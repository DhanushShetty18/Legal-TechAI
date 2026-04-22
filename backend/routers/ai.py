from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List

from modules.ai.gemini_integration import (
    summarize_legal_document,
    extract_claims,
    answer_legal_question
)

router = APIRouter(
    prefix="/ai",
    tags=["ai-integration"],
    responses={404: {"description": "Not found"}},
)

class SummarizeRequest(BaseModel):
    text: str

class ExtractClaimsRequest(BaseModel):
    text: str

class AnswerQuestionRequest(BaseModel):
    question: str
    context: str

@router.post("/summarize")
async def api_summarize_legal_document(request: SummarizeRequest):
    """
    Summarize a legal document under BNS, BNSS, and BSA.
    """
    try:
        result = summarize_legal_document(request.text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Summarization failed: {str(e)}")

@router.post("/extract-claims")
async def api_extract_claims(request: ExtractClaimsRequest):
    """
    Break document into atomic factual claims.
    """
    try:
        result = extract_claims(request.text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Claim extraction failed: {str(e)}")

@router.post("/answer-question")
async def api_answer_legal_question(request: AnswerQuestionRequest):
    """
    Answer a legal question strictly based on the provided context.
    """
    try:
        result = answer_legal_question(request.question, request.context)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Question answering failed: {str(e)}")
