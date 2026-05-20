from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging
from modules.ocr_extractor import extract_document_data

logger = logging.getLogger(__name__)

router = APIRouter(tags=["OCR Extract"])

class OCRResponse(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    companyName: Optional[str] = None
    addressStreet1: Optional[str] = None
    addressStreet2: Optional[str] = None
    city: Optional[str] = None
    stateProvince: Optional[str] = None
    postalZipCode: Optional[str] = None
    telephone: Optional[str] = None
    mobile: Optional[str] = None
    herdNo: Optional[str] = None
    email: Optional[str] = None

@router.post("/ocr-extract", response_model=OCRResponse)
async def extract_ocr_data(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")
    
    try:
        contents = await file.read()
        extracted_data = extract_document_data(contents, mime_type=file.content_type)
        return extracted_data
    except Exception as e:
        logger.error(f"OCR Extraction failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"OCR Extraction failed: {str(e)}")
