from fastapi import APIRouter
from pydantic import BaseModel
from schemas import StandardResponse
from modules.gemini import summarize_legal_document

# Gemini's client is synchronous: each call blocks for seconds. These
# endpoints are plain `def` so FastAPI runs them in a worker thread. As
# `async def` they ran on the event loop and froze every other request
# (including /health) until Gemini answered.
router = APIRouter(
    prefix="/summarizer",
    tags=["Summarization"]
)

class SummarizeRequest(BaseModel):
    text: str

@router.post("/summarize", response_model=StandardResponse)
def api_summarize_legal_document(request: SummarizeRequest):
    """
    Summarize a legal document under BNS, BNSS, and BSA.
    """
    result = summarize_legal_document(request.text)
    return StandardResponse(success=True, data=result)
