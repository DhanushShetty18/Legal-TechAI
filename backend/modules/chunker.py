import re
from typing import List
from pydantic import BaseModel

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
    text = re.sub(r'(?i)\bpage\s+\d+\s*(?:of\s*\d+)?\b', '', text)
    lines = text.split('\n')
    cleaned_lines = []
    
    for line in lines:
        line = line.strip()
        line = re.sub(r' {2,}', ' ', line)
        cleaned_lines.append(line)
        
    text = '\n'.join(cleaned_lines)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def chunk_text(text: str, filename: str) -> List[Chunk]:
    """
    Chunk the text by legal sections:
    - Split on patterns like "Section", "SECTION", numbered clauses like "1.", "2.", "1.1"
    - Each chunk must be minimum 100 characters
    - Each chunk must carry metadata
    """
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
