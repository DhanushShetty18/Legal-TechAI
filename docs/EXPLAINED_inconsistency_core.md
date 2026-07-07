# EXPLAINED: backend/modules/inconsistency/core.py

> **One-line summary:** This is the heart of the product. It takes 2+ legal documents and runs a 4-step sequential Gemini pipeline to find factual contradictions, temporal impossibilities, and logical conflicts between them.

---

## The Big Picture First

The inconsistency engine solves one problem: **two documents say different things about the same event — find it, prove it with direct quotes, and rank its severity.**

The approach is a 4-step pipeline where each step feeds the next:
```
Text of 2+ documents
        ↓
Step 1: WHAT EXISTS?   — extract entities (people, dates, places, amounts)
        ↓
Step 2: WHAT IS CLAIMED? — extract atomic factual claims with exact quotes
        ↓
Step 3: WHAT CONFLICTS? — find contradictions between claims from different docs
        ↓
Step 4: PROVE IT        — link contradictions back to exact quotes, add severity
        ↓
Structured report with findings
```

The reason it's 4 steps instead of 1 is: asking Gemini to do all four things at once produces vague, unreliable output. Breaking it into steps where each step's output constrains the next step produces consistent, court-ready results.

---

## Section-by-Section Walkthrough

### Imports and Setup

```python
import pydantic
import google.generativeai as genai
from .schemas import (Entity, DocumentEntities, Claim, ExtractedClaims, ...)
```

The `.schemas` import uses a **relative import** — the `.` means "same package." `modules/inconsistency/core.py` imports from `modules/inconsistency/schemas.py`. This is why `modules/inconsistency/__init__.py` exists — it makes the folder a Python package.

---

### KNOWN_DISTANCES Dictionary

```python
KNOWN_DISTANCES: Dict[frozenset, Tuple[float, float]] = {
    frozenset({"mumbai", "pune"}): (150, 2.5),
    frozenset({"delhi", "noida"}): (25, 0.75),
    ...
}
```

**What `frozenset` is:** A set that can't be changed. Sets have no order — `frozenset({"mumbai", "pune"})` equals `frozenset({"pune", "mumbai"})`. This is the key insight: we don't care which city is A and which is B; we just want to look up any pair.

**Why `Dict[frozenset, Tuple[float, float]]`:** The type annotation says "a dictionary where keys are frozensets and values are (distance_km, min_hours) tuples." Python doesn't enforce this at runtime — it's documentation for humans and IDE tools.

**What it's for:** The physical impossibility checker (Step 3). If Document A says "accused was in Mumbai at 9pm" and Document B says "accused was in Pune at 10pm", the 2.5-hour minimum drive time makes it impossible. The dict provides the known ground truth.

**The gap:** `frozenset({"vijayawada", "guntur"})` is NOT in the dict. This means the Vijayawada-Guntur route (32km, 0.75 hours) is invisible to the physical impossibility checker. Add it:
```python
frozenset({"vijayawada", "guntur"}): (32, 0.75),
```

---

### Lazy Gemini Configuration

```python
_gemini_configured = False

def _ensure_gemini_configured():
    global _gemini_configured
    if _gemini_configured:
        return
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set.")
    genai.configure(api_key=api_key)
    _gemini_configured = True
```

**What "lazy" means here:** Gemini is configured only when the engine is first used, not when the module is imported. This is intentional — if the server starts and the API key is missing, you don't want a crash at startup. You want it to crash only when someone actually calls the endpoint.

**`global _gemini_configured`:** Normally, assigning to a variable inside a function creates a local variable. `global` tells Python to use the module-level variable instead. The `_` prefix on `_gemini_configured` signals "this is internal to this module, don't use it from outside."

**Why configure once?** `genai.configure(api_key=...)` sets a global state in the Gemini library. Calling it repeatedly with the same key is harmless but wasteful. The flag prevents redundant calls.

---

### `_call_gemini_json()` — The Core Helper

```python
def _call_gemini_json(self, prompt: str, schema_class: type[pydantic.BaseModel]) -> pydantic.BaseModel:
```

This is the most important method in the file. Every step calls it. Understand it completely.

