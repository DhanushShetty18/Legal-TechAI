# 06 — `backend/modules/drafting/checklists.py` and `schema.py`

These two files are the backend's registry of "what case types exist, what
documents each needs, and what fields the Sale Deed needs." They are almost
entirely data, not logic — but they are the data every other backend module
in this feature is built against, and they are the backend half of the
deliberate duplication with `frontend/src/lib/caseTypes.ts` (see
[DECISIONS.md](../../DECISIONS.md) decision 12, and the system-design
folder for the full reasoning).

## Why these two files are separate from each other

`schema.py` defines the **Sale Deed field catalogue** — every field the
*generated deed text* needs (`vendor_name`, `sale_consideration_amount`,
`boundary_east`, ...). `checklists.py` defines the **document checklist** —
what the user needs to *upload* (`vendor_id`, `parent_sale_deed`,
`payment_proof`, ...) — and, critically, which of `schema.py`'s fields each
checklist document is expected to yield. These are genuinely different
concerns (what to ask the user to photograph, versus what the final legal
text needs to say) that happen to be connected by the `extracts` list.
Keeping them in separate files is why `extraction.py` can import from both
without `schema.py` ever needing to know checklists exist at all —
`schema.py` has no dependency on `checklists.py`, only the reverse.

**What breaks if either is missing:** without `schema.py`, nothing knows
what fields a Sale Deed has — the review form has nothing to render, and the
generator has nothing to read field values from. Without `checklists.py`,
there's no checklist to show the user, and — just as importantly — the
extractor would have no way to scope a Gemini prompt to "just the six fields
an Aadhaar card carries," which (per decision 7) is what keeps extraction
accuracy high.

---

## `backend/modules/drafting/schema.py`

### `SALE_DEED`, `DIVORCE_CASE` — the case type name constants

```python
SALE_DEED = "Sale Deed"
DIVORCE_CASE = "Divorce Case"
```

