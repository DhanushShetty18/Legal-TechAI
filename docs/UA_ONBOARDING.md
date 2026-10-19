# Legal-TechAI — Onboarding Guide

> Generated from the Understand-Anything knowledge graph (`.ua/knowledge-graph.json`, built at `ea15e19`),
> with the 18 files changed by `5b0b97f` ("add Gift Deed as a second draftable instrument") re-analyzed on top.
> The two newest doc folders (`docs/camera-filing-explained/`, `docs/system-design-of-camera-e-filing/`) are
> listed but were not analyzed. Re-run `/understand` to refresh the underlying graph.

## 1. Project Overview

**Legal-TechAI** is judicial infrastructure for the Indian court system. It parses multi-document legal
payloads, detects contradictions between them, answers statutory questions through RAG, and drafts
court-ready property instruments — a **Sale Deed** and a **Gift Deed** — live, from photos of the source
documents ("Camera Filing").

| | |
|---|---|
| **Languages** | Python, TypeScript, Kotlin (plus JS, CSS, XML, Gradle/TOML config) |
| **Backend** | FastAPI, Uvicorn, Pydantic v2, SQLAlchemy, ChromaDB, Gemini (text + Vision), ReportLab, python-docx |
| **Web** | Next.js 16 (App Router), React 19, Tailwind CSS 4, Vitest |
| **Mobile** | Kotlin, Jetpack Compose, Retrofit, Room, CameraX |
| **Demo** | Streamlit (`demo_app.py`) |

**Run locally:** `run_backend.bat` (uvicorn on :8000), `run_frontend.bat` (Next.js on :3001), `run_demo.bat` (Streamlit).

## 2. Architecture Layers

```
 Web UI (Next.js)  ─┐
 Android (Compose) ─┼──►  Judicial API (FastAPI routers)  ──►  NLP & Domain Services  ──►  Gemini / Chroma
 Streamlit demo    ─┘              │                                   │
                                   └────────►  Data & Schemas (SQLAlchemy + Pydantic)  ◄┘
```

| Layer | What it is | Key files |
|---|---|---|
| **Judicial API** | FastAPI app and feature routers | `backend/main.py`, `backend/routers/drafting.py`, `routers/inconsistency.py`, `routers/rag.py`, `routers/ai.py` |
| **NLP & Domain Services** | Gemini clients, OCR, chunking/RAG, inconsistency engine, deed drafting engine | `backend/modules/drafting/*`, `modules/inconsistency/core.py`, `modules/gemini.py`, `modules/embedder.py` |
| **Data & Schemas** | ORM models, DB session, CRUD, Pydantic contracts | `models.py`, `schemas.py`, `database.py`, `crud.py` |
| **Web UI** | Next.js console including the Camera Filing flow | `app/file-case/page.tsx`, `components/LiveDeedCanvas.tsx`, `lib/deedStream.ts`, `lib/useDeedGeneration.ts`, `lib/caseTypes.ts` |
| **Android Client** | Compose app with offline-capable Room cache | `AppRepository.kt`, `ApiService.kt`, `MainViewModel.kt`, `NavGraph.kt` |
| **Tests** | Pytest suites, HTTP smoke scripts, chaos probes, Vitest | `test_drafting.py`, `test_inconsistency.py`, `caseTypes.test.ts`, `deedStream.test.ts` |
| **Documentation** | Architecture, explainers, decisions log, fixtures, strategy briefs | `docs/ARCHITECTURE.md`, `docs/LEARNING_PATH.md`, `DECISIONS.md`, `docs/camera-filing-explained/`, `docs/system-design-of-camera-e-filing/` |
| **Config & Infra** | Launchers, Gradle, TS/ESLint/Vitest, devcontainer | `run_*.bat`, `frontend/vitest.config.ts`, `android/app/build.gradle.kts` |

## 3. Key Concepts

- **The model proposes, deterministic code constrains.** The defining pattern of the codebase.
  - *Drafting:* Gemini authors only the bespoke passages (the recitals and the Schedule description).
    Operative clauses are template-locked: a clause that drifts between generations would have to be
    re-registered at the parties' cost. A missing key, model failure, timeout or stub answer all degrade
    to precedent wording, so a complete deed is always produced.
  - *Inconsistency detection:* Gemini finds contradictions; deterministic physical-impossibility checks
    (known city distances) are layered on top.
- **Case type is a registry parameter.** `schema.py` (backend) and `caseTypes.ts` (frontend) define the
  case types — **Sale Deed** and **Gift Deed** (draftable) and **Divorce Case** (checklist only) — with
  their field sets, groups, required flags and derivable fields. Checklists, extraction prompts, the
  review form, generation and export all key off the case type. **Keep the two catalogues in sync.**
- **Two instruments, one pipeline.** `generator.py` builds the Sale Deed and dispatches Gift Deed
  requests to `gift_deed.py` (a lazy, in-function import). The Gift Deed reuses the existing section
  styles — no new rendering code paths in the PDF/DOCX exporters or the live canvas.