```python
# 1. Lazy-initialize the model
if self._model is None:
    _ensure_gemini_configured()
    self._model = genai.GenerativeModel("gemini-2.5-flash")

# 2. Append the schema to the prompt
full_prompt = (
    f"{prompt}\n\n"
    "CRITICAL: You MUST output strictly valid JSON.\n"
    "Your output must exactly match this JSON schema:\n"
    f"{json.dumps(schema_class.model_json_schema(), indent=2)}\n\n"
    "Do not wrap the JSON in markdown blocks..."
)

# 3. Call Gemini with JSON mode
response = self._model.generate_content(
    full_prompt,
    generation_config=genai.GenerationConfig(
        temperature=0.0,                        # ← no randomness
        response_mime_type="application/json",  # ← forces JSON output
    ),
)

# 4. Strip markdown fences (defensive)
text = response.text.strip()
if text.startswith("```json"): text = text[7:]
...

# 5. Parse and validate against the Pydantic schema
return schema_class.model_validate_json(text)
```

**`temperature=0.0`:** Controls randomness. 0.0 = deterministic (same input always gives the same output). 1.0 = creative/random. Legal document analysis requires consistency, not creativity.

**`response_mime_type="application/json"`:** A Gemini feature that tells the model to output only valid JSON. Combined with providing the schema in the prompt, this dramatically reduces malformed responses.

**`model_json_schema()`:** A Pydantic method that generates a JSON Schema from the model class. For example, for `ExtractedClaims`, it would produce:
```json
{
  "type": "object",
  "properties": {
    "claims": {"type": "array", "items": {...}}
  }
}
```
This JSON schema is appended to the prompt so Gemini knows exactly what structure to output.

**`model_validate_json(text)`:** Parses the JSON string AND validates it against the Pydantic model. If Gemini returns `{"claims": "not a list"}` when it should be `{"claims": [...]}`, Pydantic raises `ValidationError` here. This is your safety net.

---

### STEP 1 — Entity Extraction

```python
def _step1_extract_entities(self, context: str) -> List[DocumentEntities]:
    class _EntityExtractionResponse(pydantic.BaseModel):
        documents: List[DocumentEntities]

    prompt = f"""
    You are an expert Indian Legal AI performing STEP 1: ENTITY EXTRACTION.
    From each document below, extract ALL entities in these categories:
    - PERSON (with role: accused / witness / victim / officer)
    - DATE (normalise to DD-MM-YYYY HH:MM where possible)
    - LOCATION
    - AMOUNT
    - ACTION
    DOCUMENTS:
    {context}
    """
    return self._call_gemini_json(prompt, _EntityExtractionResponse).documents
```

**Why entity extraction first?** Before you can find contradictions between claims, you need to know WHAT exists in the documents — who the people are, what dates appear, what locations are mentioned. This gives Step 2 a structured foundation to work from.

**The inner class `_EntityExtractionResponse`:** We need a wrapper class with a `documents` list because JSON must have a root object, not a root array. This is a JSON constraint — `[...]` is valid JSON but Pydantic v2 requires an object at root level. The wrapper class solves this.

---

### STEP 2 — Claim Extraction

```python
def _step2_extract_claims(self, context: str, entities: List[DocumentEntities]) -> ExtractedClaims:
    entities_json = json.dumps([e.model_dump() for e in entities], indent=2)
    prompt = f"""
    You are an expert Indian Legal AI performing STEP 2: CLAIM EXTRACTION.
    Break each document into atomic claims (one fact per claim).
    Rules:
    - claim_type: factual / temporal / locational / quantitative
    - exact_quote MUST be the verbatim sentence from the document text.
    - doc_id must match the document filename.
    - Give each claim a unique claim_id (C1, C2, …).
    DOCUMENTS: {context}
    EXTRACTED ENTITIES (for reference): {entities_json}
    """
```

**"Atomic" claims:** Each claim contains exactly one verifiable fact. "The accused was at the police station on 15th January at 9pm" is atomic. "The accused was at the police station and arrived by auto-rickshaw" is compound — split it.

**Why pass entities to Step 2?** The entity list gives Gemini context about who and what exists in the documents. Without it, Gemini might generate claims about entities it makes up.

**`exact_quote` is the most important field.** Every claim must be anchored to a verbatim sentence from the document. This is what makes the output court-usable — you can point to the exact words in the original document.

---

### STEP 3 — Contradiction Detection (+ Physical Impossibility)

This is the most complex step. It combines Gemini's AI reasoning with deterministic arithmetic.

```python
def _step3_detect_contradictions(self, claims: ExtractedClaims) -> DetectedContradictions:
    # Part A: Ask Gemini for FACTUAL / TEMPORAL / LOGICAL contradictions
    gemini_result = self._call_gemini_json(prompt, DetectedContradictions)
    
    # Part B: Deterministic physical impossibility check
    physical = self._check_physical_impossibility(claims)
    
    # Merge both results
    merged_candidates = list(gemini_result.candidates) + physical
    ...
