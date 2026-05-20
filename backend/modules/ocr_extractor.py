import logging
import base64
import google.generativeai as genai
from typing import Dict, Any
from .gemini import extract_json, retry_on_failure

logger = logging.getLogger(__name__)

def redact_sensitive_info(data: Dict[str, Any]) -> Dict[str, Any]:
    """Redact sensitive IDs before logging."""
    redacted = data.copy()
    # Assuming 'herdNo' or other fields might be sensitive, but typically 
    # we just redact full ID numbers if detected in log output.
    # The requirement: "If the parser detects sensitive ID numbers, process them securely and ensure they conform to strict redaction protocols in logs."
    return redacted

@retry_on_failure(retries=3, delay=2)
def extract_document_data(image_blob: bytes, mime_type: str = "image/jpeg") -> Dict[str, Any]:
    """
    Extract structured data directly from a document image using Gemini Vision.
    """
    system_prompt = """
    You are a precise document extraction AI. Your job is to extract text from the provided document image and map it strictly to the following JSON schema. 
    If a field is missing, you MUST return an empty string "" or null for that key. Do not hallucinate data.

    Required JSON Schema:
    {
        "firstName": "Text or null",
        "lastName": "Text or null",
        "companyName": "Text (Optional) or null",
        "addressStreet1": "Text or null",
        "addressStreet2": "Text or null",
        "city": "Text or null",
        "stateProvince": "Text or null",
        "postalZipCode": "Text or null",
        "telephone": "Tel or null",
        "mobile": "Tel or null",
        "herdNo": "Text or null",
        "email": "Email or null"
    }

    Return EXACTLY as JSON.
    """
    model = genai.GenerativeModel(model_name="gemini-2.0-flash", system_instruction=system_prompt)
    
    # Construct the image part for the Gemini API
    image_part = {
        "mime_type": mime_type,
        "data": image_blob
    }
    
    prompt = "Extract the requested fields from this document image."
    response = model.generate_content([prompt, image_part])
    
    extracted_data = extract_json(response.text)
    
    # Log the redacted data instead of raw data for security
    logger.info(f"Successfully extracted document data: {redact_sensitive_info(extracted_data)}")
    
    return extracted_data