Plain string constants, used throughout the backend (and matching the
frontend's identical constants in `caseTypes.ts`) so that `"Sale Deed"`, as
a literal string, is typed in exactly one place. Every other file compares
against `SALE_DEED`, not the string literal — if this value ever needed to
change, one edit here would be sufficient.

### `class Field` — `__init__` and `as_dict`

```python
class Field:
    def __init__(self, key, label, group, required=False, kind="text", placeholder="", help_text=""):
        self.key = key
        self.label = label
        self.group = group
        self.required = required
        self.kind = kind
        self.placeholder = placeholder
        self.help_text = help_text

    def as_dict(self) -> Dict[str, Any]:
        return {"key": self.key, "label": self.label, "group": self.group, "required": self.required,
                "kind": self.kind, "placeholder": self.placeholder, "helpText": self.help_text}
```

**Job:** a small Python class describing one field the deed needs, and how
the UI should ask for it. This mirrors the TypeScript `FieldDef` interface
in `caseTypes.ts` field-for-field.
**Calls:** nothing.
**Line by line:**
- `__init__` is Python's constructor — called automatically whenever
  `Field(...)` is written (as it is, 52 times, in the `SALE_DEED_FIELDS`
  list below); it just stores every argument onto the instance (`self`).
- `as_dict` converts the object into a plain dictionary — this exists
  specifically because a Python class instance isn't automatically
  JSON-serialisable, but a `dict` is; `routers/drafting.py`'s
  `get_requirements` endpoint calls `f.as_dict()` on every field to build
  its JSON response. Note the key is renamed from `help_text`
  (Python/`snake_case` convention) to `"helpText"` (matching the
  JavaScript/`camelCase` convention the frontend expects) — this is the one
  place in the codebase where the snake↔camel translation actually happens
  explicitly.

### `SALE_DEED_FIELDS` — the 52-field catalogue

```python
_EXECUTION = "Execution"
_VENDOR = "Vendor (Seller)"
# ...
SALE_DEED_FIELDS: List[Field] = [
    Field("place_of_execution", "Place of Execution", _EXECUTION, True, placeholder="e.g. Mangaluru"),
    Field("date_of_execution", "Date of Execution", _EXECUTION, True, kind="date"),
    Field("vendor_name", "Full Name", _VENDOR, True, placeholder="e.g. Ramesh Kumar"),
    # ... 48 more
]

SALE_DEED_FIELD_KEYS = [f.key for f in SALE_DEED_FIELDS]
DERIVABLE_FIELDS = {"sale_consideration_words", "title_recital"}
```

**Job:** one `Field` instance per piece of information the deed needs,
grouped (Execution, Vendor, Purchaser, Title & Prior Deed, Consideration &
Valuation, Property Schedule, Boundaries, Witnesses) in the same order the
deed itself reads, so the review form's section order matches the document
the user is about to see generated.
**Line by line worth noting:**
- The private module-level constants (`_EXECUTION`, `_VENDOR`, ...) exist so
  the group name string is typed once and referenced by every field in that
  group — a typo in a group name would otherwise silently create a
  second, near-identical group instead of raising an error.
- `SALE_DEED_FIELD_KEYS` — a flat list of just the `key` strings, computed
  once at import time via a list comprehension; used anywhere code needs to
  check "is this a known field key" without needing the full `Field` object
  (`extraction.py`'s filtering, for one).
- `DERIVABLE_FIELDS` — a Python `set` (not a list — membership testing with
  `in` on a `set` is O(1) rather than O(n)) naming the two fields the
  *generator* can compute itself (the consideration spelled out in words,
  and the title recital's default wording) — this is read by
  `missing_required_fields` (document 07) to make sure the review screen
  never blocks the user over something the system can supply on its own.

---

## `backend/modules/drafting/checklists.py`

### `SALE_DEED_REQUIREMENTS` and `DIVORCE_REQUIREMENTS`

```python
SALE_DEED_REQUIREMENTS: List[Dict[str, Any]] = [
    {"phase": "Phase 1: Identity & Capacity of the Parties", "documents": [
        {"id": "vendor_id", "label": "Proof of Identity of the Vendor: ...", "required": True,
         "extracts": ["vendor_name", "vendor_father_name", "vendor_age", "vendor_address", "vendor_pan", "vendor_aadhaar"]},
        # ...
    ]},
    # ... four more phases
]
```

**Job:** the five-phase checklist for the Sale Deed, each document carrying
an `id` (the contract string shared with the frontend), a human `label`, a
`required` flag, and — the piece with no frontend equivalent needed, since
the frontend never does extraction itself — an `extracts` list naming which
`schema.py` field keys this *specific* document is expected to yield. This
`extracts` list is what `extraction.py`'s `build_prompt` (document 07) reads
to scope a Gemini prompt to just the handful of fields a given document type
actually carries, and what `merge_extractions` reads to decide which
document is the *authoritative* source for a field when more than one
upload happens to mention it.

`DIVORCE_REQUIREMENTS` is structurally identical in shape but every
document's `extracts` is an empty list — there is no extraction engine
behind the Divorce Case flow at all; its checklist exists purely for the
"upload and submit" UI, kept, per the file's own comment, "verbatim so the
Divorce Case flow is unchanged."

### `REQUIREMENTS_BY_CASE_TYPE` and `DRAFTABLE_CASE_TYPES`

```python
REQUIREMENTS_BY_CASE_TYPE: Dict[str, List[Dict[str, Any]]] = {
    SALE_DEED: SALE_DEED_REQUIREMENTS,
    DIVORCE_CASE: DIVORCE_REQUIREMENTS,
}

DRAFTABLE_CASE_TYPES = [SALE_DEED]
```

**Job:** `REQUIREMENTS_BY_CASE_TYPE` is the lookup table every "given a case
type name, give me its checklist" operation goes through.
`DRAFTABLE_CASE_TYPES` is a one-item list today — the single flag that
decides whether the live-generation engine applies to a case type at all;
`routers/drafting.py`'s `/case-types` endpoint, and the frontend's
`isDraftable`, both ultimately check membership in lists exactly like this
one (on each respective side).

### `requirements_for(case_type)`

```python
def requirements_for(case_type: str) -> List[Dict[str, Any]]:
    return REQUIREMENTS_BY_CASE_TYPE.get(case_type, [])
```

**Job:** the one safe way to look up a case type's checklist.
**Calls:** nothing.
**Line by line:** `.get(case_type, [])` — a dictionary's `.get` with a
default never raises `KeyError`; an unrecognised case type simply returns an
empty list, which every caller (`routers/drafting.py`'s
`get_requirements`, document 05) already treats as "not found" rather than
needing to catch an exception.

### `document_by_id(case_type, doc_id)`

```python
def document_by_id(case_type: str, doc_id: str) -> Dict[str, Any]:
    for phase in requirements_for(case_type):
        for doc in phase["documents"]:
            if doc["id"] == doc_id:
                return doc
    return {}
```

**Job:** given a case type and a document id (the exact string the frontend
sent as `doc_ids` when uploading), find that document's full checklist
entry — this is specifically how `extraction.py`'s `extract_from_document`
(document 07) discovers which fields a given upload is expected to carry.
**Calls:** `requirements_for`.
**Line by line:** a straightforward nested linear search across every phase
and every document within it — there's no index/lookup table, because the
checklist is small (fewer than 30 documents total) and this function is
called once per upload, not in any hot loop; a simple, obviously-correct
search was the right choice over a premature optimisation. Returns an empty
dict (never `None`) if nothing matches, so callers can safely chain
`.get("extracts") or [...]` without a `None` check — this is exactly the
pattern `extract_from_document` uses.

---

Next: **[07-backend-extraction-engine.md](./07-backend-extraction-engine.md)**.
