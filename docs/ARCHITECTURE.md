# Legal-TechAI — Full System Architecture

> **Who this is for:** You built this. You vibe-coded it. Now you need to truly own every line.
> This document is your complete map. Read it before anything else.

---

## 1. What This System Is

Legal-TechAI is a **FastAPI backend** that provides three distinct AI-powered services:

| Service | What it does | Key tech |
|---|---|---|
| **Inconsistency Engine** | Detects contradictions between legal documents | Gemini 2.5 Flash (4-step pipeline) |
| **RAG Legal Q&A** | Answers questions about BNS/BNSS/BSA law sections | ChromaDB + Gemini embeddings |
| **OCR Extractor** | Extracts structured data from document images | Gemini Vision |

There is also a **SQLite database** for users, cases, and documents — but this is secondary infrastructure. The three AI services above are the product.

---

## 2. The Full Folder Map

```
Legal-TechAI/
│
├── backend/                        ← ALL Python code lives here
│   ├── main.py                     ← FastAPI app entry point. Wires everything together.
│   ├── database.py                 ← SQLAlchemy engine + session factory
│   ├── models.py                   ← Database table definitions (SQLAlchemy ORM)
│   ├── schemas.py                  ← API request/response shapes (Pydantic)
│   ├── crud.py                     ← Database read/write functions
│   ├── ingestion.py                ← Legacy document ingestion router
│   ├── verification.py             ← Mock identity verification
│   │
│   ├── routers/                    ← One file = one group of API endpoints
│   │   ├── inconsistency.py        ← POST /inconsistency/detect-inconsistencies
│   │   ├── rag.py                  ← POST /rag/add-section, POST /rag/query
│   │   ├── ingest.py               ← POST /ingest/upload
│   │   ├── ocr_extract.py          ← POST /ocr-extract/extract
│   │   ├── ai.py                   ← Various AI utility endpoints
│   │   ├── summarizer.py           ← Summarization endpoint
│   │   └── demo.py                 ← Demo/test endpoints
│   │
│   └── modules/                    ← Business logic (no HTTP here)
│       ├── inconsistency/
│       │   ├── core.py             ← THE ENGINE: 4-step Gemini pipeline
│       │   └── schemas.py          ← Pydantic models for the pipeline's data
│       ├── rag/
│       │   └── service.py          ← ChromaDB + Gemini embedding + query logic
│       ├── ai/
│       │   └── gemini_integration.py  ← summarize, extract_claims, answer_question
│       ├── ocr_extractor.py        ← Image → structured JSON via Gemini Vision
│       ├── chunker.py              ← Text → chunks with metadata
│       ├── embedder.py             ← Duplicate of rag/service.py (legacy)
│       └── gemini.py               ← Shared retry + extract_json utilities
│
├── frontend/                       ← Next.js frontend (separate from backend)
├── android/                        ← Android app (separate)
├── requirements.txt                ← Python dependencies
├── legal_tech_ai.db                ← SQLite database file (auto-created)
└── run_backend.bat                 ← Windows script to start the backend
```

---

## 3. Data Flow: Upload → Inconsistency Detection

This is the most important flow in the system. Trace it completely.

```
USER
 │
 │  POST /inconsistency/detect-inconsistencies
 │  (multipart form: 2+ files attached)
 │
 ▼
routers/inconsistency.py
 │  ← Receives the uploaded files
 │  ← Validates: at least 2 files, valid severity param
 │  ← For each file:
 │      if .pdf  → PyMuPDF (fitz) extracts text, adds [Page N] markers
 │      if .txt  → decoded directly as UTF-8
 │  ← Builds: documents_data = [{"doc_id": filename, "text": "..."}, ...]
 │
 ▼
modules/inconsistency/core.py → InconsistencyEngine.process()
 │
 ├──► STEP 1: _step1_extract_entities(full_context)
 │         Prompt to Gemini: "find all PERSON, DATE, LOCATION, AMOUNT, ACTION entities"
 │         Returns: List[DocumentEntities]  (one per document)
 │
 ├──► STEP 2: _step2_extract_claims(full_context, entities)
 │         Prompt to Gemini: "break each document into atomic claims"
 │         Each claim has: claim_id, fact, claim_type, doc_id, page_ref, exact_quote
 │         Returns: ExtractedClaims
 │
 ├──► STEP 3: _step3_detect_contradictions(claims)
 │    │
 │    ├── Gemini prompt: "find FACTUAL / TEMPORAL / LOGICAL contradictions
 │    │                   between claims from DIFFERENT documents"
 │    │   Returns: DetectedContradictions (from Gemini)
 │    │
 │    └── _check_physical_impossibility(claims)  ← DETERMINISTIC (no AI)
 │            Scans temporal + locational claims
 │            Looks up pairs in KNOWN_DISTANCES dict
 │            If time_gap < min_travel_hours → PHYSICAL_IMPOSSIBILITY
 │            Merges results into DetectedContradictions
 │
 └──► STEP 4: _step4_link_evidence(claims, contradictions)
           Prompt to Gemini: "build the final report with exact quotes,
                              severity (HIGH/MEDIUM/LOW), and explanations"
           Returns: InconsistencyReport
 │
 ▼
routers/inconsistency.py (post-processing)
 │  ← _dedupe_contradictions(): remove duplicate findings
 │  ← Sort: HIGH → MEDIUM → LOW
 │  ← Filter to top_contradictions based on min_severity query param
 │
 ▼
Returns: InconsistencyReportWithRanking (JSON to client)
```

