# 02 — `frontend/src/app/file-case/page.tsx`, Function by Function

This is the single file that is the entire user interface for Camera Filing.
It is one big React component, `FileCasePage`, 884 lines, containing every
piece of state and every event handler the flow needs. Read
[00-prerequisites.md](./00-prerequisites.md) first if you haven't — this
document assumes you know `useState`/`useRef`/`useEffect`/`useMemo`, JSX, and
Tailwind at a glance.

## Why this file exists, and what breaks without it

This file **is** the feature, from the user's point of view. Delete it and
there is no Camera Filing UI at all — the backend endpoints would still work,
but nothing would call them. Its job is to be the single source of truth for
"what step of the filing is the user on right now," and to translate user
actions (click camera, select file, type a field, click generate) into calls
to the backend and updates to what's on screen.

## Imports and what they tell you

```tsx
import ExtractedFieldsForm from "@/components/ExtractedFieldsForm";
import LiveDeedCanvas from "@/components/LiveDeedCanvas";
import { downloadFile, postForm, postJson } from "@/lib/api";
import { DIVORCE_CASE, DeedFields, SALE_DEED, allDocuments, checklistFor,
         fieldLabel, isDraftable, missingRequiredFields } from "@/lib/caseTypes";
import { DeedSection } from "@/lib/deedStream";
import { useDeedGeneration } from "@/lib/useDeedGeneration";
```

This tells you the file's dependencies before you read a line of logic: two
child components it renders into (the review form, the live deed canvas),
three network helpers it never implements itself, the checklist/field data
and helper functions, a type describing one generated section, and the
custom hook that owns the entire generation/animation lifecycle. Everything
non-trivial has already been pushed out of this file into a focused module —
this file's own job is strictly "wire the UI to these pieces."

## Types declared in this file

```tsx
type FlowState = "IDLE" | "CAPTURE" | "PROCESSING" | "REVIEW" | "GENERATING" | "SUBMITTED";

type DocumentState = {
  status: "Pending" | "Uploaded";
  fields?: DeedFields;
  error?: string | null;
};

interface ExtractResponse {
  documents: { docId: string; label: string; error: string | null }[];
  fields: DeedFields;
}

interface MergeResponse {
  fields: DeedFields;
  provenance: Record<string, string>;
  missingRequired: string[];
  readyToGenerate: boolean;
}
```

`FlowState` is the state machine from document 01, written as a type so
TypeScript rejects any typo or invalid state name at compile time.
`DocumentState` is what the UI tracks per checklist slot. `ExtractResponse`
and `MergeResponse` describe exactly what the two key backend endpoints
return — declaring these lets every later line that touches `response.fields`
or `response.provenance` be type-checked, so a backend field getting renamed
would surface as a compile error here, not a silent `undefined` at runtime.

## State held by the component

```tsx
const videoRef = useRef<HTMLVideoElement>(null);
const canvasRef = useRef<HTMLCanvasElement>(null);
const fileInputRef = useRef<HTMLInputElement>(null);
const streamRef = useRef<MediaStream | null>(null);

const [caseTitle, setCaseTitle] = useState("");
const [selectedCaseType, setSelectedCaseType] = useState(SALE_DEED);
const [documentStates, setDocumentStates] = useState<Record<string, DocumentState>>({});
const [activeDocument, setActiveDocument] = useState<string | null>(null);
const [flowState, setFlowState] = useState<FlowState>("IDLE");
const [error, setError] = useState<string | null>(null);
const [showFileUpload, setShowFileUpload] = useState(false);
const [isBusy, setIsBusy] = useState(false);
const [fields, setFields] = useState<DeedFields>({});
const [provenance, setProvenance] = useState<Record<string, string>>({});
const [edits, setEdits] = useState<Record<string, string>>({});
const generation = useDeedGeneration();
```

Four `ref`s point at real DOM elements or hold a value that must survive
renders without itself causing one (the live camera `MediaStream` object).
Everything else is `useState`: which document is being captured right now,
every document's upload/extraction status, the current flow state, the
current error banner (if any), whether the capture screen should show the
camera or the file picker, a generic "a request is in flight, disable
buttons" flag, the merged field values, which document each field's value
came from, and any in-place edits made to generated deed text. `generation`
is the entire live-generation subsystem, obtained in one line from the
custom hook covered in document 04.

