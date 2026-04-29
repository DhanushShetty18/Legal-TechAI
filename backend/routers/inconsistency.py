from fastapi import APIRouter, File, UploadFile, HTTPException
from typing import List
import fitz  # PyMuPDF
from modules.inconsistency.core import InconsistencyEngine
from modules.inconsistency.schemas import InconsistencyReport

router = APIRouter(
    tags=["Inconsistency Detection"]
)

engine = InconsistencyEngine()


@router.post("/detect-inconsistencies", response_model=InconsistencyReport)
async def detect_inconsistencies(files: List[UploadFile] = File(...)):
    """
    Detect factual, temporal, logical, and physical-impossibility
    inconsistencies across multiple legal documents.

    Accepts 2+ files (PDF or plain text) via multipart form upload.
    Runs a 4-step Gemini pipeline:
      Step 1 – Entity Extraction
      Step 2 – Claim Extraction
      Step 3 – Contradiction Detection (+ physical impossibility)
      Step 4 – Evidence Linking
    """
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
        return report
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Pipeline error: {str(e)}",
        )
