# EXPLAINED: backend/routers/

> **One-line summary:** Each router file is a group of related HTTP endpoints. Routers keep main.py clean by splitting the API into logical modules — one file per feature.

---

## What an APIRouter Is

In FastAPI, `APIRouter` works exactly like the main `app` object, except it's not the server itself — it's a collection of routes you attach to the server later. The pattern:

```python
# In a router file:
router = APIRouter(prefix="/rag", tags=["RAG Pipeline"])

@router.post("/add-section")
def add_section(...): ...

# In main.py:
app.include_router(router)
# Now the endpoint is available at: POST /rag/add-section
```

The `prefix` is prepended to every route in the router. The `tags` group endpoints in the Swagger UI at `/docs`.

---

## routers/inconsistency.py

**Endpoint:** `POST /inconsistency/detect-inconsistencies`

This is the most important router. It handles the complete inconsistency detection pipeline.

### The Deduplication Logic

```python
def _quote_pair_key(c: FinalContradiction) -> frozenset:
    return frozenset({c.exact_quote_doc_a.strip(), c.exact_quote_doc_b.strip()})

def _dedupe_contradictions(contradictions: List[FinalContradiction]) -> List[FinalContradiction]:
    deduped: Dict[frozenset, FinalContradiction] = {}
    for c in contradictions:
        key = _quote_pair_key(c)
        existing = deduped.get(key)
        if existing is None or _type_rank(c) < _type_rank(existing):
            deduped[key] = c
    return list(deduped.values())
```

