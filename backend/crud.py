from sqlalchemy.orm import Session
import models, schemas
import hashlib
import uuid

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, user: schemas.UserCreate):
    fake_hashed_password = user.password + "notreallyhashed"
    db_user = models.User(
        email=user.email,
        full_name=user.full_name,
        hashed_password=fake_hashed_password,
        role=user.role
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def get_cases(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Case).offset(skip).limit(limit).all()

def create_case(db: Session, case: schemas.CaseCreate, user_id: int):
    # Generate a simple case number for MVP
    # Cast to str explicitly to satisfy linter
    case_num = f"CASE-{str(uuid.uuid4().hex)[:8].upper()}"
    db_case = models.Case(
        **case.dict(),
        case_number=case_num,
        creator_id=user_id
    )
    db.add(db_case)
    db.commit()
    db.refresh(db_case)
    return db_case

def create_document(db: Session, document: schemas.DocumentCreate, file_path: str, file_hash: str, case_id: int, user_id: int):
    db_document = models.Document(
        **document.dict(),
        case_id=case_id,
        uploader_id=user_id,
        file_path=file_path,
        file_hash=file_hash,
        is_verified=False, # Needs verification steps
        version=1
    )
    db.add(db_document)
    db.commit()
    db.refresh(db_document)
    return db_document
