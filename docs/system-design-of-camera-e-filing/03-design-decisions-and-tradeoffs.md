# 03 — Design Decisions and Trade-offs

Every decision below is a real decision made in this codebase, recorded in
full in [`DECISIONS.md`](../../DECISIONS.md) at the repository root. This
document doesn't repeat that file — it groups the decisions by the general
engineering *principle* each one teaches, so the lesson transfers to
whatever you build next, not just to this deed generator.

## Theme 1 — Correctness has a cost, and legal documents make you pay it explicitly

**The decision:** the deed's fifteen operative clauses are template-locked,
fixed Python strings; only three passages (two recitals, the Schedule
description) are ever AI-authored (`DECISIONS.md` decision 2).

**The general principle:** when the cost of being *occasionally* wrong is
asymmetric and severe — here, a clause that drifts between two
"generations" of the same deed is a clause that has to be re-registered,
at the parties' literal financial expense — you narrow the surface area
where a probabilistic system (an LLM) is allowed to act, down to exactly
the parts that are inherently bespoke and can't be templated in the first
place. You do not try to make the probabilistic system *more reliable*
until it's reliable enough for the whole document; you **redesign the
problem** so only a small, genuinely-variable slice of it needs that
system at all. This is a far more valuable instinct than "add more
validation to the AI's output" — validation can catch some errors, but it
can't catch a clause that's subtly, plausibly, wrong.

**The accepted cost:** the deed reads as less "AI-written" than a user
might expect. The recitals are genuinely AI-authored; the boilerplate
(which is what a human draftsman also just reuses from precedent, not
hand-writes fresh each time) is reliably correct instead.

## Theme 2 — A system that can fail must still produce a usable result

**The decisions, together:** generation falls back to precedent wording on
any AI failure, timeout, or stub answer (decision 3); extraction never
raises, always returning a well-formed (possibly empty-fielded) result
(implemented in `extract_from_document`, `camera-filing-explained/07`); the
PDF/DOCX export endpoints catch rendering exceptions and return a clean 500
with a message rather than crashing (`camera-filing-explained/05`).

**The general principle:** this is **graceful degradation**, and the
discipline behind it is deciding, *for every single dependency this system
has*, what the worst-case behaviour should be **before** that dependency
actually fails in production. "The AI is down" is not a hypothetical for a
feature with a real, metered, third-party dependency on a free hosting
tier — it is a certainty that will happen, repeatedly, and the question is
only whether the failure was designed for. Notice the test in
`DECISIONS.md` decision 3 that makes this concrete: *"a one-line answer is
treated as a failure too"* — graceful degradation isn't just a
try/except around the obvious crash; it requires defining what "good
enough" output actually means (25+ words, per `stream.py`'s quality gate)
and treating anything short of that the same as an outright failure,
rather than quietly shipping a degraded-but-technically-successful result.

**The accepted cost:** two wording paths (AI and template) to maintain and
keep legally equivalent in tone, forever, as the deed's structure evolves.

## Theme 3 — Perceived performance is not the same thing as actual performance

**The decisions, together:** the typing animation is paced by the client,
not by packet arrival (decision 4); the AI call is started in a background
thread and only joined when its result is actually needed, overlapping its
latency with the deterministic walk the user is already watching (decision
5).

**The general principle:** a user's experience of "how fast was this" is
governed by what they *perceive*, which is a function of *when things
become visible*, not strictly of total wall-clock time. Two systems that
both take exactly 6 seconds to fully complete a deed can feel wildly
different: one shows a blank spinner for 6 seconds then dumps the whole
result; the other shows the title and party names within half a second and
is still visibly writing when the 6 seconds are up. The second one is
*not* faster — it is **differently paced**, and that pacing was a deliberate
design decision (the character-per-tick acceleration curve in
`deedStream.ts`'s `charsPerTick`), not an incidental side effect of how SSE
happens to deliver data. This generalizes far beyond this one feature:
any long-running operation with incremental partial results (a search, a
file upload, a batch job) benefits from the same question — *what is the
very first thing we can show the user, and how do we keep something
visibly happening for the full duration, even if the underlying work
finishes early or arrives in bursts.*

**The accepted cost:** real engineering complexity — two parallel
"clocks" (content arrival and content reveal) that have to be reconciled
without ever showing content out of order or losing a byte at a chunk
boundary. This is exactly why `deedStream.ts`'s functions are kept pure and
independently unit-tested (per `camera-filing-explained/04`) — this kind of
timing-sensitive logic is precisely where an untested implementation tends
to grow subtle bugs that only show up under real network jitter, which is
hard to reproduce in manual testing.

## Theme 4 — Where you put the "truth" about a field value should match who actually knows it

**The decisions, together:** extraction prompts are scoped per document,
with identifiers re-derived from raw text by pattern rather than trusted
from the model's structured answer (decision 7); Aadhaar is masked at the
point of extraction, not at render time (decision 8); the PDF renders
exactly the sections the user approved, never a fresh re-generation
(decision 9).

**The general principle:** for each piece of data flowing through a
system, ask "what is the single most trustworthy source for this value,
and at what point does that trust actually get established?" — then do the
real work (validation, masking, finalization) **at that exact point**, not
later and not earlier. Decision 7's insight is sharp specifically because
it identifies that a vision model's own *structured* answer and its *raw
transcription* are not equally trustworthy for an identifier number, even
though they come from the same model call — the raw text is closer to the
actual pixels, the structured field is one more inferential step removed
and therefore one more place for a plausible-but-wrong answer to sneak in.
Decision 8's "mask at the boundary, not at render" is the same idea applied
to security: the trust boundary for "should a full Aadhaar number exist in
memory/logs/responses at all" is crossed exactly once, at extraction, so
that's where the irreversible operation (masking — you cannot un-mask it
later) happens; masking at render time would leave the full number
exposed in every layer *before* the render, which defeats the purpose.
Decision 9 is the same principle for a very different kind of "truth":
once a human has looked at and approved a generated document, *that
approved text* is now the most trustworthy version of the deed — more
trustworthy than a fresh AI regeneration, even though the fresh generation
might use the exact same inputs, because a non-deterministic model called
twice is not guaranteed to produce the same output twice.

