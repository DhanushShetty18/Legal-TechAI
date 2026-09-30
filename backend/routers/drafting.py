"""Camera Filing drafting API.

The flow the frontend walks:

  GET  /drafting/case-types            what can be filed, and what can be drafted
  GET  /drafting/requirements          the document checklist for a case type
  POST /drafting/extract               uploaded documents -> extracted particulars
  POST /drafting/generate              SSE: the deed, live, section by section
  POST /drafting/export/pdf            the approved deed as a court-ready PDF
  POST /drafting/export/docx           the same deed as an editable DOCX
"""

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from modules.drafting import (
    DRAFTABLE_CASE_TYPES,
    REQUIREMENTS_BY_CASE_TYPE,
    SALE_DEED,
    SALE_DEED_FIELDS,
    build_sections,
    estimate_pages,
    extract_from_document,
    extraction_summary,
    llm_available,
    merge_extractions,
    render_plain_text,
    requirements_for,
    stream_document,
)
from modules.drafting.docx_export import render_sale_deed_docx
from modules.drafting.pdf import render_sale_deed_pdf

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Drafting"])

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_UPLOADS_PER_REQUEST = 12
ACCEPTED_PREFIXES = ("image/",)
ACCEPTED_TYPES = ("application/pdf",)


class SectionModel(BaseModel):
    id: str
    style: str = "preamble"
    heading: str = ""
    body: str = ""


class DocumentResult(BaseModel):
    docId: str
    fields: Dict[str, Any] = Field(default_factory=dict)


class MergeRequest(BaseModel):
    documents: List[DocumentResult] = Field(default_factory=list)
    # Anything the user has already typed or corrected outranks the scans.
    overrides: Dict[str, Any] = Field(default_factory=dict)
    caseType: str = SALE_DEED


class GenerateRequest(BaseModel):
    fields: Dict[str, Any] = Field(default_factory=dict)
    caseType: str = SALE_DEED
    useLlm: Optional[bool] = None


class ExportRequest(BaseModel):
    fields: Dict[str, Any] = Field(default_factory=dict)
    # What the user actually read on screen and approved. Omitted, the deed is
    # rebuilt from the fields, which is the path the "regenerate" button takes.
    sections: Optional[List[SectionModel]] = None
    caseType: str = SALE_DEED
    stampPaperOffsetInches: float = 0.0
    filename: Optional[str] = None


def _sections_payload(request: ExportRequest) -> List[Dict[str, Any]]:
    if request.sections:
        return [section.model_dump() for section in request.sections]
    return [dict(section) for section in build_sections(request.fields)]


def _safe_filename(name: Optional[str], extension: str) -> str:
    stem = "".join(
        ch for ch in (name or "Sale-Deed") if ch.isalnum() or ch in "-_ "
    ).strip() or "Sale-Deed"
    return f"{stem.replace(' ', '-')}.{extension}"


@router.get("/case-types")
def list_case_types() -> Dict[str, Any]:
    return {
        "caseTypes": [
            {
                "name": name,
                "draftable": name in DRAFTABLE_CASE_TYPES,
                "phaseCount": len(phases),
                "documentCount": sum(len(p["documents"]) for p in phases),
            }
            for name, phases in REQUIREMENTS_BY_CASE_TYPE.items()
        ],
        "llmAvailable": llm_available(),
    }


@router.get("/requirements")
def get_requirements(case_type: str = SALE_DEED) -> Dict[str, Any]:
    phases = requirements_for(case_type)
    if not phases:
        raise HTTPException(status_code=404, detail=f"Unknown case type: {case_type}")
    return {
        "caseType": case_type,
        "draftable": case_type in DRAFTABLE_CASE_TYPES,
        "phases": phases,
        "fields": [f.as_dict() for f in SALE_DEED_FIELDS]
        if case_type == SALE_DEED else [],
    }


