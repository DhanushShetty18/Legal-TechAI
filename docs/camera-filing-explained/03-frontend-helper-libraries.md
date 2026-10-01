# 03 — The Frontend Helper Libraries: `lib/api.ts` and `lib/caseTypes.ts`

These two files are the frontend's foundation layer. `page.tsx` (document 02)
never talks to `fetch` directly and never hardcodes a document checklist —
it calls into these two files for both. That separation is what lets the
checklist data and the network plumbing each be tested, reused, and changed
independently of the UI that consumes them.

---

## `frontend/src/lib/api.ts`

### Why this file exists

Every network call in the feature — extraction, merge, generation, export —
needs the same handful of things done consistently: build the full URL from
a relative path, time out instead of hanging forever against a slow
backend, and turn a non-2xx HTTP response into a thrown JavaScript `Error`
with a useful message. Without this file, every call site in `page.tsx`
would duplicate (and likely get subtly wrong) that logic. **What breaks if
it's removed:** every `postJson`/`postForm`/`downloadFile` call in
`page.tsx` and `useDeedGeneration.ts` stops compiling — this file is a hard
dependency of the entire feature's networking.

### `API_BASE` and `api(path)`

```ts
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ??
  "https://legal-techai.onrender.com";

export const api = (path: string) => `${API_BASE}${path}`;
```

**Job:** know the backend's base URL, and build full URLs from it.
**Calls:** nothing.
**Line by line:**
- `process.env.NEXT_PUBLIC_API_BASE` — Next.js exposes environment variables
  prefixed `NEXT_PUBLIC_` to browser code (unprefixed ones stay server-only,
  a security boundary Next.js enforces). This lets each deployment point at
  a different backend without a code change.
- `?.replace(/\/$/, "")` — if the env var is set, strip exactly one trailing
  slash, so `https://host/` and `https://host` behave identically when a
  path like `/drafting/extract` is appended.
- `?? "https://legal-techai.onrender.com"` — the nullish-coalescing operator:
  if the left side is `null` or `undefined` (not just falsy — an empty
  string would **not** trigger this), fall back to the hardcoded production
  URL. This is why the app works even with zero environment configuration.
- `api(path)` is a one-line helper so every call site writes
  `api("/drafting/extract")` instead of `${API_BASE}/drafting/extract`
  everywhere — a trivial function, but it's the only place the
  concatenation happens, so it's the only place that could get it wrong.

### `COLD_START_TIMEOUT_MS`

```ts
export const COLD_START_TIMEOUT_MS = 150_000;
```

**Job:** a shared constant — 150 seconds — long enough to outlast the
backend's worst-case cold start (up to two minutes, per the UI's own
messaging) plus margin. Named rather than inlined so every call site's
intent is self-documenting and the single number is easy to tune later.

### `postJson<T>(path, body, timeoutMs)`

```ts
export async function postJson<T>(
  path: string,
  body: unknown,
  timeoutMs = COLD_START_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(api(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(await describeFailure(response));
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
```

**Job:** POST a JSON body to the backend, enforce a timeout, and turn a
failed HTTP response into a thrown `Error` with a real message — the one
function every plain (non-file-upload) call in this feature goes through.
**Calls:** `api`, `describeFailure`.
**Line by line:**
- `new AbortController()` / `controller.signal` — the standard mechanism for
  cancelling an in-flight `fetch` (prerequisites, A7).
- `setTimeout(() => controller.abort(), timeoutMs)` — schedules the abort to
  fire automatically if the request is still running after `timeoutMs`.
  Without this, a hung backend would leave the UI waiting forever with no
  feedback.
- `headers: { "Content-Type": "application/json" }` — tells the server how
  to parse the body; FastAPI's Pydantic model parsing (prerequisites, B4)
  depends on this header being correct.
- `body: JSON.stringify(body)` — `fetch` sends raw text/bytes, not
  JavaScript objects; this serialises whatever object was passed in.
- `if (!response.ok) throw new Error(await describeFailure(response));` —
  `response.ok` is only true for 2xx status codes. A 4xx/5xx does **not**
  reject the `fetch` promise by itself (this is a common `fetch` gotcha) —
  it resolves successfully with a response object that merely reports a bad
  status. This line is what converts that into an actual thrown error the
  rest of the code can `catch`.
- `return (await response.json()) as T;` — parse the JSON body and assert
  its type as whatever the caller specified (`<MergeResponse>`, etc.) — a
  compile-time-only assertion; nothing checks at runtime that the server
  actually sent that shape.
- `finally { clearTimeout(timer); }` — always cancels the pending timeout,
  whether the request succeeded, failed, or was aborted — otherwise a timer
  would keep running needlessly (or, worse, could fire and call
  `.abort()` on a controller tied to a request that already finished, which
  is harmless here but is exactly the kind of leak `finally` exists to
  prevent).

