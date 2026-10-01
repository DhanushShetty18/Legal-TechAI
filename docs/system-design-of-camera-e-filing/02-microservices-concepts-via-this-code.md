# 02 — Real Microservices Architecture Concepts, Taught Through This Code

**Important framing before anything else:** Legal-TechAI's backend is a
**monolith** — one FastAPI process, one deployable unit, on Render. It is
**not** a microservices system. Nothing in this document claims otherwise.
What it *does* claim is that this one monolith is internally organised
along the same **seams** a microservices system would be split along — and
that studying those seams here, in code you can read start to finish in an
afternoon, teaches the real architectural concepts faster than reading
about a sprawling multi-service system would. Each section below states
the general concept, shows exactly how (or whether) this code embodies it,
and — this is the part a purely theoretical explanation can't give you — is
explicit about **where the real thing is currently missing**, and what
would have to change to add it. Treat the gaps as a design exercise, not a
criticism of the current code: a Camera Filing feature for a single-firm
tool genuinely does not need multi-tenancy or a message queue yet. Knowing
*when* you'd need them is the actual skill.

---

## 1. Frontend → API Gateway → AI/ML Engine separation

### The general concept

In a system built as true microservices, you typically see three distinct
tiers:

- A **client** (web, mobile, whatever) that renders UI and holds no
  business logic.
- An **API gateway** — a single, stable entry point that clients talk to.
  It handles cross-cutting concerns (auth, rate limiting, routing a request
  to the right backend service, request/response shaping) and hides the
  fact that there might be a dozen different services behind it.
- One or more **backend services**, each owning one concern. An "AI/ML
  engine" service, specifically, is usually split out because it has a
  different operational profile from the rest of the backend: it's
  slower, it costs money per call, it needs its own rate limiting against
  the AI vendor's quota, and it benefits from being scaled (or
  cached, or swapped to a different model) independently of, say, the
  user-authentication service.

### How this code maps onto that

| Tier | In this codebase |
|---|---|
| Client | `frontend/` — Next.js app, zero business logic, only UI + state machine |
| API gateway | `backend/main.py` + `routers/drafting.py` — **this single FastAPI app plays both the gateway role and the backend-service role** |
| AI/ML engine | `modules/gemini.py`, and the two call sites in `modules/drafting/extraction.py` and `stream.py` |

The separation *exists* — it's just folded into one process instead of
split across two deployments. You can see the seam precisely at the import
boundary: **`modules/gemini.py` is the only file in the entire backend that
imports `google.generativeai`.** Every other file that needs AI capability
— `extraction.py`, `stream.py` — goes through functions this one module
exposes (`extract_json`, `retry_on_failure`) or, for the actual model calls,
constructs a `genai.GenerativeModel` locally but always following the same
shape those two call sites establish. If Legal-TechAI swapped Gemini for a
different vendor tomorrow, or needed to split the AI calls into their own
deployable service for cost or scaling reasons, the blast radius is
contained to `gemini.py` plus the handful of call sites that import it — not
smeared across the router, the generator, or the frontend.

**What real separation would look like, concretely:** promote
`modules/gemini.py`'s responsibilities into their own FastAPI app (or AWS
Lambda, or whatever), give it its own URL, and have `extraction.py`/
`stream.py` call it over HTTP instead of importing it as a Python module.
The function signatures of `extract_from_document` and `author_narrative`
would barely change — you'd be swapping an in-process function call for an
HTTP call, which is exactly the kind of refactor a *well-drawn module
boundary* (what this codebase already has) makes mechanical instead of a
rewrite. **This is the actual value of the separation, even collapsed into
one process**: it's a seam you can cut along later without redesigning
anything.

**Why it isn't split today, and why that's a reasonable call, not a
shortcut:** running the AI calls in-process means one deploy, one log
stream, no network hop and no second service's cold-start to wait on, and
no need to solve service-to-service auth. For a single-backend feature
calling one AI vendor, the operational cost of a second service would
likely exceed its benefit. You'd reach for the split once you had a second,
*independent* reason to scale or iterate on the AI layer separately — e.g.
multiple products sharing one inference service, or needing a different
deployment cadence for model-prompt changes versus application code.

---

## 2. How different services talk to each other (REST APIs)

### The general concept

