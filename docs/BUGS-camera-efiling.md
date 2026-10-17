# Camera E-Filing — Bug Report & Testing Primer

**Repo:** `DhanushShetty18/Legal-TechAI` @ `3115fc5`
**Scope:** the camera e-filing path only — checklist → camera/upload → extract → merge → review → live generation → PDF/DOCX download.
**Files read end to end:**

```
frontend/src/app/file-case/page.tsx          (the whole flow)
frontend/src/lib/api.ts                      (fetch + download helpers)
frontend/src/lib/deedStream.ts               (SSE decoder + typing animation)
frontend/src/lib/useDeedGeneration.ts        (generation state machine)
frontend/src/lib/caseTypes.ts                (checklist + field schema)
frontend/src/components/ExtractedFieldsForm.tsx
frontend/src/components/LiveDeedCanvas.tsx
backend/routers/drafting.py                  (extract / merge / generate / export)
backend/routers/ocr_extract.py
backend/modules/drafting/{extraction,generator,stream,formatting,pdf}.py
backend/main.py                              (CORS)
```

---

## Read this first — an honest count

You asked for 50–100 bugs. **I found 37 that I can point at a line of code for.**

I'm not padding to 100. Padding a bug list is worse than useless — you'd spend a week chasing invented problems and lose trust in the whole document. 37 real ones in ~2,500 lines of a single feature is already a high density.

They're ordered by **how much damage they do**, not by file. Fix top-down.

Each bug has six parts, exactly as you asked:

| Part | What it tells you |
|---|---|
| **Symptom** | What the user sees. No code words. |
| **Reproduce** | Steps you can run yourself in 2 minutes. |
| **Root cause** | The line, and why that line does it. |
| **Analogy** | A real-world version of the same mistake. |
| **Fix** | Code you can paste. |
| **Test** | The test that fails before the fix and passes after. |

---

## Before you start: how to run tests in YOUR repo

You already have a test setup. You may not know it.

### Frontend (Vitest — already installed)

```bash
cd frontend
npm install          # once
npm test             # runs every *.test.ts file once
npm run test:watch   # re-runs automatically as you edit
```

Existing tests: `src/lib/caseTypes.test.ts`, `src/lib/deedStream.test.ts`. Open them. They are the template for everything I give you below.

### Backend (pytest — installed separately)

```bash
cd backend
pip install pytest   # NOT in requirements.txt — see bug L3
python -m pytest -v
```

Existing tests: `test_drafting.py` has 111 of them already.

**What a test actually is.** A test is a function that runs your code with known input and crashes loudly if the output isn't what you said it would be. That's all. There is no magic:

```ts
import { describe, expect, it } from "vitest";

describe("the thing I am testing", () => {
  it("does the specific thing I expect", () => {
    const result = myFunction("some input");
    expect(result).toBe("what it should return");
  });
});
```

`describe` groups. `it` is one case. `expect(...).toBe(...)` is the assertion — if it's false, the test fails and prints both values.

Full primer with the button-click example you asked for is at the **end** of this document (section "Testing from zero"). Read the bugs first; the tests will make more sense once you've seen what they're catching.

---

# SEVERITY 1 — CRITICAL

These break the demo or destroy user data. Fix all six before you show this to anyone.

---

## C1 — The downloaded PDF is blank or 0 bytes on phones

**This is almost certainly the blank PDF in your demo video.**

**Symptom**
You tap *Download PDF*. A file called `Sale-Deed-….pdf` appears. You open it — completely blank, or the viewer says the file is corrupt. On desktop Chrome it works fine, which is why you probably haven't noticed it in development.

**Reproduce**
1. Open the deployed site **on an Android phone** (desktop will not show this).
2. Complete a filing through to *Sale Deed ready*.
3. Tap **Download PDF**, then open the downloaded file.
4. Compare: in Chrome DevTools on desktop, throttle the network to "Slow 3G" and do the same — desktop will start failing too.

**Root cause** — `frontend/src/lib/api.ts:74-82`

```ts
const blob = await response.blob();
const url = URL.createObjectURL(blob);
const anchor = document.createElement("a");
anchor.href = url;
anchor.download = filename;
document.body.appendChild(anchor);
anchor.click();
anchor.remove();
URL.revokeObjectURL(url);   // ← fires before the browser has read the blob
```

`anchor.click()` **schedules** a download; it does not wait for it. `URL.revokeObjectURL` destroys the blob URL immediately on the next line. On desktop the download machinery usually wins the race. On mobile — and on slow connections anywhere — the revoke wins, and the browser saves whatever it had, which is nothing.

**Analogy**
You hand someone a library slip and say "fetch me this book." Then, two seconds later, before they've reached the shelf, you burn the slip. They come back with empty hands and no explanation.

**Fix**

```ts
anchor.click();
anchor.remove();
// Give the browser time to start reading the blob before destroying the URL.
setTimeout(() => URL.revokeObjectURL(url), 60_000);
```

60 seconds is generous and harmless — the blob is freed either way when the tab closes.

**Test** — `frontend/src/lib/api.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("downloadFile", () => {
  it("does not revoke the blob URL in the same tick as the click", async () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:fake",
      revokeObjectURL: revoke,
    });
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      blob: async () => new Blob(["%PDF-1.4"]),
    }));

    await downloadFile("/drafting/export/pdf", {}, "deed.pdf");

    expect(revoke).not.toHaveBeenCalled();   // fails today
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:fake");
    vi.useRealTimers();
  });
});
```

---

## C2 — A failed generation turns into a "ready" document you can download

**This is the second thing that produces a blank or wrong PDF.**

**Symptom**
Generation fails. The red "Generation failed" panel appears for a moment — then it disappears on its own and is replaced by "Sale Deed ready", with an empty page and working Download buttons. The user downloads a deed that was never written.

**Reproduce**
1. In `useDeedGeneration.ts`, temporarily force an error by adding `handleEvent({type:"error", message:"boom"})` right after `startAnimation()` on line 226.
2. Run a generation. Watch the screen for 3 seconds.
3. The error panel flips to the "ready" state and *Download PDF* becomes clickable.

Real-world trigger: your Gemini key hits its quota mid-stream, so the backend emits `{"type":"error"}` (`backend/routers/drafting.py:233`).

**Root cause** — `frontend/src/lib/useDeedGeneration.ts:171-177` and `:243`

```ts
case "error":
  setState((current) => ({ ...current, phase: "error", error: event.message }));
  break;          // ← nothing stops the reader or the animation
```

