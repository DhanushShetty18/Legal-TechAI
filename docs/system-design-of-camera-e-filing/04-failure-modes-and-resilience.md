# 04 — Failure Modes and Resilience

For every real dependency and risk this feature has, this document states:
what happens when it fails, which exact code is responsible for that
behaviour, and whether the result is "still works, degraded" or "visibly
fails, but safely." Read this after document 03 — these are the same
decisions, organised instead by *dependency* so you can use this as a
reference while debugging or extending the system.

## Quick reference table

| Dependency / risk | If it fails... | Degrades gracefully? | Responsible code |
|---|---|---|---|
| `GEMINI_API_KEY` missing entirely | No AI drafting is attempted at all; deed uses template wording for all three narrative passages | Yes | `gemini.py` module load (just warns); `stream.py`'s `llm_available()` |
| Gemini API down / rate-limited / times out during narrative drafting | That generation's recitals use template wording; a notice is shown | Yes | `stream.py`'s `author_narrative` retry + `stream_document`'s `except Exception` around `pending.result()` |
| Gemini API down during document extraction | That document's fields come back empty; upload still succeeds | Yes | `extraction.py`'s `extract_from_document`'s `except Exception` |
| Gemini returns malformed/non-JSON text | Treated identically to an API failure — retried, then falls back | Yes | `gemini.py`'s `extract_json` raising; caught by the same paths above |
| Gemini returns a too-short narrative passage | That *one* passage falls back to template; other passages can still be AI-authored | Yes | `stream.py`'s `author_narrative`'s 25-word filter |
| Backend is cold / asleep (Render free tier) | Every request waits up to ~2 minutes; UI shows an explicit "waking up" message instead of looking frozen | Yes (UX-handled, not avoided) | `lib/api.ts`'s `COLD_START_TIMEOUT_MS`; `page.tsx`'s "can take up to two minutes" copy |
| Backend fully unreachable | The current action fails with a clear error message; already-uploaded documents are not lost | Partially — the action fails, but state isn't corrupted | `describeFailure`; `extractFromImage`'s and `openReview`'s `catch` blocks |
| SSE connection drops mid-stream | Whatever text had already arrived is kept and shown as the final result | Yes | `useDeedGeneration.ts`'s `start()`: `streamDoneRef.current = true` runs unconditionally after the read loop exits |
| Camera permission denied / no camera | Falls back to the file picker automatically | Yes | `page.tsx`'s `startCameraForDoc`'s `catch` block |
| A single malformed SSE frame | That one event is dropped; the stream continues | Yes | `deedStream.ts`'s `parseEventBlock`'s `catch` |
| User navigates away mid-generation | The fetch is aborted and the animation loop stopped; no orphaned work | Yes (resource cleanup) | `useDeedGeneration.ts`'s `useEffect(() => cancel, [cancel])` |
| User closes tab mid-filing | **Everything is lost.** No draft recovery exists. | **No** | Architectural — no persistence layer exists at all |
| Two uploads both claim the same field, neither "authoritative" | First upload (by processing order) wins; no error | By design, not really a failure | `extraction.py`'s `merge_extractions` precedence rule |
| Checklist id drifts between frontend and backend | That specific upload gets the *default* (unscoped, all-fields) extraction prompt instead of a focused one — lower accuracy, not a crash | Yes, silently | `checklists.py`'s `document_by_id` returning `{}` on no match; `extraction.py`'s `target_keys = spec.get("extracts") or SALE_DEED_FIELD_KEYS` |
| PDF/DOCX rendering throws (bad input shape) | Clean 500 response with a message, not a stack trace to the client | Yes | `routers/drafting.py`'s `export_pdf`/`export_docx` `try/except` around rendering |
| User-edited section text contains `<`, `>`, or `&` | Rendered correctly as literal characters, not interpreted as markup | Yes | `pdf.py`'s `_escape` |
| More than 12 files, or a file over 12MB, uploaded | Rejected immediately with a specific 400/413 and message | Yes (rejected cleanly, not silently truncated or crashed) | `routers/drafting.py`'s `MAX_UPLOADS_PER_REQUEST`/`MAX_UPLOAD_BYTES` checks |
| A reverse proxy buffers the SSE response | The "live" effect is destroyed — the whole deed arrives in one burst at the end | **No — this would be a real regression** | `routers/drafting.py`'s `X-Accel-Buffering: no` header is the *only* defence; removing it silently breaks the feature's signature behaviour with no error at all |

