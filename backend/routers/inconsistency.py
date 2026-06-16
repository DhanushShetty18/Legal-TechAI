from fastapi import APIRouter, File, UploadFile, HTTPException, Query
from typing import Dict, List
import fitz  # PyMuPDF
from modules.inconsistency.core import InconsistencyEngine
from modules.inconsistency.schemas import FinalContradiction, InconsistencyReportWithRanking

router = APIRouter(
    tags=["Inconsistency Detection"]
)

engine = InconsistencyEngine()

# Sort/filter order — does not affect detection, only response shaping.
SEVERITY_ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}

# When the same quote pair is flagged under multiple contradiction_types,
# keep the most decisive one. PHYSICAL_IMPOSSIBILITY is deterministic and
# strictly stronger evidence than the Gemini-inferred categories.
TYPE_PRIORITY = {
    "PHYSICAL_IMPOSSIBILITY": 0,
    "LOGICAL": 1,
    "TEMPORAL": 2,
    "FACTUAL": 3,
}


def _quote_pair_key(c: FinalContradiction) -> frozenset:
    """Order-independent identity for a contradiction: the two quotes it cites."""
    return frozenset({c.exact_quote_doc_a.strip(), c.exact_quote_doc_b.strip()})


def _type_rank(c: FinalContradiction) -> int:
    return TYPE_PRIORITY.get(c.contradiction_type.upper(), len(TYPE_PRIORITY))


def _dedupe_contradictions(
    contradictions: List[FinalContradiction],
) -> List[FinalContradiction]:
    """
    Collapse contradictions that cite the same pair of quotes (regardless of
    explanation wording or A/B order). Keeps the first occurrence's slot, but
    upgrades its contents in place if a later duplicate has a more decisive
    contradiction_type (e.g. PHYSICAL_IMPOSSIBILITY beats TEMPORAL).
    """
    deduped: Dict[frozenset, FinalContradiction] = {}
    for c in contradictions:
        key = _quote_pair_key(c)
        existing = deduped.get(key)
        if existing is None or _type_rank(c) < _type_rank(existing):
            deduped[key] = c
    return list(deduped.values())


@router.post("/detect-inconsistencies", response_model=InconsistencyReportWithRanking)
async def detect_inconsistencies(
    files: List[UploadFile] = File(...),
    min_severity: str = Query(
        "HIGH",
        description=(
            "Minimum severity to include in `top_contradictions`: "
            "HIGH, MEDIUM, or LOW. Default HIGH."
        ),
    ),
):
    """
    Detect factual, temporal, logical, and physical-impossibility
    inconsistencies across multiple legal documents.

    Accepts 2+ files (PDF or plain text) via multipart form upload.
    Runs a 4-step Gemini pipeline:
      Step 1 – Entity Extraction
      Step 2 – Claim Extraction
      Step 3 – Contradiction Detection (+ physical impossibility)
      Step 4 – Evidence Linking

    The pipeline's raw output is unchanged. This endpoint only sorts
    `contradictions` HIGH -> MEDIUM -> LOW and adds a `top_contradictions`
    field filtered by `min_severity`.
    """
    min_severity_upper = min_severity.upper()
    if min_severity_upper not in SEVERITY_ORDER:
        raise HTTPException(
            status_code=400,
            detail="min_severity must be one of HIGH, MEDIUM, LOW",
        )

    if len(files) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least two documents are required for contradiction detection.",
        )

    documents_data: List[dict] = []

    for file in files:
        contents = await file.read()
        filename = file.filename or "unknown"

        extracted_text = ""
        try:
            if filename.lower().endswith(".pdf"):
                doc = fitz.open(stream=contents, filetype="pdf")
                for page_num in range(len(doc)):
                    page = doc.load_page(page_num)
                    page_text = page.get_text()
                    extracted_text += f"\n[Page {page_num + 1}]\n{page_text}\n"
                doc.close()
            else:
                # Plain text (.txt, etc.)
                extracted_text = f"\n[Page 1]\n{contents.decode('utf-8')}\n"
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to extract text from {filename}: {str(e)}",
            )

        documents_data.append({"doc_id": filename, "text": extracted_text})

    try:
        report = engine.process(documents_data)

        # Collapse duplicate contradictions citing the same quote pair
        # (e.g. the same Mumbai/Pune clash reported repeatedly under
        # different contradiction_types) before sorting/filtering.
        unique_contradictions = _dedupe_contradictions(report.contradictions)

        # Sort HIGH -> MEDIUM -> LOW (does not touch detection results).
        sorted_contradictions = sorted(
            unique_contradictions,
            key=lambda c: SEVERITY_ORDER.get(c.severity.upper(), len(SEVERITY_ORDER)),
        )

        # top_contradictions = everything at or above min_severity.
        threshold = SEVERITY_ORDER[min_severity_upper]
        top_contradictions = [
            c
            for c in sorted_contradictions
            if SEVERITY_ORDER.get(c.severity.upper(), len(SEVERITY_ORDER)) <= threshold
        ]

        return InconsistencyReportWithRanking(
            **report.model_dump(exclude={"contradictions", "total_contradictions", "high_severity"}),
            contradictions=sorted_contradictions,
            top_contradictions=top_contradictions,
            total_contradictions=len(sorted_contradictions),
            high_severity=sum(
                1 for c in sorted_contradictions if c.severity.upper() == "HIGH"
            ),
        )
    except RuntimeError as e:
        # Missing API key or configuration error
        raise HTTPException(
            status_code=503,
            detail=f"Service unavailable: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Pipeline error: {str(e)}",
        )