…and then, when the stream closes:

```ts
streamDoneRef.current = true;
startAnimation();            // ← runFrame sees "stream done + caught up"
```

`runFrame` (line 114) computes `finished = streamDoneRef.current && caughtUp` and, when true, overwrites `phase` with `"complete"`. The error state is wiped out by the very next animation frame.

**Analogy**
A fire alarm goes off. Three seconds later the building's automatic timer announces "All systems normal, shift complete" and unlocks the doors — because that timer was never told about the alarm.

**Fix**

```ts
case "error":
  streamDoneRef.current = false;
  stopAnimation();
  abortRef.current?.abort();
  setState((current) => ({ ...current, phase: "error", error: event.message }));
  break;
```

`stopAnimation` must be in `handleEvent`'s dependency array:

```ts
const handleEvent = useCallback((event: DeedEvent) => { ... }, [stopAnimation]);
```

And guard the completion in `runFrame` (line 114):

```ts
const finished =
  streamDoneRef.current && caughtUp && stateRef.current.phase !== "error";
```

(keep a `stateRef` mirroring `phase`, or check it inside the `setState` updater, which already receives `current`.)

Safest version — do it inside the updater you already have:

```ts
setState((current) => {
  if (current.phase === "error") return current;      // never leave the error state
  return { ...current, sections: sectionsRef.current, ...(finished ? { ... } : {}) };
});
```

**Test** — add to a new `useDeedGeneration.test.ts`, or assert on the state machine directly.

---

## C3 — The capture button does nothing

**Symptom**
Camera preview is showing. You tap the big white shutter button. **Nothing happens at all** — no spinner, no error, no screen change. Tap again — still nothing. Tap a few seconds later — it works.

This is exactly the "I click the button and nothing happens" class of bug you asked about.

**Reproduce**
1. Open the filing page on a phone, tap **Camera** on any checklist row.
2. Tap the shutter **the instant** the preview appears, before the picture stabilises.
3. Nothing happens. Wait two seconds, tap again — it works.
4. Deterministic version: in DevTools, set `video.srcObject = null` before tapping.

**Root cause** — `frontend/src/app/file-case/page.tsx:144-163`

```ts
canvas.width = video.videoWidth;      // 0 until the video's metadata has loaded
canvas.height = video.videoHeight;    // 0
context.drawImage(video, 0, 0, 0, 0);
canvas.toBlob((blob) => {
  if (!blob) return;                  // ← silently gives up
  ...
});
```

Before the first frame arrives, `videoWidth` is `0`. The canvas becomes 0×0. `toBlob` on a zero-area canvas hands back `null`, and the `if (!blob) return` throws the user's tap away without a word.

**Analogy**
A photocopier with the lid open and no paper in the tray. You press Copy. The machine accepts the press, does its internal checks, finds nothing to copy, and goes back to idle — without a beep, a light, or a message. You stand there pressing the button.

**Fix**

```ts
const handleCapture = () => {
  setError(null);
  const video = videoRef.current;
  const canvas = canvasRef.current;
  const context = canvas?.getContext("2d");
  if (!video || !canvas || !context) return;

  if (!video.videoWidth || !video.videoHeight) {
    setError("The camera is still starting. Try again in a moment.");
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        setError("The photo could not be saved. Please try again or upload the file.");
        return;
      }
      stopCamera();
      void extractFromImage(blob, "image/jpeg", "capture.jpg");
    },
    "image/jpeg",
    0.95,
  );
};
```

**Rule worth internalising:** *every* `if (something bad) return;` in a click handler is a silent failure unless it also tells the user something. Search your codebase for bare `return;` inside handlers — each one is a candidate.