## The one true single point of failure: no persistence

Every other row in the table above is handled. This one isn't, and it's
worth being explicit about the actual user-facing cost rather than leaving
it as an abstract "limitation": a user who has photographed fifteen
documents, reviewed and corrected the extracted particulars, and is
halfway through watching a deed generate — and then their phone locks, or
their browser tab crashes, or they accidentally hit back — **loses every
bit of that work**. There is no server-side draft, no `localStorage`
snapshot, nothing. This is the single highest-value piece of resilience
*not yet built* into this feature, and is the first thing worth adding if
this were being hardened for real production use with real users filing
real deeds (as opposed to its current scope, built around a fast, within-
one-session flow).

**What adding it would require, concretely**, since this is exactly the
kind of thing worth reasoning through before writing code: a place to
persist `documentStates`/`fields`/`provenance` (a browser `localStorage`
snapshot is the cheapest version — survives a tab crash, not a lost
device; a backend-persisted draft, keyed by a session or user id, survives
both, but requires solving multi-tenancy per document 02's section 3
first, since a draft needs an owner before it can be safely stored at
all) and a load path on page mount that checks for and offers to resume an
in-progress draft. Note this is *also* exactly the feature that would make
a `/drafting/extract` call need to become idempotent/retriable against
"did I already extract this exact photo" — a new failure mode this
architecture doesn't currently need to think about precisely because it
has no persistence to make inconsistent.

## What a cascading failure would actually look like end to end

Walk the absolute worst realistic case — the backend is cold, the Gemini
key has hit its quota, and the user's network is flaky — through the code,
to see the resilience layers compound rather than just listing them in
isolation:

1. User clicks Camera, captures a photo. `extractFromImage` posts to
   `/drafting/extract` with a 150-second timeout budget
   (`COLD_START_TIMEOUT_MS`).
2. The backend is cold; Render spins it up. This eats up to ~2 minutes in
   the worst case — but the UI already said this could happen
   ("Reading the document... The first request of a session can take up
   to two minutes"), so this is not a silent hang from the user's
   perspective.
3. The backend wakes up, receives the request, calls `extract_from_document`.
   Gemini returns a quota error. `_call_gemini`'s `retry_on_failure` retries
   twice more (with 2-second gaps), still fails.
4. `extract_from_document`'s `except Exception` catches this, logs it,
   and returns `{"fields": {}, "error": "<quota message>"}` — **not** a
   500, not a crash.
5. `extract_documents` (the router) still returns a normal 200 response
   with that empty-fielded, error-flagged result.
6. The frontend's `extractFromImage` sees `docError` is set, shows the
   reassuring banner ("...nothing could be read from it. You can fill
   those particulars in at the review step"), and — critically — **still
   marks the document as `"Uploaded"`.**
7. The user continues capturing the rest of their documents the same way,
   none of which get any AI-extracted fields this time, but every single
   one is recorded as uploaded.
8. The user reaches Review with an entirely empty form and has to type
   every field by hand.
9. The user clicks Generate. `stream_document` tries `author_narrative`;
   same quota error; same retry-then-give-up; `stream_document`'s
   `except Exception` around `pending.result()` catches it, emits a
   `"notice"` event, and continues with template wording for all three
   narrative passages.
10. **The user still ends up with a complete, downloadable, court-ready
    Sale Deed PDF** — every field manually typed, every passage
    template-authored, zero AI involvement anywhere in the pipeline —
    because the deterministic skeleton in `generator.py` never depended on
    any of the failed steps above to produce a legally complete document.

This is the actual point of the whole resilience design, stated plainly:
**total AI unavailability degrades the user experience (manual typing
instead of auto-fill, generic prose instead of personalised recitals) but
never breaks the core promise of the feature** — a usable, complete legal
document always comes out the other end.

Next: **[05-rebuild-from-memory-blueprint.md](./05-rebuild-from-memory-blueprint.md)**.
