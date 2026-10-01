# 04 — The Live Writing Engine

This is the most technically interesting part of the frontend: four files
that together make a deed appear to type itself, smoothly, regardless of how
bursty the network actually is. Read [00-prerequisites.md](./00-prerequisites.md)
section A8 (Server-Sent Events) and A7 (`requestAnimationFrame`) before this
document if you haven't.

**The core idea, once, in plain language:** the backend doesn't send text at
a steady pace — networks are bursty, and the backend itself produces content
unevenly (instant for the fixed clauses, several seconds of silence while
waiting on the AI for the three bespoke paragraphs). If the browser rendered
each chunk of text the instant it arrived, the deed would appear to teleport
in bursts, then freeze — which reads as a stuttering connection, not as
writing. The fix used here is to **separate arrival from reveal**: every
character that arrives from the network is stashed into a `target` buffer
immediately, but what's actually painted on screen (`shown`) is drained from
that buffer at a steady, animation-frame-driven pace — accelerating only if
the buffer backs up a long way. Four files divide this job:

| File | Job |
|---|---|
| `deedStream.ts` | Pure, stateless logic: decode SSE bytes into events, and the math for the typing animation. No React, no network, no DOM — fully unit-testable in isolation. |
| `useDeedGeneration.ts` | The React glue: owns the fetch/SSE connection, runs the animation loop via `requestAnimationFrame`, and exposes simple state to the UI. |
| `LiveDeedCanvas.tsx` | Pure rendering: turns the current animation state into the "page of paper" the user sees, including the blinking caret and click-to-edit. |
| `ExtractedFieldsForm.tsx` | Not part of the animation — the review step just before it — included here because it's the last UI component not yet covered. |

---

## `frontend/src/lib/deedStream.ts`

### Why it's a separate file from the hook

Every function here is pure — given the same input, always the same output,
touching no global state, no DOM, no network. That is what makes the file's
own test suite (`deedStream.test.ts`) able to feed it SSE bytes split at
*arbitrary* byte boundaries (including boundaries that land in the middle of
a single JSON value) and assert the decoder still reconstructs events
correctly — something that would be far harder to test if this logic were
tangled into the `fetch` loop itself.

### Types: `DeedEvent`, `DeedSection`, `TypingSection`

```ts
export type DeedEvent =
  | { type: "status"; step: string; message: string }
  | { type: "meta"; sectionCount: number; estimatedPages: number; clauseCount: number }
  | { type: "section"; index: number; id: string; style: string; heading: string }
  | { type: "delta"; id: string; text: string }
  | { type: "section_end"; id: string; body: string }
  | { type: "done"; sections: DeedSection[]; plainText: string; estimatedPages: number; source: string; missingRequired: string[] }
  | { type: "warning"; message: string; missingRequired: string[] }
  | { type: "notice"; message: string }
  | { type: "error"; message: string };
```

**Job:** this is a TypeScript **discriminated union** — a value that is
always exactly one of these nine shapes, distinguished by its `type` field.
Every one of these exactly matches an event the backend's `stream_document`
(document 09) yields. Because `type` is a *literal* string in each branch,
TypeScript narrows the type automatically inside a `switch (event.type)` —
inside the `"delta"` case, TypeScript knows `event.text` exists and
`event.sections` (only on `"done"`) does not, and will flag it as an error
if you try to use it. This is what catches a whole class of "I misspelled
the event type" or "I used a field from the wrong event" bugs at compile
time rather than at 2am in production.

`DeedSection` is one finished block of the deed (`id`, `style`, `heading`,
`body`). `TypingSection` is the *animation's* working copy of a section —
same fields, but `body` is split into `target` (everything that has arrived
from the stream) and `shown` (how many characters of `target` are currently
painted on screen — a number, not a substring, because recomputing a
substring from a growing string on every frame would be wasteful).

### `class SSEDecoder` — `push(chunk)` and `flush()`

```ts
export class SSEDecoder {
  private buffer = "";

  push(chunk: string): DeedEvent[] {
    this.buffer += chunk;
    const events: DeedEvent[] = [];
    let separator = this.buffer.indexOf("\n\n");
    while (separator !== -1) {
      const block = this.buffer.slice(0, separator);
      this.buffer = this.buffer.slice(separator + 2);
      const event = parseEventBlock(block);
      if (event) events.push(event);
      separator = this.buffer.indexOf("\n\n");
    }
    return events;
  }

  flush(): DeedEvent[] {
    const remaining = this.buffer.trim();
    this.buffer = "";
    if (!remaining) return [];
    const event = parseEventBlock(remaining);
    return event ? [event] : [];
  }
}
```

**Job:** incrementally turn a raw stream of text chunks (exactly what you
get from reading a `fetch` response body) into complete `DeedEvent` objects,
correctly handling chunk boundaries that split an event in half.
**Calls:** `parseEventBlock`.
**Why it's a class, not a function:** it needs to remember unfinished data
*between* calls — a `function` with no persistent state couldn't do that;
this is exactly the kind of "memory between calls" problem a small class
(or a closure) solves.
**Line by line (`push`):**
- `private buffer = "";` — everything received so far that hasn't yet formed
  a complete event. `private` means only code inside this class can touch
  it directly.
- `this.buffer += chunk;` — append the newly arrived bytes (already decoded
  to a string by the caller) onto whatever was left over from last time.
- `this.buffer.indexOf("\n\n")` — SSE events are separated by a blank line
  (prerequisites, A8); find the first one.
- The `while` loop: as long as there's at least one complete event's worth
  of data in the buffer, slice it off (`block`), keep the rest as the new
  buffer, parse the block into an event, and look for the *next* separator
  in what remains — this is what lets a single `push()` call return multiple
  events if the network happened to deliver several at once.