Independent services need an agreed-upon way to exchange data without
sharing code or a process. **REST over HTTP** is the dominant convention:
each resource has a URL, each operation maps to an HTTP verb (`GET` to
read, `POST` to create/act, etc.), requests and responses are a
self-describing format (JSON, here), and — the property that matters most
for *scaling* a system — each request is **stateless**: the server doesn't
need to remember anything about a previous request from the same client to
answer the next one. Statelessness is what lets you run ten identical
copies of a service behind a load balancer with no coordination between
them; any instance can answer any request.

### How this code embodies it

Every endpoint in `routers/drafting.py` (full breakdown in
`camera-filing-explained/05`) is a REST-ish contract: `GET /case-types`
reads data, `POST /extract` performs an action and returns a result,
`POST /generate` is the one endpoint that deviates from "request → single
response" into a streaming connection (covered on its own below). Crucially,
**every single endpoint is stateless**: look at `/merge` — it does not say
"continue the session for user X"; the frontend sends the *entire* current
set of per-document results in the request body, every single time, and
the backend computes the merge fresh and forgets it the instant the
response is sent. There is no session object anywhere in this backend for
this feature. This is *why* `page.tsx` has to hold `documentStates`,
`fields`, and `provenance` all in its own React state and resend the
relevant slice of it on every call — the backend has deliberately been
given nowhere to keep that state instead.

**The one endpoint that bends the "REST" picture**: `POST /generate` isn't
request-response at all, it's SSE (document 09 of the beginner folder,
prerequisites A8). This is a deliberate, scoped exception, not a
contradiction of "REST" as a philosophy — the endpoint still statelessly
accepts everything it needs (`fields`) in one request body; it just chooses
to stream its *response* progressively instead of returning it in one
shot. **This is a real, common pattern at service boundaries**: most of a
system's endpoints are plain request/response, and the handful that need
to push incremental updates (a live feed, a long-running job's progress) use
SSE or WebSockets — you don't redesign the whole API around the exceptional
case.

**What would change talking to multiple real services:** right now,
`routers/drafting.py` calls `modules/drafting/*` functions directly, in the
same process, with no network involved — a Python function call, not an
HTTP request. If `modules/gemini.py`'s responsibilities became a separate
service (per section 1), `extraction.py` would need to become an HTTP
*client* — handling its own timeouts, retries over the network (not just
retries over a flaky AI vendor call, but now also over a flaky network hop
to your own other service), and serialization. This is exactly the kind of
complexity a monolith sidesteps, and exactly why "should this be its own
service" is a cost/benefit question, not a default.

---

## 3. Multi-tenancy (data isolation for different users / courts)

### The general concept

**Multi-tenancy** means one running system serves multiple distinct
customers ("tenants" — could be different law firms, different courts,
different users), and a tenant must **never** be able to see or affect
another tenant's data, even though they're sharing the same infrastructure.
The standard mechanisms: every row in every table carries a `tenant_id` (or
`user_id`, `court_id`) foreign key; every query is scoped by it
(`WHERE tenant_id = :current_tenant` on *every single query*, enforced
structurally, not left to each developer to remember); authentication
establishes *who* the current tenant is; and authorization checks that the
authenticated tenant actually owns whatever resource they're trying to
touch.

### How this code handles it today — honestly: it doesn't, yet

This is the one concept in this list where the code should be read as "not
implemented," not "implemented differently." Evidence, directly from the
code:

- `page.tsx`'s `handleFinalSubmitAll` posts to `"/cases/?user_id=1"` — a
  **hardcoded** user id. There is no login, no session, no concept of "the
  current user" anywhere in the Camera Filing flow.
- The entire drafting pipeline — `/extract`, `/merge`, `/generate`,
  `/export/pdf` — takes **no** tenant or user identifier as a parameter at
  all. A field set posted to `/drafting/generate` belongs to whoever
  happened to send that HTTP request, full stop; the backend has no way to
  even ask "whose deed is this."
- There is no database table backing a Camera Filing session at all (per
  document 01's "where state lives" section) — so there is nothing to
  *isolate* yet, because nothing is persisted to begin with.

**What this means in practice today:** this feature is safe to run as a
single-tenant tool — one firm, one deployment, trusted users — because
nothing in it currently distinguishes between users at all. It would be
**actively unsafe** to put two unrelated law firms' users on the same
deployment of this backend as it stands today, because there is no barrier
stopping one user's request from looking like any other's.

### What real multi-tenancy would require here, concretely

1. **Authentication** — some way to know who's calling (a session cookie,
   a JWT bearer token, an API key) attached to every request. None of the
   `/drafting/*` endpoints currently read anything like this.
2. **A `tenant_id` (or `firm_id`, or `court_id`) carried on every request**
   — either derived from the authenticated user, or passed explicitly if
   serving multiple courts/firms from one login system.
3. **If a database were added to persist drafts** (see document 04's
   note on no-persistence as a limitation): every table would need a
   tenant/user foreign key, and — the part that's easy to get wrong —
   **every single query function would need to filter by it**. The
   disciplined way to do this is to never write a raw "get draft by id"
   function at all; only ever write "get draft by id *for this tenant*,"
   so there is no code path that can accidentally skip the filter. A
   Sub-Registrar's office or a second law firm using the same deployed
   instance must never be able to request another tenant's draft by
   guessing or incrementing an id.
4. **Scoping extraction and generation themselves**, not just storage —
   even without persistence, if this became a shared multi-tenant service,
   each `/drafting/generate` call's rate limiting, cost attribution (whose
   AI usage is this?), and any per-tenant feature flags (maybe one firm
   gets Lease Deed drafting before others) would all need the same
   tenant-identity thread running through every request that
   authentication/authorization now establishes.

