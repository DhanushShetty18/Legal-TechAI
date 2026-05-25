# Legal-TechAI: Automating Legal Workflows to create a Global Judicial Impact..!!

A judicial infrastructure platform designed for the Indian Court System (eCourts Phase III compliance). This system mathematically parses, clusters, and detects contradictions across multi-document legal payloads (FIRs, charge sheets, witness statements) using localized NLP models and deterministic graph-logic.

# 🏛️ System Architecture Overview

Legal-TechAI operates on a modular, microservices-based architecture to ensure absolute data isolation (Multi-Tenancy) and high-throughput transaction handling.

1. **Frontend Core (Next.js / TailwindCSS)**
   - Implements strict state machines for hardware layer access (Camera/OCR capture).
   - Stateless UI rendering with dynamic field hydration via server-sent JSON schemas.
   - Hosted on Vercel Edge Networks.

2. **Enterprise Gateway (Java / Spring Boot)**
   - *Current Engineering Focus*
   - Acts as the central secure router and authentication layer for judicial users.
   - Manages connection pooling, multi-tenant database isolation (PostgreSQL/MySQL), and high-volume API rate-limiting/queues.

3. **Inconsistency & Extraction Engine (Python / FastAPI)**
   - Drives the text extraction layer utilizing Vertex AI (Gemini Enterprise Model Tiers) and custom layout parsers (`LayoutLM`).
   - Maps unstructured vernacular legal narrative to strict, deterministic JSON outputs aligned with the new Bharatiya Nyaya Sanhita (BNS), BNSS, and BSA codes.

## 🛠️ Repository Layout

├── legal-techai-frontend/      # Next.js Application Core
├── legal-techai-gateway/       # Spring Boot API Gateway (Under Active Dev)
└── legal-techai-engine/        # FastAPI / Python Machine Learning Microservice


## 🚀 Core MVP Technical Workflows (Active Sprint Targets)

### T1: Multi-Document Inconsistency Detection Engine
* **Objective:** Eliminate manual comparison backlogs by cross-referencing multi-document payloads (FIRs, charge sheets, witness statements) for structural and physical anomalies.
* **Pipeline:** Extract named entities (persons, dates, locations, amounts) -> Break down unstructured paragraphs into atomic factual claims -> Execute graph-logic cycle-checking to catch physical impossibilities (e.g., matching timestamps across conflicting geographical coordinates) -> Return zero-hallucination source-linked citations.
* **Sprint Focus:** Scaling production PDF parsing, establishing deterministic quote matching, and optimizing API token budgets.

### T2: Secure Document Extraction & Forms Hydration
* **Objective:** Prevent high-frequency format rejections (averaging 4-6 months of delay per filing error in Indian municipal courts) via automated data entry.
* **Pipeline:** Client-side mobile camera capture -> Real-time image sanitization -> OCR extraction via Gemini Vision API (capturing identities and regional language text) -> Algorithmic parsing into strict JSON -> Automated form-field hydration of standard court filing templates.
* **Sprint Focus:** Hardening client-side camera state locks to eliminate empty database commits, mapping out raw Indian legal filing schemas, and building editable validation screens.

### T3: Statutory Document Verification Checklist
* **Objective:** Ensure pre-filing compliance under the new BNS, BNSS, and BSA codes based on case typology.
* **Pipeline:** User selects case category (e.g., Section 138 Negotiable Instruments Act, domestic disputes) via a dynamic dropdown -> System scans the current localized document payload directory -> Compares active folder files against a mandatory statutory checklist -> Renders a real-time reactive compliance index (Green/Red flags).
* **Sprint Focus:** Encoding dynamic verification matrices for core procedural frameworks.
- [ ] Implement robust **Exponential Backoff with Jitter** on the FastAPI extraction layer to systematically mitigate 429 API rate-limiting thresholds.
- [ ] Establish the core Spring Boot multi-tenant schema to route data cleanly between distinct trial jurisdictions.
- [ ] Harden frontend state locks to securely prevent form submission before full semantic parsing is complete.
