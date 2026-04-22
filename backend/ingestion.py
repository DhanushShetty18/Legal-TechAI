import fitz  # PyMuPDF
import re
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Union

router = APIRouter()

class ChunkMetadata(BaseModel):
    source_file: str
    chunk_index: int
    char_start: int
    char_end: int

class Chunk(BaseModel):
    text: str
    metadata: ChunkMetadata

def clean_text(text: str) -> str:
    """
    Clean the extracted text:
    - Remove extra whitespace and blank lines
    - Remove page numbers
    - Keep paragraph structure intact
    """
    # Remove page numbers like "Page 1 of 5" or "Page 1"
    text = re.sub(r'(?i)\bpage\s+\d+\s*(?:of\s*\d+)?\b', '', text)
    
    lines = text.split('\n')
    cleaned_lines = []
    
    for line in lines:
        line = line.strip()
        # Replace multiple spaces with a single space
        line = re.sub(r' {2,}', ' ', line)
        cleaned_lines.append(line)
        
    # Join with newlines
    text = '\n'.join(cleaned_lines)
    # Remove multiple blank lines (3 or more newlines become 2 newlines)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def chunk_text(text: str, filename: str) -> List[Chunk]:
    """
    Chunk the text by legal sections:
    - Split on patterns like "Section", "SECTION", numbered clauses like "1.", "2.", "1.1"
    - Each chunk must be minimum 100 characters
    - Each chunk must carry metadata
    """
    # Pattern to match at the beginning of a line:
    # "Section " (case insensitive) or numbered clauses like "1.", "1.1", "2. "
    pattern = re.compile(r'(?im)^(?:\s*section\b|\s*\d+\.\d*\b)')
    
    matches = list(pattern.finditer(text))
    chunks = []
    chunk_index = 0
    
    if not matches:
        if len(text) >= 100:
            chunks.append(Chunk(
                text=text,
                metadata=ChunkMetadata(
                    source_file=filename,
                    chunk_index=chunk_index,
                    char_start=0,
                    char_end=len(text)
                )
            ))
        return chunks
        
    # Check if there is text before the first section
    if matches[0].start() > 0:
        pre_text = text[0:matches[0].start()].strip()
        if len(pre_text) >= 100:
            chunks.append(Chunk(
                text=pre_text,
                metadata=ChunkMetadata(
                    source_file=filename,
                    chunk_index=chunk_index,
                    char_start=0,
                    char_end=matches[0].start()
                )
            ))
            chunk_index += 1
            
    for i in range(len(matches)):
        start = matches[i].start()
        end = matches[i+1].start() if i + 1 < len(matches) else len(text)
            
        chunk_content = text[start:end].strip()
        if len(chunk_content) >= 100:
            chunks.append(Chunk(
                text=chunk_content,
                metadata=ChunkMetadata(
                    source_file=filename,
                    chunk_index=chunk_index,
                    char_start=start,
                    char_end=end
                )
            ))
            chunk_index += 1
            
    return chunks

@router.post("/ingest")
async def ingest_document(file: UploadFile = File(...)):
    if not (file.filename.lower().endswith('.pdf') or file.filename.lower().endswith('.txt')):
        raise HTTPException(status_code=400, detail="Only PDF and TXT files are supported.")
        
    content = await file.read()
    
    raw_text = ""
    is_scanned_pdf = False
    
    if file.filename.lower().endswith('.pdf'):
        try:
            doc = fitz.open(stream=content, filetype="pdf")
            is_scanned = True
            for page in doc:
                page_text = page.get_text()
                if page_text.strip():
                    is_scanned = False
                raw_text += page_text + "\n"
                
            if is_scanned:
                return {"message": "Scanned PDF detected - OCR required"}
                
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")
    else:
        # text file
        try:
            raw_text = content.decode('utf-8')
        except UnicodeDecodeError:
            raw_text = content.decode('latin-1')
            
    cleaned_text = clean_text(raw_text)
    chunks = chunk_text(cleaned_text, file.filename)
    
    return [chunk.model_dump() for chunk in chunks]
