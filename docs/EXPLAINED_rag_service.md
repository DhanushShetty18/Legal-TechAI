# EXPLAINED: backend/modules/rag/service.py (and embedder.py)

> **One-line summary:** This file implements Retrieval-Augmented Generation — a system where Gemini answers questions about Indian law by first searching a vector database of legal sections, then generating answers grounded in what it found.

---

## What RAG Is and Why It Exists

**The problem RAG solves:** Gemini knows a lot about Indian law from its training data, but training data has a cutoff date, may be inaccurate, and Gemini can't cite specific sections reliably. If you ask "what does Section 85 BNS say?", Gemini might hallucinate — make up a plausible-sounding answer.

**RAG's solution:** Instead of relying on Gemini's memory, you:
1. Build a database of the actual legal sections you care about.
2. When a question arrives, search the database for relevant sections.
3. Give Gemini those sections as context and tell it to only answer from them.

This gives you both the accuracy of real documents and the natural language capability of Gemini.

---

## Duplicate Code Warning

`modules/rag/service.py` and `modules/embedder.py` contain **almost identical code**. The router `routers/rag.py` imports from `embedder.py`, not from `rag/service.py`. This means `rag/service.py` is currently unused.

This is a legacy issue — the RAG service was probably refactored but the old file wasn't deleted. If you change the embedding logic, you need to change it in **`embedder.py`** for the changes to take effect at runtime.

---

## Section-by-Section Walkthrough

### ChromaDB Setup

```python
chroma_client = chromadb.Client(Settings(is_persistent=False))
collection = chroma_client.get_or_create_collection(
    name="legal_sections",
    metadata={"hnsw:space": "cosine"}
)
```

**What ChromaDB is:** A vector database — a database that stores and searches high-dimensional numerical vectors (embeddings). Unlike SQL which searches by exact text, ChromaDB searches by mathematical similarity.

**`is_persistent=False`:** The entire database lives in RAM. When the server restarts, all stored sections are gone. You have to re-add them. For production, use `chromadb.PersistentClient(path="./chroma_db")` to save to disk.

**`hnsw:space": "cosine"`:** HNSW is the search algorithm (Hierarchical Navigable Small World graphs — a fast approximate nearest-neighbor algorithm). Cosine similarity is the distance metric — it measures the angle between two vectors, not their magnitude. This is ideal for text embeddings where direction (meaning) matters more than length.

---

### `add_legal_section()` — Storing a Law Section

```python
def add_legal_section(section: SectionInput):
    # Step 1: Convert the section text to a vector
    embedding_result = genai.embed_content(
        model="models/text-embedding-004",
        content=section.text,
        task_type="retrieval_document",
        title=section.section_title
    )
    embedding = embedding_result['embedding']  # a list of ~768 numbers
    
    # Step 2: Store the text + vector + metadata in ChromaDB
    collection.add(
        documents=[section.text],      # original text (for returning in results)
        embeddings=[embedding],        # the vector (for searching)
        metadatas=[{
            "section_number": section.section_number,
            "act_name": section.act_name,
            "section_title": section.section_title
        }],
        ids=[f"{section.act_name}_{section.section_number}"]  # unique ID
    )
```

**What an embedding is:** A list of ~768 floating point numbers that represents the *meaning* of a piece of text. Two pieces of text with similar meanings produce vectors that are close together in 768-dimensional space. "The accused fled the scene" and "The suspect ran away" would have very similar vectors, even though the words are different.

**`task_type="retrieval_document"` vs `"retrieval_query"`:** Gemini's embedding model is trained with different objectives for different tasks. Documents use `retrieval_document` to optimize for being found. Queries use `retrieval_query` to optimize for searching. Using the wrong task type degrades search quality.

**`ids=[f"{section.act_name}_{section.section_number}"]`:** ChromaDB requires a unique ID per document. Using `BNS_85` instead of a UUID means if you try to add the same section twice, ChromaDB updates it rather than creating a duplicate.

---

### `query_rag_system()` — Answering a Question

