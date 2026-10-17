from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional
import logging
from modules.ocr_extractor import extract_document_data
from security import MAX_UPLOAD_BYTES

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

@router.post("", response_model=OCRResponse)
async def extract_ocr_data(file: UploadFile = File(...)):
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")

    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 12 MB limit.")

    try:
        # Blocking Gemini call: run it off the event loop.
        extracted_data = await run_in_threadpool(
            extract_document_data, contents, mime_type=content_type
        )
        return extracted_data
    except Exception:
        logger.exception("OCR extraction failed")
        raise HTTPException(status_code=500, detail="OCR extraction failed.")
