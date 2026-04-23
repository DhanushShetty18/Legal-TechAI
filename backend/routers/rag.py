from fastapi import APIRouter
from schemas import SectionInput, QueryRequest, StandardResponse
from modules.embedder import add_legal_section, query_rag_system

router = APIRouter(
    prefix="/rag",
    tags=["RAG Pipeline"]
)

@router.post("/add-section", response_model=StandardResponse)
def add_section(section: SectionInput):
    result = add_legal_section(section)
    return StandardResponse(success=True, data=result)

@router.post("/query", response_model=StandardResponse)
def query(request: QueryRequest):
    result = query_rag_system(request.question)
    # query_rag_system returns QueryResponse object. We convert it to dict.
    return StandardResponse(success=True, data=result.dict())
