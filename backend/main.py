from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
import os
import hashlib

import crud, models, schemas
from database import SessionLocal, engine
from auth_utils import get_current_user

# Create the database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Legal-TechAI API",
    description="Backend API for Legal-TechAI: A National-Scale Digital Judicial Infrastructure",
    version="0.1.0",
)

from routers import auth, demo, ai, rag, inconsistency
import ingestion
from middlewares import DataResidencyMiddleware, AuditLogMiddleware

# Add Middlewares
app.add_middleware(AuditLogMiddleware)
app.add_middleware(DataResidencyMiddleware)

# Include Routers
app.include_router(auth.router)
app.include_router(demo.router, dependencies=[Depends(get_current_user)])
app.include_router(ai.router, dependencies=[Depends(get_current_user)])
app.include_router(ingestion.router, dependencies=[Depends(get_current_user)])
app.include_router(rag.router, dependencies=[Depends(get_current_user)])
app.include_router(inconsistency.router, dependencies=[Depends(get_current_user)])

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

@app.post("/users/{user_id}/verify")
def verify_user_identity(user_id: int, govt_id: str = Form(...), db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Verify user can only verify themselves, or admin can verify anyone
    if current_user.id != user_id and current_user.user_type != models.UserType.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    db_user = crud.get_user(db, user_id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    import verification
    is_valid = verification.simulate_govt_id_verification(govt_id, db_user.full_name)
    
    if is_valid:
        db_user.is_verified_identity = True
        db.commit()
        return {"status": "verified", "message": "Identity verification successful"}
    else:
        return {"status": "failed", "message": "Identity verification failed: Invalid ID or Mismatch"}

@app.get("/cases/search", response_model=schemas.Case)
def search_case(q: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    case = db.query(models.Case).filter(models.Case.case_number == q).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.user_type != models.UserType.ADMIN and case.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this case")
    return case

@app.get("/cases/{case_id}/summary")
def get_case_summary(case_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    case = crud.get_case(db, case_id=case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.user_type != models.UserType.ADMIN and case.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this case")
        
    from modules.ai.gemini_integration import summarize_legal_document
    case_title = case.title or "Untitled Case"
    case_description = case.description or "No description provided."
    case_text = f"Title: {case_title}\n\nDescription: {case_description}"
    
    try:
        summary_result = summarize_legal_document(case_text)
        return summary_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Summarization failed: {str(e)}")

@app.post("/cases/", response_model=schemas.Case)
def create_case(case: schemas.CaseCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return crud.create_case(db=db, case=case, user_id=current_user.id)

@app.get("/cases/", response_model=List[schemas.Case])
def read_cases(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    cases = crud.get_cases(db=db, user=current_user, skip=skip, limit=limit)
    return cases

@app.post("/documents/")
def upload_document(
    case_id: int = Form(...),
    capture_method: str = Form("camera"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    case = crud.get_case(db, case_id=case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.user_type != models.UserType.ADMIN and case.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to upload to this case")

    upload_dir = "uploads"
    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir)
    
    file_location = f"{upload_dir}/{file.filename}"
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
        user_id=current_user.id
    )
