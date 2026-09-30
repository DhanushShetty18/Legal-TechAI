# Engineering Decisions

A running record of the load-bearing decisions in Legal-TechAI, why they were
taken, and what we accepted in exchange. Newest section first.

---

## Camera Filing → Live Sale Deed Generation

Upgrade of the Camera Filing feature: uploaded documents are read, the
particulars are confirmed, and a court-ready Sale Deed is written live on screen
and downloaded as a print-ready PDF.

Reference document: `Sale-Deed.pdf` at the repository root — the model draft used
as the gold standard for structure, recital order, clause language and the
signature/thumb-impression pages.

### 1. `frontend/` and `backend/` are the deployed targets, not `e-filing-updated/`

**Decision.** All work landed in `frontend/` (Vercel →
`legal-techai-frontend.vercel.app`) and `backend/` (Render →
`legal-techai.onrender.com`). `e-filing-updated/` was left untouched.

**Why.** The repository carries two near-identical Next.js trees. The root
`vercel.json` pointed its build at `e-filing-updated/frontend`, which suggested
that is what ships — but it is not. Probing the live site settles it: the served
`/file-case` page contains the string `Intelligent Case Filing Checklist`, which
exists only in `frontend/`.

**The deploy was broken, and had been since the restructure.** `/stamp-duty`
returned 404 live even after that commit reached `main`. Vercel's build log gave
the reason:

```
Warning: Could not identify Next.js version, ensure it is defined as a project dependency.
Error: No Next.js version detected. Make sure your package.json has "next" in
either "dependencies" or "devDependencies". Also check your Root Directory
setting matches the directory of your package.json file
```

The project's Root Directory is the **repository root**, where there is no
`package.json` at all. Vercel's Next.js detector reads `package.json` at the Root
Directory, so `"framework": "nextjs"` combined with `cd frontend && npm run build`
can never work — and `vercel.json` cannot set Root Directory, which is a
dashboard-only setting. Every deploy since `b786378` had failed, and Vercel kept
serving the last good deployment, which is why the Stamp Duty page never appeared
live and why the site looked healthy while being frozen.

**Resolution.** Root Directory set to `frontend` in the Vercel dashboard. Next.js
is then auto-detected from `frontend/package.json` and no build configuration is
needed, so the root `vercel.json` was deleted rather than left to re-break the
deploy if the setting is ever reset.

**Trade-off.** `e-filing-updated/` no longer has any deploy path. It is an
isolated experiment and needs its own Vercel project. **The duplicate tree is
still worth deleting** once its Live Compilation Engine work is either merged
into `frontend/` or abandoned.

### 2. The statutory clauses are template-locked; only the bespoke passages are model-authored

**Decision.** The deed is assembled from a deterministic skeleton
(`generator.build_sections`) that mirrors the reference draft. The model writes
exactly three passages — the title recital, the agreement recital, and the
Schedule's property description. The fifteen operative clauses, the attestation,
the boundaries block and the signature pages are fixed text.

**Why.** Those three passages are the genuinely bespoke parts of a conveyance:
they differ for every property and every chain of title. The operative clauses
are settled precedent. A clause that quietly drifts between generations is a
clause that has to be re-registered — at the parties' cost — and a hallucinated
covenant in a registered instrument is a liability, not a bug. Narrowing the
model's remit also means one API call instead of twenty, which is what makes the
flow fast enough to watch.

**Trade-off.** The deed is less "written by AI" than it might appear. That is the
intended trade: the recitals, which are the part a draftsman actually drafts, are
genuinely authored; the boilerplate is reliably correct.

### 3. Generation degrades to precedent wording rather than failing

**Decision.** `stream.stream_document` always produces a complete, registrable
deed. If `GEMINI_API_KEY` is absent, the model call fails, it times out after 45
seconds, or it returns a stub, the deterministic wording for those three passages
is used and the stream reports `source: "template"`.

**Why.** The brief requires the feature to be usable live. The backend runs on a
free Render instance and Gemini is a third-party dependency with quotas and 503s.
A drafting tool that returns nothing when its model is busy is not a drafting
tool. A one-line answer is treated as a failure too — a stub passage in a
registered deed is worse than precedent wording.

**Trade-off.** Two wording paths to maintain. Accepted, because the deterministic
path is also the skeleton, so it is exercised on every single generation.

