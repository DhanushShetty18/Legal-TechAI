from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Any
from schemas import StandardResponse
from modules.gemini import extract_claims, answer_legal_question

router = APIRouter(
    prefix="/inconsistency",
    tags=["Inconsistency Detection"]
)

class ExtractClaimsRequest(BaseModel):
    text: str

class AnswerQuestionRequest(BaseModel):
    question: str
    context: str

@router.post("/extract-claims", response_model=StandardResponse)
async def api_extract_claims(request: ExtractClaimsRequest):
    """
    Break document into atomic factual claims.
    """
    result = extract_claims(request.text)
    return StandardResponse(success=True, data=result)

@router.post("/answer-question", response_model=StandardResponse)
async def api_answer_legal_question(request: AnswerQuestionRequest):
    """
    Answer a legal question strictly based on the provided context.
    """
    result = answer_legal_question(request.question, request.context)
    return StandardResponse(success=True, data=result)
