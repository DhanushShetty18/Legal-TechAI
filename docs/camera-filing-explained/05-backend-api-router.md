# 05 — `backend/routers/drafting.py`, Function by Function

This file is the backend's front door for the entire feature — the eight
HTTP endpoints every frontend call in documents 02–04 ultimately hits. Read
[00-prerequisites.md](./00-prerequisites.md) sections B4–B6 (FastAPI,
Pydantic, `StreamingResponse`) first.

## Why this file exists, and what breaks without it

This file contains **zero** business logic of its own — no extraction
logic, no deed-text logic, no PDF-rendering logic. Its entire job is: parse
an HTTP request into typed Python objects, call the right function from
`modules/drafting/`, and shape the result back into an HTTP response. This
separation is deliberate — it is the "controller" layer in a classic
layered architecture (expanded on in the system-design folder), and it means
every function in `modules/drafting/` can be unit-tested directly, in plain
Python, with no HTTP server involved at all. **What breaks without this
file:** nothing on the frontend has anywhere to send requests — every
`postJson`/`postForm`/`fetch` call in documents 02–04 would 404.

## How this file gets mounted

```python
router = APIRouter(tags=["Drafting"])
```

This is just a group of routes; nothing exposes it until `backend/main.py`
does:

```python
from routers import demo, ai, rag, inconsistency, ingest, summarizer, ocr_extract, drafting
app.include_router(drafting.router, prefix="/drafting")
```

Every path this file defines as `/case-types`, `/extract`, `/generate`, and
so on is actually served at `/drafting/case-types`, `/drafting/extract`,
`/drafting/generate` — which is exactly what `lib/api.ts` calls.

## The Pydantic request/response models

```python
class SectionModel(BaseModel):
    id: str
    style: str = "preamble"
    heading: str = ""
    body: str = ""

class DocumentResult(BaseModel):
    docId: str
    fields: Dict[str, Any] = Field(default_factory=dict)

class MergeRequest(BaseModel):
    documents: List[DocumentResult] = Field(default_factory=list)
    overrides: Dict[str, Any] = Field(default_factory=dict)
    caseType: str = SALE_DEED

class GenerateRequest(BaseModel):
    fields: Dict[str, Any] = Field(default_factory=dict)
    caseType: str = SALE_DEED
    useLlm: Optional[bool] = None

class ExportRequest(BaseModel):
    fields: Dict[str, Any] = Field(default_factory=dict)
    sections: Optional[List[SectionModel]] = None
    caseType: str = SALE_DEED
    stampPaperOffsetInches: float = 0.0
    filename: Optional[str] = None
```