The lesson this absence teaches, worth internalizing explicitly: **stateless
REST design (section 2) and multi-tenant data isolation are separate
concerns that are easy to conflate.** This backend is a clean example of
one without the other — perfectly stateless, zero tenant isolation, because
it was never asked to serve more than one trust boundary. Don't assume a
well-factored stateless API is automatically safe to expose to multiple
untrusted tenants; that's a distinct piece of design that has to be added
on purpose.

---

## 4. State machines — the Camera → OCR → Document flow, formally

### The general concept

A **state machine** is a system that is, at any moment, in exactly one of a
finite set of named states, and moves between them only via defined
**transitions**, usually triggered by an event. Formalising a flow this way
buys you two things: it's impossible to be in an invalid combination of
"flags" (no state machine, just booleans, tends to eventually produce an
impossible combination like "uploading AND submitted AND idle" all true at
once), and the *allowed* transitions document themselves — you can draw the
whole flow as a diagram and anyone can see, at a glance, what can happen
next from any given point.

### This code's two state machines

**The frontend flow** (`page.tsx`'s `FlowState`, fully walked in
`camera-filing-explained/01` and `02`):

```
         ┌────────────────────────────────────────────┐
         │                                              │
         ▼                                              │
     ┌───────┐  start camera/upload   ┌─────────┐  capture/select  ┌────────────┐
     │ IDLE  │────────────────────────▶ CAPTURE │──────────────────▶ PROCESSING │
     └───────┘                        └─────────┘                  └──────┬─────┘
         ▲                                 │ cancel                        │ done
         └─────────────────────────────────┘                               │
         ▲                                                                 │
         └─────────────────────────────────────────────────────────────────┘
         │ click "Review"
         ▼
     ┌────────┐  click "Generate"   ┌────────────┐
     │ REVIEW │─────────────────────▶ GENERATING │──(terminal; "start new filing" → IDLE)
     └────────┘                     └────────────┘
```

**The generation sub-machine** (`useDeedGeneration.ts`'s `GenerationPhase`,
nested *inside* the `GENERATING` state above):

```
  idle → connecting → writing → complete
                  │                 ↑
                  └──────→ error ───┘ (retry re-enters connecting)
```

Notice these are **two separate state machines, nested** — `GENERATING` is
one state of the outer machine, and while the outer machine sits in that
one state, an entirely separate inner machine (`idle`/`connecting`/
`writing`/`complete`/`error`) is independently tracking the finer-grained
progress of the live stream. This is a common and useful pattern: don't
try to cram every possible nuance into one flat list of states (`IDLE`,
`CAPTURE`, ..., `GENERATING_CONNECTING`, `GENERATING_WRITING`,
`GENERATING_COMPLETE`, `GENERATING_ERROR`, ... — this flattening explodes
combinatorially the moment two independent concerns need tracking at once);
instead, nest a sub-machine inside the state where it's actually relevant,
and let the outer machine stay oblivious to the sub-machine's internal
detail — `page.tsx` only ever reads `generation.phase` as a value, never
needing to know the inner machine's transition rules itself.

