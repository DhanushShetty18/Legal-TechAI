from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum, Text
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .database import Base

class UserRole(str, enum.Enum):
    CITIZEN = "citizen"
    LAWYER = "lawyer"
    JUDGE = "judge"
    CLERK = "clerk"
    ADMIN = "admin"

class DocumentCaptureMethod(str, enum.Enum):
    CAMERA = "camera"
    UPLOAD = "upload" # Restricted in MVP, but schema should support it

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default=UserRole.CITIZEN)
    is_verified_identity = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    cases = relationship("Case", back_populates="creator")
    documents = relationship("Document", back_populates="uploader")
    audit_logs = relationship("AuditLog", back_populates="user")

class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True, index=True)
    case_number = Column(String, unique=True, index=True) # Unique ID for search
    title = Column(String, index=True)
    description = Column(Text)
    case_type = Column(String, default="CIVIL")
    status = Column(String, default="OPEN") # OPEN, CLOSED, PENDING
    priority = Column(String, default="NORMAL")
    creator_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    creator = relationship("User", back_populates="cases")
    documents = relationship("Document", back_populates="case")

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"))
    uploader_id = Column(Integer, ForeignKey("users.id"))
    
    file_path = Column(String) # Path to storage
    file_hash = Column(String, index=True) # SHA-256 for immutability check
    file_type = Column(String) # pdf, jpg, etc.
    
    is_verified = Column(Boolean, default=False)
    verification_status = Column(String, default="PENDING") # PENDING, VERIFIED, REJECTED
    
    capture_method = Column(String, default=DocumentCaptureMethod.CAMERA)
    capture_metadata = Column(Text) # JSON string for device info, location, timestamps
    
    version = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("Case", back_populates="documents")
    uploader = relationship("User", back_populates="documents")

class AuditLog(Base):
    """
    Tracks all actions for Evidence Provenance Infrastructure.
    Who did what, when, and to which object.
    """
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String) # CREATE, VIEW, VERIFY, UPDATE
    target_type = Column(String) # DOCUMENT, CASE
    target_id = Column(Integer)
    details = Column(Text) # JSON details
    timestamp = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="audit_logs")
