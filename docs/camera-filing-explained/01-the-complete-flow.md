# 01 — The Complete Flow, Before Any Code

This document walks the entire journey — upload to downloaded PDF — in plain
language, naming which file does which job but not yet showing code. Read
this so that when document 02 onward shows you a function, you already know
*where it sits in the story*.

## The six states the page moves through

The whole frontend page is one state machine (see prerequisites, and the
system-design folder for the formal definition) with six states, held in one
variable: `flowState`.

```
IDLE  →  CAPTURE  →  PROCESSING  →  (back to IDLE, repeat per document)
                                        │
                                        ▼  (once documents are enough)
                                     REVIEW  →  GENERATING  →  (done)
```

(For the non-draftable case type, Divorce Case, there's a seventh state,
`SUBMITTED`, reached directly from `IDLE` — that flow is the old, simpler
"upload everything, submit" behaviour and is not part of this walkthrough.)

## Step by step

### 1. The page loads — `IDLE`

The user opens `/file-case`. Before any network request happens, the page
already knows the full document checklist and field list, because
`frontend/src/lib/caseTypes.ts` contains that data as plain TypeScript
constants — no backend call needed to paint the checklist. This matters
because the backend runs on a free hosting tier that can take **up to two
minutes** to wake up from a cold stop (see the system-design folder, decision
on cold starts); if the checklist depended on the backend, the user would
stare at a blank screen for two minutes before seeing anything.

The user types a case title, picks "Sale Deed," and sees the five-phase
checklist (Identity, Title, Clearances, Consideration, Witnesses) with a
Camera button and an Upload button next to each required document.

### 2. The user captures one document — `CAPTURE`

Clicking **Camera** on, say, "Proof of Identity of the Vendor" asks the
browser for camera access (`getUserMedia`). If granted, a live viewfinder
appears with a capture button. If denied or unavailable (no camera, or the
user is on desktop), the UI falls back to a file picker automatically —
capture is never a dead end.

Clicking the capture button grabs one still frame from the video feed as a
JPEG image (via the hidden `<canvas>` trick described in the prerequisites).
Clicking **Upload** instead skips the camera and opens the file picker
directly.

Either way, the result is the same shape of data: an image blob, plus which
document slot it belongs to (`vendor_id`, `purchaser_id`, etc. — see
`checklists.ts`/`checklists.py`) plus the chosen case type.

### 3. That one document gets extracted — `PROCESSING`

The instant a photo or file is ready, the frontend immediately sends *just
that one document* to the backend: `POST /drafting/extract`, as a multipart
form carrying the image bytes, the document's id, and the case type. The UI
shows a "Reading the document..." spinner — this is the `PROCESSING` state,
and it lasts only as long as this one request takes (a few seconds, once the
backend is warm).

On the backend (`routers/drafting.py` → `extract_documents`):

1. The upload is validated (right size, right content type).
2. `modules/drafting/extraction.py`'s `extract_from_document` is called. It
   looks up, from `checklists.py`, exactly which fields *this specific
   document* is expected to carry (an Aadhaar card yields a name, father's
   name, age, address — not a survey number), builds a prompt scoped to just
   those fields, and sends the image to Gemini Vision.
3. Gemini returns what it could read as JSON. A regex safety net
   (`reconcile_identifiers`) then specifically re-checks PAN numbers, Aadhaar
   numbers and pincodes against the raw text Gemini also transcribed,
   because a vision model reading a blurry scan will confidently return a
   *plausible but wrong* ID number, and a pattern match on the transcript is
   more trustworthy than the model's own structured guess.
4. The Aadhaar number, if found, is immediately masked to its last four
   digits — the full number is never stored or returned past this point.
5. The fields actually recovered are sent back to the frontend.

The frontend stores those fields against that document's checklist slot and
returns to `IDLE`, now showing the document checked off with "N particulars
read from this document." The user repeats steps 2–3 for every document they
have. **Each document is extracted independently and immediately** — there
is no "upload everything, then process" step, which is a deliberate design
decision (see system-design folder, decision 6) driven by avoiding timeouts
on a slow free-tier backend.

### 4. The user asks to review — `REVIEW`

