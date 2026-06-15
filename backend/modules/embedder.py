import re
import chromadb
import google.generativeai as genai
from chromadb.config import Settings
from schemas import SectionInput, QueryResponse
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

chroma_client = chromadb.Client(Settings(is_persistent=False))
collection = chroma_client.get_or_create_collection(
    name="legal_sections",
    metadata={"hnsw:space": "cosine"}
)

SYSTEM_PROMPT = (
    "Answer using ONLY the sections provided below. "
    "Cite the exact section number for every claim. "
    "If the answer is not in the sections, say: "
    "'This is not covered in the provided sections.'"
)

def add_legal_section(section: SectionInput):
    embedding_result = genai.embed_content(
        model="models/text-embedding-004",
        content=section.text,
        task_type="retrieval_document",
        title=section.section_title
    )
    
    embedding = embedding_result['embedding']
    
    collection.add(
        documents=[section.text],
        embeddings=[embedding],
        metadatas=[{
            "section_number": section.section_number,
            "act_name": section.act_name,
            "section_title": section.section_title
        }],
        ids=[f"{section.act_name}_{section.section_number}"]
    )
    return {"status": "success", "section_number": section.section_number}

def query_rag_system(question: str) -> QueryResponse:
    query_embedding_result = genai.embed_content(
        model="models/text-embedding-004",
        content=question,
        task_type="retrieval_query"
    )
    query_embedding = query_embedding_result['embedding']
    
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=3
    )
    
    retrieved_sections = []
    context_parts = []
    
    if results['documents'] and results['documents'][0]:
        for i, doc in enumerate(results['documents'][0]):
            meta = results['metadatas'][0][i]
            retrieved_sections.append({
                "text": doc,
                "metadata": meta
            })
            context_parts.append(
                f"--- Act: {meta.get('act_name')}, Section: {meta.get('section_number')} "
                f"({meta.get('section_title')}) ---\n{doc}"
            )
            
    context = "\n\n".join(context_parts)
    
    prompt = f"System Instruction:\n{SYSTEM_PROMPT}\n\nContext:\n{context}\n\nQuestion: {question}"
    
    model = genai.GenerativeModel("gemini-2.5-flash")
    response = model.generate_content(prompt)
    answer = response.text
    
    citation_matches = re.findall(r"(?i)section\s+([0-9]+[A-Za-z]*)", answer)
    citations = list(set(citation_matches))
    
    all_sections = collection.get(include=["metadatas"])
    existing_section_numbers = [m["section_number"] for m in all_sections["metadatas"]] if all_sections["metadatas"] else []
    
    hallucination_flags = []
    for cit in citations:
        if cit not in existing_section_numbers:
            hallucination_flags.append(f"Section {cit}")
            
    return QueryResponse(
        answer=answer,
        citations=[f"Section {c}" for c in citations],
        hallucination_flags=hallucination_flags,
        retrieved_sections=retrieved_sections
    )
