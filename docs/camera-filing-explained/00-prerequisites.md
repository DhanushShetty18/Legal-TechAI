# 00 — Prerequisites: Everything You Need to Know Before Reading the Code

Read this file in full before any other file in this folder. Every concept
here will be assumed, not re-explained, later. Nothing here is specific to
Legal-TechAI — it is general knowledge about the tools the feature is built
from. If you already know a section, skim it anyway for the one or two
sentences on *how this specific codebase uses it*.

---

## Part A — The Frontend World (what runs in the user's browser)

### A1. What "frontend" and "backend" mean here

Two separate programs, written in two different languages, talking to each
other over the internet using plain HTTP requests (and one special kind of
HTTP request, explained in A8):

- **Frontend** — a website, written in TypeScript/React, that runs entirely
  inside the user's browser. It is what the user sees and clicks on. In this
  repo it lives in `frontend/`.
- **Backend** — a Python program (using the FastAPI framework) that runs on a
  server somewhere (Render, in this project), never inside the browser. It
  holds the business logic: talking to Google's AI model, generating PDFs,
  doing anything that needs a secret API key (which must never be visible in
  browser code, because anyone can open a browser's developer tools and read
  it). In this repo it lives in `backend/`.

The browser and the server know nothing about each other except: "send an
HTTP request to this URL, with this data, and wait for a response." That is
the *entire* contract. Everything else is each side's private implementation.

### A2. React and "components"

React is a JavaScript (here, TypeScript) library for building user interfaces
out of **components** — functions that return a description of what should
appear on screen (written in a JSX syntax that looks like HTML mixed into
code), and that automatically re-run and update the screen whenever their
data changes.

```tsx
function Greeting() {
  return <h1>Hello</h1>;
}
```

That function is a component. When React "renders" it, it turns
`<h1>Hello</h1>` into an actual `<h1>` element on the page. `file-case/page.tsx`
is one big component called `FileCasePage`.

**JSX** is the HTML-looking syntax inside the `return (...)`. `<div className="...">`
is JSX for a `<div>` element; `className` is JSX's name for HTML's `class`
attribute (because `class` is a reserved word in JavaScript).

### A3. Tailwind CSS (why every element has a wall of class names)

You will see lines like:

```tsx
<button className="flex items-center justify-center gap-3 rounded-2xl bg-indigo-600 py-4 font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 disabled:opacity-50">
```

This is **Tailwind CSS** — a styling system where every visual property
(colour, spacing, rounding, flex layout...) is its own tiny, composable class
name instead of writing custom CSS. Once you know the vocabulary it reads
almost like prose:

- `flex`, `items-center`, `justify-center`, `gap-3` — lay children out in a
  row, centred, with gaps between them.
- `rounded-2xl` — large rounded corners. `rounded-xl`, `rounded-full` are
  smaller/maximal variants.
- `bg-indigo-600`, `text-white` — background colour, text colour. The number
  is a shade (darker as it increases).
- `py-4` — padding on the Y axis (top+bottom); `px-4` is X axis (left+right).
  `p-4` is all four sides.
- `hover:bg-indigo-500` — a *variant prefix*: this class only applies on
  mouse-hover. `disabled:opacity-50` only applies when the element is
  disabled. `sm:flex-row` only applies above a certain screen width.
- `shadow-lg`, `shadow-indigo-500/20` — a drop shadow, tinted indigo at 20%
  opacity.
- `transition-all` — animate changes to the above instead of snapping.

**This document will not re-explain Tailwind classes line by line going
forward.** Where a line of JSX is interesting for its *logic* (a condition,
an event handler), that is explained; the styling classes are decoration and
are skipped once you have this vocabulary.

### A4. TypeScript: types, interfaces, generics

TypeScript is JavaScript with an added **type system**: you can declare what
shape a piece of data has, and the compiler refuses to build the code if you
use it inconsistently. This catches a huge class of bugs before the code ever
runs.

