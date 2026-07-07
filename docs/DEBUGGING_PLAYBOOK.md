# Legal-TechAI — Debugging Playbook

> **How to use this:** When something breaks, find the error class below, follow the diagnosis steps in order, apply the fix. Every error class here is one this system has hit or will hit.

---

## Error Class 1: Gemini API Key / Authentication

### Symptoms
```
google.auth.exceptions.DefaultCredentialsError: Could not automatically determine credentials
RuntimeError: GEMINI_API_KEY environment variable is not set
google.api_core.exceptions.PermissionDenied: 403 API key not valid
```

### Why It Happens
- `.env` file is missing or not in the right directory
- `.env` exists but `GEMINI_API_KEY=` is empty or has whitespace
- The API key has been revoked or expired
- The code is reading the wrong `.env` file (wrong working directory)

### Diagnosis Steps
```bash
# Step 1: Check if the .env file exists in backend/
ls -la backend/.env

# Step 2: Check the key is actually set (don't print the full key — just check it exists)
cd backend && python -c "from dotenv import load_dotenv; import os; load_dotenv(); print('KEY SET:', bool(os.getenv('GEMINI_API_KEY')))"

# Step 3: Test the key directly
cd backend && python -c "
import os
from dotenv import load_dotenv
load_dotenv()
import google.generativeai as genai
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
model = genai.GenerativeModel('gemini-2.5-flash')
r = model.generate_content('Say OK')
print(r.text)
"
```

### Fix
1. Create `backend/.env` with content: `GEMINI_API_KEY=your_actual_key_here`
2. No quotes around the key. No spaces before/after `=`.
3. Make sure uvicorn is started from the `backend/` directory, not the root.
4. If running with Docker or Render: set the env var in the platform settings, not the .env file.

### Where the key is read in code
- `modules/inconsistency/core.py` → `_ensure_gemini_configured()` → raises `RuntimeError` if missing → router returns HTTP 503
- `modules/ai/gemini_integration.py` → `os.getenv("GEMINI_API_KEY")` → module-level, logs warning if missing
- `modules/embedder.py` → same module-level pattern

---

## Error Class 2: Gemini Rate Limits / Quota Exhaustion

### Symptoms
```
google.api_core.exceptions.ResourceExhausted: 429 Quota exceeded for quota metric
google.api_core.exceptions.ServiceUnavailable: 503 The model is overloaded
AIServiceAtCapacityError: Vision AI is currently at capacity. Please try again in 30 seconds.
```

### Why It Happens
- Free tier Gemini API has strict RPM (requests per minute) and TPM (tokens per minute) limits
- The inconsistency engine makes 4 Gemini calls per analysis — with large documents, TPM limits hit fast
- Rapid repeated testing exhausts the quota

### Diagnosis Steps
```
1. Check which call is failing: look at the traceback. Is it Step 1, 2, 3, or 4?
2. Check your Gemini console at console.cloud.google.com → APIs → Generative Language API → Quotas
3. Note the time — free tier quotas reset daily
```

### Fix Options (in order of preference)
1. **Wait and retry** — The `retry_on_failure` decorator already handles transient rate limits with exponential backoff. If the quota is daily, wait for reset.
2. **Reduce document size** — Trim the documents to the relevant sections before sending to the engine. Token usage scales with document length.
3. **Upgrade to paid tier** — Gemini paid tier has 10-100× higher quotas. For production use, this is not optional.
4. **Add a manual delay** — For testing, add `time.sleep(5)` between calls.

### Where retries happen
`modules/ai/gemini_integration.py → retry_on_failure()`:
- 3 retries
- Exponential backoff: ~2s, ~4s, ~8s + jitter
- After all retries: raises `AIServiceAtCapacityError`
- Router catches `RuntimeError` (not `AIServiceAtCapacityError` specifically) → HTTP 503

**Bug to know:** In `gemini_integration.py`, the `delay` variable is shadowed inside the loop. The backoff calculation is slightly off (each retry's `delay` uses the previous iteration's computed delay, not the original `delay=2`). This means backoff is faster than intended but still functions correctly.

---

## Error Class 3: Pydantic Validation Errors

### Symptoms
```
pydantic.ValidationError: 3 validation errors for ExtractedClaims
  claims -> 0 -> claim_type
    value is not a valid enumeration member (type=type_error.enum)
pydantic_core.ValidationError: 1 validation error for InconsistencyReport
  contradictions
    Input should be a valid list [type=list_type, ...]
json.JSONDecodeError: Expecting value: line 1 column 1 (char 0)
```

### Why It Happens
- Gemini returned valid JSON but the structure doesn't match the Pydantic model
- Gemini returned a string like `"FACTUAL"` where the code expects `"factual"` (case mismatch)
- Gemini returned prose text instead of JSON (markdown fences not stripped properly)
- Gemini returned a partial JSON (truncated response due to token limit)
- Gemini returned an empty string (content filtered)