---

## 4. Data Flow: RAG Legal Q&A

```
SETUP PHASE (must happen first):
  POST /rag/add-section  → {section_number, act_name, section_title, text}
       │
       ▼
  modules/embedder.py → add_legal_section()
       │  ← Calls Gemini text-embedding-004 to convert text → vector (768 numbers)
       │  ← Stores in ChromaDB in-memory collection "legal_sections"
       │     with metadata: section_number, act_name, section_title
       │
       ▼
  ChromaDB holds the section in RAM
  (⚠ RESETS when server restarts — not persisted to disk)

QUERY PHASE:
  POST /rag/query  → {question: "What does Section 85 BNS say?"}
       │
       ▼
  modules/embedder.py → query_rag_system()
       │  ← Embeds the question with Gemini text-embedding-004
       │  ← Queries ChromaDB: find top 3 sections by cosine similarity
       │  ← Builds context string from the 3 retrieved sections
       │  ← Sends to Gemini: "Answer using ONLY these sections. Cite section numbers."
       │  ← Checks citations: are all section numbers cited actually in ChromaDB?
       │     → If not: adds to hallucination_flags
       │
       ▼
  Returns: QueryResponse {answer, citations, hallucination_flags, retrieved_sections}
```

---

## 5. Data Flow: OCR Document Extraction

```
  POST /ocr-extract/extract  (multipart: image file)
       │
       ▼
  routers/ocr_extract.py
       │  ← Reads file bytes
       │  ← Passes to modules/ocr_extractor.py
       │
       ▼
  modules/ocr_extractor.py → extract_document_data()
       │  ← Base64-encodes the image bytes
       │  ← Sends to Gemini Vision (gemini-2.5-flash) with system prompt:
       │     "Extract these fields: firstName, lastName, city, email..."
       │  ← Gemini returns JSON
       │  ← extract_json() strips markdown fences if present
       │  ← Returns structured dict
       │
       ▼
  Returns: {firstName, lastName, city, email, ...}
```

---

## 6. Data Flow: Document Upload + Database

```
  POST /documents/  (multipart form)
       │
       ▼
  main.py → upload_document()
       │  ← Creates uploads/ directory if missing
       │  ← Reads file bytes
       │  ← Calculates SHA-256 hash of file content  ← immutability proof
       │  ← Saves file to uploads/{filename}
       │  ← Creates Document record in SQLite via crud.create_document()
       │
       ▼
  SQLite: documents table now has file_path + file_hash + case_id
```

---

## 7. The Database Schema

```
users ─────────────────────────────────────────────
  id, full_name, email, hashed_password
  role: citizen / lawyer / judge / clerk / admin
  is_verified_identity: bool
  → relationships: cases (one-to-many), documents (one-to-many)

cases ─────────────────────────────────────────────
  id, case_number (unique), title, description
  case_type: CIVIL/CRIMINAL, status: OPEN/CLOSED/PENDING
  creator_id → users.id
  → relationships: documents (one-to-many)

documents ─────────────────────────────────────────
  id, case_id → cases.id, uploader_id → users.id
  file_path, file_hash (SHA-256), file_type
  is_verified: bool, verification_status: PENDING/VERIFIED/REJECTED
  capture_metadata (JSON string: device info, timestamps)

audit_logs ────────────────────────────────────────
  id, user_id, action (CREATE/VIEW/VERIFY/UPDATE)
  target_type (DOCUMENT/CASE), target_id, details (JSON), timestamp

inconsistencies ───────────────────────────────────
  id, case_id, doc_a_id, doc_b_id
  contradiction_type, severity, explanation
```

