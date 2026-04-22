from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class DocumentBase(BaseModel):
    file_type: str
    capture_metadata: Optional[str] = None

class DocumentCreate(DocumentBase):
    pass # File content handled via UploadFile

class Document(DocumentBase):
    id: int
    case_id: int
    uploader_id: int
    file_path: str
    file_hash: str
    is_verified: bool
    verification_status: str
    created_at: datetime

    class Config:
        orm_mode = True

class CaseBase(BaseModel):
    title: str
    description: Optional[str] = None
    case_type: Optional[str] = "CIVIL"
    priority: Optional[str] = "NORMAL"

class CaseCreate(CaseBase):
    pass

class Case(CaseBase):
    id: int
    case_number: str
    status: str
    created_at: datetime
    documents: List[Document] = []

    class Config:
        orm_mode = True

class UserBase(BaseModel):
    email: str
    full_name: str
    role: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    is_verified_identity: bool
    created_at: datetime

    class Config:
        orm_mode = True
