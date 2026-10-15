# 08 — `backend/modules/drafting/generator.py`, Function by Function

This file is the actual Sale Deed — not the AI, not the PDF layout, just the
deterministic structure and legal wording of the document itself. Read
[00-prerequisites.md](./00-prerequisites.md) section B12 (what a Sale Deed
is) before this document if you haven't.

## Why this file exists, and what breaks without it

This is the single most legally load-bearing file in the whole feature.
`DECISIONS.md` decision 2 explains why: the deed's fifteen operative clauses
are **template-locked** — fixed, settled wording that never varies between
generations — because a clause that silently drifts between two generations
of the "same" deed is a clause that would need to be re-registered, at the
parties' expense, if the discrepancy were ever noticed. This file is what
*is* that fixed wording. **What breaks without it:** there is no deed at
all. `stream.py` (document 09) has nothing to stream, `pdf.py` and
`docx_export.py` (document 10) have nothing to render, and the `/preview`
endpoint has nothing to return — every other file downstream of this one
exists purely to transmit or format what this file produces.

## The two kinds of content, and why that split exists

Three passages in this deed (`title_recital`, `agreement_recital`,
`schedule_body`) are the only ones the AI model is ever allowed to write
(document 09 handles asking for them). Everything else in this file is pure,
deterministic Python — string formatting from field values, with **no AI
involvement whatsoever**. This file is written so that it produces a
**complete, legally coherent deed on its own**, with sensible default
wording for all three of those passages, even if the AI is never consulted
at all. That is not an afterthought — it is the design: `build_sections`
takes an optional `narrative` dict of AI-authored overrides, and every
narrative-eligible section falls back to a `_default_*` function if its
override is absent. Document 09's entire reason to exist is deciding
*when* to supply that `narrative` dict; this file works perfectly without
it.

## `Section` — the data shape every part of the deed is represented as

```python
class Section(dict):
    def __init__(self, id: str, style: str, body: str = "", heading: str = ""):
        super().__init__(id=id, style=style, heading=heading, body=body)
```

**Job:** a `Section` is one block of the deed — the title, a clause, the
Schedule, a signature page. It carries exactly four things: a unique `id`
(used by the SSE stream and the frontend's edit-tracking to address this
section specifically), a `style` (which drives how it's laid out — in CSS
on screen, in a `ParagraphStyle` in the PDF), an optional `heading`, and its
`body` text.
**Line by line:** `class Section(dict):` — this class **is** a dictionary
(it inherits from `dict` directly), just constructed with required/named
fields rather than arbitrary keys. `super().__init__(id=id, style=style,
heading=heading, body=body)` calls `dict`'s own constructor with those four
keyword arguments, which is exactly equivalent to writing `{"id": id,
"style": style, "heading": heading, "body": body}` — the benefit of making
it a subclass rather than a plain dict literal is that `Section("title",
"title", "SALE DEED")` self-documents its positional arguments at every
call site in `build_sections` below, while still behaving as an ordinary
dict everywhere else in the codebase that expects one (JSON serialisation,
the frontend contract, `dict(section)` copies elsewhere).

## Small value-formatting helpers private to this file

### `_v(fields, key, width)` and `_has(fields, key)`

```python
def _v(fields: Dict[str, Any], key: str, width: int = 24) -> str:
    value = fields.get(key)
    if value is None:
        return blank(width)
    text = str(value).strip()
    return text or blank(width)

def _has(fields: Dict[str, Any], key: str) -> bool:
    return bool(str(fields.get(key) or "").strip())
```