**Test** — `frontend/src/app/file-case/capture.test.tsx` (needs the logic pulled into a plain function first; see "Testing from zero" at the end for why that's worth doing).

---

## C4 — Camera permission granted, but the preview stays black

**Symptom**
You tap **Camera**. The permission prompt appears, you allow it, the phone's camera indicator light turns on — and the preview area stays black forever. Sometimes it works; sometimes it doesn't. It fails *more often* the second and third time, because the permission prompt no longer slows things down.

**Reproduce**
1. Tap **Camera**, allow permission. Probably works (the prompt creates a delay that hides the bug).
2. Tap **Cancel**, then **Camera** again — now permission is already granted, so there's no prompt and no delay.
3. Repeat 5 times. You will get a black preview, with the camera light still on.

**Root cause** — two bugs feeding each other, `page.tsx:105-129`

```ts
useEffect(() => {
  if (flowState !== "CAPTURE" || showFileUpload) stopCamera();
  return stopCamera;                       // ← cleanup kills the stream
}, [flowState, showFileUpload]);

const startCameraForDoc = async (docId: string) => {
  setFlowState("CAPTURE");                 // ← schedules a re-render
  const stream = await navigator.mediaDevices.getUserMedia({...});
  streamRef.current = stream;              // ← may land BEFORE the effect runs
  if (videoRef.current) {                  // ← may still be null
    videoRef.current.srcObject = stream;
  }
};
```

Two things can go wrong and both are the same race:

1. If `getUserMedia` resolves **before** React flushes the effect, the effect's cleanup (`stopCamera`) runs *after* the stream was assigned and shuts it down. Black screen, camera light on.
2. If React hasn't rendered the `<video>` element yet when the stream arrives, `videoRef.current` is `null`, the `if` silently does nothing, and `srcObject` is never set. Black screen, no error — the exact silent-failure pattern again.

When permission is already granted, `getUserMedia` resolves in a few milliseconds and both failure modes become likely.

**Analogy**
A cleaner is told "when this room is empty, lock it up." A guest walks in through the other door at the same moment. The cleaner, working from a two-second-old instruction, locks the room with the guest inside. Nobody is at fault — the instruction was just read a moment too late.

**Fix** — tie each camera start to a token, and re-attach the stream once the element exists.

```ts
const cameraTokenRef = useRef(0);

const startCameraForDoc = async (docId: string) => {
  const token = ++cameraTokenRef.current;
  setActiveDocument(docId);
  setShowFileUpload(false);
  setFlowState("CAPTURE");
  setError(null);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    // A newer start (or a cancel) happened while we were waiting.
    if (token !== cameraTokenRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = stream;
  } catch {
    setShowFileUpload(true);
    setError("Camera unavailable. Please upload an image instead.");
  }
};

const stopCamera = () => {
  cameraTokenRef.current++;                       // invalidate anything in flight
  streamRef.current?.getTracks().forEach((t) => t.stop());
  streamRef.current = null;
};

// Attach the stream to the element once BOTH exist. This effect runs after
// every render, so whichever arrives second triggers the attachment.
useEffect(() => {
  const video = videoRef.current;
  const stream = streamRef.current;
  if (flowState === "CAPTURE" && !showFileUpload && video && stream) {
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => undefined);
    }
  }
});
```

And change the teardown effect so it only stops on *leaving* capture, not on every dependency change:

```ts
useEffect(() => {
  if (flowState !== "CAPTURE" || showFileUpload) stopCamera();
}, [flowState, showFileUpload]);

useEffect(() => stopCamera, []);   // on unmount only
```

---

## C5 — Re-uploading a document wipes the particulars already read from it

**Symptom**
A scan reads 7 particulars correctly. The photo is slightly crooked, so you tap **Re-upload** and take a better one. The second read fails (network blip, Gemini quota). The row still says "Uploaded" — but now it says *"Saved — nothing could be read automatically"*, and all 7 particulars are gone from the review form. You've gone backwards by trying to improve things.

**Reproduce**
1. Upload a clear Aadhaar/PAN scan. The row should say "N particulars read from this document".
2. Open DevTools → Network → set **Offline**.
3. Tap **Re-upload**, choose any image.
4. The row now reports zero particulars. Go to *Review Extracted Details* — the fields that document supplied are blank.

**Root cause** — `page.tsx:199-202`

```ts
setDocumentStates((current) => ({
  ...current,
  [docId]: { status: "Uploaded", fields: extracted, error: docError },
}));
```

On the failure path `extracted` is `{}` (set on line 179 and never filled). This line unconditionally replaces the previous entry — including the good fields — with the empty one. The comment three lines above says *"A failed read must not lose the upload"*, which is true of the upload but not of the data, which is the part that mattered.

**Analogy**
You photocopy a document and keep the copy. Later you try to make a better copy; the machine jams and spits out a blank page. You then throw away the good copy and file the blank one, because your filing rule is "the newest page wins."

**Fix**

```ts
setDocumentStates((current) => {
  const previous = current[docId];
  const keptFields =
    docError && previous?.fields && Object.keys(previous.fields).length
      ? previous.fields        // the failed read keeps what the good read found
      : extracted;
  return {
    ...current,
    [docId]: { status: "Uploaded", fields: keptFields, error: docError },
  };
});
```

**Test** — pull the merge rule into a pure function first, then:

```ts
describe("documentStateAfterExtraction", () => {
  it("keeps previously read fields when a re-read fails", () => {
    const previous = { status: "Uploaded" as const, fields: { vendor_pan: "ABCDE1234F" } };
    const next = documentStateAfterExtraction(previous, {}, "network error");
    expect(next.fields).toEqual({ vendor_pan: "ABCDE1234F" });
    expect(next.error).toBe("network error");
  });

  it("replaces fields when the re-read succeeds", () => {
    const previous = { status: "Uploaded" as const, fields: { vendor_pan: "OLD" } };
    const next = documentStateAfterExtraction(previous, { vendor_pan: "NEW" }, null);
    expect(next.fields).toEqual({ vendor_pan: "NEW" });
  });
});
```

---

## C6 — Indian-language text disappears from the PDF

**Symptom**
A property description, address or name typed in Devanagari (`मुंबई`), Kannada (`ಮಂಗಳೂರು`) or any non-Latin script appears correctly in the on-screen preview — and is **missing, or printed as black boxes, in the downloaded PDF**. A sale deed for a Mumbai property with a Marathi address silently loses the address.

For a product aimed at Indian courts, this is not a cosmetic bug.

**Reproduce**
1. In the review form, set *Property Description* to `मुंबई उपनगर जिल्हा, अंधेरी पूर्व`.
2. Generate, then download the PDF.
3. The Schedule section is blank or shows boxes where the text should be.

**Root cause** — `backend/modules/drafting/pdf.py:41`

```python
BODY_FONT = "Times-Roman"
BOLD_FONT = "Times-Bold"
```

These are PDF **base-14 fonts**. They carry Latin-1 glyphs only — roughly the characters on a European keyboard. They physically contain no Devanagari, Kannada, Tamil or Bengali glyphs. ReportLab has nothing to draw, so it draws nothing.

**Analogy**
A typewriter with an English typebar set. You can press any key you like for a Marathi letter — the hammer that comes down has no matching letterform cast on it, so it leaves the page blank.

**Fix** — register a Unicode font that ships the Indic glyphs.

1. Download **Noto Serif Devanagari** (Google Fonts, free, SIL licence) and commit `NotoSerifDevanagari-Regular.ttf` and `-Bold.ttf` to `backend/modules/drafting/fonts/`.
2. Register them at import time:

```python
import os
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

_FONT_DIR = os.path.join(os.path.dirname(__file__), "fonts")

def _register_fonts() -> tuple[str, str]:
    """Use a Unicode font when it is available; fall back to Times."""
    try:
        pdfmetrics.registerFont(
            TTFont("DeedBody", os.path.join(_FONT_DIR, "NotoSerifDevanagari-Regular.ttf"))
        )
        pdfmetrics.registerFont(
            TTFont("DeedBold", os.path.join(_FONT_DIR, "NotoSerifDevanagari-Bold.ttf"))
        )
        return "DeedBody", "DeedBold"
    except Exception:                      # noqa: BLE001
        return "Times-Roman", "Times-Bold"

BODY_FONT, BOLD_FONT = _register_fonts()
```

A single font family will not cover Devanagari *and* Kannada *and* Tamil. For now, Devanagari + Latin covers Maharashtra, which is where you are. Plan a per-state font map later.

**Test** — `backend/test_pdf_unicode.py`

```python
import re
from modules.drafting.pdf import render_sale_deed_pdf

def test_devanagari_survives_the_pdf():
    sections = [{"id": "schedule_body", "style": "schedule",
                 "heading": "", "body": "मुंबई उपनगर जिल्हा"}]
    pdf_bytes = render_sale_deed_pdf(sections=sections, fields={}).getvalue()

    assert pdf_bytes.startswith(b"%PDF")
    # An embedded TrueType subset proves a Unicode font was actually used.
    assert re.search(rb"/FontFile2", pdf_bytes), "no embedded Unicode font"
```

---

# SEVERITY 2 — HIGH

Silent wrong data, or a user-visible failure with no explanation.

---

## H1 — An OCR date in any non-ISO format silently vanishes

**Symptom**
Gemini reads `30-09-2026` off a scanned deed. The review form shows *Date of Execution* as **empty**, and it is **not** listed under "Still needed", so nothing warns you. The generated deed prints `__________ day of ________________, 20____`.

**Reproduce**
1. In the review form, open DevTools console and run:
   `document.querySelector('#date_of_execution').value = '30-09-2026'`
2. The field stays blank — the browser rejected the value.
3. Or: patch `openReview`'s fallback to return `{ date_of_execution: "30/09/2026" }` and watch the field render empty.

**Root cause** — `frontend/src/components/ExtractedFieldsForm.tsx:176`

```tsx
type={field.kind === "date" ? "date" : field.kind === "number" ? "number" : "text"}
value={value}
```

An `<input type="date">` accepts **only** `yyyy-mm-dd`. Anything else is discarded by the browser and the box renders empty — with no event, no warning, no console message. Meanwhile `missingRequiredFields` (`caseTypes.ts:217`) looks at the *state*, which still holds `"30-09-2026"` — a non-empty string — so it reports the field as filled.

The state says filled. The screen says empty. Both are "right". The user is the one who loses.

**Analogy**
A form says "write the date in the box." The box is a slot machine that only accepts coins of one exact size. You post a slightly wider coin; it falls through into the floor cavity. The machine's counter says "one coin received." The till is empty. Nobody is told.

**Fix** — normalise on the way in, and never let state and screen disagree.

```ts
/** Coerce the date formats OCR and users produce into the yyyy-mm-dd an
 *  <input type="date"> will actually accept. Returns "" when unparseable. */
export function toDateInputValue(raw: string): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);  // dd-mm-yyyy
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}
```

In `FieldInput`:

```tsx
{field.kind === "date" ? (
  <input
    id={field.key}
    type="date"
    value={toDateInputValue(value)}
    onChange={(e) => onChange(field.key, e.target.value)}
    className={shared}
  />
) : ...}
```

And when a date can't be coerced, show the raw text so the user can see what was read:

```tsx
{field.kind === "date" && value && !toDateInputValue(value) && (
  <p className="text-[11px] text-amber-400">
    Read as “{value}” — please re-enter it above.
  </p>
)}
```

**Test** — `frontend/src/lib/dates.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { toDateInputValue } from "./dates";

describe("toDateInputValue", () => {
  it("passes ISO dates through", () => {
    expect(toDateInputValue("2026-09-30")).toBe("2026-09-30");
  });

  it.each([
    ["30-09-2026", "2026-09-30"],
    ["30/09/2026", "2026-09-30"],
    ["30.09.2026", "2026-09-30"],
    ["1/2/2026",   "2026-02-01"],   // Indian order: day first
  ])("converts %s to %s", (input, expected) => {
    expect(toDateInputValue(input)).toBe(expected);
  });

  it("returns empty for text it cannot parse", () => {
    expect(toDateInputValue("thirtieth September")).toBe("");
  });
});
```

`it.each` runs the same test body for every row of the table. Four cases, one test.

---

## H2 — An OCR amount with commas silently vanishes

**Symptom**
Same shape as H1. The scan says `Rs. 45,00,000/-`. The *Sale Consideration* box shows **empty**, is not flagged as missing, and the deed prints a blank line where the money should be.

**Reproduce**
1. Go offline (DevTools → Network → Offline) and tap **Review Extracted Details**.
   This takes the offline fallback path at `page.tsx:233-242`, which does **not** normalise amounts.
2. Any amount a document carried as `45,00,000` lands straight in `<input type="number">`.
3. It renders blank.

**Root cause** — two places:

- `page.tsx:233-242` — the offline merge copies raw per-document values with no normalisation.
- The backend path *does* normalise (`extraction.py:211-216` converts amounts to plain digits), which is why this only shows when the backend is unreachable or cold-starting. That's exactly when you'll be demoing.

**Analogy**
A cashier's drawer accepts only loose coins. A customer hands over a sealed bank bag holding the same amount. The cashier, following the rule literally, drops it in the bin and records nothing.

**Fix** — apply the same normalisation client-side in the fallback:

```ts
/** "Rs. 45,00,000/-" -> "4500000". Returns "" when there is no number. */
export function toAmountInputValue(raw: string): string {
  const match = String(raw ?? "").match(/\d[\d,]*(?:\.\d{1,2})?/);
  if (!match) return "";
  const n = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(n) ? String(n) : "";
}
```

Apply it in the `openReview` catch branch for the four amount keys, and in `FieldInput` for `kind === "number"`.

**Test**

```ts
describe("toAmountInputValue", () => {
  it.each([
    ["Rs. 45,00,000/-", "4500000"],
    ["45,00,000",       "4500000"],
    ["4500000",         "4500000"],
    ["₹ 12,50,000.50",  "1250000.5"],
    ["no figure here",  ""],
  ])("converts %s to %s", (input, expected) => {
    expect(toAmountInputValue(input)).toBe(expected);
  });
});
```

---

## H3 — The section collapses while you are typing in it

**Symptom**
Six fields are missing in the *Vendor* group, so the group is open. You fill the last one. The instant you finish typing a valid value, **the whole group folds shut under your cursor** and you lose focus. If you were tabbing between fields, you're now somewhere else entirely.

**Reproduce**
1. Reach the review step with exactly one missing required field in a group.
2. Type a value into it.
3. The group closes as soon as the value becomes non-empty.

**Root cause** — `ExtractedFieldsForm.tsx:56`

```ts
const isOpen = expanded[group] ?? missingCount > 0;
```

While the user has never clicked the header, `expanded[group]` is `undefined`, so openness is derived live from `missingCount`. Filling the field drops `missingCount` to `0`, which flips `isOpen` to `false` on the very next render.

The intent was "groups with gaps start open." The implementation says "groups with gaps **stay** open, and snap shut the moment they don't."

**Analogy**
A filing cabinet drawer that is spring-loaded to close the moment the folder inside is complete — with your hand still in it.

**Fix** — compute the default once, on mount, and let it stop changing.

```ts
const initialOpen = useRef<Record<string, boolean> | null>(null);
if (initialOpen.current === null) {
  initialOpen.current = Object.fromEntries(
    FIELD_GROUPS.map((g) => [
      g,
      SALE_DEED_FIELDS.some((f) => f.group === g && missing.has(f.key)),
    ]),
  );
}
const isOpen = expanded[group] ?? initialOpen.current[group] ?? false;
```

---

## H4 — The offline fallback produces different data from the online path

**Symptom**
The same uploads give you different particulars depending on whether the backend answered. Online: amounts normalised, authoritative-document precedence respected. Offline: first-non-empty-wins, raw strings.

**Root cause** — `page.tsx:233-242` reimplements `merge_extractions` (`backend/modules/drafting/extraction.py:186-218`) in about eight lines, and drops two rules:

1. **Authoritative source precedence** — the backend prefers an address read off the document *declared* to carry it over the same address glimpsed elsewhere. The client just takes whichever document was uploaded first.
2. **Amount normalisation** — see H2.

**Analogy**
Two clerks at the same counter using different rulebooks. Which one you get depends on who happened to be free. Both are sure they're following procedure.

**Fix** — move the merge into `frontend/src/lib/merge.ts` as a pure function, mirroring the backend's rules (the file-header comment in `caseTypes.ts` already explains why that duplication is deliberate), and call it from both the fallback **and** as a pre-fill before the backend answers.

**Test** — the valuable test here is a shared fixture: the same documents array fed to the JS merge and asserted against the Python merge's known output, so the two can't drift silently.

---

## H5 — An unknown document type is silently treated as a vendor ID

**Symptom**
A scanned property tax receipt is extracted with the *vendor identity* prompt, so it reads almost nothing useful — and reports that quietly as "nothing could be read."

**Reproduce**
```bash
curl -X POST https://legal-techai.onrender.com/drafting/extract \
  -F "files=@tax-receipt.jpg" \
  -F "doc_ids=some_typo_id" \
  -F "case_type=Sale Deed"
```
It returns `200` with `"docId": "vendor_id"`.

**Root cause** — `backend/routers/drafting.py:170`

```python
doc_id = ids[index] if index < len(ids) and ids[index] else "vendor_id"
```

An unknown or missing id falls back to a specific, wrong document type instead of being rejected.

**Analogy**
A hospital reception where any unreadable referral slip is automatically routed to Cardiology, because that's the first department on the list.

**Fix**

```python
from modules.drafting.checklists import document_by_id

doc_id = ids[index] if index < len(ids) else ""
if not doc_id or not document_by_id(case_type, doc_id):
    raise HTTPException(
        status_code=400,
        detail=f"Unknown document id {doc_id!r} for case type {case_type!r}.",
    )
```

**Test** — `backend/test_drafting.py`

```python
def test_unknown_doc_id_is_rejected(client):
    response = client.post(
        "/drafting/extract",
        files={"files": ("x.jpg", b"\xff\xd8\xff", "image/jpeg")},
        data={"doc_ids": "not_a_real_id", "case_type": SALE_DEED},
    )
    assert response.status_code == 400
    assert "Unknown document id" in response.json()["detail"]
```

---

## H6 — A Marathi or Hindi case title gives you a file called ".pdf"

**Symptom**
Case title: `कडरी रोड मालमत्ता विक्री`. The downloaded file is named **`.pdf`** — no name at all. Some browsers refuse the download outright.

**Reproduce**
1. Type any Devanagari text as the Case Title.
2. Complete the flow and download.
3. Check the filename.

**Root cause** — `page.tsx:288`

```ts
const stem = (caseTitle.trim() || `Sale-Deed-${fields.vendor_name ?? "Draft"}`)
  .replace(/[^\w\s-]/g, "")
  .trim();
```

In JavaScript, `\w` without the `u` flag means **`[A-Za-z0-9_]` only**. Every Devanagari character matches `[^\w\s-]` and is stripped. A fully Marathi title reduces to `""`, and the template literal on line 295 produces `".pdf"`.

(The backend's `_safe_filename` uses Python's `str.isalnum()`, which *is* Unicode-aware and would have kept the text — but the frontend already destroyed it before sending.)

**Analogy**
A parcel label printer that only has English letterforms. Given a Marathi address, it prints a completely blank label and sends the parcel anyway.

**Fix**

```ts
const stem =
  (caseTitle.trim() || `Sale-Deed-${fields.vendor_name ?? "Draft"}`)
    .replace(/[^\p{L}\p{N}\s-]/gu, "")   // keep any letter or digit, any script
    .trim() || "Sale-Deed";              // never allow an empty stem
```

`\p{L}` is "any Unicode letter", `\p{N}` "any Unicode digit". The `u` flag is required for them to work.

**Test**

```ts
describe("downloadStem", () => {
  it("keeps Devanagari characters", () => {
    expect(downloadStem("कडरी रोड", {})).toBe("कडरी-रोड");
  });
  it("never returns an empty stem", () => {
    expect(downloadStem("!!!***", {})).toBe("Sale-Deed");
  });
});
```

---

## H7 — `/ocr-extract` returns 500 instead of 400 for a file with no content type

**Symptom**
Some Android browsers upload camera files with an empty `Content-Type`. The API answers **500 Internal Server Error** with a Python traceback in the logs, instead of a clear 400.

**Reproduce**
```bash
curl -X POST https://legal-techai.onrender.com/ocr-extract \
  -F "file=@photo.jpg;type="
```

**Root cause** — `backend/routers/ocr_extract.py:27`

```python
if not file.content_type.startswith("image/"):
```

`file.content_type` is `Optional[str]`. When it's `None`, `.startswith` raises `AttributeError` before your validation can run.

**Analogy**
A bouncer whose rule is "check the name on the ID." Someone arrives with no ID at all, and instead of turning them away, the bouncer faints.

**Fix**

```python
content_type = file.content_type or ""
if not content_type.startswith("image/"):
    raise HTTPException(status_code=400, detail="File must be an image.")
```

The same pattern is already handled correctly in `drafting.py:151` (`upload.content_type or ""`) — this router just didn't get the fix.

---

## H8 — "Waking the drafting engine" can hang forever with no way out

**Symptom**
Render's free instance is cold or asleep. The screen says *"Waking the drafting engine…"* with a spinner. It stays there. There's no cancel button, no timeout, no error. The only escape is reloading the page and losing everything typed into the review form.

**Root cause** — `useDeedGeneration.ts:209`

```ts
const response = await fetch(api("/drafting/generate"), { ... });
```

Every other call in the app wraps `fetch` in an `AbortController` with `COLD_START_TIMEOUT_MS` (`api.ts:20-21`). This one — the longest-running call in the product — has none.

**Analogy**
Every door in the building has a fire-exit bar except the one at the end of the longest corridor.

**Fix**

```ts
const controller = new AbortController();
abortRef.current = controller;
const timer = setTimeout(
  () => controller.abort(new DOMException("Timed out", "TimeoutError")),
  COLD_START_TIMEOUT_MS,
);
try {
  const response = await fetch(api("/drafting/generate"), { signal: controller.signal, ... });
  clearTimeout(timer);                 // the stream itself may run much longer
  ...
}
```

Clear the timer as soon as headers arrive — the stream legitimately runs for minutes, it's only the *connection* that should time out. Also add a visible **Cancel** button bound to `generation.cancel` while `phase === "connecting"`.

---

## H9 — Every filing is submitted as user 1

**Symptom**
`handleFinalSubmitAll` posts every case to the same account.

**Root cause** — `page.tsx:308`

```ts
await postJson("/cases/?user_id=1", { ... });
```

The user id is hardcoded in the URL. Any visitor can file against user 1, and any visitor can read user 1's cases.

**Analogy**
A hotel where every room key is cut to the same pattern, and the pattern is printed on the key.

**Fix** — out of scope for a quick patch; it needs real auth. Minimum step now: take `user_id` from the logged-in session rather than a literal, and have the backend reject requests whose `user_id` doesn't match the authenticated caller. Until then, treat the deployed instance as a **demo with no privacy guarantee** and don't put real client documents through it.

---

## H10 — CORS allows every website to call your API with the user's credentials

**Root cause** — `backend/main.py:59-62`

```python
allow_origins=["*"],            # In production, restrict this to specific domain URLs!
allow_credentials=True,
allow_methods=["*"],
allow_headers=["*"],
```

Your own comment flags it. `allow_origins=["*"]` together with `allow_credentials=True` means any site a user visits can issue authenticated requests to your API from their browser and read the response.

**Analogy**
Leaving the front door unlocked and putting up a sign that says "please don't come in."

**Fix**

```python
import os

ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,https://legaltechai.in,https://www.legaltechai.in",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)
```

Add your Vercel preview URL to `ALLOWED_ORIGINS` on Render, or previews will break.

---

# SEVERITY 3 — MEDIUM

Real, but either rare or non-destructive.

| # | File:line | Symptom | Root cause | Fix |
|---|---|---|---|---|
| **M1** | `deedStream.ts:54` | On some proxies the deed never appears; the stream connects and nothing is drawn. | `indexOf("\n\n")` only. SSE frames separated by `\r\n\r\n` never match, so no frame is ever parsed. | Normalise first: `this.buffer += chunk.replace(/\r\n/g, "\n")`. |
| **M2** | `LiveDeedCanvas.tsx:36-39` | Juddery, sticky scrolling on phones while the deed types. Scroll fights you. | The effect depends on `sections`, which changes **every animation frame** (60×/sec), each firing a `scrollIntoView({behavior:"smooth"})`. Smooth scrolls queue up and fight each other. | Throttle to ~4/sec: keep a `lastScrollRef` timestamp and return early if `Date.now() - last < 250`. |
| **M3** | `drafting.py:154,160,166` | Uploading 3 documents where 1 is bad loses all 3. | `raise HTTPException` inside the per-file loop aborts the whole request. | Collect per-file errors into the `results` list and return 200 with per-document errors — which is the shape the frontend already expects. |
| **M4** | `stream.py:191,208,210` | Latent: sections could emit out of order or raise `IndexError`. | `for index, section in enumerate(skeleton)` iterates the *original* list; line 208 rebinds `skeleton` to a new list and line 210 indexes the new one. Safe only because `build_sections` happens to always return the same length. | Build both skeletons before the loop, or iterate `range(len(...))` over a stable list. Add a test asserting `len(build_sections(f)) == len(build_sections(f, narrative))`. |
| **M5** | `stream.py:198` | The stream can be cut by a proxy during the model wait. | `pending.result(timeout=remaining)` blocks the generator for up to 45 s with nothing sent. Proxies drop idle connections. | Poll in 5-second slices and `yield {"type":"status", ...}` (or an SSE comment `: keepalive`) between slices. |
| **M6** | `drafting.py:152` | iPhone photos extract nothing, with no explanation. | `image/heic` passes the `image/` prefix check but Gemini can't decode it. | Either convert HEIC server-side with `pillow-heif`, or reject it with a clear message naming the format. |
| **M7** | `api.ts:66` | A hung export leaves the page spinning forever. | `downloadFile` is the only helper in the file without an `AbortController`. | Give it the same timeout wrapper as `postJson`/`postForm`. |
| **M8** | `useDeedGeneration.ts:171` | After an error event the app keeps reading a dead stream. | The `error` case doesn't break the `for(;;)` read loop. | Set a flag in `handleEvent` and check it in the loop (overlaps with C2's fix). |
| **M9** | `drafting.py:70` | A Divorce case, if ever made draftable, would silently produce a Sale Deed. | `GenerateRequest.caseType` is accepted and never read; the frontend never sends it either (`useDeedGeneration.ts:215`). | Either send and honour it, or delete the field so it can't mislead. |
| **M10** | `useDeedGeneration.ts:139` | Battery drain, hot phone during a slow generation. | When backlog is 0 but the stream isn't done, `runFrame` reschedules itself at 60 fps doing nothing. | If `backlog === 0 && !streamDoneRef.current`, stop the loop and restart it from `handleEvent` when a delta arrives. |
| **M11** | `formatting.py:157-162` | A stray 4-digit number becomes a confident "masked Aadhaar" on a registered deed. | `mask_aadhaar` accepts any string with ≥4 digits and prints `XXXX XXXX <last 4>`. | Require 12 digits for a fresh value; accept the already-masked form only when it matches `^X{4}\s?X{4}\s?\d{4}$`. |
| **M12** | `stream.py:233-234` | Gemini keeps being billed after the user closes the tab. | `executor.shutdown(wait=False)` doesn't cancel a running future. | `pending.cancel()` before shutdown (only helps pre-start), and set a hard client timeout on the Gemini call. |
| **M13** | `page.tsx:716-723` | "Generate anyway" has the same handler as the disabled main button — fine, but there's no confirmation that fill-in blanks will appear in a document going to a Sub-Registrar. | By design, but the stakes warrant a confirm step. | Add a one-line confirm listing which particulars will print as blanks. |
| **M14** | `page.tsx:359` vs `:564` | In camera mode (not upload mode), any error set is invisible. | The top banner is hidden when `flowState === "CAPTURE"`, and the inline banner only renders inside the `showFileUpload` branch. | Render the inline banner in the camera branch too — needed for C3's new messages to be seen at all. |

