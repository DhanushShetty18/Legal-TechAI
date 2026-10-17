# Legal-TechAI — Security, Bug and Performance Audit

**Audited:** `main` at `5b0b97f` · October 2026
**Written for:** someone who has just started backend engineering. Every term is explained the first time it appears.

---

## 0. Start here

### What you have to do yourself (nobody else can)

| # | Action | Why | Time |
|---|---|---|---|
| 1 | **Delete the leaked Gemini key** in Google AI Studio and create a new one. Put the new one only in Render → Environment. | A real key is in this public repo's history (see S0). | 5 min |
| 2 | On Render, set `ALLOWED_ORIGINS` to your Vercel URL(s), comma-separated. | After PR #3 merges, any origin not on this list is blocked. Without it, your live frontend stops working. | 2 min |
| 3 | On Render, set `ADMIN_API_KEY` to a long random string. | Unlocks `/rag/add-section` for you only. | 1 min |
| 4 | Run the three `CREATE INDEX` lines in §P4 on your production database. | New indexes are only created automatically on brand-new databases. | 2 min |
| 5 | Review and merge PRs #3, #4, #5. They merge cleanly in any order. | — | — |

### The three pull requests

| PR | Branch | What it fixes |
|---|---|---|
| [#3](https://github.com/DhanushShetty18/Legal-TechAI/pull/3) | `security/hardening` | S1–S3, S5–S11 |
| [#4](https://github.com/DhanushShetty18/Legal-TechAI/pull/4) | `fix/camera-efiling-bugs` | C1, C2, C3, C5, H1–H3, H6, H8, M1, M14, B1 |
| [#5](https://github.com/DhanushShetty18/Legal-TechAI/pull/5) | `perf/unblock-event-loop` | P1–P5 |

All three also add **GitHub Actions** (`.github/workflows/`): every future PR automatically runs the backend tests, the frontend tests and a TypeScript type check. You now get told when something breaks *before* it reaches users.

### Severity scale used below

| Label | Meaning |
|---|---|
| 🔴 **Critical** | Someone can take over the server, steal every user's data, or spend your money. Fix today. |
| 🟠 **High** | Real users lose data, see wrong output, or the app fails with no explanation. |
| 🟡 **Medium** | Real problem, but rare or limited in damage. |
| ⚪ **Low** | Hygiene. Fix when convenient. |

### A note on the C++ request

You asked to rewrite the database and API layer in C++. I didn't, and §P0 explains why with numbers. The short version: the app is slow because it **waits** (on Gemini, on the network, on Render waking up), not because Python **computes** slowly. C++ makes computing faster. It does nothing for waiting. The real cause was a concurrency bug, and PR #5 fixes it in about 30 lines of Python.

---

## 1. Prerequisites — read these first

Each later section says which of these it depends on. Ten minutes here makes everything after it make sense.

### 1.1 Client and server

Your app is two programs:

- **Client** — the Next.js frontend, running *in the user's browser* (on Vercel).
- **Server** — the FastAPI backend, running *on Render*.

They talk by sending **HTTP requests**: the client sends a message ("give me case 12"), the server sends back a **response** (the data, or an error code like `404 Not Found`).

**The rule that governs all of security:** *the server can never trust anything the client sends.* The client runs on the user's machine. A user can change it, replace it, or skip it entirely and send raw requests with any tool. Every value arriving at your server — every field, filename, header, number — must be treated as possibly hostile.

> **Analogy.** A bank teller does not trust a deposit slip because it's filled in neatly. They check the account number, count the cash, and verify the signature. The slip is the client. The teller is the server.

### 1.2 Trust boundaries

A **trust boundary** is any line data crosses from somewhere you don't control to somewhere you do. In this app: browser → API, uploaded file → disk, uploaded document → Gemini prompt, Gemini output → database.

Almost every vulnerability in this document is one sentence: **untrusted data crossed a trust boundary and was used without being checked.**

### 1.3 Environment variables and secrets

A **secret** is anything that grants access: API keys, database passwords. Secrets go in **environment variables** — values set on the server (Render → Environment) and read by code with `os.getenv("NAME")`. They must **never** be written in code, because code is copied, shared and — in a public repo — read by everyone, including bots that scan GitHub for keys within minutes of a push.

`.env` files are a local convenience for the same idea. Your `.gitignore` correctly excludes them.

### 1.4 Hashing

A **hash function** turns any input into a fixed-length fingerprint, in one direction only: easy to compute, practically impossible to reverse.

- `sha256("hunter2")` → `f52fbd32b2b3b86f…`
- There is no `unsha256()`.

Passwords are stored as hashes so that a stolen database doesn't reveal them. To log in, you hash what the user typed and compare fingerprints. **Salting** adds a random value per user before hashing, so two users with the same password get different fingerprints and precomputed tables of common passwords become useless.

### 1.5 The event loop (needed for the performance section)

FastAPI handles many users at once using an **event loop**: one thread that switches rapidly between requests whenever a request is *waiting* — for the network, a file, a database.

That switching only works if code **says** it's waiting, by using `await`. A function declared `async def` promises: "I will only ever wait using `await`." If it breaks that promise by calling something slow without `await`, the event loop is stuck on that one call, and **every other user waits** until it finishes.

FastAPI's rule:
- `def` endpoint → FastAPI runs it in a separate worker thread. Blocking inside it is fine.
- `async def` endpoint → runs on the event loop. Must never block.

> **Analogy.** A single waiter serving ten tables. While one table's food cooks, the waiter takes other orders — that's `await`. If the waiter instead stands at the kitchen door until one dish is ready, every other table waits. That's a blocking call inside `async def`.

### 1.6 CORS

Browsers stop a page from one website reading responses from another website's API — unless that API says it's allowed. That permission is **CORS** (Cross-Origin Resource Sharing). Your API's CORS settings decide *which websites' pages* may call it from a user's browser.

---

## Part A — Security

### S0 · A real API key is in the public git history  🔴 Critical — **you must act**

**Prerequisites:** 1.3

**What happened.** Commit `02bd7c4` (21 May 2026) added `backend/test_ocr.py` with a real Gemini key (beginning `AIzaSyBQ`) written directly in the code. Commit `aa5002b` later replaced it — but git keeps every past version. Anyone can read the old commit.

**Why it's serious.** The repo is public. Automated bots scan every public GitHub push for strings shaped like API keys. A leaked Gemini key can be used to run requests billed to your account, or to exhaust your quota so your own app stops working. Assume it has already been copied.

**What doesn't fix it.** Deleting the line (already done). Rewriting history with `git filter-repo` (the key has already been public; copies exist outside your repo).

**What fixes it.** Revoking the key at the source. Google AI Studio → API keys → delete it → create a new one → store it only in Render's environment variables.

**What PR #3 does.** Only fixes the leftover line, which had been replaced with a string that isn't valid Python (`"os.getenv("GEMINI_API_KEY")"`) and broke the file.

**Prevent it next time.** Run a secret scanner before you push. [gitleaks](https://github.com/gitleaks/gitleaks) can run as a pre-commit hook and refuse a commit containing a key. GitHub also offers free **push protection** for public repos: Settings → Code security → Secret scanning → Push protection.

**Learn more:** [GitHub — About secret scanning](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning) · [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

---

### S1 · Uploaded files saved under a name the user chooses  🔴 Critical — fixed in #3

**Prerequisites:** 1.1, 1.2

**Where:** `backend/main.py`, `POST /documents/`

```python
file_location = f"{upload_dir}/{file.filename}"
```

**The problem.** `file.filename` is whatever the client says the file is called. It's a client-supplied value crossing straight into a filesystem path. A filename containing `../` means "go up one folder," so a crafted name can point the write *outside* `uploads/` — including at the server's own Python files. Overwriting code that the server later loads turns a file upload into running the uploader's code on your server.

Even without malice, two users uploading `aadhaar.jpg` silently overwrite each other's documents.

**Category:** *Path traversal* — OWASP [A01: Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/).

> **Analogy.** A coat check that lets each guest write their own ticket number — including one that says "the manager's office."

**The fix** (`backend/security.py → safe_upload_path`):
1. Ignore the client's filename. Generate our own with `uuid.uuid4()`.
2. Keep only the extension, and only if it's on an allow-list (`.pdf .jpg .jpeg .png .webp .txt`); otherwise `.bin`.
3. Resolve the final path and confirm it is still inside `uploads/`.
4. Cap the upload at 12 MB (reading the whole file unbounded let anyone exhaust the server's memory).

**Tests:** `backend/test_security.py` checks six hostile filenames all land inside the upload folder.

**Learn more:** [OWASP — Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal) · [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) · PortSwigger Academy's free [File path traversal](https://portswigger.net/web-security/file-path-traversal) labs.

---

### S2 · Passwords stored in plain text  🔴 Critical — fixed in #3

**Prerequisites:** 1.4

**Where:** `backend/crud.py`

```python
fake_hashed_password = user.password + "notreallyhashed"
```

**The problem.** This is the password with a word glued on. Anyone who reads the database — a leaked backup, a misconfigured dashboard, a future SQL bug — reads every password. Because most people reuse passwords, that exposes their email and bank accounts too.

> **Analogy.** Storing house keys in a box labelled "not really keys."

**The fix** (`security.hash_password` / `verify_password`): PBKDF2-SHA256 with a random 16-byte salt per user and 600,000 iterations, from Python's standard library — no new dependency. The iteration count deliberately makes each guess slow for an attacker while costing a real login a fraction of a second. Verification uses `hmac.compare_digest` so the comparison time doesn't leak how many characters matched.

**Note:** there's no login endpoint yet (see S4), so no existing user can log in either way. When you build login, use `security.verify_password`.

**Better long-term:** Argon2id via the [`argon2-cffi`](https://pypi.org/project/argon2-cffi/) package is the current first recommendation. PBKDF2 was chosen here only because it needs no new install.

**Learn more:** [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) — read the whole thing; it's short.

---

### S3 · Anyone can sign up as a judge or admin  🔴 Critical (latent) — fixed in #3

**Prerequisites:** 1.1

**Where:** `backend/schemas.py → UserCreate.role`, `backend/crud.py → create_user`

**The problem.** The sign-up request includes `role`, and the server stored whatever was sent. A citizen could register as `judge`. Nothing checks roles yet, so there's no damage *today* — but the day you add "only judges may view X", every self-made judge passes.

**Category:** *Privilege escalation / mass assignment* — OWASP A01.

> **Analogy.** A courthouse visitor badge where you write your own job title.

**The fix:** self-registration accepts only `citizen` or `lawyer`; anything else becomes `citizen`. Privileged roles must be granted by an administrator through a separate, protected route (not built yet).

**Learn more:** [OWASP Mass Assignment Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html)

---

### S4 · No authentication on any endpoint  🔴 Critical — **not fixed, needs design**

**Prerequisites:** 1.1, 1.2

**The problem.** No endpoint checks *who* is calling:

| Endpoint | Consequence |
|---|---|
| `GET /cases/` | Lists every case from every user |
| `POST /cases/?user_id=1` | Files a case as any user — the frontend hard-codes `user_id=1` |
| `POST /users/{id}/verify` | Marks any account as identity-verified |
| `POST /documents/` | Attaches a document to any case, as any user |

This is the single largest remaining issue. It wasn't fixed in a PR because the fix spans frontend and backend and involves product decisions (how do users log in — email + password, OTP, Google?).

**How to fix it, in order:**
1. **Login endpoint** that checks `verify_password` and returns a signed token (a JWT). FastAPI's official tutorial walks through exactly this: [Security → OAuth2 with Password and JWT](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/).
2. **A dependency** `get_current_user(token)` that every protected route declares. FastAPI's dependency system makes this one line per route.
3. **Ownership checks.** Read `user_id` from the token, never from the URL. `GET /cases/` returns only `cases.creator_id == current_user.id`.
4. **Frontend:** store the token, send it as `Authorization: Bearer …`, delete the hard-coded `user_id=1`.

**Until then:** treat the deployed app as a demo. Don't put real clients' identity documents through it.

**Learn more:** the FastAPI security tutorial above (the best starting point for your stack) · [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) · PortSwigger's [Access control](https://portswigger.net/web-security/access-control) labs.

---

### S5 · CORS allows every website, with credentials  🟠 High — fixed in #3

**Prerequisites:** 1.6

**Where:** `backend/main.py`

```python
allow_origins=["*"],      # In production, restrict this to specific domain URLs!
allow_credentials=True,
```

**The problem.** Your own comment flagged it. `"*"` plus credentials tells browsers: *any* website may call this API on the user's behalf and read the answer. Once you add login (S4), any page a logged-in user visits could act as them.

**The fix:** origins come from the `ALLOWED_ORIGINS` environment variable (default: `localhost:3000`, `legaltechai.in`, `www.legaltechai.in`). Methods and headers are narrowed to what the app uses.

**⚠️ You must** add your Vercel URL to `ALLOWED_ORIGINS` on Render, or the deployed frontend will be blocked. Preview deployments get different URLs; add the ones you use.

**Learn more:** [MDN — CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) · PortSwigger's [CORS](https://portswigger.net/web-security/cors) topic.

---

### S6 · Anyone can add fake law to the legal knowledge base  🟠 High — fixed in #3

**Prerequisites:** 1.2

**Where:** `backend/routers/rag.py → POST /rag/add-section`

**The problem.** The legal Q&A answers from sections stored in a vector database. Anyone could add a "section" with any number, act name and text. The Q&A would then cite invented law, with a real-looking section number — and the hallucination check would *pass*, because the section exists in the store.

For a legal product, this is worse than a crash: it's confidently wrong output.

**Category:** *RAG / knowledge-base poisoning.*

**The fix:** the route requires an `X-Admin-Key` header matching `ADMIN_API_KEY`. If that variable isn't set, the route is closed entirely — safe by default.

**Learn more:** [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/) — see *Data and Model Poisoning* and *Vector and Embedding Weaknesses*.

---

### S7 · Demo routes live in production  🟠 High — fixed in #3

**Where:** `backend/routers/demo.py`, mounted unconditionally in `main.py`

**The problem.** These pitch-demo endpoints simulate security checks and expose controls nobody should reach publicly — for example, `/demo/vault/toggle-offline` changes a process-wide environment variable for every user.

**The fix:** the router is mounted only if `ENABLE_DEMO_ROUTES=1`. Leave it unset on Render; set it on a laptop for a demo.

---

### S8 · A hard-coded "always valid" signature  🟠 High — fixed in #3

**Where:** `backend/verification.py → verify_digital_signature`

```python
if signature == "SIG_BYPASS_DEMO" or ...:
    return True
```

**The problem.** A fixed string that passes a security check is a **backdoor**, and it's published in a public repo. It's not called anywhere today — which is how backdoors usually survive into production: someone wires the function up later without reading its body.

**The fix:** removed. The remaining comparison uses `hmac.compare_digest` (constant-time).

**Related, not changed:** the vault's `_verify_identity_signature` accepts `"SIG_" + sha256(document)`, which anyone can compute — so it verifies nothing. It's demo-only and now unreachable in production (S7). A real version needs public-key signatures — see the [`cryptography`](https://cryptography.io/en/latest/hazmat/primitives/asymmetric/ed25519/) library's Ed25519 docs.

---

### S9 · Error responses reveal internal details  🟡 Medium — fixed in #3

**Where:** `backend/main.py` global exception handler; `routers/ocr_extract.py`

**The problem.** Unhandled errors returned `str(exc)` to the client. Exception text often contains file paths, SQL fragments, library versions and configuration details — a free map of your internals.

**The fix:** the full error is written to the server log with `logger.exception(...)` (you see it in Render's logs); the client receives `"Internal server error."`

**Remaining:** several routers still return `f"... failed: {str(e)}"` in `HTTPException` details (`ai.py`, `inconsistency.py`, `drafting.py` export). Same fix: log it, return a generic message.

**Learn more:** [OWASP Error Handling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html)

---

### S10 · OCR endpoint crashes on missing content type; no size limit  🟡 Medium — fixed in #3

**Where:** `backend/routers/ocr_extract.py`

`file.content_type.startswith(...)` raised `AttributeError` (→ 500) when a browser sent no content type, which some Android camera uploads do. And there was no size cap. Fixed: `content_type or ""`, and a 12 MB limit read with `file.read(MAX + 1)` so an oversized file is never fully loaded.

---

### S11 · `GET /cases/?limit=` was unbounded  ⚪ Low — fixed in #3

`limit=10000000` loaded the whole table into memory in one response. Now clamped to 1–100.

---

### S12 · No rate limiting on AI endpoints  🟠 High — **not fixed**

**The problem.** Every Gemini-backed endpoint (`/ai/*`, `/summarizer/*`, `/drafting/extract`, `/drafting/generate`, `/inconsistency/*`, `/rag/query`, `/ocr-extract`) can be called in a loop by anyone. Each call spends your Gemini quota. This is sometimes called *denial of wallet*: the attack isn't taking the server down, it's making it expensive or exhausting your daily quota so real users get errors.

**How to fix it:** [`slowapi`](https://github.com/laurentS/slowapi) adds per-IP limits to FastAPI in a few lines, e.g. `@limiter.limit("10/minute")` on each AI route. After S4, limit per user instead of per IP. Also set a **budget alert** in Google Cloud billing so a spike emails you.

---

### S13 · Prompt injection through uploaded documents  🟡 Medium — **not fixed (mitigated)**

**Prerequisites:** 1.2

**The problem.** Text from uploaded documents is placed directly into Gemini prompts. A document can contain text written to *instruct the model* rather than inform it — for example, telling it to output a different PAN than the one printed. Language models cannot reliably tell "data I'm reading" from "instructions I'm following."

**Why it's only Medium here:** every extracted field goes through the review form, where a human sees and edits it before anything is generated. That human check is the real defence — keep it, and never auto-generate a deed without it.

**Hardening you can add:**
- Your regex rescue for PAN/Aadhaar (`extraction.py → reconcile_identifiers`) is already a good pattern: validate model output against deterministic rules.
- Show the user *which document* each value came from (you already track `provenance`).
- Never let model output decide anything security-relevant (who can see what).

**Learn more:** [OWASP LLM01: Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)

---

### S14 · Untrusted PDFs parsed with no limits; uploads never deleted  🟡 Medium — **not fixed**

**Where:** `routers/ingest.py`, `routers/inconsistency.py`, `ingestion.py`

- PDFs from anyone are parsed with PyMuPDF with no page or size limit. A PDF can be crafted to be tiny on disk and enormous when parsed. **Fix:** check size before reading; cap `len(doc)` at, say, 200 pages.
- `/ingest/upload` writes every file to `uploads/` and never deletes it. On Render the disk is small. **Fix:** don't store at all if you only need the text, or delete after processing.

---

## Part B — Bugs

All Part B fixes are in **PR #4**, with tests in `frontend/src/lib/filingHelpers.test.ts` and `backend/test_retry.py`. Frontend CI (type check + tests) **passed** on that PR.

### B1 · The Gemini retry wrapper never retries  🟠 High — fixed in #4

**Prerequisites:** basic Python functions.

**Where:** `backend/modules/ai/gemini_integration.py → retry_on_failure`

```python
def retry_on_failure(retries=3, delay=2):
    def decorator(func):
        def wrapper(*args, **kwargs):
            ...
            delay = delay * (2 ** attempt) + random.uniform(0, 1)   # ← here
```

**The problem.** In Python, assigning to a name *anywhere* inside a function makes it a **local** variable for the *whole* function. So `delay` inside `wrapper` is local, and reading it on the right side before it has a value raises `UnboundLocalError`. The first transient Gemini failure — exactly what retries exist for — crashes the request instead of retrying. **Verified by running the code.**

> **Analogy.** A spare tyre that's welded into the boot. It's there; it just can't come out when you need it.

**The fix:** compute into a new name, `wait = delay * (2 ** attempt) + jitter`, leaving `delay` untouched.

**Learn more:** [Python FAQ — Why am I getting an UnboundLocalError?](https://docs.python.org/3/faq/programming.html#why-am-i-getting-an-unboundlocalerror-when-the-variable-has-a-value)

---

### C1 · Downloaded PDF is blank on phones  🔴 Critical — fixed in #4

**Where:** `frontend/src/lib/api.ts → downloadFile`

```ts
anchor.click();
anchor.remove();
URL.revokeObjectURL(url);   // ← destroys the file the browser is about to read
```

**The problem.** `click()` *schedules* a download; it doesn't wait for it. The next line destroys the temporary URL pointing at the file. Desktop browsers usually start reading first; mobile browsers often don't, and save an empty file. This is the most likely cause of the blank PDF in your demo video.

> **Analogy.** Handing someone a cloakroom ticket, then tearing it up before they reach the counter.

**The fix:** `setTimeout(() => URL.revokeObjectURL(url), 60_000)`.

---

### C2 · A failed generation turns into a downloadable "ready" deed  🔴 Critical — fixed in #4

**Where:** `frontend/src/lib/useDeedGeneration.ts`

**The problem.** When the server sent an `error` event, the hook set `phase = "error"` — but the animation loop kept running. When the stream ended, the loop saw "stream done, nothing left to type" and set `phase = "complete"`, overwriting the error. The error panel vanished and *Download PDF* appeared for a deed that was never written.

**The fix:** a `failedRef` that, once set, stops the loop and the stream and prevents any later transition to `"complete"`.

### H8 · "Waking the drafting engine" can hang forever  🟠 High — fixed in #4

The `/drafting/generate` request had no timeout, unlike every other request in the app. Now it times out after 150 s *if the server never starts answering*, and shows an error. Once the stream starts, there's no timeout — a long deed legitimately takes minutes.

---

### C3 · The capture button does nothing  🟠 High — fixed in #4

**Where:** `frontend/src/app/file-case/page.tsx → handleCapture`

**The problem.** Tapping the shutter before the camera produced its first frame: `video.videoWidth` is `0` → a 0×0 canvas → `toBlob` returns `null` → `if (!blob) return;` silently throws the tap away. No message, no spinner, nothing.

**General lesson:** search your code for `return;` inside click handlers. Each one that doesn't also show a message is a silent failure.

**The fix:** `canCapture(video)` checks for a real frame first and shows "The camera is still starting." A `null` blob also now shows a message.

---

### C5 · Re-uploading a document wipes what was already read  🟠 High — fixed in #4

**The problem.** A first scan reads 7 fields. A better re-scan fails (network blip). The state was overwritten with the failed attempt's empty `{}`, losing all 7.

**The fix:** `documentStateAfterExtraction()` keeps the previous fields when the new read failed.

---

### H6 · A Marathi or Hindi case title downloads as `.pdf`  🟠 High — fixed in #4

**The problem.** `.replace(/[^\w\s-]/g, "")` — in JavaScript, `\w` means only `A–Z a–z 0–9 _`. Every Devanagari character was deleted, leaving an empty filename.

**The fix:** `downloadStem()` uses Unicode property classes — `\p{L}` (any letter), `\p{M}` (combining marks, which Devanagari vowel signs are), `\p{N}` (any digit) — with the `u` flag, and never returns an empty string.

**Learn more:** [MDN — Unicode character class escapes](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Unicode_character_class_escape)

---

### H1 / H2 · Dates and amounts read from documents show as empty boxes  🟠 High — fixed in #4

**Where:** `frontend/src/components/ExtractedFieldsForm.tsx`

**The problem.** `<input type="date">` only accepts `yyyy-mm-dd`; `<input type="number">` rejects `45,00,000`. Given anything else, the browser shows an **empty** box — silently. Meanwhile the form's own state still held the text, so the field wasn't flagged as missing either. The screen said empty; the code said filled.

**The fix:** `toDateInputValue()` converts `30-09-2026`, `30/09/2026`, `30.09.2026` (day-first, Indian order). `toAmountInputValue()` extracts the number from `Rs. 45,00,000/-`. When a value can't be converted, the form shows *"Read as '…' — please re-enter it above"* instead of a blank.

---

### H3 · A field group snaps shut while you're typing in it  🟡 Medium — fixed in #4

**The problem.** Groups with missing fields started open — but openness was recomputed live from the missing count. Filling the last missing field dropped the count to 0, and the group closed under the cursor.

**The fix:** each group's starting state is decided once, when the form first appears (`useRef`).

---

### M14 · Errors are invisible in the camera view  🟡 Medium — fixed in #4

The error banner was hidden whenever the camera was open, so C3's new messages would never have been seen. The camera view now has its own banner.

### M1 · Stream may never appear behind some proxies  🟡 Medium — fixed in #4

The live-drafting stream decoder split events only on `\n\n`. Some proxies send `\r\n\r\n`. Now normalised first.

---

### C4 · Camera preview sometimes stays black  🟠 High — **not fixed**

**Where:** `page.tsx → startCameraForDoc` and the camera `useEffect`.

**The problem.** A *race condition* — two things happening in an order you didn't plan for. `startCameraForDoc` changes state (so React will re-render) and then waits for camera permission. When permission is already granted, the camera stream can arrive *before* React has re-rendered. Then either (a) the effect's cleanup runs afterwards and stops the brand-new stream, or (b) the `<video>` element doesn't exist yet, so the stream is never attached. Both give a black preview with the camera light on, more often on the second and third use.

> **Analogy.** A cleaner told "lock this room when it's empty" locks it with a guest inside, because the guest walked in just after the instruction was given.

**How to fix it:**
1. Give each camera start a token (`useRef` counter). After `await getUserMedia`, if the token has changed, stop the new stream and return.
2. Attach the stream in an effect that runs after render and checks both `videoRef.current` and `streamRef.current` exist.
3. Stop the camera only when *leaving* capture mode, plus once on unmount.

The full code is in `docs/BUGS-camera-efiling.md` (C4) from the earlier review. It wasn't included in #4 because it changes the camera lifecycle and needs testing on a real phone — something CI can't do.

**Learn more:** [React docs — Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects), especially "How to handle the Effect firing twice."

---

### C6 · Indian-language text vanishes from the PDF  🔴 Critical for this product — **not fixed**

**Where:** `backend/modules/drafting/pdf.py` — `BODY_FONT = "Times-Roman"`

**The problem.** Times-Roman is one of the 14 built-in PDF fonts, which only contain Latin characters. A Marathi address or Kannada village name typed into the form shows on screen and **disappears** from the PDF, because the font has no shapes to draw.

**How to fix it:**
1. Download **Noto Serif Devanagari** from [Google Fonts](https://fonts.google.com/noto/specimen/Noto+Serif+Devanagari) (free, open licence). Commit the Regular and Bold `.ttf` files to `backend/modules/drafting/fonts/`.
2. Register them with ReportLab:
   ```python
   from reportlab.pdfbase import pdfmetrics
   from reportlab.pdfbase.ttfonts import TTFont
   pdfmetrics.registerFont(TTFont("DeedBody", "fonts/NotoSerifDevanagari-Regular.ttf"))
   pdfmetrics.registerFont(TTFont("DeedBold", "fonts/NotoSerifDevanagari-Bold.ttf"))
   BODY_FONT, BOLD_FONT = "DeedBody", "DeedBold"
   ```
3. Test with a field like `मुंबई उपनगर` and open the PDF.

**Caveat worth knowing:** Devanagari has conjunct letters (e.g. क्ष) that need *text shaping*. ReportLab's support for this is limited, and some conjuncts may render as separate letters. If that happens, the robust path is rendering HTML to PDF with [WeasyPrint](https://doc.courtbouillon.org/weasyprint/stable/), which uses a full shaping engine (HarfBuzz).

It isn't in a PR because the font files have to be downloaded, which the environment writing this couldn't do.

---

### Earlier-review items still open

From `docs/BUGS-camera-efiling.md` and not covered above: H4 (offline merge reimplements backend rules differently), H5 (unknown `doc_id` silently defaults to the first checklist document instead of being rejected), M3–M13. None loses data on its own; work through them after the items above.

---

## Part C — Performance

### P0 · Why not rewrite in C++?

**Prerequisites:** 1.5

The question to ask before any performance work is: **where does the time actually go?** For one deed-drafting request, roughly:

| Step | Typical time | What it's doing |
|---|---|---|
| Render free instance waking from sleep | up to ~120 s | Starting a container. First request after idle only. |
| Gemini Vision reading one document | 3–10 s | A remote model running on Google's servers |
| Gemini drafting recitals | 5–15 s | Same |
| Network round trips, browser ↔ Render | 0.1–0.5 s each | Speed of light, routing, TLS |
| Database query | ~1–10 ms | |
| **Python executing your own code** | **~1–20 ms** | String building, JSON, PDF layout |

C++ might make the last row 10–50× faster. That saves a few milliseconds out of 10–150 *seconds*. Nobody would notice.

Meanwhile it would cost you: rewriting FastAPI, SQLAlchemy, Pydantic and ReportLab equivalents by hand; manual memory management, where a single mistake becomes a crash or a security hole (the Linux kernel bug you asked about was exactly that kind of memory error); and a codebase you couldn't change quickly.

> **Analogy.** A courier is slow because the parcel waits two days at the depot. Buying him a faster motorbike saves twenty minutes of a two-day delivery.

**The rule:** measure first, then fix the biggest thing. Here, the biggest *fixable* thing was P1.

**Learn more:** Brendan Gregg's [USE Method](https://www.brendangregg.com/usemethod.html) — a one-page procedure for finding where time goes. *Designing Data-Intensive Applications* (Kleppmann), chapter 1, on latency.

---

### P1 · Every AI call froze the entire server  🔴 Critical — fixed in #5

**Prerequisites:** 1.5 (essential)

**Where:**

| File | Endpoint | Blocking call made from `async def` |
|---|---|---|
| `routers/ai.py` | `/ai/summarize`, `/ai/extract-claims`, `/ai/answer-question` | `summarize_legal_document()` etc. |
| `routers/summarizer.py` | `/summarizer/summarize` | `summarize_legal_document()` |
| `routers/drafting.py` | `/drafting/extract` | `extract_from_document()` (plus up to 3 retries with `time.sleep`) |
| `routers/inconsistency.py` | `/inconsistency/detect-inconsistencies` | `engine.process()` — a 4-step Gemini pipeline |

**The problem.** All of these are `async def` but call the Gemini SDK, which is **synchronous**: it blocks the thread until Google answers. Inside `async def` that thread is the event loop. So while one user waits 5–30 seconds for an extraction or a contradiction report, **every other request to the server waits too** — other users' page loads, other uploads, even `/health`. On a single Render instance, that is most of why the app feels slow.

This is the restaurant with one waiter standing at the kitchen door (§1.5).

**The fix:**
- `ai.py`, `summarizer.py`: changed to plain `def`. FastAPI automatically runs `def` endpoints in a worker thread.
- `drafting.py /extract`, `inconsistency.py` (and `ocr_extract.py`, fixed in #3 alongside S10): these need `async` to `await file.read()`, so the blocking part is handed to a thread explicitly:
  ```python
  from fastapi.concurrency import run_in_threadpool
  result = await run_in_threadpool(extract_from_document, contents, ...)
  ```

**How we know it's fixed:** `backend/test_concurrency.py` reads each router's code and finds any blocking call made directly inside `async def`. It finds six on `main` and zero after the fix, and now runs on every PR so the mistake can't come back.

**What's left:** PDF parsing in `ingest.py` and `inconsistency.py` is CPU work inside `async def`. For large PDFs, move it into `run_in_threadpool` too.

**Learn more:** FastAPI docs, [Concurrency and async / await](https://fastapi.tiangolo.com/async/) — read the whole page; it's written for exactly this confusion.

---

### P2 · Every legal question re-read the whole knowledge base  🟡 Medium — fixed in #5

**Where:** `backend/modules/embedder.py → query_rag_system`

```python
all_sections = collection.get(include=["metadatas"])
```

To check whether cited sections exist, every query loaded metadata for **every stored section**. Cost grows with the size of the knowledge base: fine at 50 sections, slow at 50,000. Now a set of known section numbers is kept up to date as sections are added, and checked in constant time.

**Learn more:** this is *Big-O* thinking — how cost grows with input size. [Big-O Cheat Sheet](https://www.bigocheatsheet.com/).

---

### P3 · First request after a quiet spell fails  🟡 Medium — fixed in #5

**Where:** `backend/database.py`

Database connections are kept open and reused (a *pool*). Hosted Postgres closes connections that sit idle; SQLAlchemy didn't know and handed out dead ones, so the first request after idle failed. `pool_pre_ping=True` checks each connection before use.

**Learn more:** [SQLAlchemy — Dealing with Disconnects](https://docs.sqlalchemy.org/en/20/core/pooling.html#dealing-with-disconnects)

---

### P4 · Missing indexes on foreign keys  ⚪ Low today — fixed in #5 (manual step)

**Where:** `backend/models.py`

An **index** is a sorted lookup structure, like a book's index: without one, finding "all documents for case 12" means reading every row. SQLAlchemy doesn't index foreign keys automatically. Added `index=True` to `cases.creator_id`, `documents.case_id`, `documents.uploader_id`.

**Manual step:** `create_all` only creates indexes for *new* tables. Run once on production:

```sql
CREATE INDEX IF NOT EXISTS ix_cases_creator_id      ON cases (creator_id);
CREATE INDEX IF NOT EXISTS ix_documents_case_id     ON documents (case_id);
CREATE INDEX IF NOT EXISTS ix_documents_uploader_id ON documents (uploader_id);
```

**Better long-term:** use [Alembic](https://alembic.sqlalchemy.org/en/latest/tutorial.html) for database migrations, so schema changes are versioned like code.

**Learn more:** [Use The Index, Luke](https://use-the-index-luke.com/) — free, and the best resource on database indexing that exists.

---

### P5 · Judder while the deed types out  🟡 Medium — fixed in #5

**Where:** `frontend/src/components/LiveDeedCanvas.tsx`

During live drafting, sections update about 60 times a second, and each update started a new smooth-scroll animation. Dozens of competing scrolls queued up and the page juddered on phones. Now throttled to 4 per second — visually identical, far less work.

**Try this yourself:** Chrome DevTools → Performance → record while a deed generates, before and after merging #5. You'll see the difference in the flame chart. That's the measure-fix-measure loop in practice.

---

## Part D — What to learn from this audit

Every issue above traces back to a small number of habits:

| Habit | Issues it would have prevented |
|---|---|
| Never trust client input | S1, S3, S4, S6, S10 |
| Secrets only in environment variables | S0 |
| Never write a silent `return;` in a handler | C3, C5, M14 |
| Know the event-loop rule for `async def` | P1 |
| Measure before optimising | P0 |
| Read the *code* of anything AI generates, especially security checks | S2, S8, B1 |

### Resources, in the order to use them

| Resource | For |
|---|---|
| [FastAPI tutorial](https://fastapi.tiangolo.com/tutorial/) — *Security* and *Concurrency* chapters | S4, P1. Directly your stack. |
| [PortSwigger Web Security Academy](https://portswigger.net/web-security) | Free hands-on labs. Do *Access control*, *File path traversal*, *Authentication*, *CORS*. |
| [OWASP Top 10](https://owasp.org/Top10/) and [Cheat Sheet Series](https://cheatsheetseries.owasp.org/) | Reference for every item in Part A. |
| [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/) | S6, S13 — specific to AI products like yours. |
| *Alice and Bob Learn Application Security* — Tanya Janca | Beginner-friendly book covering all of Part A. |
| [Use The Index, Luke](https://use-the-index-luke.com/) | P4 and database performance generally. |
| *Designing Data-Intensive Applications* — Martin Kleppmann | The book behind Part C. |
| [gitleaks](https://github.com/gitleaks/gitleaks), [Semgrep](https://semgrep.dev/docs/getting-started/quickstart), [Bandit](https://bandit.readthedocs.io/) | Run these on your own repo; they'd have flagged S0, S1, S2 automatically. |
