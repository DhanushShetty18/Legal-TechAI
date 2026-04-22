import os
import json
import google.generativeai as genai
from typing import List, Dict, Any
from .schemas import (
    Entity, DocumentEntities, Claim, ExtractedClaims, 
    ContradictionCandidate, DetectedContradictions,
    FinalContradiction, CleanFact, InconsistencyReport
)
import pydantic

# Configure Gemini API
# Assuming GEMINI_API_KEY is in environment variables
genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))

class InconsistencyEngine:
    def __init__(self):
        # We use Gemini 1.5 Pro for complex reasoning tasks
        self.model = genai.GenerativeModel("gemini-1.5-pro")

    def _call_gemini_json(self, prompt: str, schema_class: type[pydantic.BaseModel]) -> pydantic.BaseModel:
        """Helper to call Gemini and parse JSON into a Pydantic model."""
        # Using JSON mode if supported, or just strong prompting.
        full_prompt = f"""
{prompt}

CRITICAL: You MUST output strictly valid JSON.
Your output must exactly match this JSON schema:
{schema_class.model_json_schema()}

Do not wrap the JSON in markdown blocks like ```json ... ```. Just return the raw JSON string.
"""
        response = self.model.generate_content(
            full_prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.0,
                response_mime_type="application/json"
            )
        )
        
        try:
            return schema_class.model_validate_json(response.text)
        except pydantic.ValidationError as e:
            # If it fails, we can try to clean up the response text in case of markdown wrapping
            text = response.text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
            return schema_class.model_validate_json(text)

    def process(self, documents: List[Dict[str, str]]) -> InconsistencyReport:
        """
        Main pipeline executing the 4 sequential steps.
        documents format: [{"doc_id": "FIR.pdf", "text": "[Page 1] text..."}]
        """
        if not os.environ.get("GEMINI_API_KEY"):
            # Mock or error? The requirements expect a real integration.
            # Let's assume the key is passed correctly in the environment.
            pass

        # Format input text
        doc_texts = []
        for doc in documents:
            doc_texts.append(f"--- DOCUMENT: {doc['doc_id']} ---\n{doc['text']}\n")
        full_context = "\n".join(doc_texts)

        # STEP 1: Entity Extraction
        entities = self._extract_entities(full_context)

        # STEP 2: Claim Extraction
        claims = self._extract_claims(full_context, entities)

        # STEP 3: Contradiction Detection
        contradictions = self._detect_contradictions(claims)

        # STEP 4: Evidence Linking
        report = self._link_evidence(claims, contradictions)

        return report

    def _extract_entities(self, context: str) -> List[DocumentEntities]:
        # We will extract entities but wrap in a container list
        class EntityExtractionResponse(pydantic.BaseModel):
            documents: List[DocumentEntities]

        prompt = f"""
You are an expert Indian Legal AI.
STEP 1: ENTITY EXTRACTION
Extract key entities from the following legal documents.
Categories: PERSON, DATE, LOCATION, AMOUNT, ACTION.
For persons, specify roles (accused/witness/victim/officer) if discernible.

DOCUMENTS:
{context}
"""
        res = self._call_gemini_json(prompt, EntityExtractionResponse)
        return res.documents

    def _extract_claims(self, context: str, entities: List[DocumentEntities]) -> ExtractedClaims:
        prompt = f"""
You are an expert Indian Legal AI.
STEP 2: CLAIM EXTRACTION
Based on the text and extracted entities, break each document into atomic claims.
Rules:
- One fact per claim.
- Types: factual / temporal / locational / quantitative
- You MUST provide the exact_quote from the text that supports the claim.
- Note the doc_id and page_ref for each claim.

DOCUMENTS:
{context}

ENTITIES (For Reference):
{json.dumps([e.model_dump() for e in entities], indent=2)}
"""
        return self._call_gemini_json(prompt, ExtractedClaims)

    def _detect_contradictions(self, claims: ExtractedClaims) -> DetectedContradictions:
        prompt = f"""
You are an expert Indian Legal AI.
STEP 3: CONTRADICTION DETECTION
Compare claims across documents.
Detect 3 types of contradictions:
- FACTUAL: Same event described differently (e.g. Doc A says 'gold chain', Doc B says 'silver chain')
- TEMPORAL: Same event at different times
- LOGICAL: One claim makes another impossible

Rules:
- Only flag a contradiction if two claims from DIFFERENT documents clash.
- Identify the claim_id of the two clashing claims.
- Explain the reasoning.
- Also list the claim_ids of claims that are consistent/clean.

CLAIMS:
{claims.model_dump_json(indent=2)}
"""
        return self._call_gemini_json(prompt, DetectedContradictions)

    def _link_evidence(self, claims: ExtractedClaims, contradictions: DetectedContradictions) -> InconsistencyReport:
        prompt = f"""
You are an expert Indian Legal AI.
STEP 4: EVIDENCE LINKING
Take the detected contradictions and link them back to the original exact quotes to build the final report.

For each contradiction:
- Find the exact_quote_doc_a and exact_quote_doc_b from the claims.
- Determine severity (HIGH / MEDIUM / LOW). HIGH means it could change the outcome of the case.
- Write a one sentence, plain language explanation.

For clean facts:
- Extract the fact, document_id, page_ref, and exact_quote for the consistent_claim_ids.

CLAIMS:
{claims.model_dump_json(indent=2)}

DETECTED CONTRADICTIONS:
{contradictions.model_dump_json(indent=2)}
"""
        return self._call_gemini_json(prompt, InconsistencyReport)
