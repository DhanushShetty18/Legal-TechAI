import os
import sys

# Set key
os.environ["GEMINI_API_KEY"] = "os.getenv("GEMINI_API_KEY")"

from modules.ocr_extractor import extract_document_data
import google.generativeai as genai
genai.configure(api_key=os.environ["GEMINI_API_KEY"])

def extract_document_data_15(image_blob: bytes):
    model = genai.GenerativeModel(model_name="gemini-1.5-flash-latest")
    image_part = {"mime_type": "image/jpeg", "data": image_blob}
    response = model.generate_content(["Extract text", image_part])
    return response.text

# Create dummy image
image_blob = b"dummy image content"

try:
    print("Testing OCR extraction with 1.5 latest...")
    result = extract_document_data_15(image_blob)
    print("Result:", result)
except Exception as e:
    import traceback
    traceback.print_exc()
