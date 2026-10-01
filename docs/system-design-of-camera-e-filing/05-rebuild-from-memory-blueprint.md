# 05 — Rebuild-From-Memory Blueprint

This is the document for the goal stated at the top of this whole
documentation effort: if Camera Filing vanished tomorrow, could you sit
down and re-code it, end to end, from understanding rather than from
having memorised source text? This isn't a copy of the code to re-type —
it's the **order of decisions** you'd need to re-make, with a self-check
for each one, so you can verify you reconstructed the *real* design and not
just a plausible-looking alternative.

Work through this top to bottom. Each step names the decision, the
question that forces you to re-derive it, and how to check your answer
against what you now know of the real system.

---

## Step 1 — What does the user actually need to walk away with?

**Re-derive:** a court-ready, print-and-register-ready Sale Deed, as a PDF,
built from documents the user photographs. Before writing any code, state
the non-negotiable output in one sentence — everything else in the system
exists to serve that sentence.

**Self-check:** if your one sentence doesn't mention *print-ready* and
*register-ready* specifically (not just "a PDF"), you'll under-design the
PDF layer later (margins, signature pages, thumb impressions) and have to
retrofit it. The reference artefact (`Sale-Deed.pdf` at the repo root) is
what anchors every structural and wording decision downstream — without a
concrete reference to match, every clause and layout choice becomes a
guess. **Get or create a reference document for whatever legal instrument
you're building, before writing the generator.**

## Step 2 — What has to be true of the UI's data model, before any code?

**Re-derive:** two catalogues need to exist before a single screen can be
built: *what documents does the user need to bring* (the checklist), and
*what fields does the final document need* (the field schema). Ask
yourself: are these the same list? (They're not — a document yields
several fields; a field can be yielded by more than one document type.)

**Self-check:** if you modelled "document" and "field" as the same thing,
you will not be able to express "this document is authoritative for these
three fields" later, which is exactly the information the extraction-merge
logic depends on. Re-derive the `extracts: [field_key, ...]` relationship
explicitly as a property of each checklist document, not the other way
around.

**Decision to re-make and justify to yourself:** should this catalogue
live only on the server, or be duplicated to the client? Re-derive the
cold-start/first-paint argument from document 03's Theme 5 before deciding
— don't just copy "duplicate it" as a rule; know *when* you'd duplicate
versus when you'd fetch it.

## Step 3 — What's the state machine, and what state does NOT belong in it?

**Re-derive:** draw the flow states by listing every visually distinct
screen the user sees (checklist → capture → processing → review →
generating → done), and separately, deliberately decide what does **not**
get its own top-level state — specifically, the generation sub-phases
(connecting/writing/complete/error). Ask: why would those deserve a
*nested* machine instead of six more top-level states?

**Self-check:** if your flattened list has combinatorial-looking names
(`GENERATING_WRITING_WITH_ERROR`), you've conflated two independent
concerns that should nest. The rule to re-derive: a sub-machine belongs
inside a state when its transitions only make sense *while* the outer
machine sits in that one state, and the outer machine never needs to react
to the sub-machine's fine-grained detail — only to whether it's
"done" / "still going" / "failed."

**Decision to re-make:** where does this state live — one component's
`useState` calls, or some external state-management library? Re-derive
the answer from the actual complexity: six states, a dozen handlers, no
cross-cutting concerns needing global access. That scale doesn't justify
a state library; it would at ~20+ states or multiple components needing to
react to the same state independently.

## Step 4 — Capture: camera-first, with a fallback that's not an afterthought

**Re-derive:** the browser camera API (`getUserMedia`) can fail for
reasons entirely outside your control — no camera, permission denied,
desktop browser. Before writing the happy path, decide: what is the
*fallback*, and is it a dead end or a fully-functional alternate path?

**Self-check:** if "upload a file instead" is bolted on as an error
message rather than a fully-supported parallel entry point (its own button,
not just a catch-block message), you've under-designed this. Re-derive:
both camera-capture and file-upload should converge on the exact same
downstream function (one `extractFromImage`-shaped call), taking the same
blob/mime-type/filename shape, so neither path is second-class.