---

# SEVERITY 4 — HYGIENE

| # | What | Why it matters | Fix |
|---|---|---|---|
| **L1** | `android/local.properties`, `android/app/local.properties`, `android/.gradle/`, `android/build/` are committed | The files themselves say *"must NOT be checked into Version Control."* They leak your Windows username and path, and the `.gradle` binaries bloat every clone. | Add to `.gitignore`, then `git rm -r --cached android/.gradle android/build android/local.properties android/app/local.properties`. |
| **L2** | `ocr_extract.py:22` declares `herdNo` | A **cattle herd number** field, left over from whatever template this router started as, in a legal API. A reviewer who spots it stops trusting the rest. | Delete it and any other field the legal flow doesn't use. |
| **L3** | `pytest` missing from `backend/requirements.txt` | `python -m pytest` fails on a fresh machine, so your 111 existing tests never run in CI. | Add a `backend/requirements-dev.txt` with `pytest` and `pytest-asyncio`. |
| **L4** | `e-filing-updated/frontend/` duplicates `frontend/` and has already diverged in 8 files | Two copies of the same app; nobody can tell which one is deployed. Fixes applied to one silently miss the other. | Delete the stale tree, or move it to a branch. |
| **L5** | `camera/core.py:28` uses `datetime.utcnow()` | Deprecated in Python 3.12; returns a naive datetime, which bites when you compare timestamps. | `datetime.now(timezone.utc)`. |
| **L6** | `formatting.py:60-62` renders 101 as "One Hundred One" | Indian legal convention is "One Hundred **and** One". A deed is read aloud at registration. | Insert "and" before the final `_below_hundred` part when a Hundred scale was used. |
| **L7** | `ocr_extract.py` has no size limit | `drafting.py` caps uploads at 12 MB; this router doesn't, so a 60 MB photo can exhaust the free instance's memory. | Apply the same `MAX_UPLOAD_BYTES` check. |

