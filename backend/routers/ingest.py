from fastapi import APIRouter, UploadFile, File
import os
import uuid
import fitz  # PyMuPDF
from modules.chunker import clean_text, chunk_text
from schemas import StandardResponse

router = APIRouter(
    prefix="/ingest",
    tags=["Ingestion"]
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload", response_model=StandardResponse)
async def upload_document(file: UploadFile = File(...)):
    if not (file.filename.lower().endswith('.pdf') or file.filename.lower().endswith('.txt')):
        return StandardResponse(success=False, error="Only PDF and TXT files are supported.")
        
    # Generate UUID filename
    ext = os.path.splitext(file.filename)[1]
    new_filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, new_filename)
    
    content = await file.read()
    
    # Save file
    with open(file_path, "wb") as f:
        f.write(content)
        
    raw_text = ""
    is_scanned_pdf = False
    
    if ext.lower() == '.pdf':
        try:
            doc = fitz.open(stream=content, filetype="pdf")
            is_scanned = True
            for page in doc:
                page_text = page.get_text()
                if page_text.strip():
                    is_scanned = False
                raw_text += page_text + "\n"
                
            if is_scanned:
                return StandardResponse(
                    success=True, 
                    data={"message": "Scanned PDF detected - OCR required", "file_path": file_path, "uuid_filename": new_filename}
                )
                
        except Exception as e:
            return StandardResponse(success=False, error=f"Error processing PDF: {str(e)}")
    else:
        try:
            raw_text = content.decode('utf-8')
        except UnicodeDecodeError:
            raw_text = content.decode('latin-1')
            
    cleaned_text = clean_text(raw_text)
    chunks = chunk_text(cleaned_text, new_filename)
    
    return StandardResponse(
        success=True,
        data={
            "file_path": file_path,
            "uuid_filename": new_filename,
            "chunks": [chunk.model_dump() for chunk in chunks]
        }
    )
