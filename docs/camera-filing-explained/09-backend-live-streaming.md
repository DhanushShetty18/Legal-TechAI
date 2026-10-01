# 09 — `backend/modules/drafting/stream.py`, Function by Function

This file is the backend half of the "live writing" effect — it does not
decide *what* the deed says (that's `generator.py`, document 08) or *how*
to display it (that's the frontend, document 04); it decides the **order
and pace at which the already-decided content is revealed to the network**,
and it is the file responsible for the single cleverest piece of
engineering in this feature: hiding the AI's multi-second latency behind
content the user is already reading. Read
[00-prerequisites.md](./00-prerequisites.md) section B3 (generators/`yield`)
again before this document — every function here either is a generator or
directly manages one.

## Why this file exists, and what breaks without it

Without this file, `routers/drafting.py`'s `/generate` endpoint would have
nothing to stream — `generator.py`'s `build_sections` already returns the
*complete* deed instantly (that's exactly what `/preview` does with it).
This file's entire reason to exist is turning that instant, complete result
into a **paced sequence of events** that arrives progressively, and —
critically — managing the AI call concurrently with that pacing so the
model's latency is spent productively rather than as dead time in front of
the user. **What breaks without it:** the `/generate` SSE endpoint has no
backing function to call; the live-typing effect becomes impossible to
implement well, because there would be no way to start producing visible
output before the model call (which the fixed clauses don't need at all)
has to finish.

## The constants and the system prompt

```python
MODEL_NAME = "gemini-2.5-flash"
NARRATIVE_SECTIONS = ("title_recital", "agreement_recital", "schedule_body")
WORDS_PER_PAGE = 330
SIGNATURE_PAGES = 2
WORDS_PER_DELTA = 6
NARRATIVE_TIMEOUT_SECONDS = 45

_NARRATIVE_SYSTEM_PROMPT = """
You are a senior conveyancing draftsman in India who prepares Sale Deeds for registration ...
You write only the three bespoke passages of a Sale Deed. You never write the operative clauses ...
""".strip()
```

Note `MODEL_NAME`, `NARRATIVE_SECTIONS`, `WORDS_PER_PAGE`, and
`SIGNATURE_PAGES` are actually defined in `generator.py` and imported here
(`from .generator import MODEL_NAME, NARRATIVE_SECTIONS, build_sections,
estimate_pages, render_plain_text`) — they're listed again here because
this file is the one that actually *uses* them for the narrative-vs-template
decision. `WORDS_PER_DELTA` (6) and `NARRATIVE_TIMEOUT_SECONDS` (45) are
this file's own constants: how many words go into each SSE `delta` event,
and how long the generation is willing to wait for the AI before giving up
on it and using template wording instead.

`_NARRATIVE_SYSTEM_PROMPT` is the standing instruction for the *narrative*
model call specifically (distinct from `extraction.py`'s system prompt,
which is for reading documents, not writing prose) — it explicitly scopes
the model to **only** the three bespoke passages, forbids inventing any
particular not supplied, and dictates house style: formal Indian
conveyancing register, referring to the parties only as "the Vendor"/"the
Purchaser," continuous prose with no markdown or bullet points.

## `_narrative_prompt(fields)`

```python
def _narrative_prompt(fields: Dict[str, Any]) -> str:
    supplied = "\n".join(f"- {key}: {value}" for key, value in sorted(fields.items()) if str(value or "").strip()) \
        or "- (no particulars supplied)"
    return f"""
Particulars extracted from the parties' documents:
{supplied}

Draft the three bespoke passages of this Sale Deed and return them as a single JSON object with exactly these keys:

{{
  "title_recital": "The WHEREAS recital. ...",
  "agreement_recital": "The AND WHEREAS recital. ...",
  "schedule_body": "The Schedule description of the property. ..."
}}

Return the JSON object only.
""".strip()
```

**Job:** build the per-request prompt listing every known particular, plus
detailed per-passage instructions for exactly what each of the three
recitals/Schedule should contain.
**Calls:** nothing.
**Line by line:**
- `sorted(fields.items())` — fields are listed in a deterministic
  (alphabetical) order rather than whatever order the dict happens to
  iterate in — this makes the prompt's shape reproducible across requests
  with the same fields, which matters for debugging and for any future
  prompt-caching.
- `if str(value or "").strip()` — blank/missing fields are omitted from the
  list entirely, rather than being shown to the model as `"- vendor_pan:
  None"` or similar, which the house-style rule ("never invent... where a
  particular is missing, write the passage so it reads correctly without
  it") depends on the model simply not seeing a field exists at all when
  it's absent.
- `or "- (no particulars supplied)"` — a defensive fallback for the
  pathological case where *nothing* was supplied at all, so the prompt is
  never sent with a blank list that might confuse the model about the
  instruction's intent.
- The JSON-shaped instruction template in the prompt is — like
  `extraction.py`'s `_field_labels` — not real JSON being parsed, just a
  structure shown to the model so its eventual real answer naturally
  matches these exact three keys.

## `author_narrative(fields)`

```python
@retry_on_failure(retries=2, delay=2)
def author_narrative(fields: Dict[str, Any]) -> Dict[str, str]:
    import google.generativeai as genai
    model = genai.GenerativeModel(model_name=MODEL_NAME, system_instruction=_NARRATIVE_SYSTEM_PROMPT)
    response = model.generate_content(_narrative_prompt(fields))
    data = extract_json(response.text)
    if not isinstance(data, dict):
        raise ValueError(f"Expected a JSON object, got {type(data).__name__}")

    narrative = {}
    for key in NARRATIVE_SECTIONS:
        text = str(data.get(key) or "").strip()
        if len(text.split()) >= 25:
            narrative[key] = _strip_markdown(text)
    if not narrative:
        raise ValueError("Model returned no usable passage")
    return narrative
```

**Job:** the actual call to Gemini for the three bespoke passages, plus
quality filtering of the result — this is the function `stream_document`
runs in a background thread (see below).
**Calls:** `_narrative_prompt`, `extract_json` (`gemini.py`),
`_strip_markdown`; the Gemini SDK.
**Line by line:**
- `@retry_on_failure(retries=2, delay=2)` — fewer retries than extraction's
  three (this call is slower and on the critical path to the user seeing
  anything AI-authored at all, so fewer, cheaper retries are preferred
  here — two attempts with a 2-second gap, rather than burning more time
  before falling back to the template).
- After getting and JSON-parsing the response (same `extract_json` pattern
  as extraction), **this is the quality gate**: `for key in
  NARRATIVE_SECTIONS:` — for each of the three expected keys, only accept
  it `if len(text.split()) >= 25` — **at least 25 words**. This is the
  literal implementation of decision 3's "a one-line answer is treated as a
  failure too — a stub passage in a registered deed is worse than
  precedent wording." A model that answers a passage with something like
  `"The Vendor owns the property."` (5 words) is filtered out here just as
  surely as if the whole call had failed outright — that key is simply
  absent from the returned `narrative` dict, and `generator.py`'s
  `narrative.get(key) or _default_*(fields)` pattern (document 08) will
  fall back to the template wording for that specific passage, even while
  the *other* two passages (if they passed the length check) are still used
  as AI-authored.
- `if not narrative: raise ValueError(...)` — if **every single** passage
  failed the length check, the whole call is treated as a failure (which
  `retry_on_failure` will retry, and which `stream_document` below will
  catch and fall back on entirely) — there's no point returning an empty
  dict as a "success."

## `_strip_markdown(text)`

```python
def _strip_markdown(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"(?m)^\s*#{1,6}\s*", "", text)
    text = re.sub(r"(?m)^\s*[-*]\s+", "", text)
    return text.strip()
```

**Job:** a model asked to "write continuous prose, no markdown" will still
occasionally slip in Markdown formatting anyway (bold text, headings, bullet
points) — this strips the three most common cases before the text is used
as legal document prose, where literal asterisks or pound signs would be
visibly wrong.
**Calls:** nothing.
**Line by line:**
- `re.sub(r"\*\*(.+?)\*\*", r"\1", text)` — matches `**bold text**` and
  replaces it with just the inner text (the `(.+?)` capture group,
  non-greedy so it stops at the *nearest* closing `**` rather than the
  last one in the whole string), discarding the asterisks.
- `re.sub(r"(?m)^\s*#{1,6}\s*", "", text)` — `(?m)` enables multiline mode,
  so `^` matches the start of *any* line, not just the start of the whole
  string; this strips a Markdown heading marker (`#` through `######`) and
  any following whitespace from the start of any line.
- `re.sub(r"(?m)^\s*[-*]\s+", "", text)` — similarly strips a leading
  bullet-point marker (`-` or `*` followed by whitespace) from the start of
  any line.
- `.strip()` — trims any leading/trailing whitespace left over from the
  substitutions.

## `llm_available()`

```python
def llm_available() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))
```

**Job:** a one-line check for whether an API key is configured at all —
used by `routers/drafting.py`'s `/case-types` endpoint to report
`llmAvailable` to any consumer that wants to know in advance, and internally
by `stream_document` (below) to decide its default behaviour when the
caller doesn't explicitly specify `use_llm`.

## `iter_deltas(body, words_per_delta)`

```python
def iter_deltas(body: str, words_per_delta: int = WORDS_PER_DELTA) -> Iterator[str]:
    if not body:
        return
    tokens = re.findall(r"\S+\s*", body)
    for start in range(0, len(tokens), words_per_delta):
        yield "".join(tokens[start:start + words_per_delta])
```

**Job:** split one section's full body text into small word-group chunks
for streaming — this is literally what makes the deed arrive progressively
rather than as one giant block per section.
**Calls:** nothing (a generator function, prerequisites B3).
**Line by line:**
- `if not body: return` — an empty section body (shouldn't normally
  happen, but some structural sections could theoretically have no text)
  yields nothing at all, rather than one empty delta.
- `tokens = re.findall(r"\S+\s*", body)` — this is the key design choice:
  the pattern `\S+\s*` matches one run of non-whitespace characters
  (`\S+`, a "word") followed by *any* trailing whitespace (`\s*`, which
  could be zero or more spaces, a newline, or nothing at all if it's the
  very last word). Because the pattern captures the whitespace **as part
  of** each token, `re.findall` returns a list of tokens that, concatenated
  back together in order, reconstructs `body` **exactly, byte for byte** —
  including every space and newline in their original positions. This is
  the property the module docstring calls out explicitly: "concatenating
  everything this yields reproduces `body` byte for byte," which is what
  lets the frontend's `applyEvent` (document 04) treat every delta as a
  pure append with zero risk of losing or duplicating whitespace at chunk
  boundaries.
- `for start in range(0, len(tokens), words_per_delta): yield
  "".join(tokens[start:start + words_per_delta])` — walks the token list in
  strides of `words_per_delta` (6, by default), joining each group of up to
  6 tokens back into one string and yielding it. The very last group may
  have fewer than 6 tokens if the total doesn't divide evenly — Python
  slicing handles that automatically (`tokens[start:start+6]` simply
  returns however many elements remain if fewer than 6 are left).

## `_status(step, message)`

```python
def _status(step: str, message: str) -> Dict[str, Any]:
    return {"type": "status", "step": step, "message": message}
```

A one-line helper for building a `"status"` event dict, used repeatedly in
`stream_document` below purely to avoid retyping `{"type": "status", ...}`
at each call site.

## `stream_document(fields, use_llm)` — the main event

This is the function `routers/drafting.py`'s `/generate` endpoint iterates
over directly. It is itself a generator (every `yield` in it produces one
SSE event, in order, to the client).

### Setting up

```python
def stream_document(fields, use_llm=None):
    if use_llm is None:
        use_llm = llm_available()

    missing = missing_required_fields(fields)
    yield _status("validate", "Verifying extracted particulars")
    if missing:
        yield {"type": "warning", "message": f"{len(missing)} required particular(s) were left blank and appear in the deed as fill-in lines.", "missingRequired": missing}

    narrative: Dict[str, str] = {}
    narrative_source = "template"
    pending: Optional[Future] = None
    executor: Optional[ThreadPoolExecutor] = None

    if use_llm:
        yield _status("draft", "Drafting the recitals and Schedule")
        executor = ThreadPoolExecutor(max_workers=1)
        pending = executor.submit(author_narrative, dict(fields))
```

**Line by line:**
- `if use_llm is None: use_llm = llm_available()` — the caller (the
  `/generate` endpoint, passing through the frontend's optional `useLlm`
  flag) can force the behaviour either way; left unset, it's decided by
  whether a Gemini key is actually configured at all.
- `missing = missing_required_fields(fields)` — computed once, up front,
  using `extraction.py`'s function (document 07) — reused both for the
  warning event emitted here and for the final `"done"` event's
  `missingRequired` field.
- The `"warning"` event is emitted **immediately**, before any drafting
  work begins — so a client watching the stream learns right away (not
  buried at the end) that some required particulars are missing and will
  appear as fill-in lines.
- `if use_llm:` — **this is where the background thread is actually
  started.** `ThreadPoolExecutor(max_workers=1)` creates a thread pool with
  exactly one worker thread. `executor.submit(author_narrative,
  dict(fields))` **hands the slow, blocking network call off to that
  background thread immediately and returns instantly** — `pending` is a
  `Future` object representing "the eventual result," not the result
  itself; the main generator function keeps running on the original thread
  without waiting for it at all. `dict(fields)` passes a **copy** of the
  fields dict into the thread, not the original — important because
  dictionaries are not safe to read and write from two threads
  simultaneously without this kind of defensive copying.

### The walk through the skeleton

```python
    try:
        skeleton = build_sections(fields)
        deadline = time.monotonic() + NARRATIVE_TIMEOUT_SECONDS
        resolved = False

        yield {"type": "meta", "sectionCount": len(skeleton), "estimatedPages": estimate_pages(skeleton),
               "clauseCount": sum(1 for s in skeleton if s["style"] == "clause")}
        yield _status("compose", "Composing the deed")

        emitted: List[Dict[str, Any]] = []
        for index, section in enumerate(skeleton):
            if not resolved and section["id"] in NARRATIVE_SECTIONS:
                resolved = True
                if pending is not None:
                    remaining = max(0.0, deadline - time.monotonic())
                    try:
                        narrative = pending.result(timeout=remaining)
                        narrative_source = "gemini"
                        yield _status("draft-done", "Recitals drafted")
                    except Exception as exc:
                        logger.warning("Narrative drafting failed: %s", exc)
                        yield {"type": "notice", "message": "Drafted from the firm's precedent wording."}
                skeleton = build_sections(fields, narrative)

            section = skeleton[index]
            yield {"type": "section", "index": index, "id": section["id"], "style": section["style"], "heading": section["heading"]}
            for delta in iter_deltas(section["body"]):
                yield {"type": "delta", "id": section["id"], "text": delta}
            yield {"type": "section_end", "id": section["id"], "body": section["body"]}
            emitted.append(dict(section))

        yield {"type": "done", "sections": emitted, "plainText": render_plain_text(emitted),
               "estimatedPages": estimate_pages(emitted), "source": narrative_source, "missingRequired": missing}
    finally:
        if executor is not None:
            executor.shutdown(wait=False)
```

**Job:** this is the loop that produces every `section`/`delta`/
`section_end` event, and the exact point where the background AI call is
either joined successfully, timed out, or given up on.
**Calls:** `build_sections`, `estimate_pages`, `render_plain_text` (all
`generator.py`, document 08), `iter_deltas`.
**Line by line, in the order things actually happen:**
- `skeleton = build_sections(fields)` — build the deed **without** any
  narrative overrides yet — `narrative` is still the empty dict declared
  above. Every section before the first narrative-eligible one will use
  this exact skeleton, with template wording, which is correct because the
  template wording and the eventual AI wording are identical for every
  *other* section anyway (only `title_recital`, `agreement_recital`, and
  `schedule_body` would ever differ).
- `deadline = time.monotonic() + NARRATIVE_TIMEOUT_SECONDS` —
  `time.monotonic()` is a clock guaranteed to only ever move forward (unlike
  wall-clock time, which can jump if the system clock is adjusted) —
  exactly the right choice for measuring a timeout. The deadline is fixed
  **once, up front**, not reset each time it's checked — so the 45-second
  budget covers the time from when drafting started, not from whenever the
  walker happens to reach the narrative section.
- `yield {"type": "meta", ...}` — reports the skeleton's total section
  count, estimated page count, and clause count, all computed from this
  first (template-only) skeleton build — these counts don't change once
  the narrative is folded in (the number of *sections* is identical either
  way; only three sections' *text* differs).
- `for index, section in enumerate(skeleton):` — walk every section in
  order.
- **The critical line**: `if not resolved and section["id"] in
  NARRATIVE_SECTIONS:` — `resolved` starts `False` and is only ever set
  `True` once, the very first time the walker reaches a section whose id is
  one of the three narrative-eligible ones (`title_recital` is the eighth
  section in the skeleton, per `DECISIONS.md` decision 5 — by the time
  this fires, the title, preamble, BETWEEN/party blocks, AND, and the
  "expressions" clause have already been fully yielded to the client). This
  is the exact moment — and the *only* moment — this function ever
  interacts with the background thread.
- `if pending is not None:` — only true if `use_llm` was set (the thread
  was actually started). `remaining = max(0.0, deadline -
  time.monotonic())` — however much of the original 45-second budget is
  left *right now* (clamped to never go negative) — because several
  seconds have typically already elapsed while the earlier sections were
  being yielded, `remaining` here is usually meaningfully **less** than 45
  full seconds, which is precisely the overlap this design is exploiting.
- `narrative = pending.result(timeout=remaining)` — this is the one
  blocking call in the whole generator: **wait up to `remaining` seconds**
  for the background thread's result. If `author_narrative` already
  finished by now (very likely, since it typically takes 3-8 seconds and
  several seconds have already passed), this returns **immediately** with
  no wait at all. If it hasn't, this blocks the generator (and therefore
  the whole SSE stream — no further events are yielded while waiting here)
  until it does, or until the timeout expires. On success,
  `narrative_source = "gemini"` records that the AI path was used, and a
  `"draft-done"` status event is emitted.
- `except Exception as exc:` — catches **both** a timeout
  (`concurrent.futures.TimeoutError`, a subclass of `Exception`) **and**
  any exception that `author_narrative` itself ultimately raised after
  exhausting its own retries (a real API failure, invalid JSON, or every
  passage failing the 25-word quality gate). Either way: log it, and yield
  a `"notice"` event telling the client plainly that precedent wording was
  used instead — this is the user-visible trace of decision 3's
  degradation path actually firing.
- `skeleton = build_sections(fields, narrative)` — **this is the "build it
  twice" moment** `DECISIONS.md` decision 5 calls out as "pure and cheap":
  the skeleton is rebuilt, this time passing whatever `narrative` dict
  resulted (either the AI's successful passages, a partial dict if only
  some passages passed the quality gate, or still the empty dict if the
  whole thing failed or was never attempted) — `build_sections` itself
  (document 08) is what actually decides, per-section, whether to use a
  narrative value or its own default.
- `section = skeleton[index]` — **re-fetches the current section from the
  freshly rebuilt skeleton**, by the same index the loop is already at.
  This single line is why the *current* section (the one the walker just
  determined is narrative-eligible) picks up its AI-authored text if any
  was produced — every section *before* this index was already yielded
  from the old skeleton and is unaffected; every section *after* this index
  will naturally be read from the new skeleton on subsequent loop
  iterations, since `skeleton` itself was reassigned.
- The three `yield` lines per section — `"section"` (announcing it's
  starting, with its style/heading so the client can render the right
  container immediately), then one `"delta"` event per word-group from
  `iter_deltas`, then `"section_end"` (the authoritative full body, as a
  repair mechanism for any dropped delta, per document 04's explanation) —
  are exactly what the frontend's `applyEvent` (document 04) is built to
  consume.
- `emitted.append(dict(section))` — keeps a running copy of every section
  actually sent, used to build the final `"done"` event's `sections` field
  and its `plainText`/`estimatedPages` (recomputed from the *actual* final
  content, which could differ slightly from the very first `"meta"`
  event's estimate if narrative text came out a different length than the
  template default).
- The final `yield {"type": "done", ...}` — the one event the frontend's
  `handleEvent` (document 04) treats as authoritative, carrying the
  complete section list, flattened plain text, final page estimate,
  `narrative_source` (`"gemini"` or `"template"` — this is exactly what
  `page.tsx` shows as "recitals drafted by the AI" vs. "drafted from
  precedent wording"), and the `missingRequired` list computed at the very
  start.
- `finally: if executor is not None: executor.shutdown(wait=False)` — **this
  runs no matter how the function exits** — normal completion, an
  exception propagating out, or (in principle) the generator being closed
  early by its consumer. `shutdown(wait=False)` tells the thread pool to
  stop accepting new work and **not** block waiting for the current task to
  finish — appropriate here because by this point in the flow the
  narrative result (if any) has already been joined; if for some reason it
  hadn't (an exception before reaching the narrative section), there's no
  reason to make the whole HTTP response hang around waiting for a
  background thread nobody will ever read the result of again.

---

Next: **[10-backend-pdf-and-docx-export.md](./10-backend-pdf-and-docx-export.md)**.
