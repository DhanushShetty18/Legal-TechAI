from fastapi import APIRouter, File, UploadFile, HTTPException, Query
from typing import List
import fitz  # PyMuPDF
from modules.inconsistency.core import InconsistencyEngine
from modules.inconsistency.schemas import InconsistencyReportWithRanking

router = APIRouter(
    tags=["Inconsistency Detection"]
)

engine = InconsistencyEngine()

# Sort/filter order — does not affect detection, only response shaping.
SEVERITY_ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}


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

        # Sort HIGH -> MEDIUM -> LOW (does not touch detection results).
        sorted_contradictions = sorted(
            report.contradictions,
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
            **report.model_dump(exclude={"contradictions"}),
            contradictions=sorted_contradictions,
            top_contradictions=top_contradictions,
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