**Decision to re-make:** camera capture needs an actual still frame, not
just a feed. Re-derive the technique: draw the live `<video>` frame onto a
hidden `<canvas>`, then export the canvas as an encoded image blob. If you
didn't arrive at "hidden canvas as the capture mechanism," you don't yet
have a working camera-capture flow, you have a video player.

## Step 5 — Extraction: scope the prompt, then trust-but-verify the model

**Re-derive, in order:**
1. A vision model asked to extract *everything* from *every* document will
   have lower recall and higher hallucination risk than one asked to
   extract a *specific, short list of fields from one named document type*.
   Re-derive: the checklist's `extracts` list per document is what makes
   this scoping possible — this is why step 2's data model had to exist
   first.
2. For which specific fields is "the model confidently returns something
   plausible but wrong" worse than "the model returns nothing"? Re-derive:
   identity numbers (PAN, Aadhaar) — a *transposed* digit is worse than a
   blank, because a blank gets caught at review and a transposed digit
   might not.
3. Given (2), what's the fix? Re-derive: ask the model for the verbatim
   text it read, in addition to its structured answer, and **independently
   re-derive the identifier from that raw text using a pattern match** —
   then prefer the pattern match on disagreement. This is not obvious if
   you only think "the model might be wrong, so validate its answer" — the
   actual insight is "the model's *raw transcription* is more trustworthy
   evidence than its own *structured inference* from that transcription,"
   which is a subtler and more specific claim.

**Self-check:** if your extraction design doesn't have a raw-text field in
the model's response schema, you have no way to implement step 5.3's
rescue at all — re-derive that the raw text has to be requested
*deliberately*, it's not something you get "for free."

**Decision to re-make:** should extraction happen as the user captures
each document, or in one batch at the end? Re-derive from the actual
constraint: a slow or resource-limited backend handling N sequential model
calls in one request risks timing out; one call per request, fired the
instant each document is ready, bounds each request's worst case to a
single model call and gives the user feedback in seconds. This is not
about user experience alone — it's a direct consequence of a hosting/
timeout constraint that should be stated explicitly, not assumed.

## Step 6 — Merging: decide precedence *before* you need it

**Re-derive:** once documents are extracted independently, their fields
need folding into one set. When two documents both report a value for the
same field, who wins? Re-derive the answer from step 5's data model: a
document that *declared* a field as one it owns (its `extracts` list) is
more trustworthy for that field than a document that happened to mention
it incidentally. Among equally-declared documents, what breaks the tie?
Re-derive: there's no principled way to prefer one over the other without
more information, so the simplest deterministic rule — first processed
wins — is the honest answer, not a cop-out.

**Self-check:** if your merge logic doesn't distinguish "authoritative"
from "incidental" at all, re-derive why that's wrong using a concrete
example: a purchaser's Aadhaar card happens to show the vendor's name
somewhere (a joint document, a witnessed signature) — without the
authoritative distinction, that incidental mention could silently
overwrite a correct, deliberately-declared value from the vendor's own ID
card, depending on arbitrary processing order.

## Step 7 — The document itself: separate what's fixed from what's bespoke

**Re-derive, from the reference document:** read through it and classify
every paragraph as either (a) identical in substance to what any
conveyance of this type would say, or (b) genuinely specific to *this*
transaction's facts. Re-derive: (a) becomes fixed Python/code strings with
field values interpolated; (b) is the **only** candidate for AI
authorship.

**Self-check:** if you find yourself wanting the AI to write more than
~3-4 passages, re-examine your classification — you likely mis-classified
something as "bespoke" that's actually boilerplate with just a name or
number substituted in, which belongs in category (a) with field
interpolation, not handed to a model. The entire resilience story of this
feature (document 04) depends on category (a) being large and (b) being
small — re-derive why: (a) never fails, by construction; minimizing (b)
minimizes the system's total exposure to AI unavailability.