### Diagnosis Steps
```python
# Add this temporarily to _call_gemini_json in core.py, before model_validate_json:
print("RAW GEMINI RESPONSE:", repr(text))
# This shows exactly what Gemini returned before validation
```

```python
# Check if Gemini hit content filters:
response = model.generate_content(...)
print("FINISH REASON:", response.candidates[0].finish_reason)
# STOP = normal completion
# MAX_TOKENS = response was cut off (need shorter prompt or smaller doc)
# SAFETY = content filtered
```

### Fix by Root Cause

| Root Cause | Fix |
|---|---|
| Case mismatch (FACTUAL vs factual) | Add `.upper()` or `.lower()` before validation, or use `Field(pattern="...")` |
| Empty response / content filter | Check document content; Gemini filters documents with violence/explicit content |
| Truncated JSON | Reduce document size; increase `max_output_tokens` in `GenerationConfig` |
| Markdown fences not stripped | Add `print(repr(text))` before `model_validate_json` to see what's happening |
| Wrong field name from Gemini | The prompt schema description may be ambiguous; make the JSON schema in the prompt more explicit |

### General Rule
When you get a Pydantic error from the inconsistency engine, the problem is almost always **Gemini's output, not your Pydantic model**. Print the raw response first, fix the prompt second.

---

## Error Class 4: Import Errors at Startup

### Symptoms
```
ImportError: cannot import name 'InconsistencyEngine' from 'modules.inconsistency.core'
ModuleNotFoundError: No module named 'modules.inconsistency'
ImportError: attempted relative import with no known parent package
```

### Why It Happens
- A file was moved or renamed but imports weren't updated
- `__init__.py` is missing from a package directory
- Running `uvicorn` from the wrong directory (e.g., root instead of `backend/`)
- A required package isn't installed (`pip install -r requirements.txt` not run)

### Diagnosis Steps
```bash
# Step 1: Are you in the right directory?
pwd  # should end in /backend

# Step 2: Does the __init__.py exist?
ls backend/modules/inconsistency/__init__.py
ls backend/modules/__init__.py

# Step 3: Is the package installed?
cd backend && pip show pydantic fastapi google-generativeai chromadb pymupdf

# Step 4: Try the import manually
cd backend && python -c "from modules.inconsistency.core import InconsistencyEngine; print('OK')"
```

### Fix
1. Always run `uvicorn main:app` from inside the `backend/` directory
2. If `__init__.py` is missing: `touch modules/inconsistency/__init__.py`
3. If package is missing: `pip install -r requirements.txt`
4. If relative import fails: make sure you're importing as a module (`python -m uvicorn main:app`) or the working directory is `backend/`

---

## Error Class 5: Routing Conflicts / 404 Not Found

### Symptoms
```
404 Not Found: {"detail": "Not found"}
# Or the wrong endpoint runs (422 with unexpected fields)
```

### Why It Happens
**Route ordering issue:** FastAPI matches routes in registration order. If `{case_id}` is registered before `/search`, the path `/cases/search` matches `{case_id}="search"` instead of the search endpoint.

**Missing prefix:** Router registered without prefix but endpoint defined with it, or vice versa.

**Method mismatch:** Calling `GET` on a `POST` endpoint returns 405 (Method Not Allowed), which shows as 404 in some clients.

### Diagnosis Steps
```bash
# See all registered routes
cd backend && python -c "
from main import app
for route in app.routes:
    print(route.methods, route.path)
" 2>/dev/null
```

```
# In the browser, go to:
http://localhost:8000/docs
# Swagger UI shows every registered endpoint with its full path and method
```

### Fix
- **Route ordering:** Move specific paths (`/cases/search`) before parameterized paths (`/cases/{case_id}`) in `main.py`
- **Prefix mismatch:** Check both the `include_router(router, prefix=...)` call in main.py and the router's own `prefix=` parameter — they concatenate

---

## Error Class 6: CORS Errors (Frontend Can't Reach Backend)

### Symptoms
```
Access to fetch at 'http://localhost:8000/api/...' from origin 'http://localhost:3000'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```
This error appears in the **browser console**, not the server logs. The server receives the request and responds normally — the browser blocks the response from reaching JavaScript.

### Why It Happens
- CORS middleware is missing or misconfigured
- `allow_origins` doesn't include the frontend's origin
- The middleware runs after the route handler (middleware order matters)
- A preflight `OPTIONS` request is failing

### Diagnosis Steps
```bash
# Test with curl (bypasses CORS — if this works, the issue is purely CORS)
curl -X POST http://localhost:8000/rag/query \
  -H "Content-Type: application/json" \
  -d '{"question": "test"}'

# Test the CORS preflight explicitly:
curl -X OPTIONS http://localhost:8000/rag/query \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -v 2>&1 | grep -i "access-control"
```

### Fix
```python
# In main.py — most permissive (dev only):
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Production — restrict to your domain:
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://legaltechai.in", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)
```