### `postForm<T>(path, form, timeoutMs)`

```ts
export async function postForm<T>(
  path: string,
  form: FormData,
  timeoutMs = COLD_START_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(api(path), {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(await describeFailure(response));
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
```

**Job:** the same contract as `postJson`, but for file uploads.
**Calls:** `api`, `describeFailure`.
**What's different from `postJson`, and why:** no `Content-Type` header is
set. When `fetch`'s `body` is a `FormData` object, the browser sets
`Content-Type: multipart/form-data; boundary=...` itself, automatically,
including a boundary string unique to that specific request. Setting it
manually would produce a malformed request (a boundary FastAPI couldn't
find), so the correct action here is to *not* set it — which is why the
header line present in `postJson` is simply absent here, not an oversight.

### `downloadFile(path, body, filename)`

```ts
export async function downloadFile(
  path: string,
  body: unknown,
  filename: string,
): Promise<void> {
  const response = await fetch(api(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await describeFailure(response));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
```

**Job:** request a generated file (PDF or DOCX) and trigger the browser's
native "Save As" / downloads behaviour for it, with no server-side file
storage involved at all.
**Calls:** `api`, `describeFailure`.
**Line by line:**
- No timeout/`AbortController` here — deliberately: rendering a multi-page
  PDF can legitimately take longer than a quick JSON call, and there's
  already a visible spinner (`isBusy` in `page.tsx`) so an open-ended wait
  is acceptable here in a way it wouldn't be for, say, a field extraction.
- `const blob = await response.blob();` — reads the response body as raw
  binary data (a PDF or DOCX file), not JSON.
- `URL.createObjectURL(blob)` — creates a temporary, browser-internal URL
  that points at that in-memory blob (prerequisites, A7).
- `document.createElement("a")` ... `anchor.download = filename;` — builds
  an `<a>` link that the browser will treat as a download (because of the
  `download` attribute) rather than a navigation, pointed at the blob URL,
  with the desired filename.
- `document.body.appendChild(anchor); anchor.click(); anchor.remove();` —
  the link must actually be in the document to be clickable in every
  browser; it's appended, clicked programmatically (triggering the
  download), then immediately removed since it never needed to be visible.
- `URL.revokeObjectURL(url);` — frees the browser's internal reference to
  the blob now that the download has been triggered, preventing a memory
  leak if the user downloads many files in one session.

### `describeFailure(response)`

```ts
async function describeFailure(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
    if (typeof body?.error === "string") return body.error;
  } catch {
    // fall through to the status line
  }
  return `Request failed (${response.status} ${response.statusText}).`;
}
```

**Job:** turn a failed HTTP response into the most useful error message
available.
**Calls:** nothing.
**Line by line:**
- `await response.json()` — FastAPI's own error responses (including the
  `HTTPException(status_code=..., detail="...")` pattern used throughout
  `routers/drafting.py`) are JSON bodies with a `detail` key; this tries to
  read that first.
- `body?.detail` / `body?.error` — checks two different possible key names,
  because not every error source in this codebase necessarily uses the same
  convention; `typeof ... === "string"` guards against a non-string value
  (like a validation-error array FastAPI sometimes returns) being
  concatenated into a nonsensical message.
- `catch { }` — if the body isn't valid JSON at all (a plain-text 502 from
  a proxy in front of the backend, for instance), this swallows the parse
  error and falls through.
- The final line is the universal fallback: the raw HTTP status code and
  text (e.g. `"Request failed (500 Internal Server Error)."`) — always
  available, even when nothing else is.

---

## `frontend/src/lib/caseTypes.ts`

### Why this file exists, and why it duplicates backend data on purpose

This file is the frontend's private copy of the exact same checklist and
field catalogue that `backend/modules/drafting/checklists.py` and
`schema.py` define. That is **deliberate duplication**, not an oversight —
see `DECISIONS.md` decision 12, explained in full in the system-design
folder. In one sentence: the backend can take up to two minutes to wake up
from a cold start, and the checklist is the very first thing the page has
to paint, so it ships with the client and needs no network call to exist.
**What breaks if it drifts out of sync with the backend:** nothing crashes,
but a document id the frontend uses that the backend doesn't recognise
would silently extract against a *default* field set rather than the
focused one — a correctness bug, not a crash, which is exactly why both
sides are covered by tests asserting the same invariants (per
`DECISIONS.md`).

### The checklist data: `SALE_DEED_CHECKLIST`, `DIVORCE_CHECKLIST`, `CHECKLISTS`

These are plain data — arrays and objects, no logic — mirroring
`checklists.py`'s `SALE_DEED_REQUIREMENTS` and `DIVORCE_REQUIREMENTS` one
for one, down to identical `id` strings (`vendor_id`, `parent_sale_deed`,
etc.). The `id` values are the actual contract between frontend and backend:
`extractFromImage` in `page.tsx` sends a document's `id` as `doc_ids` in the
upload, and the backend's `document_by_id` (document 06) uses that same
string to look up which fields to expect. If a frontend id and a backend id
ever disagree, the backend would use its default/fallback field set for
that document instead of a scoped one — this is the single most important
string-matching contract in the whole feature.