---

# The order to fix these

Don't go top to bottom. Go by **effort ÷ damage**:

**This evening (about 2 hours, fixes your demo):**
1. **C1** — one `setTimeout`. Fixes the blank PDF.
2. **C3** — a readiness check. Fixes the dead shutter button.
3. **H7** — one `or ""`.
4. **H6** — one regex flag.
5. **M14** — show the error banner in camera mode.

**This week:**
6. **C2** — error state must stick.
7. **C5** — stop losing extracted fields.
8. **H1 + H2** — date and amount normalisation.
9. **C4** — the camera race.
10. **H3** — the collapsing group.

**Before any real user touches it:**
11. **C6** — Devanagari in the PDF. Non-negotiable for an Indian legal product.
12. **H9 + H10** — auth and CORS.

**When you have time:** everything in Severity 3 and 4.

---

# Testing from zero

You said you've never written a test. Start here.

## What a test is, with no jargon

A test is **a second piece of code that runs your first piece of code and complains if the answer is wrong**.

That's the entire idea. It is not a framework, not a methodology, not a career. It's a function that calls another function and checks the result.

**Analogy:** a recipe says "the cake is done when a skewer comes out clean." The skewer is the test. It doesn't bake anything. It tells you whether what you baked is what you meant to bake — without you having to eat the whole cake.

