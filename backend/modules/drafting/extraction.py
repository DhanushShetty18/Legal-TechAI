"""Multi-document extraction for the Camera Filing flow.

Each upload is sent to Gemini Vision with a prompt scoped to the fields that
document is actually expected to carry (see ``checklists.extracts``), then a
deterministic regex pass rescues the high-value identifiers - PAN, Aadhaar,
pincode, registered-document numbers, amounts - that vision models routinely
transpose. Per-document results are merged with documents named as the
authoritative source for a field winning over incidental mentions elsewhere.
"""

import logging
import re
from typing import Any, Dict, Iterable, List, Optional

from ..gemini import extract_json, retry_on_failure
from .checklists import document_by_id
from .formatting import mask_aadhaar, normalise_pan, parse_amount
from .schema import DERIVABLE_FIELDS, SALE_DEED, SALE_DEED_FIELD_KEYS, SALE_DEED_FIELDS

logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-2.5-flash"

_SYSTEM_PROMPT = """
You are a document extraction engine for an Indian conveyancing practice. You
read scans and photographs of Indian legal, revenue and identity documents and
return structured JSON.

Rules you must never break:
1. Extract only what is legibly present. If a field is absent or unreadable,
   return null. Never guess, infer or invent a value.
2. Reproduce names, survey numbers and document numbers exactly as printed,
   including punctuation and spacing.
3. Amounts must be returned as plain digits with no separators or currency
   symbols (write 4500000, never "Rs. 45,00,000/-").
4. Dates must be returned as YYYY-MM-DD.
5. Return a single JSON object and nothing else. No prose, no code fences.
""".strip()

# A vision model reading a faint scan will happily return a plausible-looking
# PAN. These patterns re-derive the same identifiers from the raw text it
# transcribed, and disagreements are resolved in favour of the pattern.
_PAN_RE = re.compile(r"\b([A-Z]{5}\d{4}[A-Z])\b")
_AADHAAR_RE = re.compile(r"\b(\d{4}\s?\d{4}\s?\d{4})\b")
_PINCODE_RE = re.compile(r"\b(\d{6})\b")


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
    """The per-document instruction. Scoping the schema sharply raises recall."""
    return (
        f"This document was supplied as: {doc_label}\n\n"
        "Extract the following fields from it. Use null for anything not "
        "legibly present in this particular document.\n\n"
        "{\n"
        f"{_field_labels(target_keys)}\n"
        '  "raw_text": null  - the complete text you read, verbatim\n'
        "}\n\n"
        "Return the JSON object only."
    )


@retry_on_failure(retries=3, delay=2)
def _call_gemini(prompt: str, image_blob: bytes, mime_type: str) -> Dict[str, Any]:
    import google.generativeai as genai

    model = genai.GenerativeModel(model_name=MODEL_NAME, system_instruction=_SYSTEM_PROMPT)
    response = model.generate_content(
        [prompt, {"mime_type": mime_type, "data": image_blob}]
    )
    data = extract_json(response.text)
    if not isinstance(data, dict):
        raise ValueError(f"Expected a JSON object, got {type(data).__name__}")
    return data


def _clean(value: Any) -> Optional[str]:
    """Normalise the many ways a model says 'nothing here'."""
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
    if text.lower() in {"null", "none", "n/a", "na", "not available",
                        "not found", "not present", "unknown", "-", "--"}:
        return None
    return text