### The field data: `SALE_DEED_FIELDS`, `FIELD_GROUPS`, `DERIVABLE_FIELDS`

```ts
export const SALE_DEED_FIELDS: FieldDef[] = [
  { key: "place_of_execution", label: "Place of Execution", group: EXECUTION, required: true, placeholder: "e.g. Mangaluru" },
  ...
];

export const DERIVABLE_FIELDS = new Set(["sale_consideration_words", "title_recital"]);

export const FIELD_GROUPS: string[] = SALE_DEED_FIELDS.reduce<string[]>((groups, field) => {
  if (!groups.includes(field.group)) groups.push(field.group);
  return groups;
}, []);
```

**Job:** `SALE_DEED_FIELDS` is the full catalogue of every field the deed
needs, each with a `key` (the field's identifier everywhere else in the
code), a human-readable `label`, which `group` it belongs to (for the
review form's sectioning), whether it's `required`, what kind of input it
needs (`text`/`number`/`date`/`textarea`), and optional placeholder/help
text. `DERIVABLE_FIELDS` names the two fields the *generator* can compute on
its own (the consideration spelled out in words, and the title recital) —
these must never block the user from proceeding just because they're empty.
`FIELD_GROUPS` computes the *distinct, order-preserving* list of group names
by walking the field list once: `.reduce` builds up an array, and
`if (!groups.includes(field.group))` is what ensures each group name
appears only once, in the order its first field appears — this is why the
review form's sections appear in a sensible reading order (Execution,
Vendor, Purchaser, Title...) without that order being hand-maintained as a
separate list anywhere.

### `missingRequiredFields(fields)`

```ts
export function missingRequiredFields(fields: DeedFields): string[] {
  return SALE_DEED_FIELDS.filter(
    (field) =>
      field.required &&
      !DERIVABLE_FIELDS.has(field.key) &&
      !String(fields[field.key] ?? "").trim(),
  ).map((field) => field.key);
}
```

**Job:** the single source of truth, on the frontend, for "what does the
user still have to supply." Used by `page.tsx` to decide which checklist
groups start expanded, show the "Still needed" banner, and whether the
"Generate" button should be disabled.
**Calls:** nothing.
**Line by line:** keeps a field in the result only if it `is required`, is
**not** one of the two fields the generator can derive itself, and its
current value is empty once converted to a string and trimmed (so a value
of `"   "` or `undefined` both count as empty). `.map((field) => field.key)`
reduces the result to just the field keys, which is all the caller needs.

### `checklistFor`, `isDraftable`, `allDocuments`, `fieldLabel`

```ts
export function checklistFor(caseType: string): ChecklistPhase[] {
  return CHECKLISTS[caseType] ?? [];
}

export function isDraftable(caseType: string): boolean {
  return DRAFTABLE_CASE_TYPES.includes(caseType);
}

export function allDocuments(caseType: string): RequiredDocument[] {
  return checklistFor(caseType).flatMap((phase) => phase.documents);
}

export function fieldLabel(key: string): string {
  const field = SALE_DEED_FIELDS.find((candidate) => candidate.key === key);
  if (!field) return key;
  const scoped = [VENDOR_GROUP, PURCHASER_GROUP].includes(field.group);
  return scoped ? `${field.group.split(" ")[0]} - ${field.label}` : field.label;
}
```

**Job:** four small, pure lookup functions so `page.tsx` never reaches into
the raw data structures (`CHECKLISTS[...]`, `.find(...)`) itself.
**Calls:** each other (`allDocuments` calls `checklistFor`); none call out
to the network — everything here is synchronous, in-memory lookup.
**Line by line:**
- `checklistFor` — look up a case type's phased checklist, defaulting to an
  empty array for an unrecognised case type rather than `undefined` (so
  callers can always safely `.map()` the result without a null check).
- `isDraftable` — is this case type one the live-generation engine supports
  (today, only `"Sale Deed"`).
- `allDocuments` — flattens the five-phase checklist into one single list
  of documents, used wherever the UI needs a plain count (`uploadedCount` in
  `page.tsx`) rather than the phase structure.
- `fieldLabel` — given a field's key, return a human-readable label for it,
  used by the "Still needed" chips in the review screen. The `scoped` check
  specifically disambiguates Vendor vs. Purchaser fields that would
  otherwise share an identical label (both have a field labelled just
  "Full Name") by prefixing with the first word of the group name — turning
  `"Full Name"` into `"Vendor - Full Name"` or `"Purchaser - Full Name"`.

Next: **[04-frontend-live-writing-engine.md](./04-frontend-live-writing-engine.md)**.