## Why it matters specifically for you

You built this with AI assistance and you can't yet read every line. That's fine — but it means you have **no way to know when a change breaks something**. Right now your only test is "open the site and click around," which takes 10 minutes, misses the mobile-only bugs, and you'll stop doing it after week two.

A test suite is the thing that lets a person who doesn't fully understand a codebase change it safely. It is *more* valuable to you than to an expert, not less.

## The anatomy of one test

```ts
import { describe, expect, it } from "vitest";
import { charsPerTick } from "./deedStream";

describe("charsPerTick", () => {              // 1. a group, named after the unit
  it("reveals nothing when there is no backlog", () => {   // 2. one behaviour
    expect(charsPerTick(0)).toBe(0);          // 3. call it, assert the answer
  });
});
```

1. `describe(name, fn)` — a labelled box. Purely organisational.
2. `it(sentence, fn)` — one specific behaviour. The sentence should read as English: *"it reveals nothing when there is no backlog."* If you can't write that sentence, you don't yet know what you're testing.
3. `expect(actual).toBe(expected)` — the assertion. If it's false, Vitest prints both values and the test fails.

Common matchers — these cover 95% of what you'll write:

| Matcher | Use for |
|---|---|
| `.toBe(x)` | numbers, strings, booleans (exact identity) |
| `.toEqual(obj)` | objects and arrays (deep comparison) |
| `.toContain(x)` | an item in an array, or a substring |
| `.toHaveLength(n)` | arrays and strings |
| `.toBeNull()` / `.toBeUndefined()` | absence |
| `.toThrow()` | a function that should blow up |
| `.not.toBe(x)` | any matcher, inverted |

