from pydantic import BaseModel, Field
from typing import List, Optional

# --- STEP 1: ENTITY EXTRACTION ---
class Entity(BaseModel):
    name: str = Field(..., description="Name or value of the entity")
    entity_type: str = Field(..., description="PERSON, DATE, LOCATION, AMOUNT, ACTION")
    role: Optional[str] = Field(None, description="Role if person (accused/witness/victim/officer)")

class DocumentEntities(BaseModel):
    doc_id: str
    entities: List[Entity]

# --- STEP 2: CLAIM EXTRACTION ---
class Claim(BaseModel):
    claim_id: str = Field(..., description="Unique ID for this claim (e.g., C1, C2)")
    fact: str = Field(..., description="Atomic claim containing one fact")
    claim_type: str = Field(..., description="factual, temporal, locational, quantitative")
    doc_id: str = Field(..., description="Document ID where claim is found")
    page_ref: str = Field(..., description="Page reference (e.g., 'Page 1')")
    exact_quote: str = Field(..., description="The exact sentence from the document")

class ExtractedClaims(BaseModel):
    claims: List[Claim]

# --- STEP 3: CONTRADICTION DETECTION ---
class ContradictionCandidate(BaseModel):
    claim_a_id: str
    claim_b_id: str
    contradiction_type: str = Field(..., description="FACTUAL, TEMPORAL, LOGICAL")
    reasoning: str = Field(..., description="Why these two claims contradict")

class DetectedContradictions(BaseModel):
    candidates: List[ContradictionCandidate]
    consistent_claim_ids: List[str]

# --- STEP 4: EVIDENCE LINKING & FINAL OUTPUT ---
class FinalContradiction(BaseModel):
    exact_quote_doc_a: str
    exact_quote_doc_b: str
    contradiction_type: str
    severity: str = Field(..., description="HIGH, MEDIUM, LOW")
    explanation: str = Field(..., description="One sentence plain language explanation")

class CleanFact(BaseModel):
    fact: str
    document_id: str
    page_ref: str
    exact_quote: str

class InconsistencyReport(BaseModel):
    total_contradictions: int
    high_severity: int
    contradictions: List[FinalContradiction]
    clean_facts: List[CleanFact]
