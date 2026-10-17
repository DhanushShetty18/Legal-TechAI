from fastapi import APIRouter, Depends
from schemas import SectionInput, QueryRequest, StandardResponse
from modules.embedder import add_legal_section, query_rag_system
from security import require_admin_key

router = APIRouter(
    prefix="/rag",
    tags=["RAG Pipeline"]
)

# Writing to the legal knowledge base is admin-only: anyone who can add a
# "section" can make the Q&A cite law that does not exist.
@router.post("/add-section", response_model=StandardResponse,
             dependencies=[Depends(require_admin_key)])
def add_section(section: SectionInput):
    result = add_legal_section(section)
    return StandardResponse(success=True, data=result)

@router.post("/query", response_model=StandardResponse)
def query(request: QueryRequest):
    result = query_rag_system(request.question)
    # query_rag_system returns QueryResponse object. We convert it to dict.
    return StandardResponse(success=True, data=result.dict())