**Why TypeScript's union type matters here specifically**: `type FlowState
= "IDLE" | "CAPTURE" | ...` isn't just documentation — the compiler
actively rejects assigning any other string to a `FlowState` variable, and
a `switch`/`if` chain comparing against it gets narrowed type-checking
(prerequisites, document 00, section A4). This is a cheap, real enforcement
mechanism for "this variable can only ever be one of these named states" —
far cheaper than building an actual state-machine library/framework, and
sufficient for a flow this size. A system with many more states, or states
whose *transitions themselves* carry complex guard logic, would outgrow this
quickly and benefit from a dedicated state-machine library (XState is the
common choice in the React ecosystem) that can validate transitions and
even generate the diagram above automatically from code.

**What's notably absent, and would matter at larger scale:** nothing
*enforces* that a transition is legal beyond "whatever `setFlowState(...)`
call happens to run." Nothing stops a bug from calling `setFlowState("GENERATING")`
directly from the `IDLE` state, skipping `REVIEW` entirely, for instance —
the type system guarantees the *value* is valid, not that the *transition*
was reached through a legal path. A true state-machine library enforces
both: you'd define the complete transition table up front
(`IDLE: { START_CAPTURE: "CAPTURE" }`, etc.) and an illegal transition
request would be rejected or ignored rather than silently succeeding. For
six states and a handful of handlers, the current lightweight approach is
proportionate; it would stop being proportionate at double-digit states
with cross-cutting guard conditions.

---

## 5. Designing for high throughput and reliability

### The general concept

Two related but distinct goals: **throughput** is how much work a system
can get through per unit time; **reliability** is whether it keeps working
correctly when something downstream of it (a dependency, the network) is
slow, flaky, or fully down. Standard techniques: **timeouts** (never wait
forever on anything), **retries** (transient failures often succeed on a
second attempt), **circuit breakers / graceful degradation** (when a
dependency is reliably failing, stop hammering it and fall back to a
reduced-but-working mode instead), **backpressure / rate limiting** (don't
accept more work than you can actually process), and **concurrency control**
(don't let unrelated work block on each other unnecessarily).

### Every one of these appears in this codebase, by name, in a specific line

| Technique | Where, specifically |
|---|---|
| Timeouts | `lib/api.ts`'s `COLD_START_TIMEOUT_MS` + `AbortController` on `postJson`/`postForm`; `stream.py`'s `NARRATIVE_TIMEOUT_SECONDS` capping how long the walker waits on the AI call |
| Retries | `gemini.py`'s `retry_on_failure` decorator, applied to every Gemini call site |
| Graceful degradation (a form of circuit breaking, applied per-call rather than tripped-and-held-open) | `stream_document`'s `except Exception` around `pending.result(...)`, falling back to template wording; `extract_from_document`'s `except Exception` returning an empty-fields result instead of propagating |
| Backpressure / rate limiting | `routers/drafting.py`'s `MAX_UPLOAD_BYTES` (12MB) and `MAX_UPLOADS_PER_REQUEST` (12) caps |
| Concurrency control | `stream.py`'s `ThreadPoolExecutor(max_workers=1)` running the AI call *alongside* (not blocking) the deterministic section walk |

**The one worth dwelling on, because it's the feature's signature
engineering move**: `stream_document`'s background-thread overlap
(`camera-filing-explained/09`, and `DECISIONS.md` decision 5) is a
**latency-hiding** technique, a close cousin of real-world patterns like
prefetching or speculative execution — do the slow, uncertain work
*concurrently* with work that's guaranteed fast and necessary anyway,
rather than sequentially in front of it. The throughput benefit is
indirect but real: because the AI call is usually already finished by the
time its result is needed, the *perceived* latency of a full deed
generation is close to the length of the deterministic walk plus whichever
of (remaining AI wait, zero) is larger — not the sum of both, which is what
a naive sequential implementation ("call the AI, wait, *then* start
building the response") would cost every single time.

**What this code does *not* currently do, that a system under genuinely
high load would need:** there is no caching layer (every `/drafting/extract`
call pays for a fresh Gemini Vision call, even for visually identical
inputs — not generally re-triggerable here since each photo is unique, but
worth naming as a technique that doesn't apply by coincidence, not because
it was rejected), no connection pooling concerns beyond what `requests`/
`httpx`/the Gemini SDK already manage internally, and no horizontal-scaling
story (Render's free tier runs one instance; if this needed to handle many
concurrent users, you'd need to confirm `ThreadPoolExecutor`'s single
background thread per request doesn't itself become a bottleneck across
many simultaneous `/generate` calls on one process, and likely add a real
task queue — Celery, or a cloud queue — rather than an in-process thread
pool, once "one extra thread per concurrent generation" stops being cheap
enough to not think about).

---

## 6. Modular design — improving one part without breaking others

### The general concept

A module is well-designed when it has **high cohesion** (everything inside
it is tightly related to one job) and **low coupling** (it depends on as
little else as possible, and exposes a narrow, stable interface rather than
its internals). The test that actually matters in practice: **can you
rewrite this module's internals completely, keeping its public interface
the same, without anyone who depends on it noticing?**

### Where this code passes that test cleanly

- **`modules/drafting/pdf.py` could be rewritten to use a different PDF
  library entirely** (WeasyPrint, a different ReportLab API version,
  rendering HTML-to-PDF instead) **without `generator.py`, `stream.py`, or
  the frontend ever needing to change.** The only contract is the function
  signature `render_sale_deed_pdf(sections, fields, first_page_top_offset) ->
  io.BytesIO` and the `style` vocabulary it reads from each section — both
  of which are genuinely stable, narrow interfaces, not leaky
  implementation details.
- **`extraction.py`'s identifier-rescue regexes could be swapped for a
  different validation strategy** (a proper PAN-checksum validator, say)
  without touching `routers/drafting.py` at all — the router only ever
  calls `extract_from_document` and trusts whatever dict comes back.
- **The frontend's `lib/deedStream.ts` is entirely swappable** — you could
  replace the whole typing-animation algorithm (a different easing curve,
  a different chunking strategy) by rewriting that one file, as long as
  `TypingSection`/`DeedEvent` and the function names `useDeedGeneration.ts`
  calls stay the same.

### Where the module boundary is deliberately leaky, and why that's a known cost, not an oversight

The **style vocabulary** (`"title"`, `"clause"`, `"recital"`, ...) is a
genuine coupling point across three files that otherwise have no
dependency on each other: `generator.py` (which assigns the styles),
`LiveDeedCanvas.tsx`, and `pdf.py`/`docx_export.py` (which each
independently interpret them). **Add a new section style in `generator.py`
and forget to handle it in even one of the other three, and that section
renders wrong — silently, with no error** (each renderer's `switch`/`if`
chain has a default/fallback case, so an unrecognised style degrades to
generic paragraph styling rather than crashing, which is good for
resilience but means a missing case is easy to miss in review). This is the
direct cost of *not* having one shared, enforced schema for what a `style`
value means and which renderers must handle it — `DECISIONS.md`'s decision
12 makes the same trade-off explicitly for the checklist data (duplication,
covered by tests asserting the invariant, rather than a generated shared
artefact) and the reasoning transfers directly: a third consumer, or a
style vocabulary that grows much larger, is the signal to invest in
something sturdier — a shared constants file imported by all three, at
minimum, or (for a genuinely cross-language shared schema) a code-generation
step from one source of truth.

**This is the practical, non-academic version of "modular design so one
part can improve without breaking others"**: it is not an absolute property
a codebase either has or lacks. It is a *continuum*, paid for with explicit
engineering cost (shared schemas, generated artefacts, enforced contracts)
that should scale with how many consumers a piece of data actually has
today — not pre-paid for consumers that might show up later. This codebase
sits at a deliberate, documented point on that continuum, and
`DECISIONS.md` is where that deliberateness gets written down at all — which
is itself the most transferable lesson in this whole document: **write down
*why* a seam was drawn where it was**, so a future maintainer (including
future you) doesn't have to reverse-engineer whether a duplication was a
decision or an accident.

Next: **[03-design-decisions-and-tradeoffs.md](./03-design-decisions-and-tradeoffs.md)**.