Once satisfied, the user clicks "Review Extracted Details." The frontend
sends everything it collected — all the per-document field sets it is
holding — to `POST /drafting/merge`. The backend folds them into one field
set using a precedence rule: a document that *declares* a field as one it's
authoritative for (per `checklists.py`) wins over a document that merely
mentioned it incidentally; among equally-authoritative documents, first
upload wins.

The frontend now shows a form, grouped by topic (Vendor, Purchaser, Title,
Consideration, Property, Boundaries, Witnesses), pre-filled with everything
that was read, each field marked "extracted" if it came from a scan versus
plain if the user types it. Groups with missing *required* fields start
expanded; complete groups collapse, so the user isn't scrolling past fifty
correct answers to find four gaps. The user can edit anything — once edited,
that field is marked `"user"` provenance and will never be overwritten by a
later merge.

### 5. The user asks to generate — `GENERATING`

Clicking "Generate Document" opens a **Server-Sent Events** connection to
`POST /drafting/generate` and keeps it open. This is where the "live
writing" happens — the single most distinctive piece of this feature, and
the subject of document 04 and 09 in detail. In short:

- The backend starts asking Gemini, in a background thread, to write exactly
  three paragraphs (how the seller got title, why the sale is happening, the
  property's description) — and *simultaneously* starts streaming the
  deed's fifteen fixed legal clauses, title, party details and signature
  pages, which need no AI at all and are ready instantly.
- By the time the stream actually reaches one of those three AI-authored
  paragraphs, several seconds have already passed rendering the fixed parts
  — so the model's 3–8 second latency is usually completely hidden behind
  animation the user is already watching, rather than a blank-screen wait
  up front.
- If the model is unavailable, times out, or returns something too short to
  be usable, those three paragraphs fall back to **precedent wording** —
  fixed legal boilerplate phrased generically. The deed is always complete;
  it just quietly loses its AI-personalised recitals and uses settled
  language instead.
- The browser never renders text the instant a network packet arrives (that
  looks like network jitter, not writing). It buffers everything that has
  arrived and reveals it on a steady per-frame typing budget, accelerating
  only if it falls far behind — so the experience looks like someone typing
  at a human pace regardless of how bursty the network actually was.

When the stream ends, the full deed is on screen as formatted "paper" —
title centred, clauses numbered with hanging indents, a Schedule block, a
boundaries block, two signature pages each with a thumb-impression grid.

### 6. The user edits, then downloads

Every AI-authored paragraph and every settled clause is click-to-edit once
generation is complete (structural parts — the title, party labels, the
signature pages themselves — are not editable, only the prose is). Any edits
are tracked separately from the generated text.

Clicking **Download PDF** or **Editable DOCX** sends the *exact* sections the
user is looking at — including any edits — to `POST /drafting/export/pdf` or
`/export/docx`. Critically, **the PDF is not a fresh AI generation** — it
renders precisely what was approved on screen. If it re-ran generation, a
non-deterministic model call could silently produce different wording than
what the user read and signed off on. The backend builds either a print-ready
A4 PDF (correct binding margins, Times New Roman, justified text, running
page numbers, signature/thumbprint pages) or an editable `.docx` with
matching formatting, and streams the finished file back; the browser turns
that into a real file download.

## The map of files, by job

| Job | Frontend file | Backend file |
|---|---|---|
| What documents/fields exist | `lib/caseTypes.ts` | `modules/drafting/checklists.py`, `schema.py` |
| Talk to the backend (plain requests) | `lib/api.ts` | — |
| The whole UI / state machine | `app/file-case/page.tsx` | — |
| The review form | `components/ExtractedFieldsForm.tsx` | — |
| Turn a photo into fields | (sends the request) | `modules/drafting/extraction.py`, `formatting.py` |
| The API endpoints themselves | — | `routers/drafting.py` |
| The deed's actual legal text | — | `modules/drafting/generator.py` |
| Making it stream live | `lib/deedStream.ts`, `lib/useDeedGeneration.ts` | `modules/drafting/stream.py` |
| Rendering the "paper" on screen | `components/LiveDeedCanvas.tsx` | — |
| The downloadable files | (sends the request) | `modules/drafting/pdf.py`, `docx_export.py` |
| Talking to Google's AI | — | `modules/gemini.py` |

Next: **[02-frontend-main-page.md](./02-frontend-main-page.md)**.