**The accepted cost:** decision 7 means a particular glimpsed on an
unexpected document type is never captured (acceptable: the user can still
type it in manually). Decision 9 means the exported PDF can diverge from
`fields` if the user edited the on-screen text — which is not a bug, it is
*the entire point*: what's exported is what was approved, not what the
fields alone would currently produce.

## Theme 5 — Duplication is sometimes the correct answer, if you can state exactly why

**The decision:** the document checklist and field catalogue are
maintained as two independent, hand-written copies — one in TypeScript, one
in Python (decision 12).

**The general principle:** "don't repeat yourself" is a good default, not
an absolute law. It optimizes for one failure mode (two copies drifting
apart) at the cost of another (a hard dependency that makes the first
consumer's load-time depend on the second consumer's availability). This
codebase picked duplication **because it correctly diagnosed which failure
mode mattered more for its actual constraints**: a free-tier backend with
a two-minute cold start would make the checklist — the very first thing
the page needs to paint — depend on that slow backend being awake, if the
data lived only server-side. The *right* question when you see
duplication in a codebase is never "is this duplicated" but "was the
cost of *not* duplicating actually higher, here, for this specific
constraint" — and, just as important, **"is there a cheap way to catch
drift if it happens anyway"** — which is exactly what the test suite's
"both sides assert the same invariants" does here (decision 12's own
stated mitigation).

**The accepted cost, stated explicitly in `DECISIONS.md` itself:** "If a
third consumer appears, this should move to a generated artefact." This is
the single most useful sentence in the whole decisions log to internalize
as a habit — **a trade-off is not a permanent verdict; it's a decision
that was correct for a stated set of conditions, with an explicit trigger
for when to revisit it.**

## Theme 6 — Scope deliberately, and say so

**The decision:** `DRAFTABLE_CASE_TYPES` contains only `"Sale Deed"` —
Divorce Case keeps its older, simpler "upload and submit" flow untouched
(decision 13).

**The general principle:** the single highest-leverage thing a feature's
scope can do is *not* try to generalize to a second case before the first
one has a real, vetted reference to build against. `DECISIONS.md` is
explicit about *why*: there is a reference document (`Sale-Deed.pdf`) that
is the model draft this whole generator was built to match; there is no
equivalent reference for a divorce petition, and "inventing one would
produce a document nobody vouched for." This is a discipline worth
naming directly: **generalizing a system ahead of having a second concrete,
validated case to generalize *from*** tends to produce an abstraction
shaped by guesswork rather than by evidence — and for a legal document
specifically, an unvetted abstraction is actively worse than a narrower
tool that's honest about what it doesn't do yet.

## Theme 7 — Test what's actually deterministic; don't try to test the model's taste

**The decision:** 140 backend tests, every Gemini call mocked, asserting
structure/formatting/precedence/degradation paths — explicitly **not**
asserting that the AI's prose reads well (decision 14).

**The general principle:** a test should assert something that is either
true or false, reliably, forever (until the code changes on purpose).
"Is this clause's wording good" is not that kind of question for a system
with a non-deterministic model in the loop — it's a judgment call, and
encoding judgment calls as automated assertions either produces tests that
are flaky for reasons unrelated to actual bugs, or tests so loose they
catch nothing. The correct target for automated testing here is everything
*around* the model that **is** deterministic: given this mocked AI
response (or this mocked AI *failure* — the explicitly-called-out test
category), does the merge logic, the clause numbering, the currency
formatting, the SSE framing, the PDF page count come out right, every
time, byte for byte. Decision 15's "a real bug the tests caught" — the
`parse_amount` currency-parsing bug from `camera-filing-explained/07` — is
offered as the concrete proof this discipline pays for itself: that bug was
exactly the kind of deterministic, specification-shaped error ("Rs.
45,00,000/- should parse to 4,500,000, not 0.45") that a focused unit test
catches immediately and permanently, and it would never have been caught
by "does the AI's prose sound good," because the amount was wrong *before*
the AI ever saw it.

Next: **[04-failure-modes-and-resilience.md](./04-failure-modes-and-resilience.md)**.
