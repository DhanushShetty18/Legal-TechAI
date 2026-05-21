import os
import time
import json
import logging
from typing import Dict, Any, List
from functools import wraps
from dotenv import load_dotenv
import google.generativeai as genai

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
else:
    logger.warning("GEMINI_API_KEY is not set. Gemini API calls will fail.")

from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable
import random

class AIServiceAtCapacityError(Exception):
    """Custom exception raised when the Vision AI (Gemini) is at capacity."""
    pass

# Retry decorator with Exponential Backoff and Jitter
def retry_on_failure(retries=3, base_delay=2):
    """
    Retries the decorated function upon failure.
    Uses exponential backoff with jitter to gracefully handle rate limits.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(retries + 1):
                try:
                    return func(*args, **kwargs)
                except (ResourceExhausted, ServiceUnavailable) as e:
                    last_exception = e
                    if attempt < retries:
                        # Exponential backoff: 2, 4, 8 seconds + random jitter
                        delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                        logger.warning(f"Rate limit or service unavailable hit for {func.__name__} (attempt {attempt + 1}). Retrying in {delay:.2f}s...")
                        time.sleep(delay)
                    else:
                        logger.error(f"All {retries} retries exhausted for {func.__name__} due to capacity constraints.")
                        # Fail gracefully with a specific error message expected by the frontend
                        raise AIServiceAtCapacityError("Vision AI is currently at capacity. Please try again in 30 seconds.")
                except Exception as e:
                    last_exception = e
                    if attempt < retries:
                        delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                        logger.warning(f"Attempt {attempt + 1} failed for {func.__name__}: {str(e)}. Retrying in {delay:.2f}s...")
                        time.sleep(delay)
                    else:
                        logger.error(f"All {retries} attempts failed for {func.__name__}")
                        raise
            raise last_exception
        return wrapper
    return decorator

def extract_json(response_text: str) -> Any:
    """Helper to extract JSON from markdown code blocks if present."""
    text = response_text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
        
    if text.endswith("```"):
        text = text[:-3]
        
    return json.loads(text.strip())

@retry_on_failure(retries=3, delay=2)
def summarize_legal_document(text: str) -> Dict[str, Any]:
    system_prompt = (
        "You are a legal analyst for Indian courts. You only analyse documents under "
        "BNS, BNSS, and BSA - India's criminal codes from 2024. Never reference IPC or CrPC."
    )
    
    prompt = f"""
    Analyze the following legal document text and extract the key information.
    
    Extract and return EXACTLY as JSON with these exact keys, using null if a field cannot be found:
    {{
        "parties": [list of strings or null],
        "charges": [list of strings or null],
        "key_dates": [list of strings or null],
        "evidence_listed": [list of strings or null],
        "current_status": string or null,
        "applicable_sections": [list of strings or null]
    }}
    
    Never hallucinate section numbers.
    
    Document Text:
    {text}
    """
    
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        system_instruction=system_prompt
    )
    
    response = model.generate_content(prompt)
    return extract_json(response.text)

@retry_on_failure(retries=3, delay=2)
def extract_claims(text: str) -> List[Dict[str, Any]]:
    prompt = f"""
    Break the following legal document into atomic factual claims.
    Each claim must be one sentence and contain exactly one verifiable fact.
    
    Return EXACTLY as a JSON array of objects with these keys:
    [
        {{
            "claim_id": string (unique identifier like "C1", "C2"),
            "claim_text": string,
            "claim_type": string (must be exactly one of: "factual", "temporal", "locational")
        }}
    ]
    
    Document Text:
    {text}
    """
    
    model = genai.GenerativeModel(model_name="gemini-2.0-flash")
    response = model.generate_content(prompt)
    return extract_json(response.text)

@retry_on_failure(retries=3, delay=2)
def answer_legal_question(question: str, context: str) -> Dict[str, Any]:
    prompt = f"""
    Answer the legal question based ONLY on the provided context.
    If the answer is not in the context, you MUST return "This information is not present in the provided documents" for the answer field.
    Always cite which part of the context you used.
    
    Return EXACTLY as JSON with these exact keys:
    {{
        "answer": string,
        "citation": string or null,
        "confidence": string (must be exactly one of: "high", "medium", "low")
    }}
    
    Question: {question}
    
    Context:
    {context}
    """
    
    model = genai.GenerativeModel(model_name="gemini-2.0-flash")
    response = model.generate_content(prompt)
    return extract_json(response.text)