## Derived values

```tsx
const checklist = useMemo(() => checklistFor(selectedCaseType), [selectedCaseType]);
const documents = useMemo(() => allDocuments(selectedCaseType), [selectedCaseType]);
const uploadedCount = documents.filter((doc) => documentStates[doc.id]?.status === "Uploaded").length;
const draftable = isDraftable(selectedCaseType);
const missing = useMemo(() => missingRequiredFields(fields), [fields]);
const labelFor = (docId: string) => documents.find((doc) => doc.id === docId)?.label ?? docId;
```

**Job:** compute values *from* state, rather than storing them as separate
state that could drift out of sync. `checklist` and `documents` only need
recomputing when the case type changes (hence `useMemo`), `uploadedCount` is
cheap enough to just compute inline every render, `draftable` is a pure
function of the selected case type, `missing` recomputes whenever `fields`
changes, and `labelFor` looks up a document's human-readable label by id —
used anywhere the UI needs to say "which document is this" without
duplicating the checklist data.

---

## Camera functions

### `stopCamera()`

```tsx
const stopCamera = () => {
  streamRef.current?.getTracks().forEach((track) => track.stop());
  streamRef.current = null;
};
```

**Job:** release the camera hardware.
**Calls:** nothing else in this file; called by the `useEffect` below, by
`handleCapture`, and implicitly whenever the component unmounts (as the
`useEffect`'s cleanup function).
**Line by line:**
- `streamRef.current?.getTracks()` — a `MediaStream` is made of one or more
  `MediaStreamTrack`s (here, one video track). `?.` is optional chaining: if
  there's no active stream, this whole expression short-circuits to
  `undefined` instead of throwing.
- `.forEach((track) => track.stop())` — stopping each track is what actually
  turns the camera light off and releases the hardware; just discarding the
  JavaScript reference to the stream is *not* enough.
- `streamRef.current = null;` — clears the ref so a later check knows there
  is no live stream.

### The camera-lifecycle `useEffect`

```tsx
useEffect(() => {
  if (flowState !== "CAPTURE" || showFileUpload) stopCamera();
  return stopCamera;
}, [flowState, showFileUpload]);
```

**Job:** guarantee the camera is never left running when it shouldn't be —
this is the single piece of code responsible for the camera light turning
off reliably, regardless of *how* the user leaves the capture screen (Cancel
button, successful capture, switching to file upload, navigating away
entirely).
**Line by line:**
- The body runs after every render where `flowState` or `showFileUpload`
  changed. If the user is no longer on the live-camera view (wrong flow
  state, or they've switched to file-upload mode), stop the camera
  immediately.
- `return stopCamera;` registers `stopCamera` itself as the *cleanup*
  function, which React guarantees to run before this effect runs again, and
  also when the component is removed from the page entirely. This is the
  safety net: even if some code path forgot to call `stopCamera` explicitly,
  unmounting the page always does.

### `startCameraForDoc(docId)`

```tsx
const startCameraForDoc = async (docId: string) => {
  setActiveDocument(docId);
  setShowFileUpload(false);
  setFlowState("CAPTURE");
  setError(null);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => undefined);
    }
  } catch {
    setShowFileUpload(true);
    setError("Camera unavailable. Please upload an image instead.");
  }
};
```

**Job:** begin capturing a specific checklist document via the live camera,
falling back to the file picker if the camera can't be used.
**Calls:** the browser's `getUserMedia`; nothing else in this file directly,
but it sets state that other renders/effects react to.
**Line by line:**
- `setActiveDocument(docId)` — remember which checklist slot this capture is
  *for*, so that when a photo eventually comes back, it's filed correctly.
- `setShowFileUpload(false); setFlowState("CAPTURE");` — switch the UI into
  the capture screen, defaulting to the camera view (not the file picker).
- `setError(null)` — clear any stale error banner from a previous attempt.
- `await navigator.mediaDevices.getUserMedia({...})` — ask the browser (and
  the user, via a permission prompt) for camera access. `facingMode:
  "environment"` prefers the rear camera. `audio: false` — this feature
  never needs sound.
- `streamRef.current = stream;` — keep the live stream so `stopCamera` can
  later stop it.
- `videoRef.current.srcObject = stream;` — this is the line that actually
  makes the live camera feed appear: assigning a `MediaStream` to a
  `<video>` element's `srcObject` is the standard way to show it.
- `videoRef.current.play().catch(() => undefined);` — some browsers require
  an explicit `.play()` call rather than relying on the element's `autoPlay`
  attribute; `.catch(() => undefined)` silently ignores a rejected play
  promise (which can happen harmlessly, e.g. if the component re-renders
  mid-request) rather than crashing on an unhandled promise rejection.
- `catch { ... }` — if permission is denied, no camera exists, or the
  browser doesn't support the API at all, fall back to the file upload UI
  and tell the user why.

### `handleFileUploadClickForDoc(docId)`

```tsx
const handleFileUploadClickForDoc = (docId: string) => {
  setActiveDocument(docId);
  setError(null);
  setShowFileUpload(true);
  setFlowState("CAPTURE");
};
```

**Job:** the file-picker equivalent of `startCameraForDoc` — go straight to
upload mode, no camera permission requested at all.
**Calls:** nothing; purely state updates. The actual file dialog opens later,
in the JSX, via `fileInputRef.current?.click()`.

### `handleFileSelect(event)`

```tsx
const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (file) void extractFromImage(file, file.type || "image/jpeg", file.name);
  event.target.value = "";
};
```

**Job:** react to the browser's native file-picker dialog closing with a
file chosen.
**Calls:** `extractFromImage`.
**Line by line:**
- `event.target.files?.[0]` — `<input type="file">` always exposes a `files`
  list even for single-file selection; take the first (only) one.
- `if (file) void extractFromImage(...)` — hand the chosen `File` straight
  into extraction, defaulting its MIME type to `image/jpeg` if the browser
  didn't report one. `void` marks the resulting Promise as deliberately
  unawaited (A6 in prerequisites) — this handler doesn't need to wait for
  extraction to finish.
- `event.target.value = "";` — resets the `<input>` so selecting the *same*
  filename again later still fires a change event (browsers don't fire
  `change` if the value appears unchanged).

### `handleCapture()`

```tsx
const handleCapture = () => {
  setError(null);
  const video = videoRef.current;
  const canvas = canvasRef.current;
  const context = canvas?.getContext("2d");
  if (!video || !canvas || !context) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      stopCamera();
      void extractFromImage(blob, "image/jpeg", "capture.jpg");
    },
    "image/jpeg",
    0.95,
  );
};
```

**Job:** grab the current video frame as a still image and start extracting
it. This is literally the shutter button.
**Calls:** `stopCamera`, `extractFromImage`.
**Line by line:**
- `canvas?.getContext("2d")` — get the 2D drawing surface of the hidden
  `<canvas>`; this is `null` if the canvas element isn't mounted yet.
- `if (!video || !canvas || !context) return;` — a defensive guard: if any
  of the three required DOM pieces aren't ready, silently abort rather than
  crashing on a `null` dereference.
- `canvas.width = video.videoWidth; canvas.height = video.videoHeight;` —
  size the invisible canvas to exactly match the real camera resolution, so
  the captured image isn't stretched or cropped.
- `context.drawImage(video, 0, 0, canvas.width, canvas.height);` — paints
  the *current* frame of the live video onto the canvas. This is the actual
  "freeze frame" operation.
- `canvas.toBlob(callback, "image/jpeg", 0.95)` — asynchronously encodes the
  canvas's pixels as a JPEG at 95% quality and calls `callback` with the
  resulting `Blob`.
- Inside the callback: bail out if encoding somehow produced nothing, stop
  the camera (the photo is taken, no need to keep it running), and hand the
  blob to `extractFromImage`.

---

## Extraction

### `extractFromImage(blob, mimeType, filename)`

```tsx
const extractFromImage = async (blob: Blob, mimeType: string, filename: string) => {
  const docId = activeDocument;
  if (!docId) return;

  setFlowState("PROCESSING");
  setError(null);

  let extracted: DeedFields = {};
  let docError: string | null = null;

  if (draftable) {
    try {
      const form = new FormData();
      form.append("files", new File([blob], filename, { type: mimeType }));
      form.append("doc_ids", docId);
      form.append("case_type", selectedCaseType);
      const response = await postForm<ExtractResponse>("/drafting/extract", form);
      extracted = response.fields ?? {};
      docError = response.documents?.[0]?.error ?? null;
    } catch (caught) {
      docError = caught instanceof Error ? caught.message : "Could not read this document.";
    }
  }

  setDocumentStates((current) => ({
    ...current,
    [docId]: { status: "Uploaded", fields: extracted, error: docError },
  }));
  setActiveDocument(null);
  setShowFileUpload(false);
  setFlowState("IDLE");
  if (docError) {
    setError(`${labelFor(docId)} was saved, but nothing could be read from it. ` +
      `You can fill those particulars in at the review step.`);
  }
};
```

**Job:** the single function responsible for turning one captured/selected
image into extracted fields, for *whichever document is currently active* —
and, crucially, for recording the upload as successful even if extraction
itself fails.
**Calls:** `postForm` (from `lib/api.ts`), `labelFor`.
**Line by line:**
- `const docId = activeDocument; if (!docId) return;` — guards against being
  called with no active document (shouldn't normally happen, but costs
  nothing to check).
- `setFlowState("PROCESSING")` — the "Reading the document..." screen.
- `if (draftable) { ... }` — only the Sale Deed flow calls the extraction
  API at all; the Divorce Case flow just records the upload with no
  particulars (there is no extraction engine for it).
- Building the `FormData`: this exactly mirrors what the backend's
  `extract_documents` endpoint expects — a file under `"files"`, the
  checklist id under `"doc_ids"`, the case type under `"case_type"`. The
  file is explicitly re-wrapped as `new File([blob], filename, {type:
  mimeType})` because a raw `Blob` from canvas capture has no filename, and
  the backend's upload-size/type checks look at the file's declared type.
- `await postForm<ExtractResponse>(...)` — the network call; `<ExtractResponse>`
  tells TypeScript the shape of what comes back, so `response.fields` and
  `response.documents` are both type-checked.
- `extracted = response.fields ?? {};` — the fields read off *this*
  document (could be empty if nothing was legible).
- `docError = response.documents?.[0]?.error ?? null;` — the backend always
  returns an array of per-document results even for a single upload; take
  the first (only) one's error field, if any.
- `catch (caught) { docError = ... }` — **this is the critical resilience
  behaviour**: if the network request itself fails entirely (backend down,
  timeout, no internet), the function does *not* propagate the error and
  abandon the upload. It records `docError` and falls through to the same
  "mark as uploaded" code below.
- `setDocumentStates((current) => ({ ...current, [docId]: {...} }))` — this
  is the line that actually commits the result: the document is marked
  `"Uploaded"` **regardless of whether extraction succeeded**, carrying
  whatever fields were recovered (possibly none) and the error message (if
  any). A failed *read* is explicitly not the same thing as a failed
  *upload* — the user's photo is never lost just because OCR had a bad day;
  they can still type the particulars in manually at the review step.
- The final four lines reset the capture UI back to the checklist, and if
  there was an error, show a reassuring (not alarming) banner explaining
  that the document was saved and the gap can be filled in later.

---

## Review

### `openReview()`

```tsx
const openReview = async () => {
  setIsBusy(true);
  setError(null);
  try {
    const overrides = Object.fromEntries(
      Object.entries(fields).filter(([key]) => provenance[key] === "user"),
    );
    const merged = await postJson<MergeResponse>("/drafting/merge", {
      documents: Object.entries(documentStates)
        .filter(([, state]) => state.fields)
        .map(([docId, state]) => ({ docId, fields: state.fields })),
      overrides,
      caseType: selectedCaseType,
    });
    setFields(merged.fields ?? {});
    setProvenance(merged.provenance ?? {});
    setFlowState("REVIEW");
  } catch (caught) {
    const local: DeedFields = {};
    const localProvenance: Record<string, string> = {};
    Object.entries(documentStates).forEach(([docId, state]) => {
      Object.entries(state.fields ?? {}).forEach(([key, value]) => {
        if (!local[key] && String(value ?? "").trim()) {
          local[key] = value;
          localProvenance[key] = docId;
        }
      });
    });
    setFields((current) => ({ ...local, ...current }));
    setProvenance((current) => ({ ...localProvenance, ...current }));
    setFlowState("REVIEW");
    setError(caught instanceof Error ? `Working offline: ${caught.message}`
      : "Working offline with the particulars read so far.");
  } finally {
    setIsBusy(false);
  }
};
```

**Job:** ask the backend to fold every document's extracted fields into one
authoritative set, with a client-side fallback merge if the backend can't be
reached — the review screen must open either way.
**Calls:** `postJson` (`lib/api.ts`).
**Line by line (try branch):**
- `overrides` — fields the user has *already* hand-edited in a previous
  pass through review (tracked by `provenance[key] === "user"`) must survive
  a re-merge; they're collected separately and sent as `overrides` so the
  backend gives them the final say regardless of what any document claims.
- The `documents` array sent to `/drafting/merge` is built from every
  checklist slot that actually has extracted fields, mapping each to
  `{docId, fields}` — exactly the shape `MergeRequest` expects server-side.
- On success: `setFields`/`setProvenance` from the server's answer, then
  move to `REVIEW`.
**Line by line (catch branch — the offline fallback):**
- This reimplements a *simplified* version of the backend's merge logic
  entirely in the browser: walk every document's fields, and for each field
  key, keep only the *first* non-empty value encountered (`if (!local[key] &&
  ...)` — once set, never overwritten). This does not implement the
  backend's authoritative-document precedence (checklists.py's `extracts`
  list) — it's explicitly a fallback, not a feature parity reimplementation.
- `setFields((current) => ({ ...local, ...current }))` — merges the fallback
  values in *underneath* whatever is already in state, so this can never
  clobber something the user already typed in this session.
- The error message distinguishes a real error (`caught instanceof Error`)
  from an unknown failure shape, and frames it as "working offline" rather
  than "failed" — the review screen still opens and is still useful.
- `finally { setIsBusy(false); }` — always re-enables the button, success or
  failure.

### `updateField(key, value)`

```tsx
const updateField = (key: string, value: string) => {
  setFields((current) => ({ ...current, [key]: value }));
  setProvenance((current) => ({ ...current, [key]: "user" }));
};
```

**Job:** record an edit the user typed into the review form.
**Calls:** nothing; passed down as the `onChange` prop to
`ExtractedFieldsForm` (document 04).
**Line by line:** updates just the one field's value, and — just as
importantly — stamps its provenance as `"user"`. This is the flag `openReview`
later reads to know this value must never be overwritten by a re-merge.

---

## Generation

### `startGeneration()`

```tsx
const startGeneration = () => {
  setEdits({});
  setFlowState("GENERATING");
  void generation.start(fields);
};
```

**Job:** kick off live generation.
**Calls:** `generation.start` (the hook from document 04).
**Line by line:** clears any leftover edits from a previous generation
(important when the user clicked "Edit & Regenerate" — see below), switches
the screen to the live-writing view, and starts the SSE stream, passing the
current field values as the source material.

### `approvedSections()`

```tsx
const approvedSections = (): DeedSection[] => {
  const base = generation.result?.sections ??
    generation.sections.map(({ id, style, heading, target }) => ({ id, style, heading, body: target }));
  return base.map((section) =>
    edits[section.id] !== undefined ? { ...section, body: edits[section.id] } : section,
  );
};
```

**Job:** compute exactly what the user is currently looking at — generated
text plus any edits layered on top — so that what gets downloaded is
*precisely* what was approved on screen (see decision 9 in the system-design
folder).
**Calls:** nothing; reads from the `generation` hook's state.
**Line by line:**
- `base` prefers the finished `generation.result.sections` (present once the
  stream's `done` event arrived); if generation is still mid-flight (unusual
  to call this then, but defensive), it falls back to building the same
  shape from the in-progress `TypingSection[]`, using each section's `target`
  (the full text that has arrived, not just what's been visually revealed).
- The final `.map` overlays any user edit for that section id on top of the
  generated body, leaving everything else untouched.

### `download(format)`

```tsx
const download = async (format: "pdf" | "docx") => {
  setIsBusy(true);
  setError(null);
  const stem = (caseTitle.trim() || `Sale-Deed-${fields.vendor_name ?? "Draft"}`)
    .replace(/[^\w\s-]/g, "").trim();
  try {
    await downloadFile(`/drafting/export/${format}`,
      { fields, sections: approvedSections(), filename: stem, caseType: selectedCaseType },
      `${stem.replace(/\s+/g, "-")}.${format}`);
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : "Download failed.");
  } finally {
    setIsBusy(false);
  }
};
```

**Job:** request and save either artefact.
**Calls:** `approvedSections`, `downloadFile` (`lib/api.ts`).
**Line by line:**
- `stem` picks a filename base: the user's case title if they typed one,
  otherwise `Sale-Deed-<vendor name>`, with anything that isn't a word
  character, whitespace, or hyphen stripped out (so a stray `/` or `"` in a
  name can't produce an invalid filename).
- The request body sends both `fields` (for the rare case the backend needs
  to rebuild) **and** `sections: approvedSections()` — but the backend
  prefers `sections` when present (document 05), which is what makes this
  WYSIWYG.
- The downloaded filename itself (third argument) replaces spaces with
  hyphens, matching how the backend's own filename sanitiser behaves.

### `handleFinalSubmitAll()`

```tsx
const handleFinalSubmitAll = async () => {
  setIsBusy(true);
  setError(null);
  try {
    await postJson("/cases/?user_id=1", {
      title: caseTitle || "Untitled Case",
      description: `Filed via E-Filing Checklist (${selectedCaseType})`,
      priority: "NORMAL",
    });
    setFlowState("SUBMITTED");
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : "Failed to submit.");
  } finally {
    setIsBusy(false);
  }
};
```

**Job:** the *non-draftable* case types' ending (Divorce Case today) — just
record that a case was filed, with no deed generation at all.
**Calls:** `postJson`.
**Line by line:** posts a plain case record to the pre-existing `/cases/`
endpoint (unrelated to the drafting engine) and moves to `SUBMITTED` on
success. Note `user_id=1` is hardcoded — there is no real user/session
system wired into this page yet (see the system-design folder's note on
multi-tenancy for what would need to change here).

### `resetToIdle()` and `startNewFiling()`

```tsx
const resetToIdle = () => {
  setFlowState("IDLE");
  setError(null);
  setActiveDocument(null);
  setShowFileUpload(false);
};

const startNewFiling = () => {
  generation.reset();
  setDocumentStates({});
  setFields({});
  setProvenance({});
  setEdits({});
  setCaseTitle("");
  setError(null);
  setFlowState("IDLE");
};
```

**Job:** two different "go back" actions. `resetToIdle` is a *soft* reset —
back to the checklist without losing any captured documents or fields (used
by "Cancel" and "Back to checklist"). `startNewFiling` is a *hard* reset —
every piece of state is wiped, including telling the generation hook to
reset its own internal state (`generation.reset()`), used once a filing is
genuinely complete and the user wants to start over.

### Two derived booleans used only by the JSX

```tsx
const isWriting = generation.phase === "writing" || generation.phase === "connecting";
const isGenerationComplete = generation.phase === "complete";
```

Named booleans computed once, rather than repeating the phase comparison
inline in several places in the JSX below — pure readability.

---

## The render (JSX) section

The remainder of the file (from `return (` to the end) is not functions but
**declarative UI**: six blocks of JSX, each guarded by
`{flowState === "..." && (...)}`, one per state in the state machine. Nothing
here is logic beyond simple conditionals and `.map()` calls over the
checklist/documents/missing-fields arrays to produce one element per item —
by this point in the file, all the actual decision-making has already
happened in the functions above. The only things worth flagging explicitly:

- The missing-fields banner and the "Still needed" chips in the `REVIEW`
  state both read from `missing` (the `useMemo` near the top) — this is why
  that value had to be computed once at the top rather than inline, it's
  used in three separate places in the JSX.
- The `GENERATING` state's header text branches on `isGenerationComplete` to
  show either live progress (`Writing section N of M`) or the finished
  summary (page count, and whether the recitals were AI-drafted or
  precedent-drafted, from `generation.result?.source`).
- `generation.notices` (warnings/notices accumulated during the stream — like
  "drafted from the firm's precedent wording") are rendered as a list of
  small banners above the deed canvas.
- The `"Generate anyway, leaving the N missing particulars as fill-in lines"`
  secondary button is a second route to the *same* `startGeneration` handler
  — the deed generator (document 08) already knows how to render a blank
  fill-in line for anything missing, so there is deliberately no hard block
  on generating an incomplete deed, only a soft nudge to fill in what's
  known.

Next: **[03-frontend-helper-libraries.md](./03-frontend-helper-libraries.md)**.
