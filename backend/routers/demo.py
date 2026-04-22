from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from pydantic import BaseModel
from typing import Dict, Any, List
import json
import base64

# Import our modules
from backend.modules.camera.core import CameraModule
from backend.modules.summarizer.core import CaseSummarizer
from backend.modules.vault.core import ImmutableVault
from backend.modules.infrastructure.schemas import Evidence

router = APIRouter(
    prefix="/demo",
    tags=["red-team-demo"],
    responses={404: {"description": "Not found"}},
)

# Initialize Modules
camera_module = CameraModule()
case_summarizer = CaseSummarizer()
immutable_vault = ImmutableVault()

# --- Module 1: Camera ---
@router.post("/camera/analyze")
async def analyze_camera_feed(file: UploadFile = File(...)):
    """
    Simulate a live feed frame analysis.
    In a real scenario, this would be a stream. Here we upload a 'frame' (image/video chunk).
    """
    try:
        contents = await file.read()
        evidence = camera_module.capture_frame(contents)
        return {"status": "PASSED", "detail": "Live feed verified.", "evidence": evidence}
    except ValueError as e:
        return {"status": "FAILED", "detail": str(e)}

# --- Module 5: Summarizer ---
class MockCaseRequest(BaseModel):
    extracted_facts: List[Dict[str, Any]]

@router.post("/summarizer/audit")
async def audit_case_summary(case_data: MockCaseRequest):
    """
    Audit a case for hallucinations or divergent facts.
    """
    # Convert Pydantic model to dict
    data_dict = {"extracted_facts": case_data.extracted_facts}
    
    result = case_summarizer.summarize_case(data_dict)
    
    status = "CLEAN"
    if "DIVERGENT FACTS" in result:
        status = "FLAGGED"
        
    return {"status": status, "report": result}

# --- Module 7: Vault ---
class ArchiveRequest(BaseModel):
    document: Dict[str, Any]
    signature: str

@router.post("/vault/archive")
async def archive_document(request: ArchiveRequest):
    """
    Archive a document to the Immutable Vault.
    Handles offline queuing automatically based on env vars.
    """
    try:
        doc_hash = immutable_vault.archive_document(request.document, request.signature)
        
        # Check if it was queued (offline) or synced (online)
        # We can inspect the vault's internal state (mocked)
        is_queued = any(entry["hash"] == doc_hash and entry["status"] == "QUEUED" for entry in immutable_vault.offline_queue)
        
        status = "QUEUED_OFFLINE" if is_queued else "TV_SYNCED_LEDGER"
        
        return {"status": status, "hash": doc_hash}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/vault/toggle-offline")
async def toggle_offline_mode(offline: bool):
    import os
    if offline:
        os.environ["JUDICIARY_NETWORK_STATUS"] = "OFFLINE"
        return {"message": "System is now OFFLINE"}
    else:
        os.environ["JUDICIARY_NETWORK_STATUS"] = "ONLINE"
        # Trigger sync
        immutable_vault.force_sync()
        return {"message": "System is now ONLINE. Sync attempted."}
