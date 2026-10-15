# 07 — The Extraction Engine: `extraction.py`, `formatting.py`, `gemini.py`

This is the part of the backend that turns a photograph into structured
data. Read [00-prerequisites.md](./00-prerequisites.md) sections B2 (decorators),
B7 (regex), and B8 (Gemini) first.

## Why these three files are split the way they are

`gemini.py` is the *generic* "talk to Google's AI" plumbing — retrying on
failure, pulling JSON out of a model's text response — used by several
features in this codebase, not just Camera Filing. `extraction.py` is the
Camera-Filing-specific logic for *one* concern: given an uploaded document,
get structured fields out of it, defensively. `formatting.py` is pulled out
separately because its functions (number-to-words, currency grouping, date
parsing, masking) are needed by **both** `extraction.py` (to clean an
amount field) and `generator.py` (document 08, to render the deed text) —
putting them in a shared, dependency-free module avoids `generator.py`
having to import anything extraction-related just to format a number.

---

## `backend/modules/gemini.py` — the shared AI helper

### Module-level setup

```python
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
else:
    logger.warning("GEMINI_API_KEY is not set.")
```

**Job:** configure the Gemini SDK once, when this module is first imported,
using an API key read from the environment. If the key is absent, this
module does **not** crash or raise — it logs a warning and moves on,
because the whole feature is designed to keep working (via template
fallback) without a key present at all (see document 09, and the
system-design folder's resilience discussion).

### `retry_on_failure(retries, delay)`

```python
def retry_on_failure(retries=3, delay=2):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    logger.error(f"Attempt {attempt + 1} failed for {func.__name__}: {str(e)}")
                    if attempt < retries - 1:
                        time.sleep(delay)
            raise last_exception
        return wrapper
    return decorator
```

**Job:** a reusable decorator *factory* — `retry_on_failure(retries=3,
delay=2)` returns a decorator that makes any function retry on exception,
used by both `extraction.py`'s `_call_gemini` and `stream.py`'s
`author_narrative`.
**Calls:** whatever function it wraps (`func`).
**Line by line:**
- Three nested functions is the standard shape for a decorator that itself
  takes arguments: `retry_on_failure(retries, delay)` returns `decorator`;
  `decorator(func)` returns `wrapper`; `wrapper(*args, **kwargs)` is what
  actually runs each time the decorated function is called.
- `@wraps(func)` — copies `func`'s name and docstring onto `wrapper`, so
  tools inspecting the decorated function (debuggers, documentation
  generators) see the original function's identity rather than a generic
  "wrapper."
- `for attempt in range(retries):` — try up to `retries` times (3, by
  default).
- `try: return func(*args, **kwargs)` — if it succeeds, return immediately;
  no further attempts happen.
- `except Exception as e:` — catches **any** exception, logs which attempt
  number failed and why, and — `if attempt < retries - 1: time.sleep(delay)`
  — waits before trying again, but **not** after the final attempt (no
  point sleeping if there's nothing left to retry).
- `raise last_exception` — after exhausting every attempt, re-raise the
  *most recent* exception, so the caller sees a real, specific error rather
  than a generic "all retries failed."

### `extract_json(response_text)`

```python
def extract_json(response_text: str) -> Any:
    text = response_text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return json.loads(text.strip())
```

**Job:** every prompt in this feature asks Gemini to "return a JSON object
and nothing else," but language models frequently wrap their answer in a
Markdown code fence anyway (```json ... ```). This function strips that
fence if present, then parses the remainder as JSON.
**Calls:** nothing (uses the standard `json` module).
**Line by line:** checks for and removes a leading ` ```json ` (7
characters) or a bare ` ``` ` (3 characters) fence, then a trailing ` ``` `
fence, before finally calling `json.loads`. If the text isn't valid JSON
even after this cleanup, `json.loads` raises a `json.JSONDecodeError` —
which the callers of `extract_json` (wrapped in `retry_on_failure`) treat as
just another failure to retry or ultimately fall back from, not something
this function itself tries to recover from further.

### The other three functions in this file

`summarize_legal_document`, `extract_claims`, and `answer_legal_question`
are **not part of the Camera Filing feature** — they belong to other
features in this codebase (document summarisation and the legal Q&A
assistant) that happen to share this same "talk to Gemini" module. They are
mentioned here only so you know they exist and why they're in this file;
they are out of scope for this walkthrough.

---

## `backend/modules/drafting/formatting.py`

Every function here is a small, pure, independently-testable unit — no
network calls, no classes, just text/number transformation. Read
[00-prerequisites.md](./00-prerequisites.md) section B11 (Indian numbering)
before this section.

### `number_to_words(n)` and its helper `_below_hundred(n)`

```python
_UNITS = ["Zero", "One", ..., "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", ..., "Ninety"]
_SCALES = [(10**7, "Crore"), (10**5, "Lakh"), (10**3, "Thousand"), (10**2, "Hundred")]

def _below_hundred(n: int) -> str:
    if n < 20:
        return _UNITS[n]
    tens, unit = divmod(n, 10)
    return _TENS[tens] + (f" {_UNITS[unit]}" if unit else "")

def number_to_words(n: int) -> str:
    n = int(n)
    if n < 0:
        return "Minus " + number_to_words(-n)
    if n < 100:
        return _below_hundred(n)
    parts = []
    for divisor, name in _SCALES:
        count, n = divmod(n, divisor)
        if count:
            parts.append(f"{_below_hundred(count) if divisor == 100 else number_to_words(count)} {name}")
    if n:
        parts.append(_below_hundred(n))
    return " ".join(parts)
```

**Job:** convert an integer into Indian-English words — `4512000` becomes
`"Forty Five Lakh Twelve Thousand"`.
**Calls:** `number_to_words` calls itself (recursion) and `_below_hundred`;
`_below_hundred` is a leaf function calling neither.
**Line by line:**
- `_below_hundred(n)` handles the irregular English number words under 100:
  for `n < 20`, every number (including the teens, which don't follow a
  "tens + units" pattern — "fourteen," not "ten-four") is just looked up
  directly in `_UNITS`. For `20 <= n < 100`, `divmod(n, 10)` splits into
  tens and units digits (`divmod` returns `(quotient, remainder)` in one
  call), looks up the tens word, and appends the unit word only `if unit`
  is non-zero (so `80` is `"Eighty"`, not `"Eighty Zero"`).
- `number_to_words(n)`: negative numbers recurse with the sign stripped and
  `"Minus "` prepended. Numbers under 100 delegate entirely to
  `_below_hundred`.
- For 100 and above, the `for divisor, name in _SCALES:` loop walks the
  scales **largest first** (Crore, then Lakh, then Thousand, then Hundred)
  — this order is what produces correctly-grouped Indian numbering rather
  than international thousand-grouping. `count, n = divmod(n, divisor)` —
  at each scale, split off how many whole units of that scale fit
  (`count`), keeping the remainder (`n`) for the next, smaller scale.
  `if count:` skips a scale entirely if its count is zero (no spurious
  "Zero Crore").
- The recursive call `number_to_words(count)` (for Crore/Lakh/Thousand) lets
  this function correctly spell out a count that itself might be large
  (e.g. "Twelve Lakh" needs the lakh-count itself, `12`, spelled as
  "Twelve" via the `n < 100` base case — but a count like `245` crore would
  need its own three-digit spelling, which is exactly what the recursive
  call handles). For the Hundred scale specifically, `_below_hundred(count)`
  is used directly instead of recursing, since a hundreds-count is by
  definition under 10 and never needs the full scale machinery.
- Any final remainder under 100 (`if n:`) is appended via `_below_hundred`
  directly.
- `" ".join(parts)` — stitches every non-empty scale segment together with
  single spaces.

### `rupees_in_words(amount)`

```python
def rupees_in_words(amount) -> str:
    value = parse_amount(amount)
    if value is None:
        return ""
    rupees = int(value)
    paise = int(round((value - rupees) * 100))
    words = f"Rupees {number_to_words(rupees)}"
    if paise:
        words += f" and {number_to_words(paise)} Paise"
    return words + " Only"
```

**Job:** the full legal phrasing for a monetary amount — `"Rupees Forty
Five Lakh Only"`.
**Calls:** `parse_amount`, `number_to_words`.
**Line by line:** parses whatever was passed in (which could be a string
like `"45,00,000"`, see `parse_amount` below) into a float; splits it into
whole rupees and paise (the Indian currency's equivalent of cents — 1 rupee
= 100 paise) via `int(value)` and a rounded remainder calculation; only
appends the paise clause if there actually is a fractional amount; and
always closes with `"Only"` — the conventional word Indian legal/financial
documents append to a spelled-out amount specifically to prevent a forger
from appending extra digits/words after it.

### `parse_amount(value)`

```python
_AMOUNT_RE = re.compile(r"\d[\d,]*(?:\.\d{1,2})?")

def parse_amount(value) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = _AMOUNT_RE.search(str(value))
    if match is None:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return None
```

**Job:** accept an amount in *any* of the forms it might arrive in —
already a number, a plain numeric string, or messy OCR text like `"Rs.
45,00,000/-"` — and reliably return a clean float, or `None` if there's
genuinely no number to find. **This function is the direct fix for the real
bug recorded in `DECISIONS.md` decision 15**: an earlier version stripped
every non-digit character including keeping the `.` in `"Rs."`, which turned
`"Rs. 45,00,000/-"` into `0.45`.
**Calls:** nothing (just the compiled regex and built-ins).
**Line by line:**
- `isinstance(value, bool)` is checked *before* `isinstance(value, (int, float))`
  deliberately — in Python, `bool` is a subclass of `int` (`True == 1`), so
  without this explicit check first, a stray `True`/`False` value would
  silently parse as `1.0`/`0.0`, a subtle correctness trap this function
  closes off entirely by just refusing to treat booleans as amounts.
- `_AMOUNT_RE = re.compile(r"\d[\d,]*(?:\.\d{1,2})?")` — the key design
  choice is **locating** a number pattern within the string (`\d[\d,]*`:
  starts with a digit, followed by any run of digits/commas, optionally
  `(?:\.\d{1,2})?` a decimal point and one or two digits) rather than
  filtering the string character-by-character — this is precisely what
  avoids the `"Rs."` bug: the regex engine skips straight past the
  non-matching `"Rs. "` prefix and finds the real number starting at the
  first digit, never touching that stray full stop at all.
- `match.group(0).replace(",", "")` — once the number substring is
  isolated, *then* it's safe to strip commas (Indian digit-grouping
  separators) before converting to `float`.
- The `try/except ValueError` is a final defensive layer — in practice the
  regex should only ever match something `float()` can parse, but this
  guards against any edge case without crashing the caller.

### `format_indian_currency(value)`

```python
def format_indian_currency(value) -> str:
    amount = parse_amount(value)
    if amount is None:
        return ""
    rupees = int(amount)
    tail = str(rupees)[-3:]
    head = str(rupees)[:-3]
    if head:
        head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
        grouped = f"{head},{tail}"
    else:
        grouped = tail
    paise = int(round((amount - rupees) * 100))
    return f"{grouped}.{paise:02d}" if paise else grouped
```

**Job:** format a number using Indian digit grouping — `45000000` becomes
`"4,50,00,000"`.
**Calls:** `parse_amount`.
**Line by line:**
- `tail = str(rupees)[-3:]` / `head = str(rupees)[:-3]` — Indian grouping
  keeps the **last three** digits ungrouped-from-the-right (the "hundreds"
  place onward), and groups everything *before* that in pairs. So the whole
  number is split at the "last 3 digits" boundary first.
- `re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)` — this regex inserts a comma
  after any digit that is followed by a number of digits that's a multiple
  of two, all the way to the end of the string (`(?=(\d\d)+$)` is a
  lookahead — it checks what follows without consuming it, which is what
  lets the comma be inserted *between* characters rather than replacing
  any). Applied to the `head` portion only, this produces the "pairs of
  digits" grouping Indian numbering uses for everything above the last
  three digits (e.g. `head = "45000"` becomes `"45,000"` — wait, more
  precisely, applied to a `head` of arbitrary length it inserts a comma
  every two digits from the right).
- `grouped = f"{head},{tail}"` joins the regrouped head to the ungrouped
  three-digit tail with one final comma — unless `head` was empty (a number
  under 1000), in which case `grouped` is just `tail` with no comma needed
  at all.
- The paise suffix (`f"{grouped}.{paise:02d}"`) is appended only if nonzero,
  zero-padded to two digits (`:02d`) so `5` paise renders as `.05`, not
  `.5`.

### `_ordinal(day)`, `parse_date(value)`, `deed_date_parts(value)`, `format_long_date(value)`

```python
def _ordinal(day: int) -> str:
    if 10 <= day % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return f"{day}{suffix}"

def parse_date(value) -> Optional[date]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%Y/%m/%d", "%d %B %Y", "%d %b %Y", "%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None

def deed_date_parts(value):
    parsed = parse_date(value)
    if parsed is None:
        return ("__________", "________________", "20____")
    return (_ordinal(parsed.day), _MONTHS[parsed.month - 1], str(parsed.year))

def format_long_date(value) -> str:
    parsed = parse_date(value)
    if parsed is None:
        return str(value or "").strip()
    day, month, year = deed_date_parts(parsed)
    return f"{day} {month} {year}"
```

**Job:** a chain of four functions handling dates, which arrive from three
different sources with three different formats — the browser's native
`<input type="date">` (always `YYYY-MM-DD`), OCR text (anything from
`"15/03/2026"` to `"15 March 2026"`), and whatever a user might type freely
into a text field.
**Calls:** `deed_date_parts` and `format_long_date` both call `parse_date`;
`deed_date_parts` also calls `_ordinal`.
**Line by line:**
- `_ordinal(day)` — English ordinal suffixes have an irregularity: 11th,
  12th, 13th all take "th" (not "st"/"nd"/"rd" despite ending in 1/2/3)
  because of the teens exception. `10 <= day % 100 <= 20` catches 11-20 (and
  also, harmlessly, 110-120, 210-220, etc. — irrelevant for a day-of-month
  which is always ≤ 31) specifically to force "th" for that range before the
  normal last-digit rule (`{1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")`)
  applies to everything else.
- `parse_date(value)` tries, in order: already a `datetime`, already a
  `date`, or — the real work — a string tried against nine different
  `strptime` format patterns in sequence, returning the first one that
  parses successfully (`continue` on failure moves to the next format) and
  `None` if every single one fails. This is a pragmatic "try everything
  plausible" approach rather than a single strict format, appropriate here
  because the date genuinely can arrive in any of these shapes depending on
  its source.
- `deed_date_parts(value)` — returns the specific three-part tuple
  (ordinal day, full month name, year) the deed's preamble sentence is
  built from (`"this 15th day of March, 2026"`). If the date can't be
  parsed at all, it returns a **tuple of blank-fill placeholders**
  (underscored lines) rather than raising or returning `None` — so the deed
  preamble still renders as grammatically complete text with visible blanks
  for registration-time completion, never a crash or a missing sentence.
- `format_long_date(value)` — a simpler "give me one readable string"
  wrapper on top of the same parsing, used anywhere the deed just needs a
  plain `"15th March 2026"` phrase (the title recital's reference to the
  prior deed's date) rather than the three separate parts; falls back to
  whatever raw text was supplied (not blanks) if parsing fails, since in
  that context a user's own (unparseable but still meaningful) text is more
  useful than a placeholder.

### `format_aadhaar(value)` and `normalise_pan(value)`

```python
def format_aadhaar(value) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    if not digits:
        return ""
    return " ".join(digits[i:i + 4] for i in range(0, len(digits), 4))

def normalise_pan(value) -> str:
    candidate = re.sub(r"[^A-Za-z0-9]", "", str(value or "")).upper()
    return candidate if re.fullmatch(r"[A-Z]{5}\d{4}[A-Z]", candidate) else str(value or "").strip()
```

**Job:** `format_aadhaar` presents an Aadhaar number the way a deed recites
it — `1234 5678 9012`, in full. An earlier version of this feature masked it
to `XXXX XXXX 9012`; that was reversed, because the deed is the document that
*identifies* the parties and a Sub-Registrar rejects a masked identifier. See
`DECISIONS.md` decision A1, which supersedes decision 8. `normalise_pan`
cleans up a PAN (India's Permanent Account Number, a tax ID) into its
canonical form if it looks valid.
**Calls:** nothing.
**Line by line:**
- `format_aadhaar`: `re.sub(r"\D", "", ...)` strips every non-digit character
  (spaces, which Aadhaar numbers are commonly printed/typed with, among
  other stray characters) leaving just the raw digit sequence. Empty input
  gives an empty string, which the generator turns into a fill-in line. The
  join then regroups the digits in fours. Note it does not validate the
  length: partial or malformed OCR output is grouped as far as it goes rather
  than silently dropped, so the reviewer can see what was misread instead of
  finding a blank where a number should be.
- `normalise_pan`: strips anything that isn't a letter or digit and
  uppercases the rest, then checks that the result matches the exact PAN
  pattern (`[A-Z]{5}\d{4}[A-Z]` — five letters, four digits, one letter —
  India's actual PAN format). If it matches, return the cleaned,
  canonical form; if not — rather than silently discarding a value that
  merely looks malformed — return the original value, stripped of
  surrounding whitespace but otherwise untouched, on the theory that a
  human reviewing the field later can judge a clearly-wrong-but-visible
  value better than one that's been silently mangled into something else.

### `blank(width)`

```python
def blank(width: int = 20) -> str:
    return "_" * width
```

**Job:** produce a dotted/underscored fill-in line of a given width — the
convention a model legal deed uses for a detail left for registration-time
completion. Trivial, but used throughout `generator.py` (document 08)
wherever a field is genuinely missing and the deed still needs to read as
grammatically complete text around a visible gap, rather than rendering the
literal word `"None"` or an empty space that would make the sentence read
oddly.

---

## `backend/modules/drafting/extraction.py`

### The system prompt and the two safety-net regexes

```python
_SYSTEM_PROMPT = """
You are a document extraction engine for an Indian conveyancing practice. ...
""".strip()

_PAN_RE = re.compile(r"\b([A-Z]{5}\d{4}[A-Z])\b")
_AADHAAR_RE = re.compile(r"\b(\d{4}\s?\d{4}\s?\d{4})\b")
_PINCODE_RE = re.compile(r"\b(\d{6})\b")
```

**Job:** `_SYSTEM_PROMPT` is the standing instruction given to every
extraction call — it explicitly forbids guessing ("If a field is absent or
unreadable, return null. Never guess, infer or invent a value"), demands
exact reproduction of printed text, plain-digit amounts, ISO dates, and a
single bare JSON object with no prose. This is a direct lever against the
single biggest risk of using a vision model for legal-document data entry:
a model that "helpfully" fills in a plausible-looking value where there
isn't one. The three regexes are the deterministic cross-check against
exactly that risk for the three identifier types where a wrong-but-plausible
answer is most dangerous (a tax ID, a national ID number, a postal code).
**Note `_PINCODE_RE` is defined but not actually referenced anywhere else in
this file** — it exists as a prepared pattern, presumably for a
cross-check not yet wired up; nothing in the current extraction flow calls
it.

### `_field_labels(keys)` and `build_prompt(doc_label, target_keys)`

```python
def _field_labels(keys: Iterable[str]) -> str:
    by_key = {f.key: f for f in SALE_DEED_FIELDS}
    lines = []
    for key in keys:
        field = by_key.get(key)
        if field is None:
            continue
        hint = f" - {field.group}: {field.label}"
        lines.append(f'  "{key}": null,{hint}')
    return "\n".join(lines)

def build_prompt(doc_label: str, target_keys: List[str]) -> str:
    return (f"This document was supplied as: {doc_label}\n\n"
        "Extract the following fields from it. Use null for anything not legibly present in this particular document.\n\n"
        "{\n" f"{_field_labels(target_keys)}\n" '  "raw_text": null  - the complete text you read, verbatim\n' "}\n\n"
        "Return the JSON object only.")
```

**Job:** build a **scoped** prompt — the actual implementation of decision
7 ("extraction prompts are scoped per document").
**Calls:** `_field_labels` is called by `build_prompt`.
**Line by line:**
- `_field_labels`: builds `by_key`, a lookup dict from field key to `Field`
  object, once; then for each requested key, looks up that field's group
  and label to produce one line of a JSON-template-looking hint —
  `'  "vendor_name": null, - Vendor (Seller): Full Name'` — this is **shown
  to the model as part of the prompt**, not real JSON syntax being parsed;
  it's a human/model-readable template that happens to look like JSON so the
  model's eventual real JSON answer naturally follows the same key names
  and structure.
- `build_prompt`: wraps those field-hint lines in a full instruction — tell
  the model what kind of document this is (`doc_label`, e.g. "Proof of
  Identity of the Vendor..."), ask for exactly these fields, null for
  anything unreadable, and **also** always ask for `raw_text` — the verbatim
  transcription that `reconcile_identifiers` (below) depends on.

### `_call_gemini(prompt, image_blob, mime_type)`

```python
@retry_on_failure(retries=3, delay=2)
def _call_gemini(prompt: str, image_blob: bytes, mime_type: str) -> Dict[str, Any]:
    import google.generativeai as genai
    model = genai.GenerativeModel(model_name=MODEL_NAME, system_instruction=_SYSTEM_PROMPT)
    response = model.generate_content([prompt, {"mime_type": mime_type, "data": image_blob}])
    data = extract_json(response.text)
    if not isinstance(data, dict):
        raise ValueError(f"Expected a JSON object, got {type(data).__name__}")
    return data
```

**Job:** the actual network call to Gemini Vision, wrapped in the retry
decorator (prerequisites, B2; defined in `gemini.py` above).
**Calls:** `extract_json` (from `gemini.py`); the Gemini SDK itself.
**Line by line:**
- `import google.generativeai as genai` — imported *inside* the function
  rather than at module load time; this means the SDK is only actually
  loaded when extraction is first attempted, not on every backend startup
  — a minor startup-cost optimisation, and it also means a missing/broken
  SDK install wouldn't break importing this module at all, only calling
  this specific function.
- `genai.GenerativeModel(model_name=MODEL_NAME, system_instruction=_SYSTEM_PROMPT)`
  — creates a model handle configured with the standing system prompt.
- `model.generate_content([prompt, {"mime_type": mime_type, "data": image_blob}])`
  — sends a **list** containing both the text prompt and the raw image
  bytes together — this is the multi-modal (text + image) call described
  in prerequisites B8.
- `extract_json(response.text)` then a type check (`isinstance(data, dict)`)
  — if the model answered with, say, a bare JSON array or a plain string
  instead of an object, this raises `ValueError` explicitly, which
  `retry_on_failure` will catch and retry against (up to 3 times total)
  before finally giving up.

### `_clean(value)`

```python
def _clean(value: Any) -> Optional[str]:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (list, tuple)):
        joined = ", ".join(str(v).strip() for v in value if str(v).strip())
        return joined or None
    text = str(value).strip()
    if not text:
        return None
    if text.lower() in {"null", "none", "n/a", "na", "not available", "not found", "not present", "unknown", "-", "--"}:
        return None
    return text
```

**Job:** normalise the many different ways a language model expresses
"there's nothing here" into one consistent `None`, and otherwise coerce
whatever it did return into a plain string.
**Calls:** nothing.
**Line by line:** `None`/`bool` → `None` (same reasoning as
`parse_amount`'s bool guard). Numbers are stringified. A list/tuple (the
model occasionally answers a field with an array instead of a single value)
is joined into one comma-separated string, filtering out any blank entries
first, collapsing to `None` if nothing substantive remained. For everything
else, convert to string and strip whitespace; if empty, `None`. The final
`if text.lower() in {...}` check is the important one: a model will answer
a genuinely-absent field with any of a dozen different literal phrasings
("Not Available", "N/A", "null", a bare hyphen) — all of these are
explicitly recognised and converted to a real `None`, so downstream code
never has to deal with the literal string `"N/A"` masquerading as a real
value.

### `reconcile_identifiers(fields, raw_text, allowed_keys, case_type)`

```python
def reconcile_identifiers(fields, raw_text, allowed_keys=None, case_type=SALE_DEED):
    text = (raw_text or "").upper()
    result = dict(fields)
    in_scope = None if allowed_keys is None else set(allowed_keys)

    pans = _PAN_RE.findall(text)
    aadhaars = [a for a in _AADHAAR_RE.findall(raw_text or "") if len(re.sub(r"\D", "", a)) == 12]

    for role in PARTY_ROLES.get(case_type, PARTY_ROLES[SALE_DEED]):
        pan_key = f"{role}_pan"
        aadhaar_key = f"{role}_aadhaar"
        if in_scope is not None and not {pan_key, aadhaar_key} & in_scope:
            continue
        claimed = _clean(result.get(pan_key))
        if claimed:
            normalised = normalise_pan(claimed)
            if not _PAN_RE.fullmatch(normalised) and len(pans) == 1:
                normalised = pans[0]
            result[pan_key] = normalised
        elif len(pans) == 1:
            result[pan_key] = pans[0]

        claimed_aadhaar = _clean(result.get(aadhaar_key))
        source = claimed_aadhaar
        if not source and len(aadhaars) == 1:
            source = aadhaars[0]
        if source:
            result[aadhaar_key] = format_aadhaar(source)

    return result
```

**Job:** this is the implementation of decision 7's "a pattern match beats
the model's structured answer" — the regex safety net described conceptually
in document 01, implemented here in full.
**Calls:** `normalise_pan`, `format_aadhaar` (both from `formatting.py`).
**Line by line:**
- `text = (raw_text or "").upper()` — uppercased once, since PAN numbers
  are always uppercase and the regex is case-sensitive.
- `result = dict(fields)` — a **copy**, not the original dict — this
  function never mutates its input, following the same "always return a
  new value" discipline seen in the frontend's `deedStream.ts`.
- `in_scope = None if allowed_keys is None else set(allowed_keys)` — when
  `allowed_keys` is given (it always is, in practice — `extract_from_document`
  below always passes the document's `extracts` list), this is converted to
  a `set` for fast membership testing.
- `pans = _PAN_RE.findall(text)` / `aadhaars = [...]` — find **every**
  PAN-shaped substring and every 12-digit Aadhaar-shaped substring anywhere
  in the whole transcribed text, not just where the model happened to
  report them. The Aadhaar list filters to groups whose digits (ignoring
  internal spaces) total exactly 12 — `_AADHAAR_RE` alone could otherwise
  match a 12-digit run that's actually part of something else entirely.
- `for role in PARTY_ROLES.get(case_type, ...)` — the rescue runs for both
  party roles of the instrument being drafted: `("vendor", "purchaser")` for
  a Sale Deed, `("donor", "donee")` for a Gift Deed. Both roles are tried
  regardless of which specific document is being processed (a vendor's ID
  card should never populate the purchaser's PAN, which is exactly what the
  scope check below prevents).
- `if in_scope is not None and not {pan_key, aadhaar_key} & in_scope: continue`
  — **this is the scope guard decision 7 explicitly calls out**: `&` on two
  sets is intersection; if neither `{role}_pan` nor `{role}_aadhaar` is
  among the fields this document is actually supposed to carry, skip this
  role entirely for this document. Without this check, a vendor's ID card
  containing exactly one PAN number would have that PAN rescued onto
  *both* `vendor_pan` and (incorrectly) `purchaser_pan`, since the regex
  search has no inherent concept of "whose card is this."
- The PAN logic: if the model *claimed* a PAN value, normalise it; if the
  normalised form **doesn't** actually match the valid PAN pattern **and**
  there's exactly one PAN-shaped match in the raw text, trust the pattern
  match instead (`normalised = pans[0]`) — this is the literal "disagreement
  resolved in favour of the pattern" behaviour. If the model claimed
  *nothing* but exactly one PAN was found in the text anyway, use that.
  Note the specific caution of `len(pans) == 1` (not `>= 1`) throughout —
  if the raw text happens to contain *two or more* PAN-shaped matches, this
  function deliberately does **not** guess which one is correct; it leaves
  the ambiguity for a human to resolve at review.
- The Aadhaar logic follows the same shape but simpler (no "is this valid"
  check needed beyond the 12-digit count already applied above), and passes
  the result through `format_aadhaar` before storing it, so the value is
  already grouped in fours by the time the review form or the deed sees it.

### `extract_from_document(image_blob, mime_type, doc_id, doc_label, case_type)`

```python
def extract_from_document(image_blob, mime_type, doc_id, doc_label="", case_type=SALE_DEED):
    spec = document_by_id(case_type, doc_id)
    target_keys = spec.get("extracts") or SALE_DEED_FIELD_KEYS
    label = doc_label or spec.get("label") or doc_id

    try:
        raw = _call_gemini(build_prompt(label, list(target_keys)), image_blob, mime_type)
    except Exception as exc:
        logger.warning("Extraction failed for %s: %s", doc_id, exc)
        return {"docId": doc_id, "label": label, "fields": {}, "rawText": "", "error": str(exc)}

    raw_text = _clean(raw.pop("raw_text", None)) or ""
    fields = {k: _clean(v) for k, v in raw.items() if k in SALE_DEED_FIELD_KEYS}
    fields = {k: v for k, v in fields.items() if v is not None}
    fields = reconcile_identifiers(fields, raw_text, allowed_keys=target_keys)
    fields = {k: v for k, v in fields.items() if _clean(v) is not None}

    logger.info("Extracted %d field(s) from %s", len(fields), doc_id)
    return {"docId": doc_id, "label": label, "fields": fields, "rawText": raw_text[:4000], "error": None}
```

**Job:** the top-level function for extracting one document — this is what
`routers/drafting.py`'s `extract_documents` endpoint calls directly, and the
function that is guaranteed to **never raise**, per its own docstring.
**Calls:** `document_by_id` (document 06), `build_prompt`, `_call_gemini`,
`_clean`, `reconcile_identifiers`.
**Line by line:**
- `spec = document_by_id(case_type, doc_id)` — look up this document's
  checklist entry (an empty dict if the id is unrecognised — `document_by_id`
  never raises either, per document 06).
- `target_keys = spec.get("extracts") or SALE_DEED_FIELD_KEYS` — use the
  document's declared field list if it has one; otherwise (an unrecognised
  document, or one whose `extracts` list happens to be empty) fall back to
  asking for *every* field — a generic, unscoped extraction rather than
  extracting nothing at all.
- `label = doc_label or spec.get("label") or doc_id` — three fallbacks in
  priority order for what to call this document in the prompt and in
  responses.
- `try: raw = _call_gemini(...) except Exception as exc:` — **this is the
  resilience boundary.** If the Gemini call fails even after its own
  internal three retries (network failure, quota exhaustion, malformed
  response that never resolved to valid JSON), this `except` catches
  literally any exception, logs it, and returns a **complete, well-formed
  result dict** with empty fields and the error message recorded — it does
  **not** propagate the exception upward. This is precisely why
  `extractFromImage` on the frontend (document 02) can safely always mark
  the document as `"Uploaded"`: this function guarantees a usable response
  shape no matter what went wrong inside it.
- `raw_text = _clean(raw.pop("raw_text", None)) or ""` — `dict.pop` removes
  and returns the `raw_text` key in one step (so it doesn't also end up
  being treated as a regular field below); cleaned via `_clean`, defaulting
  to an empty string rather than `None` (this value flows into
  `reconcile_identifiers`, which expects a string it can call `.upper()` on).
- `fields = {k: _clean(v) for k, v in raw.items() if k in SALE_DEED_FIELD_KEYS}`
  — **only** keys that are actually known Sale Deed fields survive this
  filter; if the model hallucinated an extra key not in the schema, it's
  silently discarded here.
- `fields = {k: v for k, v in fields.items() if v is not None}` — drop
  anything `_clean` reduced to `None` (the "nothing here" normalisation).
- `fields = reconcile_identifiers(fields, raw_text, allowed_keys=target_keys)`
  — run the PAN/Aadhaar rescue pass, scoped to exactly this document's
  declared fields.
- `fields = {k: v for k, v in fields.items() if _clean(v) is not None}` — a
  **second** clean-and-filter pass, specifically because
  `reconcile_identifiers` can itself introduce new values (a rescued PAN, a
  masked Aadhaar) that weren't present in the first filtering pass and need
  the same "is this actually meaningful" check applied.
- The successful return includes `rawText: raw_text[:4000]` — truncated to
  4000 characters as a sane upper bound (a very long or garbled OCR
  transcription shouldn't balloon the response size indefinitely), and
  `error: None` signalling success.

### `merge_extractions(results, case_type)`

```python
def merge_extractions(results, case_type=SALE_DEED):
    merged: Dict[str, Any] = {}
    provenance: Dict[str, str] = {}
    authoritative: Dict[str, bool] = {}

    for result in results:
        doc_id = result.get("docId", "")
        declared = set(document_by_id(case_type, doc_id).get("extracts") or [])
        for key, value in (result.get("fields") or {}).items():
            cleaned = _clean(value)
            if cleaned is None:
                continue
            is_authoritative = key in declared
            if key not in merged or (is_authoritative and not authoritative.get(key)):
                merged[key] = cleaned
                provenance[key] = doc_id
                authoritative[key] = is_authoritative

    for key in ("sale_consideration_amount", "market_value", "stamp_duty_paid", "registration_fee"):
        amount = parse_amount(merged.get(key))
        if amount is not None:
            merged[key] = str(int(amount)) if amount.is_integer() else str(amount)

    return {"fields": merged, "provenance": provenance}
```

**Job:** fold several documents' individually-extracted fields into one
field set, implementing decision 7's precedence rule: a document that
*declares* a field as one it's authoritative for wins over a document that
merely happened to also mention it.
**Calls:** `document_by_id`, `_clean`, `parse_amount`.
**Line by line:**
- Three parallel dicts are built up together: `merged` (the winning value
  per field), `provenance` (which document id that value came from), and
  `authoritative` (whether that winning value came from a document
  *declared* authoritative for that field, so a later document can be
  correctly compared against it).
- `declared = set(document_by_id(case_type, doc_id).get("extracts") or [])`
  — for each result, look up (again) which fields that document is
  declared to own.
- `is_authoritative = key in declared` — is *this* value, for *this* key,
  coming from a document that's supposed to carry it.
- `if key not in merged or (is_authoritative and not authoritative.get(key)):`
  — the actual precedence rule, read as: accept this value if **either**
  nothing has claimed this key yet, **or** this value is authoritative and
  the *previous* winner for this key wasn't. Notice what this does **not**
  do: an authoritative value, once set, can never be displaced by a later
  non-authoritative one, and two authoritative documents disagreeing on the
  same field simply keep whichever was processed first (matching "first
  upload wins" among equals, per decision 7's description) — there's no
  attempt to adjudicate between two equally-authoritative conflicting
  claims beyond upload order.
- The final loop re-parses four known amount fields through `parse_amount`
  and re-stores them as plain numeric strings (`str(int(amount))` if the
  value is a whole number, otherwise `str(amount)` preserving a decimal) —
  this guarantees that whatever messy numeric-ish text any single document
  contributed, the merged result always carries a clean, parseable number
  string for these specific fields, which is what lets the generator
  (document 08) format them as currency and spell them out in words
  without re-doing this parsing itself.

### `missing_required_fields(fields)` and `extraction_summary(fields)`

```python
def missing_required_fields(fields: Dict[str, Any]) -> List[str]:
    return [f.key for f in SALE_DEED_FIELDS if f.required and f.key not in DERIVABLE_FIELDS and _clean(fields.get(f.key)) is None]

def extraction_summary(fields: Dict[str, Any]) -> Dict[str, Any]:
    filled = [k for k in SALE_DEED_FIELD_KEYS if _clean(fields.get(k)) is not None]
    missing = missing_required_fields(fields)
    return {"fieldsFilled": len(filled), "fieldsTotal": len(SALE_DEED_FIELD_KEYS),
            "missingRequired": missing, "readyToGenerate": not missing}
```

**Job:** the backend's authoritative version of exactly what
`caseTypes.ts`'s `missingRequiredFields` computes client-side — used by
every endpoint (`/extract`, `/merge`, `/preview`) to report readiness.
**Calls:** `missing_required_fields` is called by `extraction_summary`;
both call `_clean`.
**Line by line:** identical logic to the frontend's version from document
03 — a field is missing only if it's `required`, not one of the two
`DERIVABLE_FIELDS`, and its current value cleans to `None`.
`extraction_summary` additionally counts how many of *all* fields (not just
required ones) have any value at all (`fieldsFilled`/`fieldsTotal`), and
computes `readyToGenerate` as simply "is the missing list empty" —
`not missing` relies on Python treating an empty list as falsy, so
`not []` is `True`.

---

Next: **[08-backend-deed-generator.md](./08-backend-deed-generator.md)**.
