from fastapi import APIRouter
from pydantic import BaseModel
from schemas import StandardResponse
from modules.gemini import summarize_legal_document

router = APIRouter(
    prefix="/summarizer",
    tags=["Summarization"]
)

class SummarizeRequest(BaseModel):
    text: str

@router.post("/summarize", response_model=StandardResponse)
async def api_summarize_legal_document(request: SummarizeRequest):
    """
    Summarize a legal document under BNS, BNSS, and BSA.
    """
    result = summarize_legal_document(request.text)
    return StandardResponse(success=True, data=result)