**Job:** declare the exact shape of every JSON body this router accepts,
which FastAPI uses to validate and parse incoming requests automatically
(prerequisites, B4) — note every field name here (`caseType`, `docId`,
`sections`) is written in `camelCase` to match exactly what the TypeScript
side sends (`MergeResponse`, `ExportRequest` body in `page.tsx`'s `download`)
— Python convention would normally favour `snake_case`, but matching the
wire format exactly here avoids needing any translation layer between the
two sides. `SectionModel` mirrors the frontend's `DeedSection` type from
`deedStream.ts` exactly.

## Two small private helpers

### `_sections_payload(request)`

```python
def _sections_payload(request: ExportRequest) -> List[Dict[str, Any]]:
    if request.sections:
        return [section.model_dump() for section in request.sections]
    return [dict(section) for section in build_sections(request.fields)]
```

**Job:** decide what to actually render for a PDF/DOCX export — the exact
sections the user approved, or a freshly built skeleton if none were sent.
**Calls:** `build_sections` (document 08).
**Line by line:** `if request.sections:` — a non-empty list is truthy; if
the client sent the sections it actually displayed (the normal path, from
`page.tsx`'s `approvedSections()`), use exactly those, converting each
Pydantic `SectionModel` back into a plain dict with `.model_dump()`.
Otherwise (the "Edit & Regenerate" path, or any client that doesn't hold
onto the generated sections), rebuild the deed fresh from `request.fields`
using the same deterministic generator the live stream uses — this
guarantees a complete, well-formed deed is always renderable even with zero
AI involvement.

### `_safe_filename(name, extension)`

```python
def _safe_filename(name: Optional[str], extension: str) -> str:
    stem = "".join(ch for ch in (name or "Sale-Deed") if ch.isalnum() or ch in "-_ ").strip() or "Sale-Deed"
    return f"{stem.replace(' ', '-')}.{extension}"
```

**Job:** turn a user-supplied filename into something safe to put in an
HTTP `Content-Disposition` header and on a filesystem — this is a security
boundary, not just tidiness: an unsanitised filename could contain
characters that break the HTTP header syntax, or (in other contexts) enable
a path-traversal attack.
**Line by line:** `(name or "Sale-Deed")` — default if nothing was supplied.
The generator expression keeps only alphanumeric characters, hyphens,
underscores, and spaces, discarding everything else silently (no slashes,
quotes, or control characters can survive). `.strip() or "Sale-Deed"` — if
after filtering the result is empty (e.g. the input was entirely symbols),
fall back to the default rather than producing a blank filename. The final
f-string replaces spaces with hyphens and appends the extension.

## The endpoints, in the order the frontend calls them

### `GET /case-types` — `list_case_types()`

```python
@router.get("/case-types")
def list_case_types() -> Dict[str, Any]:
    return {
        "caseTypes": [
            {"name": name, "draftable": name in DRAFTABLE_CASE_TYPES,
             "phaseCount": len(phases), "documentCount": sum(len(p["documents"]) for p in phases)}
            for name, phases in REQUIREMENTS_BY_CASE_TYPE.items()
        ],
        "llmAvailable": llm_available(),
    }
```

**Job:** report what case types exist and whether each is draftable — not
actually called by this version of `page.tsx` (which hardcodes its two case
types), but exists as a discoverable API surface and is covered by the
backend test suite. **Calls:** `llm_available` (document 09).
**Line by line:** a list comprehension builds one summary object per
registered case type, counting phases and total documents from the
checklist data structure (document 06) directly rather than hardcoding
counts anywhere.

### `GET /requirements` — `get_requirements(case_type)`

```python
@router.get("/requirements")
def get_requirements(case_type: str = SALE_DEED) -> Dict[str, Any]:
    phases = requirements_for(case_type)
    if not phases:
        raise HTTPException(status_code=404, detail=f"Unknown case type: {case_type}")
    return {"caseType": case_type, "draftable": case_type in DRAFTABLE_CASE_TYPES,
            "phases": phases, "fields": [f.as_dict() for f in SALE_DEED_FIELDS] if case_type == SALE_DEED else []}
```

**Job:** serve the checklist and field catalogue for a case type over the
network — the backend's equivalent of what `caseTypes.ts` already ships
client-side; exists for any consumer that isn't the bundled frontend (and
for tests).
**Calls:** `requirements_for` (document 06).
**Line by line:** `case_type: str = SALE_DEED` — a query parameter with a
default, so `GET /drafting/requirements` with no query string answers for
Sale Deed. `if not phases: raise HTTPException(404, ...)` — an empty list
means an unrecognised case type; FastAPI turns this exception into an actual
404 HTTP response with that detail message (which is exactly what
`describeFailure` on the frontend, document 03, knows how to surface).

### `POST /extract` — `extract_documents(files, doc_ids, case_type)`

```python
@router.post("/extract")
async def extract_documents(
    files: List[UploadFile] = File(...),
    doc_ids: str = Form(""),
    case_type: str = Form(SALE_DEED),
) -> Dict[str, Any]:
    if not files:
        raise HTTPException(status_code=400, detail="No documents were uploaded.")
    if len(files) > MAX_UPLOADS_PER_REQUEST:
        raise HTTPException(status_code=400, detail=f"Upload at most {MAX_UPLOADS_PER_REQUEST} documents per request.")

    ids = [part.strip() for part in doc_ids.split(",")] if doc_ids else []

    results: List[Dict[str, Any]] = []
    for index, upload in enumerate(files):
        content_type = upload.content_type or ""
        if not (content_type.startswith(ACCEPTED_PREFIXES) or content_type in ACCEPTED_TYPES):
            raise HTTPException(status_code=400, detail=f"{upload.filename or 'file'}: expected an image or a PDF.")
        contents = await upload.read()
        if not contents:
            raise HTTPException(status_code=400, detail=f"{upload.filename or 'file'} is empty.")
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"{upload.filename or 'file'} exceeds the 12 MB limit.")

        doc_id = ids[index] if index < len(ids) and ids[index] else "vendor_id"
        results.append(extract_from_document(contents, mime_type=content_type or "image/jpeg", doc_id=doc_id, case_type=case_type))

    merged = merge_extractions(results, case_type=case_type)
    return {
        "caseType": case_type,
        "documents": [{k: v for k, v in result.items() if k != "rawText"} for result in results],
        "fields": merged["fields"], "provenance": merged["provenance"],
        **extraction_summary(merged["fields"]),
    }
```

**Job:** this is the endpoint `extractFromImage` in `page.tsx` calls for
every single photo. It validates every upload, extracts each one via
Gemini, and returns both the per-document results and a merged field set —
even though in the normal flow exactly one file is uploaded per call, the
endpoint is written to handle several at once, which the test suite
exercises directly.
**Calls:** `extract_from_document`, `merge_extractions`, `extraction_summary`
(all document 07).
**Line by line:**
- Two early guards: no files at all is a 400; more than
  `MAX_UPLOADS_PER_REQUEST` (12) is also a 400 — this is a basic abuse/DoS
  guard, capping how much work one request can trigger.
- `ids = [part.strip() for part in doc_ids.split(",")] if doc_ids else []`
  — `doc_ids` arrives as one comma-separated string (`"vendor_id"` for a
  single upload, or `"vendor_id,purchaser_id"` for two), matching what
  `FormData.append("doc_ids", docId)` on the frontend sends; this splits it
  back into a positional list.
- The `for index, upload in enumerate(files):` loop validates **every**
  upload before processing any of them further:
  - `content_type.startswith(ACCEPTED_PREFIXES)` — `ACCEPTED_PREFIXES =
    ("image/",)`, so any `image/*` MIME type is accepted. `content_type in
    ACCEPTED_TYPES` additionally allows `application/pdf` exactly. Anything
    else (a `.txt` file, a `.zip`, an unset content type) is rejected with a
    clear 400.
  - `contents = await upload.read()` — reads the entire file into memory
    (`await` because file I/O here is asynchronous, prerequisites A6/B4).
  - Empty-file and over-12MB checks follow, each a distinct, specific error
    message — the 12MB limit returns **413** (Payload Too Large), the
    semantically correct status code, not a generic 400.
  - `doc_id = ids[index] if index < len(ids) and ids[index] else "vendor_id"`
    — positionally match this file to its declared doc id; if the list ran
    short or that position was blank, fall back to `"vendor_id"` as a
    generic default *rather than crashing* — a defensive default, though in
    practice the frontend always sends a matching id for every file.
  - `extract_from_document(...)` is called once per file — this is the
    function that actually talks to Gemini (document 07); its result is
    appended to `results` regardless of whether extraction succeeded (that
    function never raises — see document 07).
- `merged = merge_extractions(results, case_type=case_type)` — even for a
  single-document request, the results still go through the same merge
  logic the `/merge` endpoint below uses, for one consistent code path.
- The returned `documents` list strips the `rawText` key from each result
  before sending it to the client — the full transcribed text (needed
  server-side for the identifier-rescue regex pass) is not something the
  frontend needs or should receive back over the wire.
- `**extraction_summary(merged["fields"])` — unpacks `fieldsFilled`,
  `fieldsTotal`, `missingRequired`, `readyToGenerate` directly into the
  response dict (Python's `**` dict-unpacking, prerequisites B1).

### `POST /merge` — `merge(request)`

```python
@router.post("/merge")
def merge(request: MergeRequest) -> Dict[str, Any]:
    results = [{"docId": document.docId, "fields": document.fields} for document in request.documents]
    merged = merge_extractions(results, case_type=request.caseType)
    fields = merged["fields"]
    provenance = dict(merged["provenance"])
    for key, value in request.overrides.items():
        if str(value or "").strip():
            fields[key] = value
            provenance[key] = "user"
    return {"caseType": request.caseType, "fields": fields, "provenance": provenance, **extraction_summary(fields)}
```

**Job:** called once, when `page.tsx`'s `openReview` runs — fold every
document's individually-extracted fields into one authoritative set, then
layer the user's own prior edits (`overrides`) on top, so a manual
correction from an earlier visit to the review screen is never silently
reverted by this merge.
**Calls:** `merge_extractions`, `extraction_summary`.
**Line by line:** converts the Pydantic `DocumentResult` list back into
plain dicts (the shape `merge_extractions` expects), runs the same merge
logic as `/extract` across *all* documents at once this time, then loops
over `request.overrides` — anything with a non-blank value there is forced
into `fields` and explicitly stamped `provenance[key] = "user"`, overriding
whatever the merge itself decided for that key.

### `POST /generate` — `generate(request)`

```python
@router.post("/generate")
async def generate(request: GenerateRequest) -> StreamingResponse:
    def event_source():
        try:
            for event in stream_document(request.fields, use_llm=request.useLlm):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as exc:
            logger.exception("Generation failed")
            payload = {"type": "error", "message": str(exc)}
            yield f"data: {json.dumps(payload)}\n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no"})
```

**Job:** the SSE endpoint — the single most important endpoint in the whole
feature, and the server-side counterpart to `useDeedGeneration.ts`'s
`start()`.
**Calls:** `stream_document` (document 09); defines and returns a nested
generator function, `event_source`.
**Line by line:**
- `def event_source():` — a generator function (prerequisites B3) defined
  *inside* `generate`, so it has access to `request` via closure without
  needing it passed explicitly.
- `for event in stream_document(request.fields, use_llm=request.useLlm):` —
  `stream_document` is itself a generator (document 09) that yields plain
  Python dicts, one event at a time, as the deed is assembled; this loop
  pulls each one out.
- `yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"` — this is
  the line that actually produces valid SSE wire format: the `data: ` prefix,
  the event serialised to JSON, and the mandatory blank-line terminator
  (prerequisites A8, and exactly what `SSEDecoder.push` on the frontend
  parses). `ensure_ascii=False` lets non-ASCII characters (the curly quotes
  `"` and `"` used throughout the deed text, see document 08) be written as
  actual UTF-8 characters rather than escaped `\uXXXX` sequences — both are
  valid JSON, but this keeps the wire payload smaller and more readable.
- `except Exception as exc:` — if `stream_document` itself raises (rather
  than degrading gracefully, which it's designed to do internally — see
  document 09), this is the last line of defence: log the full traceback
  server-side, then **yield one final SSE event of `type: "error"`** rather
  than letting the exception propagate and simply close the connection with
  no explanation. This is what the frontend's `handleEvent`'s `"error"` case
  (document 04) catches and displays.
- `StreamingResponse(event_source(), media_type="text/event-stream", headers={...})`
  — `event_source()` is called here, which (because it's a generator
  function) does *not* run any of its body yet — it just produces the
  generator object; FastAPI drives it by pulling values out as the response
  streams to the client. The three headers are each load-bearing:
  `Cache-Control: no-cache, no-transform` stops any intermediate cache or
  proxy from buffering/rewriting the stream; `Connection: keep-alive` keeps
  the TCP connection open; `X-Accel-Buffering: no` specifically defeats
  nginx-style reverse proxies (common in front of services like Render)
  that otherwise buffer an entire response before forwarding it — which
  would silently destroy the "live" effect by delivering the whole deed in
  one burst at the very end.

### `POST /preview` — `preview(request)`

```python
@router.post("/preview")
def preview(request: GenerateRequest) -> Dict[str, Any]:
    sections = [dict(section) for section in build_sections(request.fields)]
    return {"sections": sections, "plainText": render_plain_text(sections),
            "estimatedPages": estimate_pages(sections), **extraction_summary(request.fields)}
```

**Job:** the whole deed, built deterministically, in one ordinary JSON
response — **no model call at all**. Not used by the live UI (which always
wants the streaming, AI-authored version), but used by the backend's own
test suite and as a fallback path "for clients that cannot hold an SSE
connection open," per the docstring.
**Calls:** `build_sections`, `render_plain_text`, `estimate_pages`
(document 08), `extraction_summary` (document 07).

### `POST /export/pdf` — `export_pdf(request)`

```python
@router.post("/export/pdf")
def export_pdf(request: ExportRequest) -> StreamingResponse:
    from reportlab.lib.units import inch
    try:
        buffer = render_sale_deed_pdf(sections=_sections_payload(request), fields=request.fields,
            first_page_top_offset=max(0.0, request.stampPaperOffsetInches) * inch)
    except Exception as exc:
        logger.exception("PDF rendering failed")
        raise HTTPException(status_code=500, detail=f"PDF rendering failed: {exc}")

    filename = _safe_filename(request.filename, "pdf")
    return StreamingResponse(buffer, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})
```

**Job:** render and return the court-ready PDF — the endpoint
`page.tsx`'s `download("pdf")` calls.
**Calls:** `_sections_payload`, `_safe_filename`, `render_sale_deed_pdf`
(document 10).
**Line by line:**
- `from reportlab.lib.units import inch` — imported here, inside the
  function, rather than at the top of the file — a common pattern for a
  dependency used in only one place, keeping the module's top-level imports
  focused on what every endpoint needs.
- `max(0.0, request.stampPaperOffsetInches) * inch` — clamps the offset to
  never be negative (a negative top margin would be nonsensical/broken
  layout), then converts from plain inches (a human-friendly unit the API
  accepts) into ReportLab's internal point-based unit system via the `inch`
  constant.
- `try/except` around the actual rendering call: any failure inside
  ReportLab (malformed input producing an internal layout error, for
  instance) is caught, logged with a full traceback server-side, and turned
  into a clean 500 response with a useful message — rather than an
  unhandled exception producing FastAPI's generic, less informative error
  page.
- `Content-Disposition: attachment; filename="..."` — the HTTP header that
  tells the browser "this is a download, not something to display inline,
  and here's the suggested filename" — this is what `downloadFile` on the
  frontend relies on indirectly (though it actually sets its own filename
  client-side from the `stem` it already computed; this header matters most
  for anyone hitting the endpoint directly, e.g. via `curl` or a non-browser
  client).

### `POST /export/docx` — `export_docx(request)`

```python
@router.post("/export/docx")
def export_docx(request: ExportRequest) -> StreamingResponse:
    try:
        buffer = render_sale_deed_docx(sections=_sections_payload(request), fields=request.fields)
    except Exception as exc:
        logger.exception("DOCX rendering failed")
        raise HTTPException(status_code=500, detail=f"DOCX rendering failed: {exc}")

    filename = _safe_filename(request.filename, "docx")
    return StreamingResponse(buffer, media_type=(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})
```

**Job:** the DOCX equivalent of `export_pdf`, structurally identical in
every way except which rendering function it calls and the MIME type it
declares. **Calls:** `_sections_payload`, `_safe_filename`,
`render_sale_deed_docx` (document 10). The long `media_type` string is the
official, standardised MIME type for a `.docx` file (the "Open XML
WordprocessingML" format) — Word and other office software use this exact
string to know how to open the downloaded bytes.

---

Next: **[06-backend-checklists-and-schema.md](./06-backend-checklists-and-schema.md)**.
