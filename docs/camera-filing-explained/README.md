# Camera Filing, Explained

This folder is a from-zero teaching walkthrough of one feature in Legal-TechAI:
**Camera Filing → Live Sale Deed Generation**. It is the flow where a user
photographs or uploads a stack of property documents, the app reads the
particulars off them automatically, the user confirms what it read, and a
court-ready Sale Deed is written live on screen and downloaded as a PDF or
DOCX.

It is written so that if this feature vanished tomorrow, you could rebuild it
from these documents and your own understanding — not from memory of what the
code looked like, but from understanding *why* every piece exists.

## Why this folder exists

Reading source code top to bottom teaches you what it does. It rarely teaches
you *why it is shaped that way* — why extraction happens one document at a
time instead of all at once, why the model is only trusted with three
paragraphs out of a whole legal deed, why there are two copies of the same
checklist. Those decisions are the actual engineering, and they are explained
here alongside the code, file by file, function by function, line by line.

## Read in this order

1. **[00-prerequisites.md](./00-prerequisites.md)** — every language, framework
   and concept this feature leans on, explained before you meet it in code.
   Read this first even if some of it is familiar; later documents assume it.
2. **[01-the-complete-flow.md](./01-the-complete-flow.md)** — the whole journey
   from "user opens the page" to "PDF lands in Downloads", with no code yet —
   just the shape of the system and which file does which job.
3. **[02-frontend-main-page.md](./02-frontend-main-page.md)** — the single React
   component that is the entire user interface, `file-case/page.tsx`, function
   by function.
4. **[03-frontend-helper-libraries.md](./03-frontend-helper-libraries.md)** —
   `lib/api.ts` (talking to the backend) and `lib/caseTypes.ts` (the checklist
   and field catalogue the page is built from).
5. **[04-frontend-live-writing-engine.md](./04-frontend-live-writing-engine.md)**
   — the three files that make the deed appear to type itself:
   `lib/deedStream.ts`, `lib/useDeedGeneration.ts`,
   `components/LiveDeedCanvas.tsx`, and the review-form component
   `components/ExtractedFieldsForm.tsx`.
6. **[05-backend-api-router.md](./05-backend-api-router.md)** — `routers/drafting.py`,
   the FastAPI endpoints the frontend calls.
7. **[06-backend-checklists-and-schema.md](./06-backend-checklists-and-schema.md)**
   — `modules/drafting/checklists.py` and `schema.py`, the backend's copy of
   "what documents are needed" and "what fields the deed needs".
8. **[07-backend-extraction-engine.md](./07-backend-extraction-engine.md)** —
   `modules/drafting/extraction.py` and `formatting.py`, how a photograph
   becomes structured data.
9. **[08-backend-deed-generator.md](./08-backend-deed-generator.md)** —
   `modules/drafting/generator.py`, the deterministic skeleton that is the
   actual deed.
10. **[09-backend-live-streaming.md](./09-backend-live-streaming.md)** —
    `modules/drafting/stream.py`, the part that turns the generator's output
    into a live, section-by-section broadcast.
11. **[10-backend-pdf-and-docx-export.md](./10-backend-pdf-and-docx-export.md)**
    — `modules/drafting/pdf.py` and `docx_export.py`, the two downloadable
    artefacts.

After this folder, read **`docs/system-design-of-camera-e-filing/`** for how
these eighteen files add up to one system, the engineering trade-offs behind
that shape, and a from-memory rebuild checklist.

## The feature in one paragraph

A user picks "Sale Deed", photographs each required document (ID proofs,
prior deed, tax receipts, payment proof, and so on) through the browser's
camera or a file picker. Each photo is sent to the backend the instant it is
captured; the backend asks Google's Gemini Vision model to read the
particulars relevant to *that specific document* out of the image, and a
regex safety net double-checks anything that looks like an identity number.
When the user is done uploading, the backend folds all those per-document
readings into one set of fields and the user reviews/corrects them. Clicking
"Generate" opens a Server-Sent Events connection: the backend assembles the
deed from a fixed legal skeleton — fifteen settled clauses that never change
— and asks Gemini to write only the three bespoke paragraphs (how the seller
got title, why they're selling, and the property description), streaming the
whole thing to the browser in small word-sized pieces. The browser does not
render packets as they arrive; it buffers them and reveals them at a steady
typing speed, so a jittery network still *looks* like someone writing. When
it's done, the user can click any paragraph to edit it, then download a
print-ready PDF (A4, bound-document margins, signature and thumbprint pages)
or an editable DOCX — and the PDF renders exactly what was on screen, not a
fresh and potentially different AI generation.
