from fastapi import APIRouter, File, UploadFile, HTTPException
from typing import List
import fitz  # PyMuPDF
from modules.inconsistency.core import InconsistencyEngine
from modules.inconsistency.schemas import InconsistencyReport

router = APIRouter(
    prefix="/inconsistency",
    tags=["inconsistency-detection"],
)

engine = InconsistencyEngine()

@router.post("/detect-inconsistencies", response_model=InconsistencyReport)
async def detect_inconsistencies(files: List[UploadFile] = File(...)):
    """
    Detect factual, temporal, and logical inconsistencies across multiple legal documents.
    """
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="At least two documents are required for contradiction detection.")

    documents_data = []

    for file in files:
        contents = await file.read()
        filename = file.filename
        
        extracted_text = ""
        try:
            if filename.lower().endswith(".pdf"):
                # Use PyMuPDF
                doc = fitz.open(stream=contents, filetype="pdf")
                for page_num in range(len(doc)):
                    page = doc.load_page(page_num)
                    page_text = page.get_text()
                    extracted_text += f"\n[Page {page_num + 1}]\n{page_text}\n"
            else:
                # Assume text file
                extracted_text = f"\n[Page 1]\n{contents.decode('utf-8')}\n"
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to extract text from {filename}: {str(e)}")
            
        documents_data.append({
            "doc_id": filename,
            "text": extracted_text
        })

    try:
        # Run the sequential Gemini pipeline
        report = engine.process(documents_data)
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")