**Why deduplication is needed:** The pipeline can flag the same pair of quotes multiple times under different contradiction types. For example, the Mumbai-Pune travel time might be flagged as both TEMPORAL (different times in different docs) and PHYSICAL_IMPOSSIBILITY (can't travel that fast). They're the same finding — dedupe to one, keeping the most decisive type.

**`frozenset` as dict key:** A frozenset is hashable (unlike a regular set), so it can be a dict key. `frozenset({quote_a, quote_b})` equals `frozenset({quote_b, quote_a})` — order doesn't matter. This correctly identifies the same quote pair regardless of which document is "A" and which is "B."

**`_type_rank()` priority:**
```python
TYPE_PRIORITY = {
    "PHYSICAL_IMPOSSIBILITY": 0,   # strongest — deterministic arithmetic
    "LOGICAL": 1,
    "TEMPORAL": 2,
    "FACTUAL": 3,                  # weakest — semantic difference
}
```
PHYSICAL_IMPOSSIBILITY wins over all others because it's deterministic — not a matter of interpretation. A 150km drive cannot happen in 20 minutes; this is mathematical fact, not AI opinion.

### The Endpoint Handler

```python
@router.post("/detect-inconsistencies", response_model=InconsistencyReportWithRanking)
async def detect_inconsistencies(
    files: List[UploadFile] = File(...),
    min_severity: str = Query("HIGH", description="...")
):
```

**`async def`:** This endpoint is async because it calls `await file.read()`. File reading is I/O — while waiting for the file bytes, the server can handle other requests.

**`List[UploadFile] = File(...)`:** Accepts multiple file uploads in one multipart form. The `...` means required — if no files are sent, FastAPI returns a 422 automatically.

**`Query("HIGH", description="...")`:** A URL query parameter with a default value. The client calls:
`POST /inconsistency/detect-inconsistencies?min_severity=MEDIUM`

**PDF text extraction:**
```python
if filename.lower().endswith(".pdf"):
    doc = fitz.open(stream=contents, filetype="pdf")
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        page_text = page.get_text()
        extracted_text += f"\n[Page {page_num + 1}]\n{page_text}\n"
    doc.close()
```

`fitz` is PyMuPDF — a fast PDF library. `fitz.open(stream=contents, filetype="pdf")` opens a PDF from bytes (not from a file path). The `[Page N]` markers are added so the engine can reference specific pages in its output.

**Post-processing chain:**
```python
report = engine.process(documents_data)          # run 4-step pipeline
unique_contradictions = _dedupe_contradictions(report.contradictions)  # dedupe
sorted_contradictions = sorted(unique_contradictions, key=lambda c: SEVERITY_ORDER[...])  # sort
top_contradictions = [c for c in sorted_contradictions if severity_rank <= threshold]  # filter
```

None of this post-processing changes what the engine found — it only shapes the presentation (deduped, sorted, filtered).

---

## routers/rag.py

**Endpoints:** `POST /rag/add-section`, `POST /rag/query`

```python
from modules.embedder import add_legal_section, query_rag_system

@router.post("/add-section", response_model=StandardResponse)
def add_section(section: SectionInput):
    result = add_legal_section(section)
    return StandardResponse(success=True, data=result)

@router.post("/query", response_model=StandardResponse)
def query(request: QueryRequest):
    result = query_rag_system(request.question)
    return StandardResponse(success=True, data=result.dict())
```

This router is intentionally thin — all logic lives in `modules/embedder.py`. The router's only job is to receive the HTTP request, call the service function, and wrap the result in `StandardResponse`.

**`result.dict()`:** `query_rag_system()` returns a Pydantic `QueryResponse` object. `.dict()` (Pydantic v1) or `.model_dump()` (Pydantic v2) converts it to a plain Python dict. Both work in Pydantic v2 — `.dict()` is deprecated but still functional.

**Why `StandardResponse` wrapping here but not in inconsistency.py?** Inconsistency uses a specific response model (`InconsistencyReportWithRanking`) because the response has complex structure. RAG uses `StandardResponse` as a generic envelope. Neither approach is wrong — consistency in your own codebase is what matters.

---

## routers/ingest.py

**Endpoint:** `POST /ingest/upload`

This router handles the "smart ingestion" flow: upload a document → extract text → chunk it.

```python
@router.post("/upload", response_model=StandardResponse)
async def upload_document(file: UploadFile = File(...)):
    # 1. Validate file type
    if not (file.filename.lower().endswith('.pdf') or file.filename.lower().endswith('.txt')):
        return StandardResponse(success=False, error="Only PDF and TXT files are supported.")
    
    # 2. Save with UUID filename (prevents collisions)
    new_filename = f"{uuid.uuid4()}{ext}"
    
    # 3. Extract text
    if ext == '.pdf':
        # Check if scanned (no extractable text)
        for page in doc:
            if page.get_text().strip():
                is_scanned = False
        if is_scanned:
            return StandardResponse(success=True, data={"message": "Scanned PDF — OCR required"})
    
    # 4. Clean and chunk
    cleaned_text = clean_text(raw_text)
    chunks = chunk_text(cleaned_text, new_filename)
    return StandardResponse(success=True, data={"chunks": [chunk.model_dump() for chunk in chunks]})
```

**UUID filenames:** `uuid.uuid4()` generates a universally unique random ID like `f47ac10b-58cc-4372-a567-0e02b2c3d479`. Using this as the filename prevents collisions (two users uploading `chargesheet.pdf` don't overwrite each other).

**Scanned PDF detection:**
```python
is_scanned = True
for page in doc:
    if page.get_text().strip():
        is_scanned = False
```
If PyMuPDF can't extract any text from any page, the PDF is a scanned image. In this case, the router returns an early response telling the caller to use the OCR endpoint instead. This is correct behavior — extracting text from scanned PDFs requires Gemini Vision, not PyMuPDF.

**`chunk_text()` output:** Returns `List[Chunk]` objects where each chunk is:
```python
Chunk(
    text="Section 85. Whoever commits robbery...",
    metadata=ChunkMetadata(
        source_file="abc123.pdf",
        chunk_index=0,
        char_start=0,
        char_end=342
    )
)
```
These chunks are what you'd add to ChromaDB for RAG — though currently this ingest router and the RAG router are separate flows and not automatically connected.

---

## routers/ocr_extract.py

**Endpoint:** `POST /ocr-extract/extract`

```python
@router.post("/extract")
async def extract_document(file: UploadFile = File(...)):
    contents = await file.read()
    mime_type = file.content_type or "image/jpeg"
    result = extract_document_data(contents, mime_type)
    return {"success": True, "data": result}
```

The simplest router. Reads the bytes, passes them to `extract_document_data()`, returns the result. The only subtlety: `file.content_type` is what the HTTP client reports (could be `image/jpeg`, `image/png`, `application/pdf`). The `or "image/jpeg"` is a fallback if the client doesn't send a content type header.

---

## routers/ai.py and routers/summarizer.py

These routers provide utility AI endpoints — summarizing case text, extracting claims from a document. They use the functions from `modules/ai/gemini_integration.py` or `modules/gemini.py`. Their structure is the same thin-router pattern as `rag.py`: receive request → call service function → return result.

---

## routers/demo.py

Contains test/demo endpoints used during development. Not for production use. Typically returns hardcoded data or calls the AI with a fixed prompt to demonstrate the system works.

---

## The Pattern All Routers Follow

Every router in this codebase uses the same structure:

```python
from fastapi import APIRouter, ...
from [module] import [service_function]
from schemas import StandardResponse  # or specific response model

router = APIRouter(prefix="/feature", tags=["Feature Name"])

@router.post("/action", response_model=ResponseModel)
async def endpoint_name(input: InputModel):
    try:
        result = service_function(input)
        return ResponseModel(...)
    except SpecificError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

**Why keep routers thin:** Business logic in routers is hard to test (requires an HTTP client). Business logic in service modules can be tested with plain Python function calls. The separation makes testing much easier.

---

## What Breaks If a Router File Is Removed

The corresponding endpoints return 404. More specifically: if the router is imported at the top of `main.py` (which they are), removing the file causes an `ImportError` at server startup — the entire server fails to start.

---

## Two Exercises

**Exercise 1:** The inconsistency router currently only accepts `min_severity` as a query parameter. Add a second query parameter `max_results: int = Query(10, description="Maximum contradictions to return")` that limits the number of contradictions in `top_contradictions`. The filtering should happen after sorting, so the first N highest-severity items are returned.

**Exercise 2:** `routers/ingest.py` and `routers/inconsistency.py` both extract text from PDFs using nearly identical PyMuPDF code. Extract this logic into a shared utility function in a new file `modules/pdf_utils.py`:
```python
def extract_text_from_pdf(contents: bytes) -> str:
    """Extract text from PDF bytes, adding [Page N] markers."""
    ...
```
Then update both routers to import and use this function. This is the DRY (Don't Repeat Yourself) principle in practice.