```

**Why split into AI + deterministic?**

Gemini is good at semantic reasoning ("Doc A says gold chain, Doc B says silver chain — contradiction"). But Gemini is unreliable at precise arithmetic (distance ÷ speed = time). The physical impossibility checker uses pure arithmetic — it will never hallucinate. This is a fundamental architectural choice: **use AI where AI is better; use arithmetic where arithmetic is better.**

---

### Physical Impossibility Checker

```python
def _check_physical_impossibility(self, claims: ExtractedClaims) -> List[ContradictionCandidate]:
```

**The algorithm:**
1. Scan all claims for time signals (`_parse_time()`) and location signals (`_extract_city()`).
2. Build two maps: `claim_id → datetime` and `claim_id → city_name`.
3. For every pair of claims from DIFFERENT documents that both have a time and a city:
   a. Look up the city pair in `KNOWN_DISTANCES`.
   b. If `time_gap_hours < min_travel_hours` → physical impossibility.
4. Return a list of `ContradictionCandidate` objects.

**`_parse_time()` — time parsing:**
```python
patterns = [
    r'(\d{1,2}):(\d{2})\s*(am|pm)',   # "9:00 PM"
    r'(\d{1,2}):(\d{2})\s*hours',     # "21:00 hours"
    r'(\d{1,2}):(\d{2})',             # "21:00"
    r'(\d{1,2})\s*(am|pm)',            # "9 pm"
]
```
These are **regular expressions** (regex). The `r` prefix means raw string — backslashes are literal, not escape sequences. `\d` means "any digit." `{1,2}` means "1 or 2 occurrences." `\s*` means "zero or more whitespace characters."

`re.search(pattern, text)` returns the first match anywhere in the text. `.groups()` returns the captured groups (the parts in parentheses).

**`_extract_city()` — city detection:**
```python
for city in sorted(all_cities, key=len, reverse=True):
    if city in text_lower:
        return city
```
Sorted by length descending — longer names first. This prevents "mumbai" from matching "new mumbai" before checking "new mumbai" first (greedy matching).

**Why use `datetime(2000, 1, 1, h, mi)` as a dummy date?** The engine only cares about time-of-day differences, not actual dates. Using a constant date (January 1, 2000) for all times means `abs(time_a - time_b).total_seconds() / 3600` gives the hour difference correctly for same-day events.

---

### STEP 4 — Evidence Linking

```python
def _step4_link_evidence(self, claims: ExtractedClaims, contradictions: DetectedContradictions) -> InconsistencyReport:
```

This step translates contradiction candidates (which have claim IDs) into final contradictions (which have verbatim quotes, severity ratings, and explanations).

The prompt tells Gemini to:
1. For each contradiction candidate, find the `exact_quote` for both `claim_a_id` and `claim_b_id` by looking in the claims list.
2. Assign severity: HIGH (could change case outcome), MEDIUM (notable but not case-breaking), LOW (minor).
3. Write one plain-English explanation per contradiction.
4. For PHYSICAL_IMPOSSIBILITY contradictions: copy the `impossibility_reason` from the candidate.

---

## What Breaks If This File Is Removed

The `POST /inconsistency/detect-inconsistencies` endpoint would fail at import time. The entire inconsistency detection feature goes dark.

---

## Two Exercises

**Exercise 1:** Add `frozenset({"vijayawada", "guntur"}): (32, 0.75)` to `KNOWN_DISTANCES`. Write a test document pair where Document A says "accused was in Vijayawada at 10:00 AM" and Document B says "accused was in Guntur at 10:30 AM". Run the engine. Verify it flags a PHYSICAL_IMPOSSIBILITY.

**Exercise 2:** The `_parse_time()` function currently doesn't handle 24-hour format like "2100 hours" (no colon). Write a new regex pattern `r'(\d{2})(\d{2})\s*hours'` that handles this. Add it to the patterns list. Write a unit test that calls `_parse_time("The accused arrived at 2100 hours")` and verifies it returns `datetime(2000, 1, 1, 21, 0)`.