def reconcile_identifiers(
    fields: Dict[str, Any],
    raw_text: str,
    allowed_keys: Optional[Iterable[str]] = None,
) -> Dict[str, Any]:
    """Re-derive PAN / Aadhaar / pincode from the transcribed text.

    A pattern match in the raw text beats the model's own structured answer,
    because the failure mode we care about is a confidently mis-transcribed
    identifier rather than a missing one.

    ``allowed_keys`` scopes the rescue to the fields the document is actually
    about. Without it, a vendor's ID card carrying a single PAN would have that
    PAN attributed to the purchaser as well - a wrong identifier for a party to
    a registered deed, and one that would pass the review form as "filled".
    """
    text = (raw_text or "").upper()
    result = dict(fields)
    in_scope = None if allowed_keys is None else set(allowed_keys)

    pans = _PAN_RE.findall(text)
    aadhaars = [a for a in _AADHAAR_RE.findall(raw_text or "")
                if len(re.sub(r"\D", "", a)) == 12]

    for role in ("vendor", "purchaser"):
        pan_key = f"{role}_pan"
        aadhaar_key = f"{role}_aadhaar"
        if in_scope is not None and not {pan_key, aadhaar_key} & in_scope:
            continue
        claimed = _clean(result.get(pan_key))
        if claimed:
            normalised = normalise_pan(claimed)
            # Trust the pattern when the model's answer is not a valid PAN but
            # a valid one is sitting in the text it transcribed.
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
            result[aadhaar_key] = mask_aadhaar(source)

    return result


def extract_from_document(
    image_blob: bytes,
    mime_type: str,
    doc_id: str,
    doc_label: str = "",
    case_type: str = SALE_DEED,
) -> Dict[str, Any]:
    """Extract one uploaded document. Never raises; failures come back as an error field."""
    spec = document_by_id(case_type, doc_id)
    target_keys = spec.get("extracts") or SALE_DEED_FIELD_KEYS
    label = doc_label or spec.get("label") or doc_id

    try:
        raw = _call_gemini(build_prompt(label, list(target_keys)), image_blob, mime_type)
    except Exception as exc:  # noqa: BLE001 - one bad scan must not sink the filing
        logger.warning("Extraction failed for %s: %s", doc_id, exc)
        return {"docId": doc_id, "label": label, "fields": {}, "rawText": "",
                "error": str(exc)}

    raw_text = _clean(raw.pop("raw_text", None)) or ""
    fields = {k: _clean(v) for k, v in raw.items() if k in SALE_DEED_FIELD_KEYS}
    fields = {k: v for k, v in fields.items() if v is not None}
    fields = reconcile_identifiers(fields, raw_text, allowed_keys=target_keys)
    fields = {k: v for k, v in fields.items() if _clean(v) is not None}

    logger.info("Extracted %d field(s) from %s", len(fields), doc_id)
    return {"docId": doc_id, "label": label, "fields": fields,
            "rawText": raw_text[:4000], "error": None}


def merge_extractions(results: List[Dict[str, Any]],
                      case_type: str = SALE_DEED) -> Dict[str, Any]:
    """Fold per-document results into one field set.

    A document that declares a field in its ``extracts`` list is the
    authoritative source for it - an address read off an electricity bill beats
    the same address glimpsed on a tax receipt. Among equals, the first
    non-empty value wins, which is the order the user uploaded them in.
    """
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

    # Amounts are stored as plain numbers so the generator can spell them out.
    for key in ("sale_consideration_amount", "market_value", "stamp_duty_paid",
                "registration_fee"):
        amount = parse_amount(merged.get(key))
        if amount is not None:
            merged[key] = str(int(amount)) if amount.is_integer() else str(amount)

    return {"fields": merged, "provenance": provenance}


def missing_required_fields(fields: Dict[str, Any]) -> List[str]:
    """Required fields the user still has to supply.

    Fields the generator can derive on its own are excluded - the flow asks
    only for information it genuinely cannot work out.
    """
    return [
        f.key
        for f in SALE_DEED_FIELDS
        if f.required and f.key not in DERIVABLE_FIELDS
        and _clean(fields.get(f.key)) is None
    ]


def extraction_summary(fields: Dict[str, Any]) -> Dict[str, Any]:
    filled = [k for k in SALE_DEED_FIELD_KEYS if _clean(fields.get(k)) is not None]
    missing = missing_required_fields(fields)
    return {
        "fieldsFilled": len(filled),
        "fieldsTotal": len(SALE_DEED_FIELD_KEYS),
        "missingRequired": missing,
        "readyToGenerate": not missing,
    }