- **Precedent documents drive the templates.** The Sale Deed follows `Sale-Deed.pdf`; the Gift Deed
  mirrors `GIFT DEED (50-50).pdf` (donor/donee blocks, society and relationship recitals, voluntary and
  irrevocable gift clauses, a before-and-after shareholding table, the Schedule).
- **Full identifiers, not masked.** The Gift Deed decision reversed Aadhaar masking: `format_aadhaar`
  groups and prints the full number (the old `mask_aadhaar` is gone). Treat extracted identifiers as
  sensitive data accordingly.
- **Party-scoped identifier rescue.** `extraction.py` re-checks PAN/Aadhaar with regex, limited to the
  party a document is about (vendor/purchaser or donor/donee), then merges per-document extractions by
  precedence.
- **Live SSE drafting.** `stream.py` runs the Gemini narrative call in a background thread with
  case-specific prompts while it walks the deterministic sections, emitting word-group deltas. On the
  client, `deedStream.ts` is a pure, DOM-free decoder/reducer; `useDeedGeneration.ts` drives it with a
  frame-rate-independent typing animation for a given case type.
- **Indian formatting.** Lakh/crore number-to-words, rupee phrasing, currency grouping, ordinal deed
  dates and dotted fill-in blanks live in `formatting.py`.
- **Statutory context.** Prompts and Q&A target the new criminal codes — BNS, BNSS and BSA.
- **Offline-first mobile.** The Android repository wraps calls in a sealed `Result` with Room fallbacks.

### Watch out for duplication
- **`e-filing-updated/`** is a parallel copy with its own `backend/` and `frontend/`. The live code is the
  top-level `backend/` and `frontend/`.
- Overlapping pairs: `routers/ocr.py` / `routers/ocr_extract.py`, `modules/gemini.py` /
  `modules/ai/gemini_integration.py`, `modules/embedder.py` / `modules/rag/service.py` (documented as
  unused), and `ingestion.py` / `routers/ingest.py`.

## 4. Guided Tour

1. **Project Overview** — `README.md`: the product map and MVP workflows.
2. **Architecture Map** — `docs/ARCHITECTURE.md`, `docs/LEARNING_PATH.md`: data flows and a study order.
3. **FastAPI Entry Point** — `backend/main.py`: creates tables, mounts every router, CORS and logging.
4. **Cases & Schemas** — `models.py`, `schemas.py`, `database.py`: persistence and wire contracts.
5. **Persistence & Ingestion** — `crud.py`, `ingestion.py`: case numbers, file hashes, section chunking.
6. **Gemini & OCR** — `modules/gemini.py`, `ocr_extractor.py`, `ai/gemini_integration.py`: JSON parsing
   with retries; Vision-to-schema mapping.
7. **Camera Filing: case types & checklists** — `drafting/schema.py`, `drafting/checklists.py`: the
   case-type registry and the documents each case type requires, grouped by phase.
8. **Extraction** — `drafting/extraction.py`, `formatting.py`: photos → case-type-scoped fields →
   one merged field set.
9. **Generators & live streaming** — `drafting/generator.py`, `drafting/gift_deed.py`, `stream.py`,
   `DECISIONS.md`: template-locked skeletons for both deeds plus live model-authored passages.
10. **Router & live-typing UI** — `routers/drafting.py`; `file-case/page.tsx` (case-type picker, then
    capture → process → review → generate → submit); `ExtractedFieldsForm.tsx`; `deedStream.ts`;
    `useDeedGeneration.ts`; `LiveDeedCanvas.tsx`.
11. **Export & tests** — `drafting/pdf.py` (ReportLab, binding margins, stamp-paper offset, impression
    grids, running header naming the deed type), `docx_export.py` (editable Word for advocate amendments),
    `test_drafting.py` (Sale and Gift Deed suites, Gemini mocked).
12. **Contradiction Detection** — `inconsistency/core.py`, `inconsistency/schemas.py`, `routers/inconsistency.py`.
13. **RAG Legal Q&A** — `chunker.py`, `embedder.py` (in-memory Chroma + citation hallucination checks), `rag/service.py`.
14. **Next.js Console** — `layout.tsx`, `page.tsx`, `AppSidebar.tsx`, `inconsistency/page.tsx`, `legal-qa/page.tsx`.
15. **Android Client** — `AndroidManifest.xml`, `MainActivity.kt`, `ApiService.kt`, `AppRepository.kt`.

## 5. File Map

### Backend — API
| File | Purpose |
|---|---|
| `backend/main.py` | App entry: DB schema, router mounting, CORS/logging, core case and document endpoints |
| `backend/routers/drafting.py` | Case types, checklists, extract, merge, SSE live generation, preview, PDF/DOCX export — Sale and Gift Deeds |
| `backend/routers/inconsistency.py` | Upload → text → engine → dedupe, rank, filter |
| `backend/routers/rag.py` | Add-section and query endpoints delegating to the embedder |
| `backend/routers/ai.py` | Summarize, extract-claims, legal Q&A |
| `backend/routers/demo.py` | Red-team demo endpoints (camera, audit, vault, offline toggle) |