**Job:** `_v` is the single most-used helper in this file — "give me this
field's value, or a dotted blank line of the right width if it's missing."
`_has` is a simple boolean check used where a blank fill-in wouldn't make
sense (deciding *whether* to include an optional line at all, rather than
what to put in it).
**Calls:** `_v` calls `blank` (document 07's `formatting.py`).
**Line by line:** `_v` — if the key is entirely absent (`None`), return a
blank immediately. Otherwise convert to string and strip whitespace; if
that leaves an empty string (the field exists but is blank), *still* return
a blank fill-line rather than an empty string — the `width` parameter
controls how long that fill-line looks, calibrated per-field throughout
this file so e.g. a name gets a shorter blank than a full address.

### `_party_block(fields, role, caption, part)`

```python
def _party_block(fields, role, caption, part) -> str:
    name = _v(fields, f"{role}_name", 28).upper()
    father = _v(fields, f"{role}_father_name", 24)
    age = _v(fields, f"{role}_age", 4)
    marital = _v(fields, f"{role}_marital_status", 12)
    occupation = _v(fields, f"{role}_occupation", 16)
    nationality = str(fields.get(f"{role}_nationality") or "Indian").strip()
    address = _v(fields, f"{role}_address", 40)
    pan = _v(fields, f"{role}_pan", 12)
    aadhaar = format_aadhaar(fields.get(f"{role}_aadhaar")) or blank(12)

    return (f"{name}, son / daughter / wife of {father}, aged about {age} years, "
            f"{marital} by marital status, by occupation {occupation}, "
            f"{nationality} National, residing at {address}, holding PAN Card "
            f"No. {pan} and Aadhaar Card No. {aadhaar} "
            f"(hereinafter called "the {caption}") of the {part}.")
```

**Job:** render one party's (Vendor's or Purchaser's) full legal
introduction paragraph — this one function produces both the Vendor and
Purchaser sections in `build_sections`, just called with different `role`,
`caption`, and `part` arguments.
**Calls:** `_v`, `format_aadhaar` (from `formatting.py`).
**Line by line:**
- Every field is fetched with the shared `role` prefix (`f"{role}_name"`,
  so `"vendor_name"` or `"purchaser_name"` depending on which call this is)
  — this is what makes one function serve both parties rather than needing
  near-duplicate `_vendor_block`/`_purchaser_block` functions.
- `name = ... .upper()` — party names are conventionally rendered in
  capitals in this kind of legal document (matching the reference
  `Sale-Deed.pdf`).
- `nationality = str(fields.get(...) or "Indian").strip()` — defaults to
  `"Indian"` specifically (not a blank line) when absent, since the vast
  majority of parties to a deed registered in India are Indian nationals,
  and a blank here would read oddly in an otherwise-complete sentence.
- `aadhaar = format_aadhaar(fields.get(f"{role}_aadhaar")) or blank(12)` —
  the number is recited **in full**, grouped in fours, because the deed is
  what identifies the parties to the Sub-Registrar; see `DECISIONS.md`
  decision A1, which reversed the earlier masking behaviour. Formatting is
  applied again here rather than trusted from extraction so that a value the
  user typed into the review form is presented the same way as one read off
  a scan. If there's no Aadhaar at all, `format_aadhaar` returns `""` and
  `or blank(12)` supplies the fill-line instead.
- The final f-string assembles the whole sentence using every value, with
  `caption` (`"VENDOR"` or `"PURCHASER"`) and `part` (`"ONE PART"` /
  `"OTHER PART"`) distinguishing the two calls' output.

### `_consideration_phrase(fields)` and `_market_value_phrase(fields)`

```python
def _consideration_phrase(fields) -> str:
    amount = parse_amount(fields.get("sale_consideration_amount"))
    if amount is None:
        return f"Rs. {blank(16)}/- ({blank(40)})"
    words = str(fields.get("sale_consideration_words") or "").strip() or rupees_in_words(amount)
    return f"Rs. {format_indian_currency(amount)}/- ({words})"

def _market_value_phrase(fields) -> str:
    amount = parse_amount(fields.get("market_value"))
    if amount is None:
        return f"Rs. {blank(16)}/-"
    return f"Rs. {format_indian_currency(amount)}/- ({rupees_in_words(amount)})"
```

**Job:** both render a monetary amount as the full `"Rs. 4,50,00,000/-
(Rupees Four Crore Fifty Lakh Only)"` phrasing a deed uses, each for its own
field.
**Calls:** `parse_amount`, `format_indian_currency`, `rupees_in_words` (all
`formatting.py`, document 07).
**Line by line (the interesting difference between the two):**
`_consideration_phrase` checks `fields.get("sale_consideration_words")`
first — a field the *user* can supply directly (and which `extraction.py`
sometimes recovers from a document) — and only falls back to computing the
words itself via `rupees_in_words(amount)` if nothing was supplied. This is
`DERIVABLE_FIELDS` (document 06) in action: `sale_consideration_words` is
one of the two fields the generator can compute on its own, and this is
exactly where that computation happens — the review form never *has* to
ask for it, because this line will always produce something reasonable
even if it's left blank. `_market_value_phrase` has no equivalent
user-suppliable words field — the market value's words are always computed
fresh, every time.

### `_default_title_recital(fields)`

```python
def _default_title_recital(fields) -> str:
    supplied = str(fields.get("title_recital") or "").strip()
    if supplied:
        return supplied
    return (f"WHEREAS the Vendor is the absolute owner of and is in lawful, peaceful and vacant "
            f"possession and enjoyment of the property more particularly described in the Schedule "
            f"hereunder written, having acquired the same by and under a registered Sale Deed bearing "
            f"Document No. {_v(fields, 'prior_deed_document_no', 18)}, registered in Addl. Book No. "
            f"{_v(fields, 'prior_deed_book_no', 8)}, Volume No. {_v(fields, 'prior_deed_volume_no', 8)}, "
            f"at Pages {_v(fields, 'prior_deed_pages', 14)}, dated "
            f"{format_long_date(fields.get('prior_deed_date')) or blank(18)}, duly registered in the "
            f"Office of the Sub-Registrar, {_v(fields, 'prior_deed_sro', 18)}, and the Vendor has since "
            f"then been holding the said property as its absolute owner, paying all taxes and outgoings "
            f"in respect thereof, and the revenue records in respect of the said property stand mutated "
            f"in the name of the Vendor.")
```

**Job:** this is one of the two "recital" fallback functions — called by
`build_sections` whenever the AI-authored `narrative` dict doesn't contain
a usable `title_recital` (either because the AI was never consulted, it
failed, or it returned something too short — see document 09).
**Calls:** `_v`, `format_long_date` (`formatting.py`).
**Line by line:** `supplied = str(fields.get("title_recital") or "").strip()`
— checks first whether the **user themselves** already typed a custom
title recital directly into that field (recall from `caseTypes.ts`/
`schema.py` that `title_recital` is itself one of the Sale Deed's fields,
with help text "Left blank, this recital is drafted for you") — if so, use
exactly that, verbatim, no further processing. Only if genuinely nothing
was supplied does the function fall through to the fixed WHEREAS paragraph,
which weaves in every prior-deed detail (document number, book, volume,
pages, date, Sub-Registrar's office) via `_v` — each individually falling
back to its own blank fill-line if that specific detail is missing, so the
paragraph always reads as one grammatically complete sentence regardless of
how much or how little prior-deed information was actually captured.

### `_default_agreement_recital(fields)`

A fixed paragraph (no field interpolation at all, beyond what
`_consideration_phrase` embeds) — the standard "AND WHEREAS the Vendor...
has agreed to sell... for a total sale consideration of..." recital. It
differs from `_default_title_recital` in containing almost no blanks of its
own, because this recital's content (the parties' free will, lack of
coercion, the Purchaser's satisfaction with the title) is boilerplate that
doesn't actually depend on any specific field except the consideration
amount.

### `_default_schedule_body(fields)`

```python
def _default_schedule_body(fields) -> str:
    lines: List[str] = []
    descriptors = [("Survey No.", "survey_number"), ("Sub-Division No.", "sub_division_number"),
        ("P.T. Sheet No.", "pt_sheet_number"), ("Chalta No.", "chalta_number"),
        ("Extent / Area", "property_area"), ("Village / City", "village_or_city"),
        ("Taluka", "taluka"), ("District", "district"), ("State", "state")]
    for label, key in descriptors:
        if _has(fields, key):
            lines.append(f"{label}: {str(fields[key]).strip()}")

    described = str(fields.get("property_description") or "").strip()
    if described:
        lines.append("")
        lines.append(described)
    elif not lines:
        lines.append(blank(60))

    return "\n".join(lines)
```

**Job:** render the Schedule — the precise description of the property
being conveyed — as short labelled lines followed by a free-text
description.
**Calls:** `_has`, `blank`.
**Line by line:** walks a fixed list of (label, field key) pairs in a
deliberate order (survey/sub-division/sheet/chalta numbers, then area, then
the location hierarchy village→taluka→district→state) and includes a line
**only** for whichever of these were actually supplied (`if _has(fields,
key):`) — unlike `_v`, there is no blank fill-line per missing descriptor
here; a descriptor that wasn't captured is simply omitted entirely rather
than cluttering the Schedule with half a dozen blank lines. If a free-text
`property_description` was supplied, it's appended after a blank separator
line. The `elif not lines:` branch only fires if **neither** any descriptor
**nor** a description was supplied at all — in that one worst case, a
single wide blank fill-line (`blank(60)`) is produced so the Schedule
section is never rendered completely empty.

### `_boundaries_body(fields)`

A four-line block (East/West/North/South), each line built via `_v` with a
34-character blank width if that direction's boundary is missing —
structurally the simplest of the body-builder functions, included here for
completeness since it feeds directly into the `"boundaries"` section in
`build_sections`.

---

## `_operative_clauses(fields)` — the fifteen template-locked clauses

```python
def _operative_clauses(fields) -> List[str]:
    consideration = _consideration_phrase(fields)
    payment = str(fields.get("mode_of_payment") or "").strip()
    payment_clause = f" The said consideration has been paid by way of {payment}." if payment else ""
    authority = _v(fields, "local_authority", 22)
    stamp = parse_amount(fields.get("stamp_duty_paid"))
    reg_fee = parse_amount(fields.get("registration_fee"))
    duty_particulars = ""
    if stamp is not None:
        duty_particulars += f" Stamp duty of Rs. {format_indian_currency(stamp)}/- has been paid hereon."
    if reg_fee is not None:
        duty_particulars += f" Registration fee of Rs. {format_indian_currency(reg_fee)}/- has been paid."

    return [
        f"That in pursuance of the said agreement and in consideration of {consideration}, ... {payment_clause}",
        "That the Vendor doth hereby sell, convey, transfer, assign and assure unto the Purchaser ...",
        "That the actual, physical, vacant and peaceful possession ...",
        f"That all expenses of and incidental to this Sale Deed ... {duty_particulars}",
        "That all taxes, cesses, charges, dues, demands, arrears ...",
        f"That the Vendor doth hereby convey a NO OBJECTION CERTIFICATE ... {authority} ...",
        "That all rights, liberties, easements and appurtenances ...",
        "That the Vendor has assured and declared ... free from all sorts of encumbrances ...",
        "That the Purchaser shall have full right to apply for and obtain water, electricity ...",
        "That the Vendor has, simultaneously with the execution hereof, delivered ... all the original previous title deeds ...",
        "That the Vendor doth hereby declare and assure ... not been acquired or requisitioned ...",
        f"That the market value of the said property is {_market_value_phrase(fields)}. ...",
        "That the Vendor doth hereby covenant ... execute and register such further deeds ...",
        "That the Vendor doth hereby declare that he / she has not entered into any prior agreement ...",
        "That the Vendor and the Purchaser hereby declare that they are Indian Nationals ...",
    ]
```

**Job:** this is decision 2's "fifteen operative clauses" in the flesh —
settled conveyancing language that is **identical in structure across every
single generation of every deed**, with only a handful of specific values
(the consideration amount, the payment mode, the stamp duty/registration
fee figures, the local authority name, the market value) interpolated into
otherwise entirely fixed sentences.
**Calls:** `_consideration_phrase`, `_v`, `parse_amount`,
`format_indian_currency`, `_market_value_phrase`.
**Line by line (the interpolation pattern, which repeats across several
clauses):**
- `payment_clause` — an *entire extra sentence*, not just a value, that is
  conditionally appended: `if payment else ""` — if no payment mode was
  recorded, clause 1 simply ends one sentence earlier, rather than
  containing an awkward "paid by way of ________" blank. This is a
  different strategy from `_v`'s blank-fill approach, chosen deliberately
  here because an entire optional clarifying sentence is either worth
  including or not, whereas a core legal fact (a party's name, an amount)
  must always appear, blank or not.
- `duty_particulars` — built the same way, as up to two optional appended
  sentences (stamp duty paid, registration fee paid), each independently
  present only if that specific amount exists.
- Every clause is **plain Python string literals** — nothing about their
  core wording is parameterised at all beyond these few interpolations.
  This is the literal meaning of "template-locked": edit this file's source
  code to change a clause's wording, and that is the *only* way it ever
  changes — no prompt, no model temperature, no randomness can alter so
  much as a comma in these fifteen sentences.
- The function returns a plain Python `list` of fifteen strings, in a fixed
  order — `build_sections` below is what turns this list into numbered
  `Section` objects.

---

## `build_sections(fields, narrative)` — assembling the whole deed

```python
def build_sections(fields: Dict[str, Any], narrative: Optional[Dict[str, str]] = None) -> List[Section]:
    narrative = narrative or {}
    place = _v(fields, "place_of_execution", 18)
    day, month, year = deed_date_parts(fields.get("date_of_execution"))

    sections: List[Section] = [
        Section("title", "title", "SALE DEED"),
        Section("preamble", "preamble", f"This SALE DEED is made, executed and entered into at {place} on this {day} day of {month}, {year}."),
        Section("between_label", "party-label", "BETWEEN"),
        Section("vendor", "party", _party_block(fields, "vendor", "VENDOR", "ONE PART")),
        Section("and_label", "party-label", "AND"),
        Section("purchaser", "party", _party_block(fields, "purchaser", "PURCHASER", "OTHER PART")),
        Section("expression", "preamble", "The expressions "the Vendor" and "the Purchaser" shall, ..."),
        Section("title_recital", "recital", narrative.get("title_recital") or _default_title_recital(fields)),
        Section("agreement_recital", "recital", narrative.get("agreement_recital") or _default_agreement_recital(fields)),
        Section("witnesseth", "operative-heading", "NOW THIS DEED WITNESSETH AS UNDER:-"),
    ]

    for index, clause in enumerate(_operative_clauses(fields), start=1):
        sections.append(Section(f"clause_{index}", "clause", clause, heading=str(index)))

    sections.extend([
        Section("schedule_heading", "schedule-heading", "SCHEDULE"),
        Section("schedule_note", "schedule-note", "(The complete description of the property ...)"),
        Section("schedule_body", "schedule", narrative.get("schedule_body") or _default_schedule_body(fields)),
        Section("boundaries", "boundaries", _boundaries_body(fields), heading="BOUNDED ON THE"),
        Section("attestation", "attestation", "IN WITNESS WHEREOF the parties hereto have signed ..."),
        Section("sign_vendor", "signature-block", _v(fields, "vendor_name", 28).upper(), heading="1. NAME AND SIGNATURE OF THE VENDOR"),
        Section("sign_purchaser", "signature-block", _v(fields, "purchaser_name", 28).upper(), heading="2. NAME AND SIGNATURE OF THE PURCHASER"),
        Section("witnesses", "witnesses", f"1. {_v(fields, 'witness_1_name', 26)}\n   {_v(fields, 'witness_1_address', 40)}\n\n2. ...", heading="WITNESSES:-"),
    ])
    return sections
```

**Job:** this is **the** function — the entire Sale Deed, assembled in
exact reading order, as a flat `List[Section]`. Every other backend module
in this feature (the `/preview` and `/generate` endpoints, both export
functions) calls this function, directly or indirectly, to get the deed's
actual content.
**Calls:** `_v`, `deed_date_parts` (`formatting.py`), `_party_block`,
`_default_title_recital`, `_default_agreement_recital`, `_operative_clauses`,
`_default_schedule_body`, `_boundaries_body`.
**Line by line:**
- `narrative = narrative or {}` — if no AI-authored overrides were supplied
  at all (`None`, the default), treat it as an empty dict rather than
  needing a `None`-check at every usage site below.
- `place`, `day, month, year` — computed once up front, used only in the
  preamble sentence.
- The opening list (title through `witnesseth`) is built as a single
  `List[Section]` literal — title, preamble sentence, the `BETWEEN`/`AND`
  party-label scaffolding surrounding each party's full introduction block,
  the standing "expressions" clause defining what "the Vendor"/"the
  Purchaser" mean throughout, the two recitals, and finally the heading
  that introduces the operative clauses.
- **This is the line that decides AI vs. template, section by section**:
  `narrative.get("title_recital") or _default_title_recital(fields)` — if
  the `narrative` dict has a non-empty value for this key (meaning the AI
  successfully authored it, per document 09's filtering), use it;
  otherwise call the deterministic fallback. The exact same pattern repeats
  verbatim for `agreement_recital`
  (`narrative.get("agreement_recital") or _default_agreement_recital(fields)`)
  and, further down, for `schedule_body`. All three are listed together in
  document 09's `NARRATIVE_SECTIONS` tuple as the only sections the model is
  ever asked to author — this `narrative.get(key) or _default_*(fields)`
  pattern is the single mechanism, repeated three times, that makes the
  fallback to template wording actually take effect.
- `for index, clause in enumerate(_operative_clauses(fields), start=1):` —
  `enumerate(..., start=1)` numbers the clauses starting at 1 (not 0,
  matching how a legal deed numbers its clauses for a human reader); each
  clause becomes its own `Section` with id `clause_1`, `clause_2`, etc., and
  its `heading` set to the clause number as a string (used by both the
  on-screen rendering and the PDF to print `"1."`, `"2."`, ... before each
  clause).
- The closing `sections.extend([...])` appends the Schedule heading, its
  explanatory note, the Schedule body (again AI-or-default), the
  boundaries block, the attestation paragraph, two signature-block
  sections (one per party, each carrying just that party's name as its
  `body`), and finally the witnesses block listing both witnesses' names
  and addresses.
- The function returns the complete, flat list — there is no nesting; a
  "page" or "clause group" is not a structural concept in this data, only
  `style` tags that downstream renderers (the browser, the PDF, the DOCX)
  interpret to decide layout, pagination, and page breaks each in their own
  way.

## `render_plain_text(sections)` and `estimate_pages(sections)`

```python
def render_plain_text(sections: List[Dict[str, Any]]) -> str:
    out: List[str] = []
    for section in sections:
        heading = str(section.get("heading") or "").strip()
        body = str(section.get("body") or "").strip()
        if section.get("style") == "clause" and heading:
            out.append(f"{heading}. {body}")
        else:
            if heading:
                out.append(heading)
            if body:
                out.append(body)
    return "\n\n".join(out)

def estimate_pages(sections: List[Dict[str, Any]]) -> int:
    words = len(render_plain_text(sections).split())
    return max(1, -(-words // WORDS_PER_PAGE)) + SIGNATURE_PAGES
```

**Job:** `render_plain_text` flattens the structured section list into one
plain-text document — used for the `/preview` endpoint's `plainText` field
and, within `stream.py` (document 09), to compute the final `plainText` of
the `"done"` SSE event; it is **not** used for the PDF or DOCX (those
render each section individually with its own styling, document 10).
`estimate_pages` is a rough page-count estimate shown in the UI while
generating (`"N pages"`) and in the `"meta"` SSE event.
**Calls:** `estimate_pages` calls `render_plain_text`.
**Line by line:**
- `render_plain_text`: for a `"clause"` section with a heading, format it as
  `"3. That the Vendor doth hereby..."` (number, period, space, body) —
  matching how a clause actually reads on the page. For every other style,
  emit the heading and body as separate paragraphs (whichever of the two is
  non-empty) — a title has no separate heading, so only its body prints;
  a signature block has both. `"\n\n".join(out)` separates every emitted
  piece with a blank line, the plain-text convention for paragraph breaks.
- `estimate_pages`: counts whitespace-separated words in the flattened
  text, divides by `WORDS_PER_PAGE` (330, a constant defined near the top
  of the file as "roughly how many rendered words fit on a printed page"),
  and rounds **up** via the `-(-words // WORDS_PER_PAGE)` idiom — negating,
  floor-dividing, then negating again is a standard Python trick for
  ceiling division using only integer operators (Python's `//` always
  floors, even for a result that should round up; this double-negation
  flips a floor into a ceiling). `max(1, ...)` guarantees at least one page
  even for a vanishingly short deed. Finally, `+ SIGNATURE_PAGES` (a
  constant, `2`) accounts for the two signature pages, which are governed
  by thumb-impression grids and layout rather than word count, so they're
  simply added as a fixed number rather than estimated from their own text.

---

Next: **[09-backend-live-streaming.md](./09-backend-live-streaming.md)**.
