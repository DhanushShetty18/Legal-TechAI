# EXPLAINED: backend/modules/ai/gemini_integration.py (and modules/gemini.py)

> **One-line summary:** This file provides three AI functions — summarize a document, extract claims, answer a question — each with exponential backoff retry logic so the app degrades gracefully when Gemini is overloaded.

---

## Note on Duplicate Files

`modules/ai/gemini_integration.py` and `modules/gemini.py` are **near-duplicates**. Both define `retry_on_failure`, `extract_json`, `summarize_legal_document`, `extract_claims`, and `answer_legal_question`. The key difference:

- `gemini_integration.py` has a more complete `retry_on_failure` with `ResourceExhausted`/`ServiceUnavailable` exceptions caught, and defines `AIServiceAtCapacityError`.
- `gemini.py` has a simpler retry implementation.

`modules/ocr_extractor.py` imports from `modules/gemini.py` (the simpler version). `main.py` imports `AIServiceAtCapacityError` and `summarize_legal_document` from `modules/ai/gemini_integration.py`.

**Use `gemini_integration.py` as the reference.** It's the more complete, production-ready version.

---

## Section-by-Section Walkthrough

### The `AIServiceAtCapacityError` Custom Exception

```python
class AIServiceAtCapacityError(Exception):
    """Custom exception raised when the Vision AI (Gemini) is at capacity."""
    pass
```

**What custom exceptions are:** In Python, you can create your own exception types by subclassing `Exception`. The `pass` body means the exception has no additional behavior — it just exists as a distinct type.

**Why create a custom exception instead of using the built-in ones?**

Because it lets callers be specific:
```python
try:
    result = summarize_legal_document(text)
except AIServiceAtCapacityError as e:
    # Tell user: "try again in 30 seconds"
    return JSONResponse(status_code=503, content={"message": str(e)})
except Exception as e:
    # Something else went wrong
    raise HTTPException(status_code=500, detail=str(e))
```

If you used a generic `Exception`, you'd have to parse the error message to distinguish "rate limit" from "network error" from "bug in code." Custom exceptions let you distinguish them by type.

---

### `retry_on_failure` — The Decorator

```python
def retry_on_failure(retries=3, delay=2):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(retries + 1):
                try:
                    return func(*args, **kwargs)
                except (ResourceExhausted, ServiceUnavailable) as e:
                    last_exception = e
                    if attempt < retries:
                        delay = delay * (2 ** attempt) + random.uniform(0, 1)
                        time.sleep(delay)
                    else:
                        raise AIServiceAtCapacityError("Vision AI is at capacity...")
                except Exception as e:
                    last_exception = e
                    if attempt < retries:
                        delay = delay * (2 ** attempt) + random.uniform(0, 1)
                        time.sleep(delay)
                    else:
                        raise
            raise last_exception
        return wrapper
    return decorator
```

**What a decorator is:** A function that wraps another function, adding behavior before and/or after the original function runs. The `@retry_on_failure(retries=3, delay=2)` syntax is equivalent to:
```python
summarize_legal_document = retry_on_failure(retries=3, delay=2)(summarize_legal_document)
```

**Three-layer nesting:** `retry_on_failure` is a "decorator factory" — it takes arguments (`retries`, `delay`) and returns a decorator. The decorator takes a function and returns a wrapper. This three-layer pattern is necessary when the decorator itself needs configurable parameters.

**`@wraps(func)`:** Without this, `wrapper.__name__` would be `"wrapper"` instead of `"summarize_legal_document"`. `@wraps` copies the original function's name, docstring, and other metadata to the wrapper. This matters for logging and debugging.

**`*args, **kwargs`:** The wrapper accepts any positional and keyword arguments and passes them through to the original function. This is how the decorator works on any function regardless of its signature.

**Exponential backoff:**
```python
delay = delay * (2 ** attempt) + random.uniform(0, 1)
```
- Attempt 0 fails: wait `2 * 1 + random = ~2 seconds`
- Attempt 1 fails: wait `2 * 2 + random = ~4 seconds`
- Attempt 2 fails: wait `2 * 4 + random = ~8 seconds`
- After 3 retries: raise `AIServiceAtCapacityError`

**`random.uniform(0, 1)`:** The "jitter" — a random 0-1 second addition. Why? If 100 clients all hit the rate limit simultaneously and all retry after exactly 2 seconds, they'll all hit the rate limit again simultaneously. Jitter spreads the retries over time.

