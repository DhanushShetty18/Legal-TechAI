"""Camera Filing drafting engine: extract, generate live, render court-ready."""

from .checklists import (
    DRAFTABLE_CASE_TYPES,
    REQUIREMENTS_BY_CASE_TYPE,
    document_by_id,
    requirements_for,
)
from .extraction import (
    extract_from_document,
    extraction_summary,
    merge_extractions,
    missing_required_fields,
)
from .generator import (
    build_sections,
    estimate_pages,
    narrative_sections_for,
    render_plain_text,
)
from .schema import (
    DIVORCE_CASE,
    GIFT_DEED,
    GIFT_DEED_FIELDS,
    GIFT_DEED_FIELD_KEYS,
    SALE_DEED,
    SALE_DEED_FIELDS,
    SALE_DEED_FIELD_KEYS,
    field_keys_for,
    fields_for,
)
from .stream import llm_available, stream_document

__all__ = [
    "DIVORCE_CASE",
    "DRAFTABLE_CASE_TYPES",
    "GIFT_DEED",
    "GIFT_DEED_FIELDS",
    "GIFT_DEED_FIELD_KEYS",
    "REQUIREMENTS_BY_CASE_TYPE",
    "SALE_DEED",
    "SALE_DEED_FIELDS",
    "SALE_DEED_FIELD_KEYS",
    "build_sections",
    "document_by_id",
    "estimate_pages",
    "extract_from_document",
    "extraction_summary",
    "field_keys_for",
    "fields_for",
    "llm_available",
    "merge_extractions",
    "missing_required_fields",
    "narrative_sections_for",
    "render_plain_text",
    "requirements_for",
    "stream_document",
]