```ts
interface DocumentResult {
  docId: string;
  fields: Record<string, string>; // an object whose values are all strings, keys unknown ahead of time
}

type FlowState = "IDLE" | "CAPTURE" | "PROCESSING"; // a value that must be exactly one of these three strings
```

`Record<string, string>` is a **generic** type: "a dictionary/object from
string keys to string values." You'll see `Record<string, DocumentState>`,
meaning "an object whose keys are document IDs and whose values are
`DocumentState` objects."

A function can declare a generic too:

```ts
export async function postJson<T>(path: string, body: unknown): Promise<T> { ... }
```

Here `T` is a placeholder type decided by *whoever calls the function* — call
it as `postJson<MergeResponse>(...)` and TypeScript treats the returned value
as a `MergeResponse`, checking your code's use of it accordingly, even though
the function itself has no idea what `MergeResponse` is.

### A5. React Hooks: `useState`, `useRef`, `useEffect`, `useMemo`, `useCallback`

A plain JavaScript function has no memory between calls — every call starts
fresh. But a React component function is *called over and over* (once per
render) and needs to remember things between those calls: what the user
typed, what step of a flow they're on. Hooks are React's mechanism for that.

- **`useState(initialValue)`** returns a `[value, setValue]` pair. Calling
  `setValue(newValue)` updates the stored value *and* tells React "re-render
  this component now, because something it depends on changed."

  ```ts
  const [flowState, setFlowState] = useState<FlowState>("IDLE");
  // later: setFlowState("CAPTURE") schedules a re-render with the new state
  ```

