from fastapi import APIRouter, HTTPException
from schemas import SectionInput, QueryRequest, QueryResponse
from modules.rag.service import add_legal_section, query_rag_system

router = APIRouter(
    prefix="/rag",
    tags=["RAG Pipeline"]
)

@router.post("/add-section")
def add_section(section: SectionInput):
    try:
        return add_legal_section(section)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/query", response_model=QueryResponse)
def query(request: QueryRequest):
    try:
        return query_rag_system(request.question)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
