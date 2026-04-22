from pydantic import BaseModel, Field, HttpUrl
from typing import List, Optional, Union
from datetime import datetime

class LDContext(BaseModel):
    vocab: str = Field(alias="@vocab", default="https://schema.org/")

class JudicialBaseModel(BaseModel):
    context: str = Field(alias="@context", default="https://schema.org/")
    type: str = Field(alias="@type")
    id: str = Field(alias="@id")

class Identity(JudicialBaseModel):
    type: str = "Person" # or Organization
    name: str
    govt_id_hash: str = Field(..., description="Hash of the government ID for privacy")
    verified: bool = False

class Evidence(JudicialBaseModel):
    type: str = "DigitalDocument"
    format: str # e.g., "video/mp4", "application/pdf"
    hash: str
    captured_at: datetime
    source_metadata: dict = Field(default_factory=dict, description="Metadata about the capture source (e.g., camera device info)")

class Hearing(JudicialBaseModel):
    type: str = "Event"
    date: datetime
    participants: List[str] # List of Identity IDs
    transcript_summary: Optional[str] = None

class Case(JudicialBaseModel):
    type: str = "LegalCase"
    title: str
    status: str
    evidence_list: List[Evidence] = Field(default_factory=list)
    hearings: List[Hearing] = Field(default_factory=list)
    plaintiff: Union[Identity, str]
    defendant: Union[Identity, str]
    filing_date: datetime = Field(default_factory=datetime.utcnow)