- `this.buffer = this.buffer.slice(separator + 2);` — `+2` skips past both
  `\n` characters of the separator, not just the first.
- Whatever is left in `this.buffer` after the loop (no `\n\n` found) is, by
  definition, an incomplete event — it stays in the buffer for the *next*
  call to `push` to complete.
**Line by line (`flush`):** called once the stream has ended entirely, to
recover a final event that arrived without its trailing blank-line
terminator (the connection simply closed right after it) — without this,
the very last section of a deed could occasionally go missing if the server
closed the connection a moment too early.

### `parseEventBlock(block)`

```ts
function parseEventBlock(block: string): DeedEvent | null {
  const payload = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!payload) return null;
  try {
    return JSON.parse(payload) as DeedEvent;
  } catch {
    return null;
  }
}
```

**Job:** turn one raw SSE block (one or more lines, some of which may not be
`data:` lines) into a parsed `DeedEvent`.
**Calls:** nothing (not exported — an internal helper for this file only).
**Line by line:**
- `.split("\n")` then `.filter((line) => line.startsWith("data:"))` — an SSE
  block can technically contain other line types (`event:`, `id:`,
  comments); this keeps only the `data:` lines, which is all this backend
  ever sends.
- `.map((line) => line.slice(5).trimStart())` — strips the five characters
  `"data:"` off the front of each line, and any leading space the SSE
  convention allows after the colon.
- `.join("\n")` — multi-line JSON payloads sent as several `data:` lines are
  supposed to be rejoined with newlines between them, per the SSE spec.
- `if (!payload) return null;` — an empty block (e.g. a stray keep-alive)
  produces nothing to parse.
- `JSON.parse(payload)` — turn the text into the actual event object.
- `catch { return null; }` — **a single malformed frame must not take the
  whole generation down.** If, for any reason, one event's JSON is broken,
  this silently drops just that one event rather than throwing an exception
  that would unwind the whole `push()` call (and, with it, every other valid
  event in the same chunk).

### `applyEvent(sections, event)`

```ts
export function applyEvent(sections: TypingSection[], event: DeedEvent): TypingSection[] {
  if (event.type === "section") {
    if (sections.some((s) => s.id === event.id)) return sections;
    return [...sections, { id: event.id, style: event.style, heading: event.heading, target: "", shown: 0 }];
  }
  if (event.type === "delta") {
    return sections.map((section) =>
      section.id === event.id ? { ...section, target: section.target + event.text } : section,
    );
  }
  if (event.type === "section_end") {
    return sections.map((section) =>
      section.id === event.id ? { ...section, target: event.body } : section,
    );
  }
  return sections;
}
```

**Job:** given the current list of sections being animated and one new
event, return the *new* list of sections (never mutating the old one — a
core React/functional-programming convention: always produce a new value
rather than changing one in place, which is what lets React efficiently
detect "did anything change?").
**Calls:** nothing.
**Line by line:**
- `"section"` — a brand-new section has started on the backend. Guard
  against adding it twice (`.some(...)`, in case of a duplicate event — SSE
  over a flaky connection can occasionally redeliver), then append it with
  an empty `target` and `shown: 0` — nothing to show yet, text arrives via
  subsequent `delta` events.
- `"delta"` — find the matching section by id and **append** `event.text`
  onto its `target`. This is additive — each delta is a *new piece* of text,
  not the whole thing — which is exactly how `iter_deltas` on the backend
  (document 09) produces them.
- `"section_end"` — sets `target` to `event.body` **directly** (not
  appending) — this is the authoritative full text of the section, sent by
  the backend as a safety net in case any individual delta was dropped in
  transit. If every delta arrived correctly, this is a no-op (the
  concatenated deltas already equal `event.body`); if one was lost, this
  silently repairs it.