### Backend — drafting engine (`backend/modules/drafting/`)
| File | Purpose |
|---|---|
| `__init__.py` | Barrel re-exporting checklists, extraction, generation, case-type constants and streaming |
| `schema.py` | `Field` model, Sale and Gift Deed field sets, case-type constants, derivable fields |
| `checklists.py` | Required-document checklists per case type (Sale, Gift, Divorce), grouped by phase |
| `extraction.py` | Gemini Vision extraction, party-scoped PAN/Aadhaar rescue, precedence merge, readiness report |
| `formatting.py` | Indian currency/number-to-words, dates, Aadhaar grouping, PAN normalisation, blanks |
| `generator.py` | Sale Deed section builder; dispatches Gift Deeds; plain-text render; page estimate |
| `gift_deed.py` | Gift Deed section builder (`build_gift_deed_sections`, `gift_operative_clauses`, recitals, shareholding table, Schedule) |
| `stream.py` | SSE orchestration with a background Gemini thread and Sale/Gift-specific prompts |
| `pdf.py` / `docx_export.py` | Court-ready PDF and editable Word output for either deed |

### Backend — other services
| File | Purpose |
|---|---|
| `modules/inconsistency/core.py` | Four-step Gemini contradiction pipeline + distance checks |
| `modules/gemini.py` | Summaries, claims, Q&A under BNS/BNSS/BSA, with retry |
| `modules/ocr_extractor.py` | Vision OCR → identity schema, redacted logging |
| `modules/chunker.py` / `embedder.py` | Section-aware chunking and Chroma RAG |
| `modules/vault/core.py`, `camera/core.py` | Hash-based immutable vault; camera anti-forgery checks |

### Frontend (`frontend/src/`)
| File | Purpose |
|---|---|
| `app/file-case/page.tsx` | Camera Filing flow: case-type picker → capture → extract/merge → review → live draft → export/submit |
| `components/ExtractedFieldsForm.tsx` | Review form grouped by the case type's field catalogue; opens on missing required fields |
| `components/LiveDeedCanvas.tsx` | Live-typing "page of paper" with auto-scroll |
| `lib/caseTypes.ts` | Frontend case-type catalogue: checklists, field groups, derivable fields, lookups |
| `lib/deedStream.ts` / `lib/useDeedGeneration.ts` | SSE decode/reduce and the generation hook (takes a case type) |
| `lib/api.ts` | `postJson`, `postForm`, `downloadFile` with cold-start-aware timeouts |
| `app/stamp-duty/page.tsx` | State-wise stamp duty calculator |

### Android (`android/app/src/main/java/com/legaltechai/app/`)
`network/ApiService.kt` (Retrofit), `data/AppRepository.kt` (cache + `Result`), `ui/MainViewModel.kt`,
`ui/NavGraph.kt`, `ui/screens/*`.

## 6. Complexity Hotspots

| File | Why it's tricky |
|---|---|
| `backend/modules/drafting/stream.py` | Threads, SSE, per-case prompts, merging partial model output into the deterministic walk |
| `backend/modules/drafting/generator.py` + `gift_deed.py` | Legal text where template changes have registration consequences; keep both instruments' clauses locked |
| `backend/modules/drafting/extraction.py` | Vision prompts, party-scoped regex rescue, merge precedence |
| `backend/modules/drafting/schema.py` / `checklists.py` | Case-type registry that every stage reads; mirrored in `caseTypes.ts` |
| `backend/modules/drafting/pdf.py` | ReportLab layout, stamp-paper offsets, signature/witness pages |
| `backend/routers/drafting.py` | Largest router, many endpoints across both deeds |
| `backend/modules/inconsistency/core.py` | Multi-step LLM pipeline plus deterministic checks |
| `frontend/src/app/file-case/page.tsx` | ~900-line state machine with case-type branching |
| `frontend/src/lib/caseTypes.ts` | Field catalogue for both deeds; drift from the backend breaks review and generation |
| `frontend/src/lib/useDeedGeneration.ts` | Fetch-based SSE plus the animation loop |
| `frontend/src/components/LiveDeedCanvas.tsx` | Auto-scroll and per-block styling |
| `frontend/src/app/stamp-duty/page.tsx` | State-by-state duty and fee rules |
| `android/.../CameraScreen.kt`, `InconsistencyScreen.kt` | CameraX permissions, upload/retry states, size checks |
| `demo_app.py` | Streamlit app driving every feature against a remote backend |

**Safety nets:** `backend/test_drafting.py` (Sale and Gift Deed suites) and `backend/test_inconsistency.py`
run without live Gemini calls; `npm test` in `frontend/` runs Vitest (`caseTypes.test.ts`,
`deedStream.test.ts`). Many other `backend/test_*.py` files are manual HTTP smoke scripts that need a
running server.
