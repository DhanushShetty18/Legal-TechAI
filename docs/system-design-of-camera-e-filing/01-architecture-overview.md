# 01 — Architecture Overview

## The layered picture

```
┌─────────────────────────────────────────────────────────────────────┐
│  BROWSER (frontend/, deployed to Vercel)                             │
│                                                                       │
│  ┌───────────────┐   ┌──────────────────┐   ┌─────────────────────┐ │
│  │ UI layer      │→→│ Presentation      │→→│ Networking layer     │ │
│  │ page.tsx      │   │ components        │   │ lib/api.ts           │ │
│  │ (state        │   │ LiveDeedCanvas    │   │ (fetch, timeouts,    │ │
│  │  machine,     │   │ ExtractedFields-  │   │  SSE byte decoding)  │ │
│  │  event        │   │ Form              │   │ lib/deedStream.ts    │ │
│  │  handlers)    │   │                    │   │ lib/useDeedGen...ts │ │
│  └───────────────┘   └──────────────────┘   └─────────────────────┘ │
│           ↑                                                          │
│           │ reads static checklist/field data, no network needed    │
│  ┌───────────────┐                                                   │
│  │ lib/caseTypes.ts│  (duplicated client-side copy of backend data)  │
│  └───────────────┘                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                 │  HTTPS — JSON over POST, and one
                                 │  long-lived SSE connection
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BACKEND (backend/, deployed to Render)                              │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ API / controller layer — routers/drafting.py                   │  │
│  │ (parses HTTP, calls the engine below, shapes the HTTP response)│  │
│  └───────────────────────────┬─────────────────────────────────────┘  │
│                               ▼                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Domain / engine layer — modules/drafting/                      │  │
│  │                                                                 │  │
│  │  checklists.py / schema.py   — what's required, what fields exist│
│  │  extraction.py / formatting.py — photo → structured fields      │
│  │  generator.py                 — fields → deed text (deterministic)│
│  │  stream.py                    — paces generator.py output + AI  │
│  │  pdf.py / docx_export.py      — sections → downloadable file    │
│  └───────────────────────────┬─────────────────────────────────────┘  │
│                               ▼                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ External-integration layer — modules/gemini.py                 │  │
│  │ (the only file that imports google.generativeai directly)      │  │
│  └───────────────────────────┬─────────────────────────────────────┘  │
└───────────────────────────────┼───────────────────────────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │  Google Gemini API       │
                    │  (third-party, external) │
                    └─────────────────────────┘
```

## The rule each layer follows

This is a textbook **layered (n-tier) architecture**, and the discipline
that makes it work is simple to state and easy to verify by reading the
imports at the top of any file: **a layer may only call downward, never
sideways across an unrelated concern, and a lower layer never knows the
upper layer exists.**

- `routers/drafting.py` imports from `modules/drafting/` — never the other
  way around. `modules/drafting/generator.py` has never heard of FastAPI,
  `HTTPException`, or HTTP status codes. You can tell this just from
  `generator.py`'s imports (document 08 of the beginner folder): `from
  ..gemini import ...`, `from .formatting import ...` — nothing web-related
  at all.
- `modules/drafting/extraction.py` and `stream.py` import from
  `modules/gemini.py` — never the reverse, and `gemini.py` itself has no
  idea Camera Filing exists; it's generic AI plumbing other features in
  this codebase also use.
- The frontend's `lib/deedStream.ts` has **zero** imports from React, the
  DOM, or `fetch` — it is pure logic, sitting below even `useDeedGeneration.ts`
  in its own small stack, specifically so it can be unit-tested without a
  browser at all.

**Why this matters, concretely:** because `generator.py` doesn't know
FastAPI exists, it can be — and is — called directly, with no server
running, by the test suite, by the `/preview` endpoint, and by `stream.py`,
each in a completely different context, without any of them needing to
know about the others. The moment a lower layer starts reaching upward
(say, if `generator.py` tried to read something off a FastAPI `Request`
object), every one of those independent callers breaks simultaneously, and
the function becomes untestable without spinning up a web server. Layered
discipline isn't a stylistic preference here — it's what keeps 18 files
independently reasoned-about instead of one tangled ball.

## The two things that cross the frontend/backend boundary deliberately

Everything in this diagram communicating across the dotted vertical line in
the middle goes through plain HTTP — but two pieces of **data**, not
requests, are duplicated across that boundary on purpose:

1. **The checklist and field catalogue** (`caseTypes.ts` mirrors
   `checklists.py`+`schema.py`). This is *not* a REST call result cached
   client-side — it's independently maintained, identical data, committed
   in two languages. The reasoning (cold-start latency) is covered in
   document 03 of this folder.
2. **The style vocabulary** (`"title"`, `"clause"`, `"recital"`,
   `"signature-block"`, ...). This string vocabulary is defined nowhere
   centrally — `generator.py` assigns it, and three *independent*
   renderers (`LiveDeedCanvas.tsx`'s CSS, `pdf.py`'s ReportLab styles,
   `docx_export.py`'s python-docx formatting) each separately interpret the
   same strings into their own visual output. This is **not** duplication
   of data — it's three different presentations of one semantic model, the
   same way one HTML document can be styled by three different
   stylesheets. It is still worth knowing about, because adding a new
   section style means touching three files, not one — see document 04 on
   failure modes for what happens if one of the three is forgotten.

## Where state actually lives

Nothing in this entire feature writes to a database. Read that again: there
is no `CameraFilingSession` table, no persisted "draft in progress" record.
Every piece of state — which documents are uploaded, what fields were
extracted, what the user edited — lives **only in the browser's React state**
for the duration of one session, and is submitted to the backend fresh on
each request. The backend is **stateless** between requests (explored
further in document 02's REST section): every `/drafting/*` call carries
everything the backend needs to answer it, and the backend remembers
nothing about a previous call from the same user. Close the tab mid-filing,
and everything is gone — there is no draft recovery. This is a genuine
limitation, not an oversight; document 04 covers exactly what this costs
and what adding persistence would require.

Next: **[02-microservices-concepts-via-this-code.md](./02-microservices-concepts-via-this-code.md)**.