- Every other event type (`status`, `meta`, `warning`, `notice`, `error`,
  `done`) returns `sections` completely unchanged — this function's whole
  job is maintaining the *section content*; everything else is handled
  elsewhere (`useDeedGeneration.ts`'s `handleEvent`).

### The animation math: `charsPerTick`, `backlogOf`, `tick`, `isCaughtUp`

```ts
export const BASE_CHARS_PER_TICK = 7;
export const MAX_CHARS_PER_TICK = 90;

export function charsPerTick(backlog: number): number {
  if (backlog <= 0) return 0;
  const accelerated = BASE_CHARS_PER_TICK + Math.floor(backlog / 60);
  return Math.min(MAX_CHARS_PER_TICK, Math.max(BASE_CHARS_PER_TICK, accelerated));
}

export function backlogOf(sections: TypingSection[]): number {
  return sections.reduce((total, section) => total + (section.target.length - section.shown), 0);
}

export function tick(sections: TypingSection[], budget: number): TypingSection[] {
  if (budget <= 0) return sections;
  let remaining = budget;
  let changed = false;
  const next = sections.map((section) => {
    if (remaining <= 0 || section.shown >= section.target.length) return section;
    const spend = Math.min(remaining, section.target.length - section.shown);
    remaining -= spend;
    changed = true;
    return { ...section, shown: section.shown + spend };
  });
  return changed ? next : sections;
}

export function isCaughtUp(sections: TypingSection[]): boolean {
  return sections.every((section) => section.shown >= section.target.length);
}
```

**Job:** this is the actual typing-speed algorithm, in four small pure
functions.
**Calls:** none call each other; `useDeedGeneration.ts`'s per-frame loop
calls all four in sequence.
**Line by line:**
- `backlogOf` — sum, across every section, how many characters have arrived
  (`target.length`) but not yet been shown (`shown`). This is "how far
  behind is the animation right now," in characters.
- `charsPerTick(backlog)` — the speed curve. At zero backlog, zero speed
  (nothing to show). Otherwise, a base speed of 7 characters per tick, plus
  one extra character per 60 characters of backlog (`Math.floor(backlog /
  60)`), clamped between the base (`Math.max(BASE_CHARS_PER_TICK, ...)`,
  which is actually redundant once `backlog > 0` since `accelerated` is
  already `>= BASE_CHARS_PER_TICK`, but makes the floor explicit) and a
  ceiling of 90. **This is the fix for the problem named in `DECISIONS.md`
  decision 4**: without a ceiling, a deed that finished generating in two
  seconds would still take roughly a minute to finish *animating* at the
  base rate; with acceleration, a large backlog is drained faster while a
  small, steady trickle of text still reads at a comfortable, human typing
  pace.
- `tick(sections, budget)` — spend a character `budget` across the sections,
  **in order**, filling the earliest unfinished section completely before
  spending anything on the next. `if (remaining <= 0 || section.shown >=
  section.target.length) return section;` skips sections that are already
  fully shown or if the budget ran out. `Math.min(remaining, section.target.length
  - section.shown)` spends either the whole remaining budget or just enough
  to finish this section, whichever is smaller — this is what makes
  "spillover" into the next section within the same animation frame work
  correctly: if section A only needed 3 of the frame's 10-character budget,
  the remaining 7 carry over to section B in the same `tick` call. The
  `changed` flag lets the function return the *exact same array reference*
  when nothing actually changed (all sections already fully shown), which
  matters for React's ability to skip unnecessary re-renders.
- `isCaughtUp` — true once every section's `shown` has reached its
  `target.length` — i.e. the animation has fully drained the buffer and
  there's nothing left to type.

### `visibleText`, `activeSectionId`, `toDeedSections`

```ts
export function visibleText(section: TypingSection): string {
  return section.target.slice(0, section.shown);
}

export function activeSectionId(sections: TypingSection[]): string | null {
  const active = sections.find((section) => section.shown < section.target.length);
  if (active) return active.id;
  const last = sections[sections.length - 1];
  return last ? last.id : null;
}

export function toDeedSections(sections: TypingSection[]): DeedSection[] {
  return sections.map(({ id, style, heading, target }) => ({ id, style, heading, body: target }));
}
```

**Job:** three small read-only helpers used by the rendering layer.
**Line by line:**
- `visibleText` — the actual substring currently on screen for a section
  (everything from the start of `target` up to `shown`).
- `activeSectionId` — which section the typing caret should currently sit
  in: the *first* one not yet fully shown, or — once everything is finished
  — the very last section (so the caret visually "lands" at the end of the
  document rather than disappearing).
- `toDeedSections` — strips the animation-only `shown` field, converting the
  working `TypingSection[]` back into the plain `DeedSection[]` shape used
  once generation is complete (for PDF/DOCX export and for the "no `done`
  event arrived" fallback in the hook below).

---

## `frontend/src/lib/useDeedGeneration.ts`

### Why this file exists

`deedStream.ts` is pure logic with no concept of "React component," "network
connection," or "animation frame." This file is the glue that drives all of
that pure logic from inside a React component's lifecycle, and exposes one
simple object (`{ phase, sections, status, ... , start, cancel, reset,
skipAnimation }`) that `page.tsx` consumes without needing to know any of
the mechanics underneath. **What breaks without it:** `page.tsx` would have
to manage the fetch connection, the SSE decoder, and the animation loop
itself, mixed into the same component that also handles camera capture and
the review form — this file's entire reason to exist is keeping that
complexity contained and reusable.

### Refs vs. state — the central design decision of this file

```ts
const [state, setState] = useState<State>(INITIAL);
const sectionsRef = useRef<TypingSection[]>([]);
const frameRef = useRef<number | null>(null);
const lastFrameRef = useRef<number>(0);
const streamDoneRef = useRef(false);
const donePayloadRef = useRef<GenerationResult | null>(null);
const abortRef = useRef<AbortController | null>(null);
```

**Why both a `useState` and a `useRef` holding overlapping information:** the
animation runs on `requestAnimationFrame`, which can fire up to ~60 times a
second. If every single frame called `setState` with a brand new sections
array, React would re-render the entire component tree 60 times a second —
wasteful, and liable to visibly stutter. Instead, the authoritative,
continuously-updated working copy lives in `sectionsRef` (a plain mutable
box, A5 in prerequisites, that does **not** trigger a re-render when
changed), and `state.sections` is deliberately only synced from it inside
`runFrame`'s own `setState` call — once per frame, which is already the
natural rendering cadence, not more often. `frameRef` holds the handle
returned by `requestAnimationFrame` so the loop can be cancelled.
`lastFrameRef` remembers the previous frame's timestamp, needed to compute
real elapsed time between frames. `streamDoneRef` / `donePayloadRef` record,
outside of React state, whether the network stream itself has finished and
what its final payload was — read by the animation loop to decide when to
transition to the `"complete"` phase. `abortRef` holds the `AbortController`
for the current fetch, so `cancel()` can stop an in-flight stream.

### `stopAnimation()` and `cancel()`

```ts
const stopAnimation = useCallback(() => {
  if (frameRef.current !== null) {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }
}, []);

const cancel = useCallback(() => {
  abortRef.current?.abort();
  abortRef.current = null;
  stopAnimation();
}, [stopAnimation]);
```

**Job:** `stopAnimation` halts the `requestAnimationFrame` loop.
`cancel` additionally aborts any in-flight network request. Both are
`useCallback`-wrapped so their function identity is stable across renders
(prerequisites, A5) — needed because `cancel` is used as a `useEffect`
cleanup function below, and an unstable reference there would cause the
effect to tear down and re-run every single render.
**Calls:** `cancel` calls `stopAnimation`.

### `reset()`

```ts
const reset = useCallback(() => {
  cancel();
  sectionsRef.current = [];
  streamDoneRef.current = false;
  donePayloadRef.current = null;
  setState(INITIAL);
}, [cancel]);
```

**Job:** fully wipe this hook's state, used by `page.tsx`'s
`startNewFiling` and the "Edit & Regenerate" button.
**Calls:** `cancel`.

### `useEffect(() => cancel, [cancel])`

```ts
useEffect(() => cancel, [cancel]);
```

**Job:** guarantee that if the component using this hook is ever removed
from the page while a generation is in progress (user navigates away
mid-stream), the fetch is aborted and the animation loop is stopped — no
orphaned network connection or animation loop left running against a
component that no longer exists.
**Line by line:** this is the terse form of `useEffect(() => { return
cancel; }, [cancel])` — an effect whose body does nothing on mount and whose
*cleanup function* is `cancel` itself.

### `runFrame(timestamp)` — the animation loop's body

```ts
const runFrame = useCallback((timestamp: number) => {
  const previous = lastFrameRef.current || timestamp;
  const elapsed = Math.min(timestamp - previous, 250);
  lastFrameRef.current = timestamp;

  const backlog = backlogOf(sectionsRef.current);
  if (backlog > 0) {
    const budget = Math.max(1, Math.round((charsPerTick(backlog) * elapsed) / FRAME_MS));
    sectionsRef.current = tick(sectionsRef.current, budget);
  }

  const caughtUp = isCaughtUp(sectionsRef.current);
  const finished = streamDoneRef.current && caughtUp;

  setState((current) => ({
    ...current,
    sections: sectionsRef.current,
    ...(finished ? { phase: "complete" as GenerationPhase, status: "",
      result: donePayloadRef.current ?? { sections: toDeedSections(sectionsRef.current),
        plainText: "", estimatedPages: current.estimatedPages, source: "template", missingRequired: [] } } : {}),
  }));

  if (finished) { stopAnimation(); return; }
  frameRef.current = requestAnimationFrame(runFrame);
}, [stopAnimation]);
```

**Job:** this function *is* the animation — it runs once per screen
refresh, decides how many characters to reveal this frame, and either
schedules itself again or stops.
**Calls:** `backlogOf`, `charsPerTick`, `tick`, `isCaughtUp`, `toDeedSections`,
`stopAnimation`; schedules itself via `requestAnimationFrame`.
**Line by line:**
- `const previous = lastFrameRef.current || timestamp;` — on the very first
  frame, `lastFrameRef.current` is still its initial `0` (falsy), so
  `previous` defaults to the current `timestamp` itself, producing an
  `elapsed` of zero for that first frame rather than some huge, meaningless
  number.
- `const elapsed = Math.min(timestamp - previous, 250);` — real milliseconds
  since the last frame. **Clamped to 250ms** — this is the fix for
  backgrounded tabs: browsers throttle `requestAnimationFrame` in inactive
  tabs, so when the user switches back, `elapsed` could otherwise be many
  seconds, which would (via the budget calculation below) try to reveal an
  enormous number of characters in a single frame — a visible jump rather
  than smooth catch-up acceleration.
- `const backlog = backlogOf(sectionsRef.current);` — how far behind, in
  characters, right now.
- `const budget = Math.max(1, Math.round((charsPerTick(backlog) * elapsed) / FRAME_MS));`
  — `charsPerTick(backlog)` is defined as a *per-ideal-frame* rate (at 60fps,
  `FRAME_MS` = 1000/60 ≈ 16.67ms); scaling by `elapsed / FRAME_MS` converts
  that into "characters for *this* frame's actual duration," so the
  animation runs at the same real-world speed whether the display is 60Hz
  or 120Hz, or whether a frame happened to take longer than usual.
  `Math.max(1, ...)` guarantees at least one character is revealed per
  frame whenever there's a backlog, so the animation can never completely
  stall.
- `sectionsRef.current = tick(sectionsRef.current, budget);` — advance the
  working copy.
- `const finished = streamDoneRef.current && caughtUp;` — generation is
  truly finished only when **both** are true: the network stream itself has
  ended, *and* the animation has fully caught up to whatever arrived. A
  stream that finished instantly but with a huge deed still typing out is
  correctly *not* yet "finished" by this definition — the UI should keep
  showing the writing animation, not jump straight to "done."
- The `setState` call updates `state.sections` from the ref (syncing React's
  visible state to the animation's working copy, once per frame) and, only
  when `finished` is true, also flips the phase to `"complete"` and sets
  `result`. The `result` fallback (`donePayloadRef.current ?? {...}`) covers
  the case where the stream ended *without* a proper `"done"` event (e.g.
  the connection dropped mid-deed) — the UI still gets a usable result
  object built from whatever text actually arrived, rather than being stuck
  with no result at all.
- `if (finished) { stopAnimation(); return; }` — stop scheduling further
  frames once done.
- `frameRef.current = requestAnimationFrame(runFrame);` — otherwise, ask the
  browser to call this same function again before the next repaint — this
  one line is what turns a single function call into a continuous loop.

### `startAnimation()`

```ts
const startAnimation = useCallback(() => {
  if (frameRef.current !== null) return;
  lastFrameRef.current = 0;
  frameRef.current = requestAnimationFrame(runFrame);
}, [runFrame]);
```

**Job:** kick off the loop, idempotently (calling it while already running
does nothing, guarded by the `if (frameRef.current !== null) return;` check)
— safe to call from multiple places (`start`, `skipAnimation`, and again
after the stream finishes) without risking two loops running at once.
**Calls:** schedules `runFrame`.

### `handleEvent(event)`

```ts
const handleEvent = useCallback((event: DeedEvent) => {
  switch (event.type) {
    case "status": setState((current) => ({ ...current, status: event.message })); break;
    case "meta": setState((current) => ({ ...current, estimatedPages: event.estimatedPages, sectionCount: event.sectionCount })); break;
    case "warning": case "notice":
      setState((current) => ({ ...current, notices: current.notices.includes(event.message)
        ? current.notices : [...current.notices, event.message] })); break;
    case "error": setState((current) => ({ ...current, phase: "error", error: event.message })); break;
    case "done":
      donePayloadRef.current = { sections: event.sections, plainText: event.plainText,
        estimatedPages: event.estimatedPages, source: event.source, missingRequired: event.missingRequired ?? [] };
      streamDoneRef.current = true;
      break;
    default: sectionsRef.current = applyEvent(sectionsRef.current, event);
  }
}, []);
```

**Job:** the dispatcher — every decoded SSE event passes through here, which
decides whether it updates visible React state directly (status messages,
metadata, warnings, errors) or feeds into the section-content pipeline
(`section`/`delta`/`section_end`, handled by the `default` case falling
through to `applyEvent`).
**Calls:** `applyEvent`.
**Line by line:**
- `"status"` — just mirrors the backend's human-readable progress message
  (`"Composing the deed"`, etc.) into state, shown as the subtitle while
  writing.
- `"meta"` — records the total section/page/clause counts the backend
  reports up front, used for the "Writing section N of M" progress text.
- `"warning"`/`"notice"` — both append a message to a `notices` list, with a
  duplicate check (`current.notices.includes(event.message)`) so the same
  message (e.g. "drafted from the firm's precedent wording") doesn't appear
  twice if the backend somehow sent it more than once.
- `"error"` — immediately flips the whole hook into the `"error"` phase,
  which `page.tsx` renders as a distinct failure screen with a retry button.
- `"done"` — stores the authoritative final payload in a ref (not state —
  it's only consumed by `runFrame`, not rendered directly) and flags the
  stream as finished. Note this does **not** immediately flip `phase` to
  `"complete"` — that only happens inside `runFrame`, once the *animation*
  has also caught up, which is the whole point of separating arrival from
  reveal.
- `default:` — every other event type (`"section"`, `"delta"`,
  `"section_end"`) is exactly what `applyEvent` (from `deedStream.ts`) knows
  how to handle, so this one line routes all three to it and updates the
  ref directly, bypassing `setState` entirely (the next animation frame
  will pick up the change).

### `start(fields)`

```ts
const start = useCallback(async (fields: Record<string, string>) => {
  cancel();
  sectionsRef.current = [];
  streamDoneRef.current = false;
  donePayloadRef.current = null;
  setState({ ...INITIAL, phase: "connecting", status: "Waking the drafting engine" });

  const controller = new AbortController();
  abortRef.current = controller;

  try {
    const response = await fetch(api("/drafting/generate"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ fields }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`The drafting engine did not respond (${response.status}).`);
    }
    setState((current) => ({ ...current, phase: "writing" }));
    startAnimation();

    const reader = response.body.getReader();
    const utf8 = new TextDecoder();
    const decoder = new SSEDecoder();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of decoder.push(utf8.decode(value, { stream: true }))) {
        handleEvent(event);
      }
    }
    for (const event of decoder.flush()) handleEvent(event);

    streamDoneRef.current = true;
    startAnimation();
  } catch (caught) {
    if (controller.signal.aborted) return;
    stopAnimation();
    setState((current) => ({ ...current, phase: "error",
      error: caught instanceof Error ? caught.message : "Generation failed unexpectedly." }));
  }
}, [cancel, handleEvent, startAnimation, stopAnimation]);
```

**Job:** this is the function `page.tsx`'s `startGeneration` calls — it owns
the entire network connection lifecycle: open it, read it byte by byte,
decode and dispatch every event, and know when it's truly over.
**Calls:** `cancel`, `api`, `startAnimation`, `handleEvent`, `stopAnimation`;
constructs an `SSEDecoder` directly.
**Line by line:**
- `cancel(); sectionsRef.current = []; ...` — a fresh start always first
  tears down anything previous, exactly as `reset` does, then resets the
  tracking refs.
- `setState({ ...INITIAL, phase: "connecting", ... })` — immediately shows
  the "Waking the drafting engine" state, before the network request has
  even been sent — important because that request can take up to two
  minutes on a cold backend, and the UI must not look frozen during that
  wait.
- `fetch(api("/drafting/generate"), { ..., headers: { Accept:
  "text/event-stream" }, ... })` — the `Accept` header is a hint to the
  server about what response format is wanted; FastAPI's `StreamingResponse`
  with `media_type="text/event-stream"` (document 05) answers it correctly
  regardless, but it's good practice to declare it.
- `if (!response.ok || !response.body)` — guards against both an HTTP error
  status *and* the pathological case of a response with no body stream at
  all (shouldn't normally happen, but costs nothing to check).
- `setState(... phase: "writing" ...); startAnimation();` — only once the
  connection is actually established does the UI move from "connecting" to
  "writing," and the animation loop starts — note it starts *before* any
  data has necessarily arrived; `runFrame` simply does nothing useful until
  `backlogOf` becomes non-zero.
- `response.body.getReader()` — gets a low-level `ReadableStreamDefaultReader`,
  the API for pulling chunks of bytes out of a streaming HTTP response one
  at a time.
- `new TextDecoder()` — raw network bytes are UTF-8 encoded; this decodes
  them into actual JavaScript strings. `{ stream: true }` in `.decode(value,
  { stream: true })` tells the decoder "more bytes are coming" — necessary
  because a single UTF-8 character can span multiple bytes, and a chunk
  boundary could land in the middle of one; `stream: true` makes the decoder
  correctly hold back an incomplete trailing byte sequence until the next
  chunk completes it, rather than producing a corrupted character.
- `new SSEDecoder()` — the class from `deedStream.ts`, doing the actual
  event-framing work described above.
- `for (;;) { const { done, value } = await reader.read(); if (done) break; ... }`
  — the core read loop: `reader.read()` resolves with the next chunk of
  bytes (`value`) as they arrive over the network, and `done: true` once the
  server has closed the stream. Each chunk is decoded to text, pushed into
  the SSE decoder, and every event that comes back is dispatched to
  `handleEvent`.
- `for (const event of decoder.flush()) handleEvent(event);` — after the
  loop ends, recover any final incomplete-but-parseable event still sitting
  in the decoder's buffer (the case `flush()` exists for).
- `streamDoneRef.current = true; startAnimation();` — **this line runs
  whether or not a proper `"done"` event was ever received.** If the
  connection simply closes mid-deed (a dropped connection, a server
  restart), the stream loop still exits via `done: true` from `reader.read()`,
  and this marks the stream as finished anyway — "whatever arrived is still
  a usable draft," per the comment in the source. `startAnimation()` is
  called again here in case the animation loop had already stopped (e.g. it
  had fully caught up earlier and was waiting for more data that never
  came) — this nudges it to run one more time, notice `streamDoneRef` is now
  true and `isCaughtUp` is also true, and transition to `"complete"`.
- `catch (caught) { if (controller.signal.aborted) return; ... }` — if the
  *user* cancelled (navigated away, started a new generation), `aborted` is
  true and this returns silently — that is an intentional cancellation, not
  a failure, and should not show an error banner. Any other exception
  (network failure, the thrown "did not respond" error above) stops the
  animation and transitions to the `"error"` phase with a message.

### `skipAnimation()`

```ts
const skipAnimation = useCallback(() => {
  sectionsRef.current = sectionsRef.current.map((section) => ({ ...section, shown: section.target.length }));
  startAnimation();
}, [startAnimation]);
```

**Job:** the "Skip to the end" button's handler — instantly reveal
everything that has arrived so far, without waiting for the normal
character-by-character pace.
**Calls:** `startAnimation`.
**Line by line:** sets every section's `shown` equal to its `target.length`
(fully revealed) in one step, then nudges the animation loop to run once
more so it notices everything is caught up and (if the stream itself has
also finished) transitions to `"complete"` on the very next frame. Note this
only reveals what has *arrived so far* — if the stream is still actively
producing more text, skipping catches up to the current backlog, and new
text will still need to arrive and will still animate in afterward (just
with nothing left to "skip" at this instant).

---

## `frontend/src/components/LiveDeedCanvas.tsx`

### Why this file exists

This component's only job is turning the array of `TypingSection` the hook
produces into the visual "page of paper" — it contains **no** network code,
no state about *what* generation phase things are in beyond the booleans
it's handed; it is a pure rendering layer, which is what makes it possible
to reason about independently (does this line of text look right on the
page?) from whether the animation timing is correct.

### `LiveDeedCanvas` (the main export) and `handleScroll`

```tsx
export default function LiveDeedCanvas({ sections, isWriting, edits = {}, onEdit, editable = false }: LiveDeedCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);

  useEffect(() => {
    if (!following || !isWriting) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [sections, following, isWriting]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    setFollowing(distanceFromBottom < 120);
  };

  const activeIndex = sections.findIndex((section) => section.shown < section.target.length);
  const caretIndex = activeIndex === -1 ? sections.length - 1 : activeIndex;
  ...
```

**Job:** render the scrollable "sheet of paper," auto-scrolling to follow
the writing — unless the user has deliberately scrolled up to re-read
something, in which case it politely stops following them around.
**Calls:** nothing beyond DOM APIs; renders `DeedBlock` for each section.
**Line by line:**
- `following` state — starts `true` (auto-follow by default).
- The `useEffect` re-runs every time `sections` changes (i.e. every
  animation frame that actually revealed new text): if the user is still
  following *and* the deed is actively being written, smooth-scroll the
  invisible `endRef` sentinel element into view — which, being placed at the
  very bottom of the content, has the effect of scrolling the whole
  container to the bottom.
- `handleScroll` — wired to the scroll container's `onScroll`. Computes how
  far the current scroll position is from the true bottom
  (`scrollHeight - scrollTop - clientHeight` is a standard formula for
  "pixels of unscrolled content below the viewport"). If that distance is
  small (`< 120` pixels — a tolerance, not an exact-zero check, since
  smooth-scrolling and sub-pixel rendering mean "exactly at the bottom"
  rarely happens precisely), following resumes; otherwise it's set to
  `false`, which the `useEffect` above respects by simply not
  auto-scrolling on the next update. This is what lets a user scroll up
  mid-generation to re-read an earlier clause without being yanked back
  down every time new text arrives — and resume following just by
  scrolling back down themselves.
- `activeIndex` / `caretIndex` — find the first section that isn't fully
  shown yet (mirrors `deedStream.ts`'s `activeSectionId`, but by index here
  since it's needed to pass a boolean per rendered block); if every section
  is fully shown (`activeIndex === -1`), the caret belongs on the *last*
  section instead.

### `Caret`

```tsx
const Caret = () => (
  <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] animate-pulse bg-indigo-600 align-middle" />
);
```

**Job:** a tiny component rendering the blinking text-cursor bar, shown only
next to whichever section is actively being typed. `animate-pulse` is a
Tailwind utility that applies a CSS opacity-pulsing animation — this is pure
CSS, no JavaScript timer involved in the blinking itself.

### `DeedBlock`

```tsx
function DeedBlock({ section, showCaret, edited, onEdit, editable }: {...}) {
  const fullyTyped = section.shown >= section.target.length;
  const text = edited !== undefined && fullyTyped ? edited : visibleText(section);
  const isEditable = editable && fullyTyped && onEdit !== undefined &&
    ["preamble", "party", "recital", "clause", "schedule", "attestation"].includes(section.style);

  if (isEditable) {
    return <EditableBlock section={section} text={text} onEdit={onEdit!} />;
  }

  switch (section.style) {
    case "title": return <h1 ...>{text}{showCaret && <Caret />}</h1>;
    case "party-label": return <p ...>{text}{showCaret && <Caret />}</p>;
    case "operative-heading": return <h2 ...>{text}{showCaret && <Caret />}</h2>;
    case "schedule-heading": return <h2 ...>{text}{showCaret && <Caret />}</h2>;
    case "schedule-note": return <p ...>{text}{showCaret && <Caret />}</p>;
    case "clause": return (<div ...><span>{section.heading}.</span><p>{text}{showCaret && <Caret />}</p></div>);
    case "schedule": case "boundaries": return (<div ...>{section.heading && <p>{section.heading}</p>}<div>{text}{showCaret && <Caret />}</div></div>);
    case "signature-block": return <SignatureBlock section={section} text={text} showCaret={showCaret} />;
    case "witnesses": return (<div ...><p>{section.heading}</p><div>{text}{showCaret && <Caret />}</div></div>);
    default: return <p ...>{text}{showCaret && <Caret />}</p>;
  }
}
```

**Job:** render exactly one section, in the correct visual style for its
`style` tag — this is the per-section dispatcher, mirroring how the PDF
renderer (document 10) also switches on `style`, just with CSS instead of
ReportLab paragraph styles.
**Calls:** `visibleText` (from `deedStream.ts`), `EditableBlock`,
`SignatureBlock`.
**Line by line:**
- `fullyTyped` — has the animation finished revealing this section.
- `text` — if the user has edited this section **and** it's fully typed,
  show their edit; otherwise show whatever portion of the generated text
  the animation has currently revealed (`visibleText(section)`). The
  `fullyTyped` guard matters: an edit should never be shown *mixed into* an
  in-progress typing animation — editing only becomes possible once a
  section is finished and the "complete" phase makes the whole deed
  editable.
- `isEditable` — a section is only ever editable if the caller explicitly
  allows it (`editable` prop, true only once generation is fully complete),
  it's fully typed, an edit handler was actually provided, **and** its style
  is one of the prose styles (`preamble`, `party`, `recital`, `clause`,
  `schedule`, `attestation`) — deliberately excluding structural styles like
  `title`, `party-label`, `signature-block`, and `witnesses`, which are
  either single words/labels or contain their own specialised layout
  (signature + photograph box + fingerprint grid) that a plain text edit
  wouldn't make sense for.
- The `switch` then renders each style with its own JSX/Tailwind layout —
  clauses get a hanging-indent two-column look (number on the left, text
  flowing to the right), the schedule/boundaries styles preserve line
  breaks (`whitespace-pre-line`), and everything shows the blinking
  `<Caret />` only when `showCaret` is true for *this specific* section
  (computed by the parent as `index === caretIndex`).

### `EditableBlock`

```tsx
function EditableBlock({ section, text, onEdit }: {...}) {
  const isClause = section.style === "clause";
  return (
    <div className={...}>
      {isClause && <span ...>{section.heading}.</span>}
      <textarea
        value={text}
        onChange={(event) => onEdit(section.id, event.target.value)}
        rows={Math.max(2, Math.ceil(text.length / 78))}
        ...
      />
    </div>
  );
}
```

**Job:** render an editable section as a `<textarea>` that visually blends
in with the surrounding "paper" styling until the user actually interacts
with it (the hover/focus Tailwind variants reveal a border only then).
**Calls:** nothing; calls back `onEdit(section.id, newValue)` on every
keystroke, which ultimately reaches `page.tsx`'s `setEdits` state updater.
**Line by line:** `rows={Math.max(2, Math.ceil(text.length / 78))}` is a
rough auto-sizing heuristic — estimate how many lines the text will wrap to
at roughly 78 characters per line (a reasonable guess for this font/width
combination) and size the textarea tall enough to show it all without an
internal scrollbar, with a minimum of 2 rows so even a very short edited
sentence has comfortable room.

### `SignatureBlock`

```tsx
function SignatureBlock({ section, text, showCaret }: {...}) {
  return (
    <div ...>
      <p>{section.heading}</p>
      <div ...>
        <div>
          <p>Name: {text}{showCaret && <Caret />}</p>
          <p>Signature: ______________________________</p>
        </div>
        <div>Photograph</div>
      </div>
      {(["Right", "Left"] as const).map((hand) => (
        <table key={hand}>
          <tbody>
            <tr>{FINGERS.map((finger) => <td key={finger}>{finger}<br />of {hand} Hand</td>)}</tr>
            <tr>{FINGERS.map((finger) => <td key={finger} aria-label={...} />)}</tr>
          </tbody>
        </table>
      ))}
    </div>
  );
}
```

**Job:** render one full signature page — name, a blank signature line, a
photograph placeholder box, and a ten-cell grid (five fingers × two hands)
for thumb/finger impressions, exactly matching what the printed PDF also
produces (document 10), so the on-screen preview is an honest preview of the
download.
**Calls:** nothing; a leaf rendering component.
**Line by line:** `(["Right", "Left"] as const).map(...)` renders two
identical-structure tables, one per hand; each table has a header row naming
each of the five `FINGERS` and a second, empty row — the actual blank boxes
where an impression would physically go once printed — given an `aria-label`
rather than visible text since there's nothing to display, only a
screen-reader-friendly description of what the empty cell represents.

---

## `frontend/src/components/ExtractedFieldsForm.tsx`

### Why this file exists

This is the review-step UI — not part of the animation engine, but the last
unexplained component, and the direct predecessor to generation in the flow.
Its job: show every field the deed needs, grouped sensibly, pre-filled with
whatever was extracted, with groups that still have gaps opened by default
and complete groups collapsed out of the way.

### `ExtractedFieldsForm`

```tsx
export default function ExtractedFieldsForm({ fields, provenance, onChange }: ExtractedFieldsFormProps) {
  const missing = useMemo(() => new Set(missingRequiredFields(fields)), [fields]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => FIELD_GROUPS.map((group) => {
    const groupFields = SALE_DEED_FIELDS.filter((f) => f.group === group);
    return { group, fields: groupFields,
      missingCount: groupFields.filter((f) => missing.has(f.key)).length,
      filledCount: groupFields.filter((f) => String(fields[f.key] ?? "").trim()).length };
  }), [fields, missing]);

  return (
    <div>
      {groups.map(({ group, fields: groupFields, missingCount, filledCount }) => {
        const isOpen = expanded[group] ?? missingCount > 0;
        return (
          <section key={group}>
            <button onClick={() => setExpanded((current) => ({ ...current, [group]: !isOpen }))} ...>
              ...
            </button>
            {isOpen && (
              <div>
                {groupFields.map((field) => (
                  <FieldInput key={field.key} field={field} value={fields[field.key] ?? ""}
                    source={provenance[field.key]} isMissing={missing.has(field.key)} onChange={onChange} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
```

**Job:** group every field by its `group` name, compute how many in each
group are missing vs. filled, and render one collapsible section per group.
**Calls:** `missingRequiredFields`, `FieldInput`.
**Line by line:**
- `missing` — a `Set` (not an array) of missing field keys, computed once
  per `fields` change; a `Set` is used specifically because the render loop
  below needs fast `.has(key)` membership checks for every field, and a
  `Set`'s lookup is far cheaper than repeatedly calling `.includes()` on an
  array.
- `groups` — for each of the field catalogue's distinct group names
  (`FIELD_GROUPS`, from `caseTypes.ts`), filter down to just that group's
  fields and precompute its `missingCount`/`filledCount` — this is the data
  the header button's "3 still needed" vs. "8 of 8 filled" text and icon
  come from.
- `const isOpen = expanded[group] ?? missingCount > 0;` — this is the
  "complete groups collapse, incomplete groups open by default" behaviour.
  `expanded[group]` is `undefined` until the user has explicitly
  clicked that group's header at least once; until then, the `??` falls
  through to the default rule (`missingCount > 0`). Once the user *has*
  clicked a header, their explicit choice (`true`/`false`) is remembered and
  always wins over the default — the user's manual toggle is never silently
  overridden by this component re-rendering with the same data.
- Clicking the header toggles `expanded[group]` in state; the field inputs
  for a group render only while `isOpen` is true, each wrapped as a
  `FieldInput`.

### `FieldInput`

```tsx
function FieldInput({ field, value, source, isMissing, onChange }: {...}) {
  const wasExtracted = Boolean(source) && source !== "user";
  const shared = `...` + (isMissing ? "border-amber-500/60 ..." : "border-slate-700 ...");

  return (
    <div className={...}>
      <label htmlFor={field.key}>
        <span>{field.label}{field.required && <span>*</span>}</span>
        {wasExtracted && <span>extracted</span>}
      </label>
      {field.kind === "textarea" ? (
        <textarea id={field.key} value={value} rows={3} placeholder={field.placeholder}
          onChange={(event) => onChange(field.key, event.target.value)} className={shared + " resize-y"} />
      ) : (
        <input id={field.key}
          type={field.kind === "date" ? "date" : field.kind === "number" ? "number" : "text"}
          value={value} placeholder={field.placeholder}
          onChange={(event) => onChange(field.key, event.target.value)} className={shared} />
      )}
      {field.helpText && <p>{field.helpText}</p>}
    </div>
  );
}
```

**Job:** render exactly one field — label, the correctly-typed input element
(text, number, date, or multi-line textarea, decided by `field.kind` from
the shared `FieldDef` catalogue), visually flagged amber if it's missing,
and tagged "extracted" if its current value came from a scanned document
rather than the user's own typing.
**Calls:** nothing; calls back `onChange(key, value)` on every keystroke,
which is `page.tsx`'s `updateField`.
**Line by line:**
- `wasExtracted = Boolean(source) && source !== "user"` — `source` is the
  `provenance[field.key]` value, which is either a document id (extraction),
  the literal string `"user"` (manually typed/edited), or `undefined`
  (never touched at all). This is `true` only in the first case.
- `shared` — one base Tailwind class string reused by both the `<input>`
  and `<textarea>` branches, conditionally swapping the border colour to
  amber when `isMissing` — this is the visual cue the "Still needed" chips
  in `page.tsx` are reinforcing.
- The `type={...}` ternary chain picks the right native HTML input type for
  the field's declared `kind` — `date` gets the browser's native date
  picker, `number` gets numeric input affordances (and, on mobile, a numeric
  keyboard), everything else is plain text.
- Every change handler is the exact same one-liner:
  `onChange(field.key, event.target.value)` — this component never holds
  its own local copy of the field's value; it is a fully **controlled**
  input, meaning the displayed `value` always comes from the parent's
  `fields` state, and every keystroke immediately round-trips back up
  through `onChange` before the new character is actually shown. This is
  what keeps `page.tsx`'s `fields` state as the single source of truth, with
  no risk of this component's internal state and the parent's state ever
  disagreeing.

---

Next: **[05-backend-api-router.md](./05-backend-api-router.md)** — the
FastAPI endpoints all of this frontend code has been calling.
