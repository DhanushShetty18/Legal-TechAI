import asyncio
import os
import json
from ingestion import chunk_text, clean_text

def test_ingestion():
    sample_text = """
    Legal Document Title
    Page 1 of 5
    
    This is some introductory text that is long enough to be at least one hundred characters. 
    It provides context for the sections that follow and is essential for understanding the 
    document as a whole. This text should be captured as the first chunk.
    
    Section 1
    This is the first section. It discusses important legal matters and outlines the responsibilities
    of the parties involved. It is also long enough to be its own chunk. The minimum length is 100 
    characters, so I'm adding more text here to ensure it meets that requirement.
    
    1.1 Scope
    The scope of this agreement covers everything. It must be carefully reviewed by all parties.
    Again, extending the text to make sure we hit the 100 character limit for the chunk.
    
    SECTION 2
    This section is entirely capitalized. Let's see if the regex picks it up. It also needs to be 
    more than one hundred characters long. Here is some filler text to reach the limit.
    """
    
    print("--- Original Text ---")
    print(sample_text)
    print("\n--- Cleaned Text ---")
    cleaned = clean_text(sample_text)
    print(cleaned)
    print("\n--- Chunks ---")
    chunks = chunk_text(cleaned, "sample.txt")
    
    print(json.dumps([chunk.model_dump() for chunk in chunks], indent=2))

if __name__ == "__main__":
    test_ingestion()
