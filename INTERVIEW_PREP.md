# INTERVIEW_PREP.md — Legal-TechAI Walkthrough Prep

> Rehearse this out loud. Everything here is grounded in YOUR actual code — file
> names, function names, and line numbers are real. When a section says "point
> at the screen," open that file and point.
>
> One ground rule for the whole interview: **never claim more than the code
> shows.** You built this with heavy AI assistance. That's fine — the winning
> move is owning the design decisions and the debugging, not pretending you
> hand-typed every line. Interviewers at a court-data startup have seen a
> hundred inflated projects. Honesty + real understanding beats polish.

---

## 1. THE 10-MINUTE WALKTHROUGH SCRIPT

*(Speak this. Practice until it's yours, not a recital. Times are rough targets.)*

### Minute 0–1: The problem

"In Indian criminal cases, the same event gets described in multiple documents
— the FIR, the charge sheet, witness statements. These documents routinely
contradict each other: one says the theft happened at 9 PM, another says 11 PM;
one says a gold chain, another says silver. Today, finding those contradictions
is a human reading documents side by side. My project automates that: you
upload two or more legal documents, and it returns a structured report of every
contradiction, with the exact quotes from each document as evidence, ranked by
severity."

### Minute 1–2: What the system is, honestly

"It's a FastAPI backend in Python, with a Next.js frontend, and Google's Gemini
as the language model. There are a few modules — OCR extraction from document
photos, a RAG question-answering system over legal sections, a summarizer — but
the heart of the project, and what I'll walk you through, is the
**inconsistency detection engine**. I'll be upfront: I built this with heavy AI
assistance. What I own is the architecture decisions, the debugging, and I can
walk you through every line of the core pipeline."

*(Saying this early defuses the "did you write this?" question before it's asked.)*

### Minute 2–4: Architecture

*(Open `backend/main.py` on screen.)*

"The entry point is `backend/main.py`. It creates the FastAPI app, sets up CORS
so the Vercel-hosted frontend can call it, adds a logging middleware that times
every request, and — the important part — mounts routers. Each feature lives in
its own router file under `backend/routers/`. So at line 46 you see
`app.include_router(inconsistency.router, prefix="/inconsistency")` — that's
how the URL `/inconsistency/detect-inconsistencies` comes to exist.

The inconsistency feature is split in two layers, deliberately:

- `backend/routers/inconsistency.py` is the **HTTP layer** — it handles file
  uploads, extracts text from PDFs, validates inputs, and shapes the response.
- `backend/modules/inconsistency/core.py` is the **engine** — a class called
  `InconsistencyEngine` that knows nothing about HTTP. It takes a list of
  document texts and returns a report.

That separation means I can test the engine without a web server, and I could
swap the HTTP layer for a CLI or a queue worker without touching detection
logic."

### Minute 4–6: The pipeline

*(Open `backend/modules/inconsistency/core.py`, scroll to `process()` at line 130.)*

"The engine runs a **four-step prompt-chained pipeline**. Each step is a
separate Gemini call, and each step's structured output feeds the next:

1. **Entity extraction** — `_step1_extract_entities` pulls out people, dates,
   locations, amounts, and actions from each document.
2. **Claim extraction** — `_step2_extract_claims` breaks the documents into
   atomic claims: one fact per claim, each with a `claim_id`, a type
   (factual / temporal / locational / quantitative), and — this is critical —
   the `exact_quote`, the verbatim sentence it came from.
3. **Contradiction detection** — `_step3_detect_contradictions` asks Gemini to
   compare claims *across different documents* and flag factual, temporal, and
   logical contradictions. Then — my favorite part — I layer a **deterministic
   check** on top: `_check_physical_impossibility`. If two claims put the same
   person in Mumbai at 9 PM and Pune at 10 PM, no LLM judgment is needed —
   I have a hardcoded distance table, `KNOWN_DISTANCES`, and pure Python math
   says a 2.5-hour drive can't happen in 1 hour. That's a contradiction the
   system can prove, not just suspect.
4. **Evidence linking** — `_step4_link_evidence` builds the final report: each
   contradiction gets the exact quote from each document, a severity rating,
   and a plain-English explanation.

Every Gemini call goes through one helper, `_call_gemini_json`, which forces
JSON output at temperature zero and validates the response against a Pydantic
schema — if Gemini returns garbage, validation fails loudly instead of garbage
flowing downstream."

### Minute 6–8: Demo + one real bug story

*(Do the demo: upload two conflicting .txt files at `/docs`, or through the frontend.)*

"Let me show you. These two witness statements disagree on the time and place
of the same event... [run it] ...and here's the report: contradictions sorted
high-to-low severity, each with both quotes.

One real bug worth mentioning: early on, this endpoint returned twenty-plus
copies of the *same* contradiction. The same Mumbai/Pune clash would be flagged
by Gemini as TEMPORAL, again as LOGICAL, and again by my deterministic check as
PHYSICAL_IMPOSSIBILITY — three-plus entries for one underlying conflict. I fixed
it in the router with `_dedupe_contradictions`: I build an order-independent
identity key for each contradiction — a `frozenset` of its two quotes — and
when duplicates collide, I keep the one with the most decisive type, using a
priority table where PHYSICAL_IMPOSSIBILITY beats everything because it's
mathematically proven, not LLM-inferred."

### Minute 8–10: Limitations, said before they ask

"What I'd want you to know about the limits:

- **It's slow.** Four sequential LLM calls means a request takes tens of
  seconds. For a real product I'd parallelize per-document steps and stream
  progress to the client.
- **The physical-impossibility check only knows 13 hardcoded city pairs.** It's
  a proof of concept for the idea 'combine LLM extraction with deterministic
  verification' — production would use a geocoding API and routing distances.
- **Trust boundaries are demo-grade**: CORS is wide open, there's no
  authentication, and legal documents get sent to Google's API — a real court
  deployment would need on-premise models and a proper data-protection review.
- **The dedup key depends on Gemini quoting verbatim.** If it paraphrases a
  quote slightly between duplicate entries, the frozenset keys differ and the
  dedup misses. Temperature zero makes this rare, not impossible.

Those are the four things I'd fix first with more time."

---

## 2. THE DATA FLOW, EXPLAINED FOR REAL

One request: a client POSTs **two .txt files** to
`POST /inconsistency/detect-inconsistencies`. Here is every function it passes
through, in order, in your real code.

### Step 0 — The URL exists because of a router mount
**`backend/main.py:46`** — `app.include_router(inconsistency.router, prefix="/inconsistency")`

FastAPI stitches the app together from router files. The router in
`routers/inconsistency.py` declares the path `/detect-inconsistencies`; the
prefix here prepends `/inconsistency`. If someone asks "where's this route
defined?", it's defined in *two* places that combine: prefix in `main.py`,
path in the router. (This exact combination bit you once on the OCR route —
see War Story C.)

### Step 1 — Logging middleware wraps the request
**`backend/main.py:67-73`** — `log_requests(request, call_next)`

Every request passes through this first. It records the start time, calls the
actual endpoint, then logs method, path, and how long it took. It exists so you
can see in the server logs that the inconsistency endpoint takes 30+ seconds
while `/health` takes milliseconds — your only observability right now.

### Step 2 — FastAPI parses and validates the request
**`backend/routers/inconsistency.py:54-63`** — the signature of `detect_inconsistencies`

Before your code runs, FastAPI reads the function signature:
`files: List[UploadFile] = File(...)` means "this endpoint expects a multipart
form upload with one or more files — reject anything else with a 422."
`min_severity: str = Query("HIGH")` means "read this from the URL query string,
default to HIGH." You never wrote parsing code; the type annotations *are* the
parsing code. That's the core FastAPI idea.

### Step 3 — Input validation you wrote by hand
**`backend/routers/inconsistency.py:80-91`**

Two checks: `min_severity` must be HIGH/MEDIUM/LOW (else 400), and there must
be at least 2 files (else 400 — you can't have a *cross-document* contradiction
with one document). These exist because failing fast with a clear message is
better than a confusing pipeline error four LLM calls later.

### Step 4 — Text extraction per file
**`backend/routers/inconsistency.py:95-117`**

For each uploaded file: `await file.read()` pulls the bytes. If the filename
ends in `.pdf`, PyMuPDF (`fitz`) opens it and extracts text page by page,
inserting `[Page N]` markers. For your .txt files it takes the simpler branch
at **line 110**: decode the bytes as UTF-8 and wrap in `[Page 1]`. The page
markers exist so that later, claims can carry a `page_ref` — a lawyer needs
"page 3 of the charge sheet," not just "somewhere in the document." Output:
`documents_data`, a list of `{"doc_id": filename, "text": ...}` dicts.

### Step 5 — Into the engine
**`backend/routers/inconsistency.py:120`** → **`backend/modules/inconsistency/core.py:130`** — `engine.process(documents_data)`

Note `engine = InconsistencyEngine()` at **router line 11** — one engine
instance created when the module loads, reused for every request. `process()`
first concatenates all documents into one string, `full_context`, with
`--- DOCUMENT: filename ---` headers (**core.py:141-145**) so Gemini can tell
which text belongs to which document. Then it runs the four steps in sequence.

### Step 6 — The one Gemini gateway
**`backend/modules/inconsistency/core.py:89-125`** — `_call_gemini_json(prompt, schema_class)`

All four steps go through this single helper. What it does, in order:

1. **Lazy init** (line 94-96): the first time it's called, it runs
   `_ensure_gemini_configured()` (checks `GEMINI_API_KEY` exists, else raises
   RuntimeError) and creates the `gemini-2.5-flash` model. Lazy because you
   don't want the *server* to crash at import time if the key is missing — you
   want a clean 503 at request time. (The router maps RuntimeError → HTTP 503
   at **inconsistency.py:150**.)
2. **Schema injection** (line 98-105): it appends the Pydantic model's JSON
   schema (`schema_class.model_json_schema()`) to the prompt — literally
   telling Gemini "your output must match this exact shape."
3. **Constrained generation** (line 107-113): `temperature=0.0` (most
   deterministic output) and `response_mime_type="application/json"` (Gemini's
   JSON mode).
4. **Defensive fence-stripping** (line 116-123): even in JSON mode, models
   sometimes wrap output in ` ```json ` fences; this strips them.
5. **Validation** (line 125): `schema_class.model_validate_json(text)` — Pydantic
   parses the JSON *and* checks every field matches the schema. Bad output
   raises here instead of corrupting the pipeline.

### Step 7 — STEP 1: Entity extraction
**`core.py:164-183`** — `_step1_extract_entities(full_context)`

One Gemini call: "extract every PERSON, DATE, LOCATION, AMOUNT, ACTION from
each document." Validated against `DocumentEntities` (in
`modules/inconsistency/schemas.py:17`). Why this step exists: it primes the
next step — claim extraction is more reliable when the model has already
enumerated the entities the claims will be about.

### Step 8 — STEP 2: Claim extraction
**`core.py:188-214`** — `_step2_extract_claims(full_context, entities)`

Second Gemini call, with the entities from step 1 pasted in as reference.
"Break each document into atomic claims" — one fact per claim. Each `Claim`
(schemas.py:24) carries `claim_id` (C1, C2…), `fact`, `claim_type`, `doc_id`,
`page_ref`, and `exact_quote` — the verbatim source sentence. *Atomic* matters:
you can't cleanly say "claim A contradicts claim B" if a claim bundles three
facts. `exact_quote` matters twice over: it's the evidence a lawyer needs, and
it later becomes the deduplication key.

### Step 9 — STEP 3: Contradiction detection (LLM half)
**`core.py:219-250`** — `_step3_detect_contradictions(claims)`

Third Gemini call: compare claims *across different documents* and return
`ContradictionCandidate`s typed FACTUAL, TEMPORAL, or LOGICAL, each with the
two clashing `claim_id`s and reasoning — plus a list of claim IDs that stayed
consistent (those become the "clean facts" in the final report).

### Step 10 — STEP 3.5: Physical impossibility (deterministic half)
**`core.py:278-390`** — `_check_physical_impossibility(claims)`

Pure Python, zero LLM. For every claim, it tries to pull out a time
(`_parse_time`, line 396 — regexes for "9:00 PM", "21:00", "9 pm") and a city
(`_extract_city`, line 440 — substring search against the cities in
`KNOWN_DISTANCES`, line 38). Then for every *pair* of claims from *different*
documents that have both a time and a city: compute the time gap in hours; look
up the minimum road-travel time between the two cities; if the gap is smaller
than the travel time, emit a `PHYSICAL_IMPOSSIBILITY` candidate with a
human-readable proof ("Distance is 150 km; minimum travel time is 2.5 hours;
time gap is only 1.00 hours. One statement must be false.").

Why it exists: this is the thesis of the project. LLMs *suspect*
contradictions; arithmetic *proves* them. Back in `_step3` (lines 252-273) the
deterministic results get merged into Gemini's candidate list, and any claim
now implicated gets removed from the "consistent" list.

### Step 11 — STEP 4: Evidence linking
**`core.py:472-506`** — `_step4_link_evidence(claims, contradictions)`

Fourth Gemini call. It gets the full claims list plus the candidate
contradictions and produces the final `InconsistencyReport` (schemas.py:88):
for each contradiction, look up the two claim IDs and copy their exact quotes
into `exact_quote_doc_a` / `exact_quote_doc_b`, assign a severity (HIGH =
could change the case outcome), write a one-sentence explanation, and for
physical impossibilities, copy the proof verbatim into `impossibility_reason`.
Consistent claims become `clean_facts`.

### Step 12 — Back in the router: dedup, sort, filter
**`backend/routers/inconsistency.py:125-139`**

- `_dedupe_contradictions` (line 36): collapse entries citing the same quote
  pair. Identity = `_quote_pair_key` (line 27), a `frozenset` of the two
  stripped quotes — frozenset because {A,B} equals {B,A}, so swapped doc order
  still counts as the same contradiction. On collision, keep the entry whose
  `contradiction_type` ranks highest in `TYPE_PRIORITY` (line 19):
  PHYSICAL_IMPOSSIBILITY > LOGICAL > TEMPORAL > FACTUAL.
- Sort survivors HIGH → MEDIUM → LOW using `SEVERITY_ORDER` (line 14).
- `top_contradictions` = only those at or above `min_severity`.

### Step 13 — Response assembly and serialization
**`backend/routers/inconsistency.py:141-149`**

Build `InconsistencyReportWithRanking` (schemas.py:99 — it *extends*
`InconsistencyReport` with the `top_contradictions` field). Crucially,
`total_contradictions` and `high_severity` are **recomputed from the deduped
list** — the engine's own counts were pre-dedup and would be wrong. FastAPI
then serializes it to JSON because of
`response_model=InconsistencyReportWithRanking` on the decorator (line 54),
which also guarantees the response shape matches the documented schema.

Errors on the way out: `RuntimeError` (missing API key) → 503; anything else →
500 with the message (lines 150-160).

**That's the whole journey: middleware → FastAPI validation → hand validation →
text extraction → 4 Gemini calls + 1 deterministic check → dedup → sort →
Pydantic-validated JSON response.**

---

## 3. MY 3 DEBUGGING WAR STORIES — RECONSTRUCTED HONESTLY

### War Story A: The duplicate contradictions bug
*(Commit `aa5002b` — "dedupe contradictions")*

**Symptom.** Upload two documents with one real conflict — say Mumbai-at-9PM vs
Pune-at-10PM — and the response contained 20+ contradiction entries. Same two
quotes, over and over, and the "5 total contradictions, 3 high severity" counts
were inflated garbage.

**Root cause, in the code.** Duplicates enter from two directions:

1. *Within Gemini's own output*: in `_step3_detect_contradictions`
   (`core.py:219`), one underlying conflict legitimately matches multiple
   category definitions — a time-and-place clash is TEMPORAL *and* LOGICAL —
   so Gemini reports it once per category. Nothing told it not to.
2. *The merge at `core.py:252-273`*: your deterministic
   `_check_physical_impossibility` finds the *same* clash again and its
   candidates get appended to Gemini's list — by design, with no overlap check.
3. Then `_step4_link_evidence` (`core.py:472`) faithfully expands every
   candidate into a `FinalContradiction`. LLM nondeterminism in step 4 could
   pad the list further. Multiply across claim pairs and you get 20+.

The deep lesson: **the pipeline had no notion of contradiction *identity***.
Nothing in the system could say "these two entries are the same finding."

**Why the fix works.** The fix (`routers/inconsistency.py:27-51`) *defines*
identity: a contradiction **is** its pair of evidence quotes. `_quote_pair_key`
returns `frozenset({quote_a.strip(), quote_b.strip()})` — frozenset is an
unordered, hashable set, so A-vs-B and B-vs-A hash identically, and it can be a
dict key. `_dedupe_contradictions` walks the list keeping one entry per key in
a dict; on collision it keeps the more *decisive* type via `TYPE_PRIORITY` —
PHYSICAL_IMPOSSIBILITY wins because it's arithmetic proof, not LLM inference.
And the response recomputes `total_contradictions` and `high_severity` from the
deduped list (`inconsistency.py:145-148`) so the counts are honest again.
Deliberate choice: fix in the **router**, not the engine — the engine's raw
output stays untouched and inspectable; dedup is response shaping.

**60-second spoken version.**
"My contradiction engine merges results from two detectors — Gemini's semantic
detection and my deterministic physical-impossibility check — and Gemini itself
would report one conflict under multiple categories. So one real contradiction
came back twenty-plus times. The root cause was that nothing in the system
defined what makes two contradictions 'the same one.' I decided a contradiction
is identified by its evidence — the pair of exact quotes it cites — and built
the dedup key as a frozenset of the two quotes, so document order doesn't
matter and it's hashable. When duplicates collide I keep the most decisive
type: physical impossibility beats a vague 'factual' label because it's
mathematically proven. And I recomputed the summary counts post-dedup, because
the engine's counts were pre-dedup and lied. I put the fix in the router rather
than the engine on purpose — detection stays pure, presentation gets cleaned."

### War Story B: The /docs 500 error
*(Commit `c50bac0` — "Fix: Add Optional to typing imports in main.py")*

**Symptom.** Opening `/docs` — FastAPI's auto-generated Swagger page, your main
demo surface — returned a 500.

**Root cause, in the code.** Before the fix, `main.py` line 7 read
`from typing import List` — no `Optional`. But the `upload_document` endpoint
used it in its signature: `extracted_metadata: Optional[str] = Form(None)`
(now `main.py:170`). Here's the part to *actually* understand: Python evaluates
type annotations **when the `def` statement executes**, which is when the
module is imported — not when someone calls the endpoint. So importing
`main.py` raised `NameError: name 'Optional' is not defined` before the app
could even finish starting. The whole backend was down; `/docs` was simply the
first page you checked, so that's where the 500 appeared. It *felt* like a
docs bug; it was actually an import-time crash of the entire app.

**Why the fix works.** One word: `from typing import List, Optional`. Now the
annotation resolves at import, the module loads, every route comes back
including `/docs`. The transferable lessons: (1) in Python, annotations are
live expressions, not comments — a typo in one is a runtime error; (2) when
"one page" 500s, check whether the app started at all before debugging that
page; (3) a linter or even `python -c "import main"` in CI would have caught
this before deploy.

**60-second spoken version.**
"During demo prep, our API docs page started returning 500. The instinct is
'something's wrong with docs generation,' but the real cause was an import-time
crash: I'd added an upload endpoint whose signature used `Optional[str]`
without importing `Optional` from typing. Python evaluates annotations when the
function is *defined* — at import — so the whole module failed to load and
every route was down; /docs was just where I noticed. The fix was one word in
the import line, but the lesson stuck: annotations are executed code, and when
one endpoint mysteriously 500s, first confirm the app actually booted. Now I'd
put a smoke-test import in CI so a broken deploy never reaches the platform."

### War Story C: The Gemini model deprecation
*(Commits `4421c79` → `b588629` → `9a35add` → finally `f6b551a`)*

**Symptom.** Endpoints that had worked started failing with Gemini API 404s —
`models/gemini-2.0-flash is not found for API version v1beta` — nothing in
your code had changed. Google had deprecated the `gemini-2.0-flash` model
name.

**Root cause, in the code.** The model name was a **hardcoded string literal in
seven different files**. The fix commit `f6b551a` had to touch:
`modules/ai/gemini_integration.py`, `modules/embedder.py`,
`modules/gemini.py` (three call sites!), `modules/inconsistency/core.py:96`,
`modules/ocr_extractor.py:49`, `modules/rag/service.py:91`, and
`modules/summarizer/core.py`. And the git history shows this was the *third*
time you'd chased model names around the repo — `4421c79` and `9a35add` were
earlier rounds of "set all models to 2.0-flash." The real defect was never the
model name; it was **configuration duplicated across the codebase** — a
classic DRY (Don't Repeat Yourself) violation. Every rename risked missing a
file, and the failure mode of missing one is cruel: six features work, the
seventh 404s, and you don't find out until someone hits it.

(Bonus: the same commit fixed the OCR route — `routers/ocr_extract.py` had
`@router.post("/")` under prefix `/ocr-extract`, making the real path
`/ocr-extract/` with a trailing slash; POSTs to `/ocr-extract` got a 307
redirect that broke the frontend. Changed to `@router.post("")`.)

**Why the fix works — and why it's incomplete.** Updating all seven strings to
`gemini-2.5-flash` restores service, and at 2.5-flash the API contract is the
same, so it's a drop-in. But be ready to say: the *durable* fix is one
constant — `GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")` in a
single config module — so the next deprecation is a one-line change or just an
environment variable update on the host. You know this and would do it in a
rebuild; say so proactively.

**60-second spoken version.**
"One day my endpoints started returning 404s from the Gemini API with zero code
changes on my side — Google had deprecated the model name I was using. The bug
took ten minutes; the fix audit took longer, because I'd hardcoded the model
string in seven files, and my git history shows I'd already done this dance
twice on earlier renames. So the real root cause wasn't the deprecation — every
API model gets deprecated eventually — it was that I'd duplicated configuration
instead of centralizing it. I updated all seven call sites to gemini-2.5-flash
to restore service, and the honest self-critique is that the durable fix is a
single GEMINI_MODEL constant read from the environment, so next time it's a
config change, not a code hunt. It taught me to treat external service names as
config, not code."

---

## 4. THE 15 MOST LIKELY INTERVIEW QUESTIONS + HONEST ANSWERS

**Q1. "Why Gemini instead of open-source models like Llama or Mistral?"**
"Three honest reasons. First, this task needs strong instruction-following and
reliable JSON output — my whole pipeline depends on
`response_mime_type='application/json'` plus Pydantic validation in
`_call_gemini_json`, and frontier hosted models are simply better at schema
adherence than the 7B models I could self-host. Second, cost and speed of
iteration: Gemini's flash tier has a generous free/cheap tier and I had no GPU
budget — my git history literally has a commit 'Switch to flash model for quota
efficiency.' Third, Gemini gave me vision for the OCR module and an embedding
model (`text-embedding-004`) from one SDK. The trade-off I accept: legal
documents go to Google's servers, which is a genuine problem for real court
data — production would need on-premise or India-region-guaranteed hosting,
and that's when I'd evaluate open-source seriously."

**Q2. "Why ChromaDB?"**
"For the RAG module I needed a vector store to hold embedded legal sections and
do cosine-similarity search. ChromaDB is embedded — it runs in-process, no
separate server, one pip install — which is right-sized for a demo with dozens
of sections. You can see it's deliberately minimal: `chromadb.Client(
Settings(is_persistent=False))` — in-memory, wiped on restart, sections are
re-added via the `/rag/add-section` endpoint. The honest limitation: no
persistence and no horizontal scale. At production scale — millions of
sections, concurrent users — I'd move to pgvector or a managed vector DB, keep
the same embed-store-retrieve interface, and swap the backend."

**Q3. "Why four sequential steps instead of one big prompt?"**
"I get four things from decomposition. **Debuggability** — when output is
wrong, I can inspect which step broke: were the claims bad, or was detection
bad on good claims? A monolithic prompt is a black box. **Reliability** — each
step has a small, focused Pydantic schema; asking one prompt to do entity
extraction, claim decomposition, cross-document comparison, AND severity
rating produces sloppier output on each. **An injection point for
deterministic logic** — my physical-impossibility check needs *structured
claims* with parsed times and locations as its input; that interface only
exists because step 2 produces typed claims. That's the step you can't get
from one big prompt. **The trade-off is real**: 4x the latency and API cost,
and errors cascade — bad claims in step 2 poison step 3. For this accuracy-
over-speed use case, I'd make the same call again."

**Q4. "How would this scale to 100-page documents?"**
"Today it wouldn't — honest answer. `process()` in `core.py:141` concatenates
all documents into one `full_context` string and sends the entirety into every
prompt. Two 100-page documents blow past sane context usage, degrade extraction
quality ('lost in the middle'), and step 2's claims JSON gets huge. The fix is
chunking: run entity and claim extraction per-chunk or per-page — the `[Page
N]` markers I already insert in the router are the natural seams — then run
contradiction detection on the *claims*, not the raw text. Claims are tiny
compared to source text, so a 100-page doc might yield 300 claims that fit
easily in one detection prompt. If claims outgrew that too, I'd pre-filter
pairs by entity overlap — only compare claims that share a person or event —
before asking the LLM. That's also basically an inverted index, and it's how
I'd keep the pairwise explosion under control."

**Q5. "What breaks first under load?"**
"The Gemini calls, and in a nasty way. `detect_inconsistencies` is declared
`async def`, but the four Gemini calls inside `engine.process()` are
**synchronous, blocking** SDK calls. A blocking call inside an async endpoint
holds up the event loop — so while one 30-second detection runs, the server
struggles to serve anything else. Ten concurrent users and it's effectively
serial. Second failure: Gemini rate limits — the inconsistency engine has no
retry (ironically, `modules/gemini.py` has a `@retry_on_failure` decorator that
the other modules use, but `core.py` doesn't). Fixes in order: run engine calls
in a threadpool via `run_in_executor` or make the endpoint sync so FastAPI
threadpools it automatically; add retry with exponential backoff; then move
detection to a background job queue with a job-status endpoint, because 30+
second synchronous HTTP responses are wrong at any scale."

**Q6. "What would you rebuild if you started over?"**
"Four things. **One Gemini gateway module** — model name, API key config,
retry, and JSON validation in one place; right now that logic exists in
near-duplicate form in `modules/gemini.py`, `modules/ai/gemini_integration.py`,
and `core.py`, which is how the model-rename bug cost me seven files.
**Async or queued execution** for the pipeline, as in Q5. **A claims-first
data model** — persist extracted claims in the database keyed by case, so
detection can rerun on stored claims without re-extracting, and new documents
can be compared against existing claims incrementally. **Config hygiene** —
every external name and knob from environment/config, zero literals. Notice
most of that list is boring infrastructure, not AI — that's the honest lesson
of the project."

**Q7. "How do you prevent hallucinated legal citations?"**
"Two mechanisms, in different modules. In the **RAG module**, generation is
constrained then *verified*: the system prompt says answer only from the
provided sections, and then — this is the part I like — the code doesn't trust
the prompt. `query_rag_system` regex-extracts every 'Section N' mention from
the answer, checks each against the section numbers actually stored in
ChromaDB, and anything unknown goes into a `hallucination_flags` field in the
response. So a fabricated citation isn't silently served; it's labeled. In the
**inconsistency engine**, the equivalent is `exact_quote` — every contradiction
must cite verbatim sentences from the source documents, so a reviewer can
verify every finding against the original. The honest gap: I flag suspect
citations rather than block or regenerate, and the quote-verbatim rule is
prompt-enforced, not code-verified — production should do a substring check of
each quote against the source text and reject non-matches."

**Q8. "Walk me through what happens when I upload two files."** →
Deliver Section 2. Practice it as a 3-minute spoken version: middleware →
signature validation → text extraction with page markers → four pipeline steps
→ deterministic merge → dedup → sort → validated JSON out.

**Q9. "Why temperature 0?"**
"Temperature controls sampling randomness — higher means more diverse token
choices. For creative writing you want some; for extraction and classification
I want the model's single most-probable output every time, so
`_call_gemini_json` sets `temperature=0.0`. Two reasons specific to this
system: reproducibility while debugging — same documents in, same claims out,
near enough — and my dedup key depends on quotes being *stable*; randomness in
quoting directly weakens dedup. Caveat I'll volunteer: temperature 0 reduces
but doesn't eliminate nondeterminism, and it does nothing for *correctness* —
a wrong extraction at temperature 0 is just consistently wrong."

**Q10. "How is this tested? How do you know it works?"**
"Honestly: thinner than I'd like. There are test files in `backend/`
(`test_inconsistency.py`, `test_rag.py`, etc.) and I built a test-case document
of engineered contradictions — pairs of statements with known conflicts like
the Mumbai/Pune scenario — which is effectively manual golden-set evaluation.
The deterministic parts are genuinely unit-testable: `_parse_time`,
`_extract_city`, `_dedupe_contradictions` are pure functions and those tests
are cheap and stable. The LLM steps are the hard part — outputs vary, so
classic assertion tests are brittle. What production needs is an evaluation
harness: a labeled set of document pairs with known contradictions, run the
pipeline, measure precision and recall per contradiction type, and track that
across prompt changes. I understand that's the right approach; I haven't built
it, and I'd say it's the single most important missing piece."

**Q11. "What happens if Gemini returns malformed JSON?"**
"Defense in depth, then a clean failure. First, JSON mode
(`response_mime_type='application/json'`) makes malformed output rare. Second,
`_call_gemini_json` strips markdown code fences defensively, because models
sometimes wrap JSON in ` ```json ` anyway. Third,
`schema_class.model_validate_json(text)` — Pydantic parses and validates
structure and types; wrong shape raises `ValidationError`. That propagates up
through `process()` to the router's `except Exception` and becomes a 500 with
a message. So garbage never flows *through* the pipeline — but the honest gap
is there's no retry-on-validation-failure; one bad generation fails the whole
30-second request. The fix is a retry loop around validation, ideally feeding
the validation error back to the model."

**Q12. "Why is dedup in the router instead of the engine?"**
"Deliberate layering call. The engine's contract is 'here is the raw detection
output'; dedup, sorting by severity, and the `min_severity` filter are
*presentation* decisions that could differ per consumer — a UI wants top
contradictions, an audit log might want every raw detection precisely to see
duplicate patterns. Keeping the engine pure also made debugging the duplicate
bug possible: I could look at raw output and prove where duplicates came from.
Counter-argument I'll concede: if a second consumer of the engine ever appears,
they'd re-implement dedup — at that point it moves into the engine, or into a
post-processing function both share."

**Q13. "Why a hardcoded distance table instead of asking Gemini about travel times?"**
"Because the physical-impossibility check is the one place I can offer *proof*
rather than judgment, and I refuse to launder that through an LLM. If Gemini
says 'Mumbai to Pune takes about 3 hours,' the check inherits hallucination
risk and the output becomes 'the model thinks it's impossible.' With
`KNOWN_DISTANCES` — 13 city pairs with distance and minimum road hours — the
output is arithmetic: distance, minimum time, actual gap, therefore
impossible. In a legal context, 'provable' versus 'plausible' is everything.
The obvious limitation: 13 pairs is a demo. Production keeps the deterministic
principle but sources distances from a geocoding/routing API — the data source
scales; the architecture decision stands."

**Q14. "Is your module-level `engine = InconsistencyEngine()` safe for concurrent requests? Any other concurrency issues?"**
"The singleton itself is nearly stateless — its only mutable state is the lazy
`self._model`, and the worst race is two first-requests both initializing it,
which is wasteful but harmless since both produce equivalent model objects. The
*real* concurrency issue is the one from Q5: blocking Gemini calls inside an
`async def` endpoint stall the event loop, so concurrency is broken at the
request level regardless of the singleton. And the global ChromaDB collection
in the RAG module is in-memory per-process — multiple workers would each have
their own, inconsistent index. Both are known demo shortcuts I can articulate
fixes for."

**Q15. "How much of this did you write yourself?"**
"Straight answer: I built this AI-assisted — a substantial amount of code was
generated with AI tools. What I own: the product concept and pipeline design —
the four-step decomposition and the LLM-plus-deterministic-check hybrid; the
key decisions like quote-pair dedup keys, dedup in the router, temperature
zero, lazy init mapping to 503s; and the debugging — the duplicate
contradictions bug, the import-time crash, the model deprecation across seven
files were all real problems I diagnosed and fixed. I can walk you through any
file in the core path line by line — test me on that. What I *won't* claim is
that I hand-typed every line or that this is production-hardened; the README
actually overstates the architecture and I'd rewrite it. My view: AI-assisted
building is the job now, and the engineer's value is knowing whether the
generated code is *right* — which is exactly the skill I'm demonstrating by
being able to defend this system under questioning."

---

## 5. THE 5 CONCEPTS I MUST ACTUALLY UNDERSTAND

### Concept 1: An API endpoint (and FastAPI routing)
An endpoint is a URL + HTTP method that runs a specific function on your
server. The client sends a request (URL, method, headers, body); your function
runs; a response goes back. In your code:
`@router.post("/detect-inconsistencies")` in `routers/inconsistency.py:54`
says "when a POST arrives at this path, run `detect_inconsistencies`." The
full public URL includes the prefix from `main.py:46`. FastAPI's twist: the
function's **type annotations define the interface** — `files: List[UploadFile]
= File(...)` makes it a multipart file-upload endpoint, and FastAPI generates
the `/docs` Swagger page from these annotations automatically. That's why a
broken annotation import (War Story B) killed the app.
**One-liner if asked:** "An endpoint is a URL-to-function mapping; in FastAPI
the function signature declares and enforces the request format."

### Concept 2: What Pydantic validates
Pydantic turns a class definition into a data contract. `Claim` in
`modules/inconsistency/schemas.py:24` says a claim *must* have a string
`claim_id`, `fact`, `claim_type`, `doc_id`, `page_ref`, `exact_quote` — parse
data into it and every field is checked; anything missing or mistyped raises a
`ValidationError`. Your code leans on this in three distinct places:
(1) **LLM output** — `model_validate_json` in `core.py:125` is the firewall
between Gemini's free-form text and your typed pipeline; (2) **schema-as-
prompt** — `model_json_schema()` in `core.py:102` turns the same class into
instructions for Gemini, so the contract is enforced on both sides; (3) **API
responses** — `response_model=InconsistencyReportWithRanking` guarantees what
leaves your API matches the documented shape.
**One-liner:** "Pydantic is a typed contract at every boundary — especially the
boundary with the LLM, which is where untrusted data enters."

### Concept 3: What an embedding is (and why ChromaDB)
An embedding is a list of numbers (a vector) representing a text's *meaning*:
texts about similar things get nearby vectors. In `add_legal_section` (RAG
module), `genai.embed_content(model="models/text-embedding-004", ...)` converts
a legal section to a vector stored in ChromaDB; `query_rag_system` embeds the
user's *question* the same way and asks ChromaDB for the 3 nearest stored
vectors by **cosine similarity** (the collection is created with
`metadata={"hnsw:space": "cosine"}` — cosine compares vector *direction*, i.e.
topical similarity regardless of text length). Why it beats keyword search:
"punishment for stealing" retrieves the theft section even though the statute
says "theft," not "stealing" — meaning matches, words don't have to.
**One-liner:** "Embeddings turn 'find relevant sections' from word-matching
into geometry — nearest vectors are the most semantically similar texts."

### Concept 4: A prompt-chained pipeline
Instead of one giant prompt doing everything, you run a **sequence of focused
LLM calls where each call's structured output is the next call's input**.
Yours is exactly `process()` in `core.py:130`: entities → claims →
contradictions → evidence-linked report. It's function composition, with an
LLM inside each function and a Pydantic schema on each arrow. Why it matters:
each step is separately promptable, debuggable, and validated — and structured
intermediate outputs create the seam where non-LLM code can participate
(`_check_physical_impossibility` operates on step 2's typed claims; it could
never operate on raw prose). Cost: latency and cascading errors.
**One-liner:** "It's a factory line for the LLM — each station does one job,
gets quality-checked, and hands typed parts to the next station; and because
the parts are typed, ordinary code can work a station too."

### Concept 5: A deduplication key
To remove duplicates you must first define "same" — the dedup key is that
definition, computed so that duplicates get *equal* keys. Yours is
`_quote_pair_key` in `routers/inconsistency.py:27`:
`frozenset({quote_a.strip(), quote_b.strip()})`. Each piece is deliberate:
**frozenset** = unordered + hashable, so (A,B) and (B,A) — the same
contradiction with documents swapped — produce the identical key, and it can
index a dict; **.strip()** normalizes whitespace so trivial padding doesn't
split keys; **quotes, not explanations**, because the LLM words explanations
differently every time but quotes are verbatim source text — the *stable* part
of the record. And when two entries share a key you need a keep-rule: yours is
`TYPE_PRIORITY`, keep the most decisive contradiction type.
**One-liner:** "A dedup key is your definition of identity, built only from
the stable fields — mine says a contradiction *is* its unordered pair of
evidence quotes."

---

## 6. WEAK SPOTS AUDIT — WHERE A PROBING INTERVIEWER COULD EXPOSE ME

### Weak Spot 1: The README describes a system that doesn't exist
The README claims "microservices-based architecture," a "Java / Spring Boot
Enterprise Gateway," "Vertex AI (Gemini Enterprise Model Tiers)," "LayoutLM,"
and a repo layout (`legal-techai-gateway/` etc.) that isn't in the repo. The
actual system: one FastAPI monolith, the consumer `google.generativeai` SDK,
no Java anywhere, no LayoutLM. An interviewer who reads the README before the
call will test you on the gateway. **Do not defend the README.**
**Honest answer:** "Fair catch — the README is aspirational-roadmap language
that reads as if it's built, and that's a mistake I'd fix before anything else;
overstated docs destroy trust. What actually exists is a single FastAPI service
calling Gemini through the consumer SDK. Let me walk you through what's real —
it's genuinely interesting without the inflation."
**Strong move: rewrite the README before the interview.** Turning this weak
spot into "I caught my own docs overstating and corrected them" is a great
story. (Ask me — I can draft it.)

### Weak Spot 2: Duplicated and dead code — and the RAG trap
Three near-duplicate Gemini helper modules exist (`modules/gemini.py`,
`modules/ai/gemini_integration.py`, plus `core.py`'s own `_call_gemini_json`),
each with its own fence-stripping and config. Worse — **trap alert** —
`routers/rag.py:3` imports `add_legal_section` and `query_rag_system` from
**`modules/embedder.py`**, while `modules/rag/service.py` contains a
near-identical copy that is **dead code, not what actually runs**. If you
demo "my RAG code" from `service.py` and an interviewer notices the import,
you look like you don't know your own repo. Walk through `embedder.py` (same
logic, so everything in this doc still applies).
**Honest answer:** "That duplication is a scar of AI-assisted iteration — new
versions got generated alongside old ones instead of replacing them, and
`modules/rag/service.py` is a dead duplicate of `embedder.py`, which is what
the router actually imports. It's also exactly why the model rename cost me
seven files. The cleanup is a day: one Gemini client module, delete the dead
copies, and imports that make the live path obvious."

### Weak Spot 3: The async endpoint that blocks, no timeouts, no retry in the core engine
`detect_inconsistencies` is `async def`, but every Gemini call inside is
blocking — under concurrency the event loop stalls (Q5). No timeout on any
Gemini call: if Google hangs, your request hangs. And the engine has **no
retry**, even though `retry_on_failure` exists in `modules/gemini.py:19` and
other modules use it — one transient 429 four steps into a 40-second pipeline
fails the whole request. If asked "what happens with 50 concurrent users,"
don't guess optimistically.
**Honest answer:** "It would degrade badly, and I can tell you exactly why:
blocking SDK calls inside an async endpoint serialize the event loop. I
understand the failure mode and the fix — threadpool the engine calls or make
the route sync so FastAPI threadpools it, add per-call timeouts, apply the
retry decorator that already exists in my own codebase, and for real scale
move detection to a background queue with a status endpoint. I know the shape
of the solution; I haven't built it because the demo never faced concurrency."

### Weak Spot 4: Security and privacy are demo-grade — sensitive in a legal product
The list: CORS `allow_origins=["*"]` with `allow_credentials=True`
(`main.py:56-62`); zero authentication on any endpoint; the global exception
handler returns raw `str(exc)` to clients (`main.py:80` — internal detail
leakage); `upload_document` writes files using the client-supplied filename
into `uploads/` (`main.py:179` — collision and path-safety issues); court
documents and ID images go to Google's API; and `redact_sensitive_info` in
`ocr_extractor.py:14` — meant to redact IDs from logs — **is a stub that
returns the data unchanged** while the log line right after it implies
redaction happened. For a court-data company, this is *the* domain-relevant
weak spot; expect it.
**Honest answer:** "Security is demo-grade and I'd rather enumerate the gaps
myself than have you find them: open CORS, no auth, error messages leak
internals, uploaded filenames aren't sanitized, and my log-redaction function
is honestly a stub — it returns data unchanged, which is worse than absent
because it implies safety it doesn't provide. Biggest of all for this domain:
raw legal documents leave the machine to a third-party API. A real deployment
inverts that — data residency first, models on-prem or in-region, auth and
audit logging from day one. I know where every hole is, which I'd argue is the
prerequisite for fixing them."

### Weak Spot 5: No evaluation — I can't state precision or recall
If asked "what's your false-positive rate?" or "how do you know detection
quality didn't drop when you changed a prompt?" — there is no number. Testing
is manual golden-set runs with engineered documents. Related fragilities you
should name before they're found: the dedup key breaks if Gemini paraphrases a
quote between duplicates (near-duplicates survive dedup); severity ratings are
LLM judgment with no rubric-consistency check; `_extract_city` does substring
matching (a claim mentioning "Mumbai Road, Pune" matches both cities — order
of the sorted-by-length loop decides); `_parse_time` grabs the *first*
time-like pattern in the text, right or wrong.
**Honest answer:** "I can't give you a precision number, and I consider that
the project's biggest genuine gap — for a legal tool, false positives erode
trust and false negatives are missed exculpatory evidence, so the eval harness
isn't optional. What I'd build: a labeled corpus of document pairs with known
contradiction sets, run the pipeline on every prompt or model change, track
precision and recall per contradiction type. The deterministic parts are
already unit-testable pure functions. If I joined your team, 'how do we
measure whether the AI is right' is the question I'd want to own — this
project taught me it's the hard one."

---

## FINAL REHEARSAL CHECKLIST (two days)

**Day 1:** Read Section 2 with the actual files open, tracing every line
reference until you can narrate the flow from memory. Read each war story,
then open the commit (`git show aa5002b`, `git show c50bac0`,
`git show f6b551a`) and connect story to diff. Say each 60-second version
aloud 3 times.

**Day 2:** Deliver the Section 1 walkthrough aloud, twice, with screen-sharing
practice (know which files you'll open when). Have someone (or an AI) fire the
15 questions at you cold, out of order. Re-read the weak spots last — those
answers must be the most fluent ones you have, because they're delivered under
pressure. Consider fixing the README (Weak Spot 1) tonight; it converts your
worst exposure into your best story.

**Before the interview:** run the demo end-to-end once (`/docs` → upload two
conflicting .txt files) so you know your API key works and roughly how long a
request takes. Nothing kills a walkthrough like a live 503.