### 4. The typing animation is driven by the client, not by packet arrival

**Decision.** The backend streams the deed as SSE in small word-group deltas.
The client accumulates those into a target buffer and drains it at a steady rate
in a `requestAnimationFrame` loop, accelerating only when it falls a long way
behind (`deedStream.charsPerTick`).

**Why.** Rendering text as packets arrive produces bursts and stalls, which reads
as a stuttering network rather than as writing. Separating arrival from reveal
gives the smooth Gamma-style effect regardless of network jitter, keeps a 5–10
page deed legible as it fills in, and makes the animation frame-rate independent.
The acceleration curve matters: without it, a user whose deed generated in two
seconds would still watch a queue drain for a minute.

**Trade-off.** The deed is complete on the client before it has finished
appearing. Mitigated with a "Skip to the end" control.

### 5. Model latency is overlapped with the animation, not placed in front of it

**Decision.** The narrative model call is submitted to a background thread when
generation starts, and joined only when the walker reaches the first
model-authored section (`title_recital`, the eighth section).

**Why.** By the time the walker needs that text, the client has been typing out
the title, preamble and party blocks for several seconds. The model's 3–8 seconds
are spent behind the animation instead of as a blank screen before it.

**Trade-off.** The skeleton is built twice per generation. It is pure and cheap;
measured in microseconds against seconds of network.

### 6. Documents are extracted one at a time, but merged on the backend

**Decision.** Each upload is extracted on capture via `POST /drafting/extract`
(one Gemini call, seconds). The client holds the per-document results and posts
them to `POST /drafting/merge` when the review form opens.

**Why.** Three alternatives were rejected. Extracting everything at the end means
a single request carrying up to 20 images and 20 sequential model calls — a
guaranteed timeout on Render's free tier. Merging in the client duplicates the
precedence rules in two languages, where they will drift. Chunked batch uploads
need cross-request merge state. Per-document extraction gives feedback in
seconds, keeps payloads small, and keeps one authoritative implementation of
precedence.

**Trade-off.** An extra round trip when the review opens. It carries JSON only,
and it falls back to a client-side merge if that request fails, so the review
still opens offline.

### 7. Extraction prompts are scoped per document, and identifiers are re-derived from the raw text

**Decision.** Each checklist entry declares the fields it is expected to yield
(`checklists.extracts`), and the prompt is built from just those. The model also
returns the verbatim text it read, and PAN / Aadhaar / pincode are re-derived
from that text by pattern; a pattern match beats the model's structured answer.

**Why.** Asking for 52 fields from an Aadhaar card invites invention; asking for
six raises recall and cuts tokens. The failure mode that matters for identifiers
is not a missing value but a *confidently mis-transcribed* one — a vision model
reading a faint scan will happily return a plausible PAN with four leading
letters. The text it transcribed is better evidence than the field it inferred.

**Trade-off.** Scoping means a particular glimpsed on an unexpected document is
not captured. Acceptable: the review form lets the user type anything in, and
`merge` prefers the document that declares a field as its authoritative source.

### 8. Aadhaar is masked at the point of extraction

**Decision.** `mask_aadhaar` reduces an Aadhaar number to `XXXX XXXX 9012` inside
`extract_from_document`, before the value is stored, returned or logged.

**Why.** Masking at render time leaves the full number in API responses, client
memory and logs. Masking at the boundary means the full number never exists past
the extractor. A test asserts no 12-digit group survives anywhere in the
generated deed.

**Trade-off.** The full number cannot be recovered for a field that legitimately
needs it at registration. The registrar takes that from the original document.

### 9. The PDF prints what the user approved, not a re-derivation

**Decision.** `POST /drafting/export/pdf` accepts the `sections` array the user
actually read on screen, including any edits. It only rebuilds from `fields` when
`sections` is omitted.

**Why.** WYSIWYG is a correctness property for a legal instrument. If the PDF
re-ran generation, a non-deterministic model call could produce a document that
differs from the one the user approved — and they would sign it without knowing.

**Trade-off.** The client can post arbitrary section text. This is a drafting
tool for the user's own document, so that is a feature; the text is escaped
before rendering.

### 10. PDF geometry targets legal/green paper and binding