- **`useRef(initialValue)`** returns a mutable box (`{ current: value }`) that
  — unlike `useState` — does **not** trigger a re-render when changed, and
  keeps its value across renders. It is used for two things in this codebase:
  (1) holding a reference to an actual DOM element (`<video ref={videoRef}>`
  lets code later do `videoRef.current.play()`), and (2) holding a value that
  changes very frequently (like an animation's per-frame position) where
  triggering a full React re-render on every change would be wasteful.

- **`useEffect(fn, deps)`** runs `fn` after the component renders, and again
  whenever any value in the `deps` array changes since the last render. If
  `fn` returns a function, that returned function runs as *cleanup* right
  before the effect runs again or the component disappears. This is how the
  camera is started and reliably stopped:

  ```ts
  useEffect(() => {
    if (flowState !== "CAPTURE" || showFileUpload) stopCamera();
    return stopCamera; // cleanup: always stop the camera when this effect reruns or the component unmounts
  }, [flowState, showFileUpload]);
  ```

- **`useMemo(fn, deps)`** recomputes `fn()` only when something in `deps`
  changes, and returns the cached result otherwise. Used for derived values
  that are cheap to need but wasteful to recompute every single render, like
  filtering a document list.

- **`useCallback(fn, deps)`** is `useMemo` for *functions themselves* — it
  returns the same function reference across renders as long as `deps`
  haven't changed, which matters because some hooks (like `useEffect`) compare
  dependencies by reference and would otherwise think "this changed" on every
  render just because a new function object was created.

### A6. `async`/`await` and Promises

Network requests take time. JavaScript does not pause the whole program to
wait — it uses a `Promise`, an object representing "a value that will exist
later." `async function` and `await` are syntax that let you *write*
asynchronous code that *reads* like ordinary sequential code:

```ts
async function openReview() {
  const merged = await postJson<MergeResponse>("/drafting/merge", body);
  // execution pauses here until the request finishes, without blocking the browser
  setFields(merged.fields);
}
```

Anything that calls an `async` function gets back a `Promise`; if you don't
need the result you can mark that explicitly with `void someAsyncCall()` so
TypeScript (and a linter) doesn't warn you that you ignored a Promise.

### A7. Browser APIs this feature uses directly

- **`navigator.mediaDevices.getUserMedia({ video: {...} })`** — asks the
  browser (and therefore the OS) for permission to access a camera, and
  returns a live `MediaStream`. `facingMode: "environment"` requests the
  *rear/outward* camera on a phone (as opposed to the front-facing selfie
  camera), because the user is photographing a document, not themselves.
- **`<video>` + `<canvas>`** — the live camera feed is displayed in a
  `<video>` element. To actually *capture a still frame*, the code draws the
  current video frame onto an invisible `<canvas>` (`context.drawImage(...)`)
  and then asks the canvas to export itself as an image file
  (`canvas.toBlob(callback, "image/jpeg", 0.95)` — a JPEG at 95% quality).
- **`Blob` and `File`** — a `Blob` is raw binary data with a MIME type (a
  label like `image/jpeg` saying what kind of data it is). A `File` is a
  `Blob` that also has a filename; it is what the `<input type="file">`
  picker and the camera capture both ultimately produce.
- **`FormData`** — the browser's representation of a multipart file-upload
  form, the standard way to send files (not just text) in an HTTP request.
  `form.append("files", someFile)` adds a file under the field name `files`.
- **`fetch(url, options)`** — the browser's built-in function for making an
  HTTP request. Returns a `Promise<Response>`.
- **`AbortController`** — lets code *cancel* an in-flight `fetch` (for
  example, to enforce a timeout: start a timer that calls `controller.abort()`
  if the request hasn't finished in time, and pass `controller.signal` into
  `fetch` so it knows to listen for that).
- **`URL.createObjectURL(blob)`** — turns an in-memory `Blob` (like a
  downloaded PDF) into a temporary URL the browser can treat as if it were a
  real file, which is how "download this file the server just generated" is
  implemented without the server needing to host a persistent file: a hidden
  `<a>` link is created pointing at that URL with a `download` attribute, and
  `.click()` is called on it programmatically.
- **`requestAnimationFrame(callback)`** — asks the browser to call `callback`
  right before it next repaints the screen (typically ~60 times a second).
  Calling it again inside the callback creates a self-sustaining animation
  loop. This is what drives the "typing" effect — explained fully in
  document 04.

### A8. Server-Sent Events (SSE) — how the deed streams live

A normal HTTP request gets exactly one response, then the connection is done.
**SSE** is a standard for the opposite: one request stays open, and the
server can push *multiple* messages down it over time, each one formatted as
plain text:

```
data: {"type":"status","message":"Composing the deed"}

data: {"type":"delta","id":"title_recital","text":"WHEREAS the "}

```

Each **event** is one or more `data: ...` lines, terminated by a **blank
line**. The client reads the response body as a stream of bytes (not waiting
for it to finish) and has to reassemble those bytes back into events —
tricky because the network can hand you a chunk of bytes that stops in the
*middle* of an event, or that contains two and a half events at once. Code
document 04 covers exactly how this codebase's `SSEDecoder` handles that.

The server side of this is a `StreamingResponse` in FastAPI (see A14) whose
body is a Python *generator* (A13) instead of one finished string.

---

## Part B — The Backend World (Python / FastAPI)

### B1. Python basics assumed going forward

- **Type hints** (`def f(x: int) -> str:`) are optional annotations, checked
  by external tools but not enforced at runtime by Python itself — they exist
  purely to make the code's intent explicit and catch mistakes with tooling.
- **`Dict[str, Any]`, `List[...]`, `Optional[X]`** (from the `typing` module)
  are the Python equivalents of TypeScript's `Record<...>`, arrays, and
  "either `X` or `None`."
- **f-strings**: `f"Hello {name}"` embeds a variable's value directly into a
  string.
- **Dict/list comprehensions**: `[f(x) for x in items if cond(x)]` builds a
  new list by transforming and filtering `items` in one expression — used
  constantly in this codebase instead of manual loops.
- **`**kwargs` / `**dict` spread**: `{**a, **b}` merges two dictionaries into
  a new one, with `b`'s keys winning on conflict.

### B2. Decorators

A **decorator** wraps a function with extra behaviour without changing the
function's own code:

```python
@retry_on_failure(retries=3, delay=2)
def _call_gemini(prompt, image_blob, mime_type):
    ...
```

`@retry_on_failure(retries=3, delay=2)` is itself a function call that
returns a decorator, which then wraps `_call_gemini` so that calling
`_call_gemini(...)` actually calls the wrapped version — one that retries up
to three times, waiting two seconds between attempts, if the real function
raises an exception. The implementation of `retry_on_failure` is explained in
document 07; what matters for every other file is just: *any function
wearing this decorator automatically retries on failure.*

### B3. Generators and `yield`

A normal Python function runs to completion and returns one value. A
**generator** function instead contains one or more `yield` statements, and
calling it doesn't run the function body at all — it returns an iterator
object. Each time something asks that iterator for "the next value," the
function body runs *until the next `yield`*, hands back that value, and then
pauses exactly there — with all its local variables intact — until asked for
the next value.

```python
def iter_deltas(body: str):
    for start in range(0, len(tokens), 6):
        yield "".join(tokens[start:start + 6])
```

Calling `iter_deltas(text)` does nothing yet. A `for chunk in iter_deltas(text):`
loop pulls one chunk at a time, running just enough of the function to
produce it. This is how `stream_document` (document 09) produces the deed
section by section *as the client asks for the next piece*, instead of
building the whole thing in memory first and sending it in one go — which
matters because sending it in one go is exactly what would defeat the "live"
effect.

### B4. FastAPI: routers, path operations, Pydantic models

**FastAPI** is a Python web framework: you write plain functions, decorate
them with the HTTP method and URL path they should answer, and FastAPI
handles turning HTTP requests into function calls and function return values
back into HTTP responses (as JSON, by default).

```python
router = APIRouter(tags=["Drafting"])

@router.get("/case-types")
def list_case_types() -> Dict[str, Any]:
    return {"caseTypes": [...]}
```

An `APIRouter` is a *group* of related endpoints that gets attached to the
main application under a shared URL prefix — in `main.py`:
`app.include_router(drafting.router, prefix="/drafting")` — which is why the
frontend calls `/drafting/case-types` even though the router itself only ever
writes `/case-types`.

**Pydantic models** (`class GenerateRequest(BaseModel): ...`) describe the
*shape* of a JSON request body as a Python class. FastAPI reads the incoming
request's JSON, validates it against the model automatically (rejecting the
request with a clear error if a required field is missing or the wrong
type), and hands your function a fully-formed, type-checked Python object.
You never manually parse JSON in these endpoints — it has already happened
before your function body runs.