---

## 8. The Pydantic Data Contracts (schemas.py vs inconsistency/schemas.py)

There are TWO schema files. Do not confuse them.

**`backend/schemas.py`** — API-level shapes (what HTTP requests/responses look like)
- `UserCreate`, `User` — user registration input/output
- `CaseCreate`, `Case` — case creation input/output  
- `DocumentCreate`, `Document` — document upload shapes
- `SectionInput`, `QueryRequest`, `QueryResponse` — RAG pipeline shapes
- `StandardResponse` — `{success: bool, data: any, error: str}` — the default wrapper

**`backend/modules/inconsistency/schemas.py`** — pipeline-internal shapes
- `Entity`, `DocumentEntities` — Step 1 output
- `Claim`, `ExtractedClaims` — Step 2 output
- `ContradictionCandidate`, `DetectedContradictions` — Step 3 output
- `FinalContradiction`, `CleanFact`, `InconsistencyReport` — Step 4 output
- `InconsistencyReportWithRanking` — final API response (extends Step 4 output)

---

## 9. How Gemini Is Used (Three Patterns)

**Pattern A — JSON mode with Pydantic validation (inconsistency engine)**
```python
response_mime_type="application/json"  # forces Gemini to output JSON
schema_class.model_validate_json(text) # validates against Pydantic model
```
This is the safest pattern. If Gemini's JSON doesn't match the schema, Pydantic raises a `ValidationError` and you know exactly what's wrong.

**Pattern B — Free text + manual JSON parsing (gemini_integration.py)**
```python
response = model.generate_content(prompt)
result = extract_json(response.text)  # strips ```json fences, then json.loads()
```
Less safe — if Gemini writes prose instead of JSON, `json.loads()` raises an exception.

**Pattern C — Vision (multimodal) input (ocr_extractor.py)**
```python
image_part = {"mime_type": "image/jpeg", "data": image_bytes}
model.generate_content([text_prompt, image_part])
```
Gemini Vision: you pass both text instructions and image bytes in one call.

---

## 10. CORS and Middleware

```
Request arrives
      │
      ▼
CORSMiddleware
  ← Checks if request origin is allowed (currently "*" = all)
  ← Adds Access-Control headers to response
  ← Without this, browser-based frontends are BLOCKED by security policy
      │
      ▼
log_requests middleware
  ← Records: method, path, time taken
      │
      ▼
Route handler runs
      │
      ▼
global_exception_handler
  ← Catches any unhandled exception
  ← Returns {success: false, error: "..."} instead of crashing
```

---

## 11. Environment Variables

Create a `.env` file in `backend/` with:

```
GEMINI_API_KEY=your_key_here
DATABASE_URL=sqlite:///./legal_tech_ai.db   # optional, this is the default
```

**What happens without `GEMINI_API_KEY`:**
- RAG: `api_key = os.getenv("GEMINI_API_KEY")` → `None` → `genai.configure()` not called → any embed/generate call crashes with `google.auth.exceptions.DefaultCredentialsError`
- Inconsistency engine: `_ensure_gemini_configured()` raises `RuntimeError("GEMINI_API_KEY not set")` → router catches it → returns HTTP 503

---

## 12. Known Architectural Issues (Be Aware)

| Issue | Location | Impact |
|---|---|---|
| ChromaDB is in-memory | `embedder.py`, `rag/service.py` | All RAG sections lost on server restart |
| `embedder.py` duplicates `rag/service.py` | Both files | Two copies of the same code; changes to one don't affect the other |
| `allow_origins=["*"]` | `main.py` | In production, restrict to your Vercel domain |
| No authentication on most endpoints | All routers | Any caller can upload documents, run the engine, etc. |
| `delay` variable shadowed in retry | `gemini_integration.py` | The `delay` parameter is shadowed by the inner `delay` variable in the loop; backoff math is slightly off |
| No persistent KNOWN_DISTANCES | `inconsistency/core.py` | Vijayawada-Guntur and other routes not in the dict are invisible to the physical impossibility checker |