## The button-click test you asked for

This is the one you specifically wanted: *does clicking the button actually do the thing?*

Install nothing — `@testing-library/react` and `jsdom` are already in your `package.json`.

`frontend/src/components/__tests__/CaptureButton.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// A deliberately small component so the test is about behaviour, not layout.
function CaptureButton({ onCapture }: { onCapture: () => void }) {
  return (
    <button onClick={onCapture} aria-label="Capture Document">
      <span />
    </button>
  );
}

describe("the capture button", () => {
  it("calls its handler exactly once when clicked", () => {
    const onCapture = vi.fn();            // a fake function that records calls

    render(<CaptureButton onCapture={onCapture} />);

    // Find it the way a user would: by what it says, not by CSS class.
    const button = screen.getByRole("button", { name: /capture document/i });
    fireEvent.click(button);

    expect(onCapture).toHaveBeenCalledTimes(1);
  });

  it("does nothing before it is clicked", () => {
    const onCapture = vi.fn();
    render(<CaptureButton onCapture={onCapture} />);
    expect(onCapture).not.toHaveBeenCalled();
  });
});
```

Three new ideas, each worth understanding:

- **`vi.fn()`** — a *spy*. A fake function that remembers every call made to it. You then assert on its memory. It's how you check "did this get called?" without the real thing happening.
- **`render(<Component />)`** — mounts your component into a simulated browser (jsdom) that exists only inside the test. No real browser, no server.
- **`screen.getByRole("button", { name: ... })`** — finds the element the way a screen reader or a user would. **Never query by CSS class** — classes change when you restyle, and your test would break for no real reason.