@router.post("/extract")
async def extract_documents(
    files: List[UploadFile] = File(...),
    doc_ids: str = Form(""),
    case_type: str = Form(SALE_DEED),
) -> Dict[str, Any]:
    """Extract particulars from one or more uploaded documents.

    ``doc_ids`` is a comma-separated list positionally matching ``files``; it
    tells the extractor which checklist entry each upload answers, which is
    what lets it use a focused prompt per document.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No documents were uploaded.")
    if len(files) > MAX_UPLOADS_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=f"Upload at most {MAX_UPLOADS_PER_REQUEST} documents per request.",
        )

    ids = [part.strip() for part in doc_ids.split(",")] if doc_ids else []

    results: List[Dict[str, Any]] = []
    for index, upload in enumerate(files):
        content_type = upload.content_type or ""
        if not (content_type.startswith(ACCEPTED_PREFIXES)
                or content_type in ACCEPTED_TYPES):
            raise HTTPException(
                status_code=400,
                detail=f"{upload.filename or 'file'}: expected an image or a PDF.",
            )
        contents = await upload.read()
        if not contents:
            raise HTTPException(
                status_code=400,
                detail=f"{upload.filename or 'file'} is empty.",
            )
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"{upload.filename or 'file'} exceeds the 12 MB limit.",
            )

        doc_id = ids[index] if index < len(ids) and ids[index] else "vendor_id"
        results.append(
            extract_from_document(
                contents,
                mime_type=content_type or "image/jpeg",
                doc_id=doc_id,
                case_type=case_type,
            )
        )

    merged = merge_extractions(results, case_type=case_type)
    return {
        "caseType": case_type,
        "documents": [
            {k: v for k, v in result.items() if k != "rawText"}
            for result in results
        ],
        "fields": merged["fields"],
        "provenance": merged["provenance"],
        **extraction_summary(merged["fields"]),
    }


@router.post("/merge")
def merge(request: MergeRequest) -> Dict[str, Any]:
    """Fold per-document extraction results into one field set.

    Documents are extracted one at a time as they are captured, so the user
    gets feedback in seconds rather than after the whole checklist. This folds
    those results together when the review form opens, which keeps the
    precedence rules in one place instead of duplicating them in the client.
    """
    results = [
        {"docId": document.docId, "fields": document.fields}
        for document in request.documents
    ]
    merged = merge_extractions(results, case_type=request.caseType)

    fields = merged["fields"]
    provenance = dict(merged["provenance"])
    for key, value in request.overrides.items():
        if str(value or "").strip():
            fields[key] = value
            provenance[key] = "user"

    return {
        "caseType": request.caseType,
        "fields": fields,
        "provenance": provenance,
        **extraction_summary(fields),
    }


@router.post("/generate")
async def generate(request: GenerateRequest) -> StreamingResponse:
    """Stream the deed as Server-Sent Events, section by section."""

    def event_source():
        try:
            for event in stream_document(request.fields, use_llm=request.useLlm):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as exc:  # noqa: BLE001 - the client needs to hear why
            logger.exception("Generation failed")
            payload = {"type": "error", "message": str(exc)}
            yield f"data: {json.dumps(payload)}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            # Render and most reverse proxies buffer responses by default,
            # which would collect the whole deed and deliver it in one frame.
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/preview")
def preview(request: GenerateRequest) -> Dict[str, Any]:
    """The deed in one shot, with no model call. Used by tests and as the
    fallback for clients that cannot hold an SSE connection open."""
    sections = [dict(section) for section in build_sections(request.fields)]
    return {
        "sections": sections,
        "plainText": render_plain_text(sections),
        "estimatedPages": estimate_pages(sections),
        **extraction_summary(request.fields),
    }


@router.post("/export/pdf")
def export_pdf(request: ExportRequest) -> StreamingResponse:
    from reportlab.lib.units import inch

    try:
        buffer = render_sale_deed_pdf(
            sections=_sections_payload(request),
            fields=request.fields,
            first_page_top_offset=max(0.0, request.stampPaperOffsetInches) * inch,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("PDF rendering failed")
        raise HTTPException(status_code=500, detail=f"PDF rendering failed: {exc}")

    filename = _safe_filename(request.filename, "pdf")
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/export/docx")
def export_docx(request: ExportRequest) -> StreamingResponse:
    try:
        buffer = render_sale_deed_docx(
            sections=_sections_payload(request),
            fields=request.fields,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("DOCX rendering failed")
        raise HTTPException(status_code=500, detail=f"DOCX rendering failed: {exc}")

    filename = _safe_filename(request.filename, "docx")
    return StreamingResponse(
        buffer,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        ),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