**Important:** `add_middleware()` must be called BEFORE `include_router()`. FastAPI processes middleware in reverse registration order — the last-added middleware runs first. If CORS is added after routes are registered, some configurations can behave unexpectedly.

---

## Error Class 7: Database Errors

### Symptoms
```
sqlalchemy.exc.OperationalError: (sqlite3.OperationalError) no such table: users
sqlalchemy.exc.IntegrityError: UNIQUE constraint failed: users.email
sqlalchemy.exc.OperationalError: database is locked
```

### Why It Happens
- **no such table:** `models.Base.metadata.create_all()` wasn't called, or was called before models were imported
- **UNIQUE constraint failed:** Trying to create a user with an email that already exists
- **database is locked:** Multiple processes writing to the same SQLite file simultaneously

### Fix by Error

| Error | Fix |
|---|---|
| no such table | Ensure `models.Base.metadata.create_all(bind=engine)` is in main.py and runs before any requests |
| UNIQUE constraint | Add a check in your endpoint: `crud.get_user_by_email(db, email)` before creating |
| database is locked | SQLite doesn't handle concurrent writes well. For production, switch to PostgreSQL. For dev, ensure only one uvicorn worker |

### Migrating an Existing Database
When you add a new column to a model, `create_all()` does NOT add it to the existing table. Fix options:
1. **Dev:** Delete `legal_tech_ai.db` and restart. All data is lost.
2. **Production:** Use Alembic (SQLAlchemy migration tool): `alembic revision --autogenerate -m "add court_name to cases"` then `alembic upgrade head`.

---

## Error Class 8: ChromaDB / Embedding Errors

### Symptoms
```
chromadb.errors.InvalidCollectionException: Collection legal_sections does not exist
ValueError: Expected embeddings to have 768 dimensions, got 0
IndexError: list index out of range  # from results['documents'][0]
```

### Why It Happens
- **Collection doesn't exist:** Server was restarted (ChromaDB is in-memory — resets on restart)
- **0 dimensions:** Gemini embed_content returned empty or the API call failed silently
- **IndexError on results[0]:** ChromaDB returned no results (collection is empty or query returned nothing)

### Diagnosis Steps
```python
# Check collection size:
all_docs = collection.get()
print("TOTAL SECTIONS IN CHROMADB:", len(all_docs['ids']))

# If 0 — the collection is empty. Add sections first via POST /rag/add-section
```

### Fix
1. After every server restart, re-add your legal sections via `POST /rag/add-section`
2. For persistence: change to `chromadb.PersistentClient(path="./chroma_db")`
3. For the `results[0]` IndexError: add a guard:
```python
if results['documents'] and results['documents'][0]:
    # process results
else:
    # return "no relevant sections found"
```

---

## Error Class 9: Model Deprecation

### Symptoms
```
google.api_core.exceptions.NotFound: 404 models/gemini-2.5-flash is not found
google.api_core.exceptions.InvalidArgument: 400 Model does not support JSON mode
```

### Why It Happens
- Google deprecates model versions. `gemini-2.5-flash` will eventually be replaced.
- Different model versions have different capability flags (some don't support `response_mime_type="application/json"`)

### Diagnosis
```python
# List available models:
import google.generativeai as genai
genai.configure(api_key="your_key")
for m in genai.list_models():
    if 'generateContent' in m.supported_generation_methods:
        print(m.name)
```

### Fix
1. Search for `"gemini-2.5-flash"` across all Python files:
   ```bash
   grep -r "gemini-2.5-flash" backend/
   ```
   Found in: `core.py`, `gemini_integration.py`, `gemini.py`, `ocr_extractor.py`, `rag/service.py`, `embedder.py`
2. Update to the new model name in all locations
3. Test `response_mime_type="application/json"` — verify new model supports it

### Prevention
Define the model name as a constant in one place:
```python
# In a new file: backend/config.py
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_EMBED_MODEL = "models/text-embedding-004"
```
Then import from there everywhere. Model updates become a one-line change.

---

## Quick Reference: Error → Most Likely Cause

| Error | First place to check |
|---|---|
| `RuntimeError: GEMINI_API_KEY not set` | `backend/.env` file |
| `ResourceExhausted: 429` | Gemini quota (check console.cloud.google.com) |
| `ValidationError` in pipeline | Print raw Gemini response before validation |
| `ModuleNotFoundError` | Are you running from `backend/` directory? |
| `no such table` | `models.Base.metadata.create_all()` not called |
| CORS blocked in browser | `app.add_middleware(CORSMiddleware, allow_origins=["*"])` |
| 404 on valid endpoint | Check Swagger at `/docs` — is the route actually registered? |
| ChromaDB empty | Server restarted; re-add sections via `/rag/add-section` |
| `JSONDecodeError` | Gemini returned prose not JSON; print `response.text` |
| Model not found | Model name deprecated; run `genai.list_models()` |
