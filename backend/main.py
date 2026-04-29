from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import time
import logging
from sqlalchemy.orm import Session
from typing import List
import shutil
import os
import hashlib
import sys

import crud, models, schemas
from database import SessionLocal, engine

# Create the database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Legal-TechAI API",
    description="Backend API for Legal-TechAI: A National-Scale Digital Judicial Infrastructure",
    version="0.1.0",
)

from routers import demo, ai, rag, inconsistency, ingest, summarizer
import ingestion

app.include_router(demo.router)
app.include_router(ai.router)
app.include_router(ingestion.router)
app.include_router(rag.router)
app.include_router(inconsistency.router, prefix="/inconsistency", tags=["inconsistency"])
app.include_router(ingest.router)
app.include_router(summarizer.router)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api_logger")

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    logger.info(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {request.method} {request.url.path} - {process_time:.4f}s")
    return response

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"success": False, "data": None, "error": str(exc)}
    )


# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def read_root():
    return {"message": "Welcome to Legal-TechAI API", "status": "running"}

@app.get("/health")
def health_check():
    return {"status": "ok", "version": "0.1.0"}

@app.post("/users/", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return crud.create_user(db=db, user=user)

@app.post("/users/{user_id}/verify")
def verify_user_identity(user_id: int, govt_id: str = Form(...), db: Session = Depends(get_db)):
    db_user = crud.get_user(db, user_id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Simulate verification
    import verification

    is_valid = verification.simulate_govt_id_verification(govt_id, db_user.full_name)
    
    if is_valid:
        db_user.is_verified_identity = True
        db.commit()
        return {"status": "verified", "message": "Identity verification successful"}
    else:
        return {"status": "failed", "message": "Identity verification failed: Invalid ID or Mismatch"}

@app.get("/cases/search", response_model=schemas.Case)
def search_case(q: str, db: Session = Depends(get_db)):
    # Search by strict case number first
    case = db.query(models.Case).filter(models.Case.case_number == q).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case

@app.get("/cases/{case_id}/summary")
def get_case_summary(case_id: int, db: Session = Depends(get_db)):
    case = crud.get_case(db, case_id=case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    from modules.ai.gemini_integration import summarize_legal_document
    
    # Construct case text
    case_title = case.title or "Untitled Case"
    case_description = case.description or "No description provided."
    case_text = f"Title: {case_title}\n\nDescription: {case_description}"
    
    try:
        summary_result = summarize_legal_document(case_text)
        return summary_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Summarization failed: {str(e)}")

@app.post("/cases/", response_model=schemas.Case)
def create_case(case: schemas.CaseCreate, user_id: int, db: Session = Depends(get_db)):
    return crud.create_case(db=db, case=case, user_id=user_id)

@app.get("/cases/", response_model=List[schemas.Case])
def read_cases(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    cases = crud.get_cases(db, skip=skip, limit=limit)
    return cases

@app.post("/documents/")
def upload_document(
    case_id: int = Form(...),
    uploader_id: int = Form(...),
    capture_method: str = Form("camera"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # Create upload directory if it doesn't exist
    upload_dir = "uploads"
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir)
    
    file_location = f"{upload_dir}/{file.filename}"
    
    # Calculate hash while saving
    sha256_hash = hashlib.sha256()
    
    with open(file_location, "wb") as buffer:
        content = file.file.read()
        sha256_hash.update(content)
        buffer.write(content)
        
    file_hash = sha256_hash.hexdigest()
    
    doc_create = schemas.DocumentCreate(
        file_type=file.content_type,
        capture_metadata=None
    )
    
    return crud.create_document(
        db=db,
        document=doc_create,
        file_path=file_location,
        file_hash=file_hash,
        case_id=case_id,
        user_id=uploader_id
    )