```python
class GenerateRequest(BaseModel):
    fields: Dict[str, Any] = Field(default_factory=dict)
    caseType: str = SALE_DEED
```

`Field(default_factory=dict)` means "if this key is absent from the incoming
JSON, default to a fresh empty dict" (a *factory* rather than a bare `{}`
default, because mutable defaults shared across calls are a classic Python
footgun).

### B5. `UploadFile`, `File(...)`, `Form(...)`

```python
async def extract_documents(
    files: List[UploadFile] = File(...),
    doc_ids: str = Form(""),
):
```

This endpoint doesn't take a JSON body — it takes a **multipart form**
(matching the browser's `FormData`, A7). `File(...)` tells FastAPI "this
parameter comes from an uploaded file in the form"; `UploadFile` is a handle
to that upload — you `await upload.read()` to get its raw bytes. `Form("")`
means "this parameter comes from a plain text form field, defaulting to an
empty string if absent." The `...` in `File(...)` is Python's `Ellipsis`,
used by FastAPI/Pydantic as a marker for "no default — this is required."

### B6. `StreamingResponse`

The normal FastAPI pattern is "return a value, FastAPI converts it to JSON
and sends it all at once." `StreamingResponse` is the escape hatch for
responses that are *produced over time*: you hand it a generator (B3), and it
sends each yielded chunk to the client as soon as it is produced, keeping the
HTTP connection open until the generator is exhausted. This is what makes SSE
(A8) and file downloads of generated content (rather than files already
saved to disk) possible.

### B7. Regular expressions (`re` module)

A **regular expression** (regex) is a pattern-matching mini-language for
text. This codebase uses a handful of patterns repeatedly:

- `\d` — any digit. `\D` — any non-digit.
- `\s` — any whitespace. `\S` — any non-whitespace.
- `{4}` — exactly four of the preceding token. `{1,2}` — one or two.
- `[A-Z]` — any uppercase letter. `[^\w\s-]` — anything that is *not* a word
  character, whitespace, or hyphen (used to strip unsafe characters out of a
  filename).
- `\b` — a "word boundary" (so `\bCAT\b` matches the word CAT but not
  CATALOG).
- `re.findall(pattern, text)` — every non-overlapping match, as a list.
- `re.sub(pattern, replacement, text)` — replace every match.
- `re.fullmatch(pattern, text)` — true only if the *entire* string matches,
  not just some substring of it.

Document 07 explains exactly which identifiers (PAN numbers, Aadhaar numbers,
pincodes) these patterns are used to double-check.

### B8. Google's Gemini API (the AI model)

**Gemini** is Google's family of large language models, available through
the `google-generativeai` Python package (imported as `google.generativeai`,
aliased to `genai`). Two capabilities are used here:

1. **Vision**: sending an image *and* a text prompt together, and getting
   back a text response describing or extracting information from the
   image. `model.generate_content([prompt_text, {"mime_type": ..., "data": image_bytes}])`.
2. **Text generation with a system instruction**: `GenerativeModel(system_instruction=...)`
   sets standing instructions ("you are a conveyancing draftsman...") that
   apply to every call made with that model instance, separately from the
   per-call prompt.

The model is asked to answer *only* in JSON (the prompts explicitly demand
this), but a language model is fundamentally a text generator with no hard
guarantee of valid JSON or of staying in character — so every call this
codebase makes to Gemini is wrapped in: a retry decorator (B2), a JSON
extraction step that tolerates the model wrapping its answer in markdown code
fences, and a fallback path for when the whole thing fails. That defensive
pattern is not incidental — it is one of the central engineering decisions of
this feature, covered in the system-design folder.

### B9. ReportLab (the PDF engine)

**ReportLab** is a Python library for programmatically generating PDF files.
This codebase uses its higher-level **Platypus** layer, which works with
*flowable* objects that automatically wrap and paginate — you describe
content as a sequence of paragraphs, tables, and spacers, and ReportLab
figures out where page breaks fall:

- **`Paragraph(text, style)`** — one block of styled, auto-wrapping text.
  The `text` can contain a small set of HTML-like tags (`<br/>`, `&nbsp;`);
  this is why user-supplied text is HTML-escaped before being wrapped in a
  `Paragraph` (document 10 — otherwise a clause containing a literal `<` or
  `&` would corrupt the layout or be misinterpreted as markup).
- **`ParagraphStyle`** — a named bundle of font, size, alignment, indentation,
  and spacing settings, reused across many paragraphs the way a CSS class is
  reused across many HTML elements.
- **`Table` / `TableStyle`** — a grid, used here for the ten-box
  fingerprint-impression grid and the signature/photograph layout.
- **`Frame` / `PageTemplate` / `BaseDocTemplate`** — the page geometry: a
  `Frame` is a rectangular region text flows into; a `PageTemplate` names one
  or more frames to use for a page; `BaseDocTemplate` is the document as a
  whole, which can switch between differently-shaped page templates (used
  here so page one can have a taller top margin than every later page).
- **`KeepTogether`** — a wrapper saying "never split these flowables across a
  page break" (used so a witness's full block, or the boundaries block,
  doesn't get its heading orphaned on one page and its body pushed to the
  next).