**Decision to re-make, for every fixed clause:** what happens to this
clause's wording if a referenced field is missing? Re-derive case by case
— sometimes the right answer is a visible blank fill-line (a party's name
must appear, blank or not); sometimes it's dropping an entire optional
sentence cleanly (a payment-method clarification that doesn't apply if no
payment method was recorded). Getting this distinction right, clause by
clause, is what keeps the output always reading as *grammatically complete
legal prose*, not a form letter with visible `{{placeholder}}` syntax
showing through.

## Step 8 — Making generation feel "live" without lying about timing

**Re-derive the core tension:** some content (the fixed skeleton) is ready
instantly; some content (the AI passages) takes several real seconds.
Naively, you'd generate everything, then send it all, then animate it on
the client — ask yourself what's wrong with that. Re-derive: the user
would stare at nothing for however long the AI call takes, *in front of*
the part that didn't need to wait at all.

**Re-derive the fix, in two parts:**
1. **Overlap, don't sequence.** Start the slow, uncertain work
   concurrently with the fast, certain work, and only block on the slow
   work's result at the exact moment you've run out of fast work to show.
   Re-derive the mechanism: a background thread/task started immediately,
   joined only when the walker reaches the first AI-dependent section —
   by which point several seconds of real time have already elapsed
   showing other content.
2. **Separate arrival from reveal.** Content arriving over a network
   arrives in bursts, not at a steady human-readable pace. Re-derive: buffer
   everything that arrives into a "target" value; separately, on every
   animation frame, reveal some bounded number of characters from the gap
   between what's arrived and what's shown — accelerating only when that
   gap grows large, so a backend that finishes "too fast" doesn't force the
   user to watch a multi-minute typewriter crawl to catch up.

**Self-check:** if your design renders text the instant a network chunk
arrives, you have *not* built the "live writing" effect — you've built a
network-jitter visualizer. The single test to apply: does your design
behave sensibly if the *entire* backend response arrived in one chunk,
instantly? If the honest answer is "it would just dump all the text on
screen at once," you haven't actually separated arrival from reveal yet.

## Step 9 — Rendering the same content three independent ways

**Re-derive:** the generated deed needs to appear (a) live, animated, on
screen, (b) as a print-ready PDF, (c) as an editable DOCX. Ask: should
these three share one rendering engine?

**Self-check and the honest answer:** probably not, and re-derive why —
a browser's CSS/DOM, ReportLab's flowable-and-frame model, and
python-docx's mutate-a-document-in-place model are different enough that
forcing one shared abstraction across all three would likely be *more*
code and *more* indirection than three focused renderers. What **should**
be shared, and must be re-derived as a deliberate contract, is the
*vocabulary* each renderer switches on — a small, named set of section
"styles" (title, clause, recital, signature-block, ...) that each
renderer independently maps to its own native layout primitives. Write
this vocabulary down somewhere all three renderers' authors (even if
that's just you, at three different times) can check against — this is
the exact coupling point document 02's section 6 calls out as the known,
accepted cost of this design.

## Step 10 — What goes wrong, and does the system still produce an output?

**Re-derive, for every external dependency you've introduced** (the AI
vision model, the AI text model, the camera API, the network to your own
backend): what is the worst case, and what should the system do instead of
crashing? Write the answer down *before* you've seen it fail in practice,
not after.

**Self-check — the single sharpest test of whether you actually
internalized this feature's design, not just its code:** can you answer,
from memory, exactly what a user ends up holding if **every** AI call
fails for their entire session, start to finish? If your answer is
anything other than *"a complete, court-ready PDF, fully hand-typed and
template-worded, with zero AI involvement anywhere"* — you have rebuilt a
feature that depends on its AI vendor being up. The real Camera Filing
feature does not, and that is its most important property.

---

## Using this blueprint

Don't read this once and consider the exercise complete. The actual test:
close every file in `docs/camera-filing-explained/` and the real source
code, and try to narrate steps 1 through 10 out loud, in your own words,
filling in the *why* at each step without looking anything up. Wherever you
get stuck or your answer feels like a guess rather than a derivation,
that's exactly the spot to go re-read — not the whole feature again, just
that one step's corresponding file in `camera-filing-explained/`. That
targeted gap-filling, repeated a few times, is what turns "I read this
once" into "I could rebuild this."