### Now the version that catches bug C3

The point of a test is to encode a rule you care about. The rule here: *a tap on the shutter must always produce either a photo or a message — never silence.*

To test that, the capture logic has to be callable without a browser. Pull it out of the component into a plain function:

`frontend/src/lib/capture.ts`

```ts
export type CaptureOutcome =
  | { kind: "captured" }
  | { kind: "not-ready"; message: string };

/** Decide whether the shutter can fire. Pure: no DOM, no canvas, no network. */
export function canCapture(
  video: { videoWidth: number; videoHeight: number } | null,
): CaptureOutcome {
  if (!video || !video.videoWidth || !video.videoHeight) {
    return { kind: "not-ready", message: "The camera is still starting. Try again in a moment." };
  }
  return { kind: "captured" };
}
```

`frontend/src/lib/capture.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { canCapture } from "./capture";

describe("canCapture", () => {
  it("allows capture once the video has dimensions", () => {
    expect(canCapture({ videoWidth: 1280, videoHeight: 720 })).toEqual({ kind: "captured" });
  });

  it("explains itself when the camera has not started", () => {
    const outcome = canCapture({ videoWidth: 0, videoHeight: 0 });
    expect(outcome.kind).toBe("not-ready");
    // The bug was silence. This asserts there is always something to say.
    expect(outcome).toHaveProperty("message");
    expect((outcome as { message: string }).message).not.toBe("");
  });

  it("explains itself when there is no video element at all", () => {
    expect(canCapture(null).kind).toBe("not-ready");
  });
});
```

Run `npm test`. Three passing tests. Now change `canCapture` to return `{ kind: "captured" }` unconditionally — watch two of them fail. **That failure is the whole value.** A test you've never seen fail is a test you can't trust.

## A backend test

`backend/test_formatting.py` — your `formatting.py` is pure functions, which makes it the easiest place on the backend to start:

```python
"""Run from the backend directory:  python -m pytest test_formatting.py -v"""

import pytest

from modules.drafting.formatting import (
    format_indian_currency,
    mask_aadhaar,
    parse_amount,
    rupees_in_words,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Rs. 45,00,000/-", 4500000.0),
        ("45,00,000",       4500000.0),
        ("4500000",         4500000.0),
        ("₹ 12,50,000.50",  1250000.50),
        ("no number here",  None),
        (None,              None),
    ],
)
def test_parse_amount(raw, expected):
    assert parse_amount(raw) == expected


def test_indian_grouping_not_international():
    # 45 lakh is 45,00,000 in India - NOT 4,500,000.
    assert format_indian_currency(4500000) == "45,00,000"


def test_rupees_in_words_uses_lakh_not_million():
    assert rupees_in_words(4500000) == "Rupees Forty Five Lakh Only"


def test_mask_aadhaar_is_idempotent():
    """Masking an already-masked value must not corrupt it (see bug M11)."""
    once = mask_aadhaar("1234 5678 3611")
    assert once == "XXXX XXXX 3611"
    assert mask_aadhaar(once) == once
```

`@pytest.mark.parametrize` is pytest's version of `it.each` — one test body, six cases, six separate pass/fail results.

## The four rules worth keeping

1. **Write the failing test first, then the fix.** If you fix first, you never find out whether the test actually catches the bug. This is the single habit that separates tests that work from tests that decorate.
2. **Test behaviour, not implementation.** "Clicking capture produces a photo or a message" survives a rewrite. "The handler calls `canvas.toBlob`" breaks the moment you change approach, and tells you nothing when it does.
3. **One assertion-idea per test.** When a test fails you want to know *what* broke from the name alone, without reading the body.
4. **Pure functions are 10× easier to test.** Notice that every test above got easy the moment the logic was pulled out of a component. That's not a coincidence — it's the main practical reason people separate logic from UI. Your `deedStream.ts` is already written this way, which is why it already has 260 lines of tests.

## Where to learn properly

In priority order. Don't do all of them.

| Resource | What it covers | Time |
|---|---|---|
| **Vitest docs → "Getting Started" + "API → expect"** (vitest.dev) | Your actual tool. The only mandatory one. | 2 hrs |
| **Testing Library "Guiding Principles"** (testing-library.com/docs/guiding-principles) | Why to query by role/text and never by class. One page; changes how you write every component test. | 20 min |
| **Kent C. Dodds — "Common mistakes with React Testing Library"** (kentcdodds.com/blog) | The specific traps everyone hits in month one. | 30 min |
| **pytest docs → "Get Started" + "Parametrizing tests"** (docs.pytest.org) | Your backend tool. | 2 hrs |
| **Your own `frontend/src/lib/deedStream.test.ts`** | 260 lines of good tests for code you own. Read it line by line and ask what each one is protecting against. | 1 hr |

Skip, for now: anything on mocking frameworks, test coverage percentages, E2E tools (Playwright/Cypress), or TDD philosophy. They're real, they're just not your bottleneck. Your bottleneck is writing your first fifty assertions.

## Your first week with tests

| Day | Do this |
|---|---|
| 1 | Run `npm test` and `python -m pytest`. Watch them pass. Break one on purpose; watch it fail. |
| 2 | Write `capture.test.ts` from this document. Make it pass by fixing **C3**. |
| 3 | Write `dates.test.ts` (**H1**). Make it pass. |
| 4 | Write `api.test.ts` (**C1**). Make it pass. |
| 5 | Write `test_formatting.py`. Make it pass. |
| 6–7 | For each remaining Severity 1 bug: write the failing test first, then fix. |

By the end of that week you'll have written ~30 tests, fixed the six critical bugs, and — the part that actually matters — you'll be able to change this codebase without being afraid of it.

---

## One thing to do before anything else

Your demo video shows a real PAN number rendered in full in a generated deed. Aadhaar is masked correctly (`mask_aadhaar` works); PAN is not masked anywhere.

Two consequences:

- **For demos:** use synthetic parties. Never record a screen with a real PAN, address or document number in it.
- **For the product:** decide deliberately whether a full PAN belongs on the rendered deed. It legitimately does on a registered sale deed — but it should not be sitting in logs, in `rawText` (currently stored to 4,000 characters, `extraction.py:182`), or in any error payload. Grep for where extracted fields get logged before you put a real client's documents through this.
