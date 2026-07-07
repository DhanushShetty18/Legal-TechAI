# Legal-TechAI — Learning Path

> **For:** A smart beginner who vibe-coded this system and now needs to truly own every line.
> **Goal:** By the end of this path, you can read any file in this codebase, explain it to anyone, extend it confidently, and debug it without panic.

---

## How to Use This Document

Each step has:
- **File to read** — open it in VS Code
- **Concept it teaches** — the transferable Python/web idea
- **What to do** — an active task, not just passive reading
- **Time estimate** — honest, assumes you sit and actually do it

Don't skip steps. This codebase is a chain — each file builds on the last.

---

## STEP 1: Python Foundations You Need First

**Before you read any code file**, make sure you can answer these:

1. What is the difference between a function and a method?
2. What does `class Foo(Bar):` mean? (inheritance)
3. What is `self`?
4. What does `Optional[str]` mean?
5. What is a dictionary, and how do you loop over its keys and values?
6. What does `f"Hello {name}"` do?
7. What is `try: ... except Exception as e:` ?

If any of these are unclear, spend one hour on [Python Tutorial: Real Python — Python Basics](https://realpython.com/tutorials/basics/) before proceeding.

---

## STEP 2: `backend/database.py` — 15 minutes

**Concept taught:** How Python connects to a database (SQLAlchemy engine + session factory)

**Read:** The entire file — it's only 20 lines.

**Understand these three things:**
```python
engine = create_engine(DATABASE_URL, ...)  # the connection to SQLite
SessionLocal = sessionmaker(bind=engine)    # a factory that creates sessions
Base = declarative_base()                   # the parent class all models inherit
```

**Do this:** Open `legal_tech_ai.db` with DB Browser for SQLite (free download). Look at the tables. This is the physical database your code creates. Seeing it makes everything concrete.

**Key insight:** `SessionLocal()` creates a "session" — a temporary workspace for database operations. You open it, do your queries, and close it. Like opening a file: always close what you open.

---

## STEP 3: `backend/models.py` — 30 minutes

**Concept taught:** ORM — defining database tables as Python classes

**Read:** Read alongside `EXPLAINED_models.md`.

**Do this after reading:**
```python
# Open a Python REPL in backend/ and run:
from database import engine, Base
import models
models.Base.metadata.create_all(bind=engine)

# Now open legal_tech_ai.db in DB Browser — see the tables appear
# Then create a user programmatically:
from database import SessionLocal
db = SessionLocal()
user = models.User(full_name="Test User", email="test@test.com", hashed_password="xxx", role="citizen")
db.add(user)
db.commit()
# Refresh DB Browser — see the row appear
db.close()
```

**Key insight:** A `models.User` Python object and a row in the `users` table are the same thing. SQLAlchemy translates between the two automatically.

---

## STEP 4: `backend/schemas.py` — 30 minutes

**Concept taught:** Pydantic — data validation and serialization

**Read:** Read alongside `EXPLAINED_schemas.md`.

**Do this:**
```python
from schemas import UserCreate, User
from pydantic import ValidationError

# This should work:
u = UserCreate(email="a@b.com", full_name="Test", role="citizen", password="abc")
print(u.email)

# This should fail with a clear error:
try:
    u2 = UserCreate(email="a@b.com", full_name="Test")  # missing role and password
except ValidationError as e:
    print(e)
    # Pydantic tells you exactly which fields are missing
```

**Key insight:** Pydantic models are the "contract" between your code and the outside world. If the contract is violated, you get a clear error message — not a mysterious crash deep in the code.

---

## STEP 5: `backend/main.py` — 45 minutes

**Concept taught:** FastAPI — building a web API; decorators; dependency injection; middleware

**Read:** Read alongside `EXPLAINED_main.md`.

**Do this:**
```bash
# Start the server:
cd backend
uvicorn main:app --reload --port 8000

# Open in browser:
http://localhost:8000/docs
```

Spend 10 minutes clicking through the Swagger UI. Try the `GET /health` endpoint. Try creating a user with `POST /users/`. Watch the terminal — see the `log_requests` middleware print every request.

**Do this second:** Add a new endpoint to `main.py`:
```python
@app.get("/ping")
def ping():
    return {"pong": True, "timestamp": datetime.utcnow().isoformat()}
```
Restart the server, call `/ping`, see the response.

**Key insight:** `@app.get("/path")` is a decorator — it registers the function below it as a route handler. The function's parameters (with type hints) tell FastAPI what to expect from the request.

---

## STEP 6: `backend/modules/ai/gemini_integration.py` — 45 minutes

**Concept taught:** Decorators in depth; the `@wraps` pattern; exponential backoff; calling an external API

**Read:** Read alongside `EXPLAINED_gemini_integration.md`.

**Do this — call Gemini directly:**
```python
# Create test_gemini.py in backend/:
import os
from dotenv import load_dotenv
load_dotenv()
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-2.5-flash")

# Basic call:
r = model.generate_content("What is Section 302 IPC in one sentence?")
print(r.text)

# JSON mode:
import json
r2 = model.generate_content(
    "Return a JSON object with keys 'name' and 'age' for a fictional person.",
    generation_config=genai.GenerationConfig(response_mime_type="application/json")
)
print(json.loads(r2.text))
```

**Key insight:** The `@retry_on_failure` decorator is a function that wraps your function. When you call `summarize_legal_document(text)`, you're actually calling the `wrapper` function, which calls the original function, catches rate limit errors, waits, and retries.

---

## STEP 7: `backend/modules/chunker.py` — 30 minutes

**Concept taught:** Regular expressions; text processing; Pydantic in non-API contexts

**Read:** The file is short. Read every line.

**Do this:**
```python
from modules.chunker import clean_text, chunk_text

sample = """
SECTION 1. Short title.
This Act may be called the Bharatiya Nyaya Sanhita, 2023.

SECTION 2. Definitions.
In this Act, unless the context otherwise requires—
(a) "act" includes illegal omission;
"""

cleaned = clean_text(sample)
print("CLEANED:", repr(cleaned))

chunks = chunk_text(cleaned, "test.txt")
for c in chunks:
    print(f"Chunk {c.metadata.chunk_index}: {c.text[:50]}...")
```

**Key insight:** Regex patterns like `r'(?im)^(?:\s*section\b|\s*\d+\.\d*\b)'` look scary but they're just precise string matching. Break them down: `(?im)` = case-insensitive multiline; `^` = start of line; `\s*` = optional whitespace; `section\b` = the word "section" followed by a word boundary.

---

## STEP 8: `backend/modules/embedder.py` — 45 minutes

**Concept taught:** Vector databases; embeddings; semantic search; ChromaDB

**Read:** Read alongside `EXPLAINED_rag_service.md`.

**Do this — the full RAG flow manually:**
```python
# In backend/, run:
from modules.embedder import add_legal_section, query_rag_system
from schemas import SectionInput

# Add a section:
s = SectionInput(
    section_number="85",
    act_name="BNS",
    section_title="Robbery",
    text="Section 85 BNS: Whoever commits robbery shall be punished with rigorous imprisonment for a term of up to ten years and shall also be liable to fine."
)
result = add_legal_section(s)
print(result)  # {"status": "success", "section_number": "85"}

# Query it:
answer = query_rag_system("What is the punishment for robbery?")
print("ANSWER:", answer.answer)
print("CITATIONS:", answer.citations)
print("HALLUCINATIONS:", answer.hallucination_flags)
```

**Key insight:** You just ran the entire RAG pipeline manually. The API endpoint does the same thing — it just wraps this in HTTP. Understanding the service function is more important than understanding the HTTP layer.

---

## STEP 9: `backend/modules/inconsistency/schemas.py` — 20 minutes

**Concept taught:** Designing data models for a multi-step pipeline; using Pydantic to enforce pipeline contracts

**Read:** This is the data spine of the entire inconsistency engine. Every step produces output that is a Pydantic model, which feeds the next step.

**Draw this on paper:**
```
Entity → DocumentEntities → [Step 1 output]
Claim → ExtractedClaims → [Step 2 output]
ContradictionCandidate → DetectedContradictions → [Step 3 output]
FinalContradiction → InconsistencyReport → [Step 4 output]
InconsistencyReportWithRanking → [API response]
```

For each model, write down: "What information does this carry? Where does it come from? Where does it go?"

**Key insight:** The pipeline's reliability comes from these schemas. Each step's output is validated by Pydantic before being passed to the next step. If Step 2 produces malformed data, it fails loudly — you know exactly where the problem is.

---

## STEP 10: `backend/modules/inconsistency/core.py` — 90 minutes

**Concept taught:** The 4-step pipeline architecture; combining AI and deterministic logic; regex for time/place extraction; frozenset as dict key

**Read:** Read alongside `EXPLAINED_inconsistency_core.md`.

**Do this — run the engine end to end:**

Create two text files:
```
# doc1.txt
The accused Ramesh Kumar was present at the police station in Mumbai at 9:00 PM on 15th January 2024. He was seen by the station officer. He arrived by bus from Pune.

# doc2.txt
The witness Suresh Patil states that he saw Ramesh Kumar in Pune at 8:30 PM on 15th January 2024. The accused was purchasing items at a shop near the Pune bus stand.
```

```python
# In backend/:
from modules.inconsistency.core import InconsistencyEngine

engine = InconsistencyEngine()
result = engine.process([
    {"doc_id": "doc1.txt", "text": open("doc1.txt").read()},
    {"doc_id": "doc2.txt", "text": open("doc2.txt").read()},
])

print("CONTRADICTIONS FOUND:", result.total_contradictions)
for c in result.contradictions:
    print(f"\n[{c.contradiction_type}] Severity: {c.severity}")
    print(f"Doc A: {c.exact_quote_doc_a}")
    print(f"Doc B: {c.exact_quote_doc_b}")
    print(f"Explanation: {c.explanation}")
    if c.impossibility_reason:
        print(f"Impossibility: {c.impossibility_reason}")
```

**Expected output:** PHYSICAL_IMPOSSIBILITY — Mumbai is 150km from Pune; minimum 2.5 hours by road; the 30-minute gap is impossible.

**Key insight:** This is your product. Spend time here. Add more city pairs to `KNOWN_DISTANCES`. Try documents where the contradiction is purely factual (not geographic). Understand every line of `_step3_detect_contradictions`.

---

## STEP 11: `backend/routers/` — 60 minutes

**Concept taught:** APIRouter; route registration; async endpoints; Query parameters; File uploads

**Read:** Read alongside `EXPLAINED_routers.md`.

**Do this:** Open Postman (or use the `/docs` Swagger UI). Make a real request to `/inconsistency/detect-inconsistencies` with your two test files. Watch the entire pipeline run. Read the JSON response. Map each field back to the Pydantic schema in `inconsistency/schemas.py`.

**Key insight:** Routers are just Python functions with HTTP decorators. The HTTP layer is thin. All the interesting logic is in `modules/`. If you can call a service function directly (Step 10), you already understand 90% of what the router does.

---

## STEP 12: `backend/main.py` revisited — 30 minutes

**Concept taught:** Seeing the whole system as a cohesive whole

By now you understand every piece. Read `main.py` again. This time, every line should make complete sense:
- Why `models.Base.metadata.create_all()` is here (not in models.py)
- Why CORS is needed
- Why `get_db()` uses `yield`
- Why `global_exception_handler` re-raises `HTTPException`
- Why route order matters (`/cases/search` before `/cases/{case_id}`)

**Do this:** Draw a complete request lifecycle diagram from memory:
```
HTTP request → CORS middleware → log_requests middleware → route handler → 
get_db() dependency → crud/service function → Pydantic response model → 
JSON response → client
```

---

## The Concepts This Codebase Teaches (Master List)

By following this path, you've learned:

| Concept | Where you learned it |
|---|---|
| SQLAlchemy ORM (tables as classes) | database.py + models.py |
| Pydantic v2 (validation, serialization) | schemas.py + inconsistency/schemas.py |
| FastAPI (routing, dependency injection, middleware) | main.py + routers/ |
| Environment variables and .env | gemini_integration.py |
| Python decorators (@wraps pattern) | gemini_integration.py |
| Exponential backoff with jitter | gemini_integration.py |
| Calling external APIs (Gemini) | gemini_integration.py + core.py |
| Regular expressions | chunker.py + core.py |
| Vector databases (ChromaDB) | embedder.py |
| Embeddings and semantic search | embedder.py |
| Multi-step pipeline architecture | inconsistency/core.py |
| Combining AI + deterministic logic | inconsistency/core.py |
| frozenset as dict key | inconsistency/core.py |
| File uploads (multipart) | routers/inconsistency.py |
| PDF text extraction (PyMuPDF) | routers/inconsistency.py + routers/ingest.py |
| CORS | main.py |
| SHA-256 hashing | main.py |
| Async Python (async def, await) | routers/ |

---

## What to Build Next (to Deepen Your Understanding)

These are features this codebase is ready for but hasn't built yet. Build them in order — each one tests your understanding.

1. **Persistent ChromaDB** — change `embedder.py` from in-memory to disk-based. Tests: SQLAlchemy, filesystem
2. **Pre-Hearing Readiness Checker** — new endpoint that takes a CNR number, hits NJDG, returns upcoming hearing dates. Tests: HTTP calls, new router
3. **Add Vijayawada-Guntur to KNOWN_DISTANCES** — tests: the physical impossibility checker
4. **Unit tests for `_parse_time()`** — tests: pytest, the regex patterns
5. **Rate limit logging** — count Gemini calls per minute, log when approaching limits. Tests: module-level state, logging
6. **Alembic migrations** — add a `court_name` column to `Case` without deleting the database. Tests: real migration workflow
7. **Replace `allow_origins=["*"]`** — restrict CORS to your actual frontend domain. Tests: CORS headers