```python
def query_rag_system(question: str) -> QueryResponse:
    # Step 1: Convert the question to a vector
    query_embedding_result = genai.embed_content(
        model="models/text-embedding-004",
        content=question,
        task_type="retrieval_query"          # ← different task type than add_section
    )
    query_embedding = query_embedding_result['embedding']
    
    # Step 2: Find the 3 most similar sections in ChromaDB
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=3
    )
    
    # Step 3: Build context from the 3 retrieved sections
    context = "\n\n".join([
        f"--- Act: {meta['act_name']}, Section: {meta['section_number']} ---\n{doc}"
        for doc, meta in zip(results['documents'][0], results['metadatas'][0])
    ])
    
    # Step 4: Ask Gemini to answer using ONLY this context
    prompt = f"System Instruction:\n{SYSTEM_PROMPT}\n\nContext:\n{context}\n\nQuestion: {question}"
    model = genai.GenerativeModel("gemini-2.5-flash")
    response = model.generate_content(prompt)
    answer = response.text
```

**Why `results['documents'][0]`?** ChromaDB returns results in a nested list structure — `results['documents']` is a list of lists (one inner list per query, since you can batch queries). Since we always send one query, we take index `[0]`.

**The `SYSTEM_PROMPT`:**
```python
SYSTEM_PROMPT = (
    "Answer using ONLY the sections provided below. "
    "Cite the exact section number for every claim. "
    "If the answer is not in the sections, say: "
    "'This is not covered in the provided sections.'"
)
```
This is **grounding** — the instruction that prevents Gemini from using its training data and forces it to work only with what you provided. The "if not in sections" clause prevents hallucination.

---

### Hallucination Detection

```python
# Extract all section numbers Gemini cited
citation_matches = re.findall(r"(?i)section\s+([0-9]+[A-Za-z]*)", answer)
citations = list(set(citation_matches))

# Get all section numbers that actually exist in ChromaDB
all_sections = collection.get(include=["metadatas"])
existing_section_numbers = [m["section_number"] for m in all_sections["metadatas"]]

# Flag any citations that don't exist
hallucination_flags = [f"Section {cit}" for cit in citations if cit not in existing_section_numbers]
```

**How this works:** The regex `(?i)section\s+([0-9]+[A-Za-z]*)` finds all patterns like "Section 85", "Section 103A", "SECTION 17". `(?i)` makes it case-insensitive. `[A-Za-z]*` captures trailing letters for sections like "63B".

If Gemini answers "Under Section 500 IPC..." but Section 500 is not in your ChromaDB collection, `hallucination_flags` will contain `"Section 500"`. Your frontend can show this as a warning.

**Limitation:** This only detects hallucinated section *numbers*. If Gemini correctly cites Section 85 but misquotes what it says, this check won't catch it. True hallucination detection requires embedding-based semantic comparison.

---

## The Full RAG Flow Visualized

```
User question: "What is the punishment for robbery under BNS?"
        │
        ▼
genai.embed_content(question, task_type="retrieval_query")
        │
        ▼  [0.021, -0.445, 0.881, ...]  (768 numbers)
        │
        ▼
ChromaDB.query(query_embedding, n_results=3)
        │
        ▼  Returns: BNS Section 309 (robbery), BNS Section 310 (dacoity), BNS Section 311
        │
        ▼
Build context string from 3 sections
        │
        ▼
Gemini: "Answer ONLY from this context: [3 sections]. Question: punishment for robbery?"
        │
        ▼
Gemini answer: "Under Section 309 BNS, robbery is punishable by..."
        │
        ▼
Check: is "309" in ChromaDB? Yes → not flagged as hallucination
        │
        ▼
Return: {answer, citations: ["Section 309"], hallucination_flags: [], retrieved_sections: [...]}
```

---

## What Breaks If This File Is Removed

The RAG endpoints (`/rag/add-section` and `/rag/query`) would fail at import — `routers/rag.py` imports `add_legal_section` and `query_rag_system` from `embedder.py`. Since `embedder.py` is a near-duplicate of `rag/service.py`, removing `rag/service.py` alone has no effect (it's not imported anywhere). Removing `embedder.py` would break the RAG endpoints.

---

## Two Exercises

**Exercise 1:** The current system stores sections in RAM — they disappear on restart. Change `embedder.py` to use persistent ChromaDB storage:
```python
chroma_client = chromadb.PersistentClient(path="./chroma_db")
```
Then add 3 BNS sections via the API, restart the server, and verify you can still query them without re-adding.

**Exercise 2:** The hallucination check uses regex to find section citations. What if Gemini writes "as per BNS S.85" instead of "Section 85"? Write a new regex pattern that also catches this format, and add it to the citation extraction logic. Test by asking a question and inspecting what citations are extracted.
