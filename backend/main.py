from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
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

from routers import demo
app.include_router(demo.router)

# Configure CORS
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    return {"status": "healthy"}

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
    
    # Mock AI Summary Logic (Rule-Based for MVP)
    # In production, this would call Gemini API with case documents
    
    summary_text = f"This is a {case.case_type} case filed on {case.created_at.strftime('%Y-%m-%d')}. "
    if case.description:
        summary_text += f"The plaintiff alleges: {case.description[:100]}... "
    summary_text += "The system has analyzed 2 key documents."

    recommendation = "Judicial Review Recommended"
    if "urgent" in (case.description or "").lower():
        recommendation = "High Priority: Expedited Hearing Suggested"

    return {
        "case_number": case.case_number,
        "summary": summary_text,
        "key_dates": [
            {"event": "Case Filed", "date": case.created_at.strftime('%Y-%m-%d')},
            {"event": "Evidence Submitted", "date": case.created_at.strftime('%Y-%m-%d')},
            {"event": "Estimated Hearing", "date": "Provisional scheduled in 14 days"}
        ],
        "recommendation": recommendation,
        "citations": ["IPC Section 420 (Cheating)", "Evidence Act Section 65B"]
    }

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