**Decision.** A4, 1.6" left margin, 0.9" right, 1.0" top and bottom, Times
throughout, justified body, hanging-indent clauses, running page numbers, and a
`first_page_top_offset` that clears pre-printed e-stamp certificates.

**Why.** Deeds are printed, bound along the left edge and read in a registrar's
office. A symmetric web-style margin puts clause text into the binding. The
first-page offset exists because the deed is often printed onto stamp paper that
already carries a certificate at the head.

### 11. PDF for filing, DOCX for amendment

**Decision.** Both are offered. The PDF is the print-and-register artefact; the
DOCX is the copy an advocate opens for final amendments, with matching margins
and body font.

**Why.** The brief asks for a "downloadable and editable PDF". PDF is not an
editing format, and a form-field PDF is a poor editing experience. Splitting the
two requirements serves both honestly. In-app "Edit & Regenerate" and
click-to-edit paragraphs cover light changes without leaving the flow.

### 12. The document checklist ships with the client as well as the server

**Decision.** `frontend/src/lib/caseTypes.ts` mirrors
`backend/modules/drafting/checklists.py` and `schema.py`. Document `id` values are
identical on both sides.

**Why.** The backend cold-starts in up to two minutes on Render's free tier, and
the checklist is the first thing the page must paint. Shipping it client-side
makes the flow usable immediately; the backend is needed only once a document is
actually uploaded. The `id` values are the contract — they tell the extractor
which prompt to use.

**Trade-off.** Deliberate duplication that can drift. Both sides are covered by
tests asserting the same invariants (five phases, unique ids, required-field
coverage), and the shared ids are what would break loudly. **If a third consumer
appears, this should move to a generated artefact.**

### 13. Sale Deed is draftable; Divorce Case keeps its existing behaviour

**Decision.** `DRAFTABLE_CASE_TYPES` contains only `Sale Deed`. Selecting
`Divorce Case` shows its original checklist and the original "Submit Entire
Filing" path.

**Why.** The brief scopes court-ready generation to the Sale Deed, using the
reference PDF as the standard. There is no equivalent reference for a divorce
petition, and inventing one would produce a document nobody vouched for. The
existing divorce flow was working and is left alone.

### 14. Tests target the logic, not the model

**Decision.** 140 backend tests (`backend/test_drafting.py`) and 50 frontend
tests. Every Gemini call is mocked. Assertions cover the deed's structure and
language, Indian number-to-words and currency grouping, extraction precedence,
identifier rescue, Aadhaar masking, SSE framing at arbitrary chunk boundaries,
the typewriter, PDF page count and content, DOCX structure, and every endpoint
including its failure paths.

**Why.** Tests that call the real model are slow, cost money and fail on quota
rather than on regressions. What needs guarding is the deterministic machinery
around the model — and, critically, the *degradation* paths: there are explicit
tests that a failed, timed-out or stub-returning model still yields a complete
deed.

**Trade-off.** No test asserts the model's prose is good. That is a judgment
call, verified by reading the live output.

### 15. A real bug the tests caught

`parse_amount` stripped every non-digit character and kept the dot, so
`"Rs. 45,00,000/-"` — the exact format OCR returns from an Indian payment
receipt — parsed as `0.45`. The sale consideration would have been recited as
"Rupees Zero Only" in a registered deed. Fixed by *locating* the number with a
pattern rather than filtering the string.

Recorded because it is the argument for the strict number-formatting tests: the
input looked obviously fine and the failure was silent.

---

## API surface added

| Endpoint | Purpose |
| --- | --- |
| `GET /drafting/case-types` | What can be filed, and what can be drafted |
| `GET /drafting/requirements?case_type=` | Document checklist + field definitions |
| `POST /drafting/extract` | Uploads → extracted particulars (per document) |
| `POST /drafting/merge` | Fold per-document results into one field set |
| `POST /drafting/preview` | Whole deed in one shot, no model call |
| `POST /drafting/generate` | **SSE** — the deed, live, section by section |
| `POST /drafting/export/pdf` | Court-ready PDF of the approved deed |
| `POST /drafting/export/docx` | Editable DOCX of the same deed |

New runtime dependencies: `reportlab`, `python-docx`.

## Running the tests

```bash
cd backend && python -m pytest test_drafting.py -v     # 140 tests
cd frontend && npm test                                # 50 tests
```
