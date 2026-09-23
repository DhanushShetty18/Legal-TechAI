from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
import io

from modules.engine_mode_a import generate_mode_a_document
from modules.engine_mode_b import generate_mode_b_document

router = APIRouter()

class GenerationRequest(BaseModel):
    mode: str  # "mode_a" or "mode_b"
    data: dict

@router.post("/draft")
async def generate_draft(req: GenerationRequest):
    try:
        if req.mode == "mode_a":
            file_stream = generate_mode_a_document(req.data)
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            filename = "Live_Petition.docx"
            
        elif req.mode == "mode_b":
            file_stream = generate_mode_b_document(req.data)
            media_type = "application/pdf"
            filename = "Live_Application.pdf"
            
        else:
            raise HTTPException(status_code=400, detail="Invalid mode specified. Use 'mode_a' or 'mode_b'")
        
        return StreamingResponse(
            file_stream, 
            media_type=media_type, 
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
