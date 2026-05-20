
from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Any
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
    filename: Optional[str] = None
    doc_type: Optional[str] = None
    uploaded_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

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

    model_config = ConfigDict(from_attributes=True)

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

    model_config = ConfigDict(from_attributes=True)

# --- RAG Schemas ---
class SectionInput(BaseModel):
    section_number: str
    act_name: str
    section_title: str
    text: str

class QueryRequest(BaseModel):
    question: str

class QueryResponse(BaseModel):
    answer: str
    citations: List[str]
    hallucination_flags: List[str]
    retrieved_sections: List[dict]

# --- Standard Response ---
class StandardResponse(BaseModel):
    success: bool
    data: Any = None
    error: Optional[str] = None

# --- Inconsistency Schemas ---
class InconsistencyBase(BaseModel):
    case_id: int
    doc_a_id: int
    doc_b_id: int
    contradiction_type: str
    severity: str
    explanation: str

class InconsistencyCreate(InconsistencyBase):
    pass

class Inconsistency(InconsistencyBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