### B10. python-docx (the DOCX engine)

**python-docx** is the equivalent library for Microsoft Word's `.docx`
format. Its model is more direct than ReportLab's: you hold a `Document`
object and call `document.add_paragraph(text)`, `document.add_table(rows, cols)`,
and so on, mutating the document in place rather than building a list of
flowables. `document.add_section(WD_SECTION.NEW_PAGE)` starts a new section
beginning on a new page — used for each signature page.

### B11. The Indian numbering system (why the currency code looks unusual)

Western/international numbers are grouped in **thousands**:
`45,000,000` (forty-five million). Indian numbering groups the *first* three
digits together and then groups by **hundreds** after that, using named
units **lakh** (10⁵ = 100,000) and **crore** (10⁷ = 10,000,000):
`4,50,00,000` is the same value as `45,000,000`, read as "four crore fifty
lakh." A Sale Deed executed in India states its consideration this way —
both as digits in this grouping, and spelled out in words ("Rupees Four
Crore Fifty Lakh Only") because the deed is read aloud at registration and a
purely numeric figure is easier to misread or alter. `formatting.py`
(document 07) implements both the digit grouping and the word conversion
from scratch, because no off-the-shelf library in this stack does Indian
grouping.

### B12. What a Sale Deed actually is (the legal document being generated)

You do not need to be a lawyer to follow the code, but a little vocabulary
removes a lot of mystery:

- A **Sale Deed** is the legal instrument that actually transfers ownership
  of real property (land/a building) from a seller to a buyer in India, once
  registered with the government's Sub-Registrar.
- The **Vendor** is the seller; the **Purchaser** is the buyer. The deed
  refers to them only by these roles throughout, never by a generic "Party A."
- A **recital** (conventionally beginning "WHEREAS...") is a paragraph that
  states background facts — who owns what, and why this transaction is
  happening — as opposed to an **operative clause**, which actually *does*
  something legally ("the Vendor doth hereby sell...").
- The **Schedule** is a precisely worded description of exactly which
  property is being conveyed — survey numbers, area, boundaries — because a
  deed with an ambiguous property description is a defective deed.
- **Consideration** is the price paid. **Stamp duty** and **registration
  fee** are government charges paid to register the document, calculated
  against the **market value** (a government guidance figure) as well as the
  consideration.
- **Attestation** is the formal statement that the parties signed in the
  presence of **witnesses**, and a deed includes space for the parties'
  **thumb impressions** (fingerprints) as well as signatures — standard
  practice at Indian Sub-Registrar offices.
- An **encumbrance certificate** proves the property is free of existing
  loans, liens, or disputes. A **mother deed** / chain of title documents the
  ownership history. **RTC / Khata** are revenue records (land records
  maintained by local government) proving who the land is registered to.

With this vocabulary, the field names in `schema.py` and the clause text in
`generator.py` (documents 06 and 08) read as what they are, instead of as
unfamiliar legal boilerplate.

---

## Part C — Testing vocabulary (so the test files make sense if you open them)

Not required to understand the feature itself, but mentioned because
`DECISIONS.md` and the codebase reference it: a **mock** is a fake
stand-in for a real dependency (here, the real Gemini API call) used in
tests so the test runs instantly, for free, and produces the same result
every time, instead of depending on a live network call to a paid,
rate-limited, non-deterministic third party. Every test for this feature
mocks Gemini; none of them verify that the AI's prose is *good* — only that
the deterministic machinery around it (merging, formatting, PDF structure,
and — critically — what happens when the model fails) behaves correctly.

---

You now have every concept the next ten documents will use. Proceed to
**[01-the-complete-flow.md](./01-the-complete-flow.md)**.