**Bug alert: `delay` variable shadowing.** The outer function parameter is `delay=2`, but inside `wrapper`, the line `delay = delay * (2 ** attempt) + random.uniform(0, 1)` reassigns the local `delay` variable on each loop iteration. On the second loop iteration, `delay` refers to the **already-computed** value from the first iteration, not the original `2`. The backoff math is slightly off because of this. To fix:
```python
wait_time = delay * (2 ** attempt) + random.uniform(0, 1)
time.sleep(wait_time)
```

**`ResourceExhausted` and `ServiceUnavailable`:** These are Google API Core exceptions (from `google.api_core.exceptions`) that signal rate limits and temporary outages respectively. Retrying these makes sense. Other exceptions (like `ValueError` from bad input) are also retried here — which is less ideal but not harmful.

---

### `extract_json()` — Markdown Fence Stripper

```python
def extract_json(response_text: str) -> Any:
    text = response_text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return json.loads(text.strip())
```

**Why this exists:** Gemini often wraps JSON in markdown code fences:
````
```json
{"key": "value"}
```
````
This is visually helpful in chat interfaces but breaks `json.loads()`. This function strips the fences before parsing.

**`text[7:]`** — Python string slicing. `"```json"` is 7 characters. `text[7:]` gives everything from character index 7 onwards (i.e., skips the fence opener).

**Limitation:** This doesn't handle nested markdown or fences with a language tag other than `json`. For most cases it's fine.

---

### `summarize_legal_document()`

```python
@retry_on_failure(retries=3, delay=2)
def summarize_legal_document(text: str) -> Dict[str, Any]:
    system_prompt = (
        "You are a legal analyst for Indian courts. You only analyse documents under "
        "BNS, BNSS, and BSA - India's criminal codes from 2024. Never reference IPC or CrPC."
    )
    
    prompt = f"""
    Extract and return EXACTLY as JSON with these exact keys:
    {{
        "parties": [...],
        "charges": [...],
        "key_dates": [...],
        "evidence_listed": [...],
        "current_status": string or null,
        "applicable_sections": [...]
    }}
    """
    
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=system_prompt   # ← passed separately, not in prompt
    )
    response = model.generate_content(prompt)
    return extract_json(response.text)
```

**`system_instruction` vs prompt:** When you use `system_instruction`, Gemini treats it as a persistent instruction that shapes all responses from this model instance. It's separate from the user prompt and given higher weight. Putting "never reference IPC" in the system instruction is more effective than putting it in the prompt — the model treats system instructions as hard constraints.

**`{{` and `}}`** in f-strings — double braces escape to a literal `{` or `}`. Without doubling, Python would try to interpret `{parties}` as an f-string variable.

**This function returns a dict, not a Pydantic model.** Unlike the inconsistency engine which uses Pydantic validation, this function calls `extract_json()` which returns `json.loads()` output — a plain Python dict. If Gemini returns malformed JSON, `json.loads()` raises `json.JSONDecodeError`. There's no retry specifically for this case.

---

### `extract_claims()` and `answer_legal_question()`

```python
@retry_on_failure(retries=3, delay=2)
def extract_claims(text: str) -> List[Dict[str, Any]]:
    # Returns a JSON array of {claim_id, claim_text, claim_type} objects

@retry_on_failure(retries=3, delay=2)
def answer_legal_question(question: str, context: str) -> Dict[str, Any]:
    # Returns {answer, citation, confidence}
```

These are simpler than the inconsistency engine's claim extraction because they don't use Pydantic validation — they return raw Python dicts from `extract_json()`. The inconsistency engine's `_step2_extract_claims()` is the more robust version (validates with Pydantic).

---

## What Breaks If This File Is Removed

`main.py` imports `AIServiceAtCapacityError` and `summarize_legal_document` at the endpoint function level (inside `get_case_summary()`). If the file is missing, that endpoint fails with `ImportError` when called. The server still starts because the import is inside the function body, not at the top level.

`ocr_extractor.py` imports `extract_json` and `retry_on_failure` from `modules/gemini.py` (the other duplicate), so it would be unaffected by removing this file.

---

## Two Exercises

**Exercise 1:** Fix the `delay` variable shadowing bug. In the retry `wrapper`, replace the line that reassigns `delay` with a new variable `wait_time`. Verify the fix by checking that on the second retry attempt, the wait is actually `2 * 2 + jitter = ~4 seconds`, not `~6 seconds` from the already-modified value.

**Exercise 2:** Add a new function `detect_evidence_tampering(text: str) -> Dict[str, Any]` with the `@retry_on_failure` decorator. The function should ask Gemini to identify any phrases in the document that suggest evidence may have been altered or added after the fact (phrases like "it was later discovered", "upon further examination", "the report was subsequently amended"). Return `{"flags": [...], "confidence": "high/medium/low"}`.
