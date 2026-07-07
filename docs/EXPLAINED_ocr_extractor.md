# EXPLAINED: backend/modules/ocr_extractor.py

> **One-line summary:** Takes a document image (JPEG, PNG, etc.) and uses Gemini Vision to extract structured fields — name, address, email, and other contact/identity information — into a JSON dict.

---

## What OCR Is and What This Does Differently

**Traditional OCR** (Optical Character Recognition): Uses image processing algorithms to detect characters in an image and convert them to text. Tools like Tesseract do this — they produce raw text, then you parse it.

**This file does multimodal AI extraction instead:** It sends the image directly to Gemini Vision and asks Gemini to produce structured JSON. This is better for court documents because:
- Traditional OCR fails on low-quality images, handwriting, and stamps
- Gemini Vision can understand context ("this is an address block, this is a signature")
- Output is immediately structured — no regex parsing needed

The tradeoff: Gemini Vision costs more per call than Tesseract, and requires an API key.

---

## Section-by-Section Walkthrough

### Imports and Setup

```python
import logging
import base64
import google.generativeai as genai
from typing import Dict, Any
from .gemini import extract_json, retry_on_failure

import os
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
```

**`from .gemini import`:** This is a relative import — `.gemini` means `modules/gemini.py` (same package). It imports the simpler `retry_on_failure` and `extract_json` from `modules/gemini.py`, not from `modules/ai/gemini_integration.py`. Both files define these — this one uses the shorter version.

**Module-level `genai.configure()`:** This configures Gemini at import time, not lazily. This means if `GEMINI_API_KEY` is missing, Gemini isn't configured but there's no immediate crash — the crash happens at the first `model.generate_content()` call.

**`import base64`:** Imported but not actually used in the final code — the image is passed directly as bytes, not base64-encoded. This is a leftover import from an earlier version.

---

### `redact_sensitive_info()`

```python
def redact_sensitive_info(data: Dict[str, Any]) -> Dict[str, Any]:
    """Redact sensitive IDs before logging."""
    redacted = data.copy()
    return redacted
```

**What this currently does:** Nothing. It makes a copy of the dict and returns it unchanged.

**What it's supposed to do:** Before logging extracted data (which might include ID numbers, Aadhaar numbers, passport numbers), redact sensitive fields. This is a security stub — the intent is right, the implementation is incomplete.

**What a real implementation would look like:**
```python
def redact_sensitive_info(data: Dict[str, Any]) -> Dict[str, Any]:
    redacted = data.copy()
    sensitive_fields = ["herdNo", "telephone", "mobile", "email"]
    for field in sensitive_fields:
        if field in redacted and redacted[field]:
            value = str(redacted[field])
            redacted[field] = value[:2] + "****" + value[-2:] if len(value) > 4 else "****"
    return redacted
```

---

### `extract_document_data()` — The Core Function

```python
@retry_on_failure(retries=3, delay=2)
def extract_document_data(image_blob: bytes, mime_type: str = "image/jpeg") -> Dict[str, Any]:
```

**`image_blob: bytes`:** Raw binary image data — the bytes you'd read from an image file. Not a file path, not base64, not a URL. Raw bytes.

**`mime_type: str = "image/jpeg"`:** A default parameter — if you don't provide mime_type, it assumes JPEG. MIME types tell the receiving system what kind of file this is: `image/jpeg`, `image/png`, `application/pdf`.

```python
    system_prompt = """
    You are a precise document extraction AI. Extract text and map it to this JSON schema.
    If a field is missing, return "" or null. Do not hallucinate data.

    Required JSON Schema:
    {
        "firstName": "Text or null",
        "lastName": "Text or null",
        ...
        "herdNo": "Text or null",
        "email": "Email or null"
    }
    """
```

**The schema in the prompt:** By showing Gemini the exact JSON structure with example values, you constrain its output format. The instruction "Do not hallucinate data" is explicit — if a field isn't visible in the image, return `null`.

**`herdNo`** — a livestock identification number. This suggests the OCR extractor was originally built for agricultural/rural legal documents (perhaps cattle theft cases, land records), not just general court documents.

```python
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=system_prompt
    )
    
    image_part = {
        "mime_type": mime_type,
        "data": image_blob        # ← raw bytes, not base64
    }
    
    prompt = "Extract the requested fields from this document image."
    response = model.generate_content([prompt, image_part])
```

**Multimodal input:** `model.generate_content([prompt, image_part])` sends both text and image. The list `[prompt, image_part]` tells Gemini: "here's what I want you to do, and here's the image to do it on." Gemini Vision processes both.

**Why pass `image_blob` directly (not base64)?** The Gemini Python SDK handles the encoding internally when you pass bytes. In older versions of the API, you needed to base64-encode manually — that's why `import base64` is still at the top (a leftover from the old approach).

```python
    extracted_data = extract_json(response.text)
    logger.info(f"Successfully extracted: {redact_sensitive_info(extracted_data)}")
    return extracted_data
```

**`extract_json(response.text)`:** Strips markdown fences and calls `json.loads()`. If Gemini returns valid JSON, you get a Python dict. If not, you get a `json.JSONDecodeError`.

---

## Where This Is Called

`routers/ocr_extract.py` (or `routers/ocr.py`) receives the file upload, reads the bytes, and calls `extract_document_data(image_bytes, mime_type)`.

The complete flow:
```
POST /ocr-extract/extract  (multipart form: file=document.jpg)
        │
        ▼
routers/ocr_extract.py
  ← reads file.read() → bytes
  ← determines mime_type from file.content_type
        │
        ▼
modules/ocr_extractor.py → extract_document_data(bytes, mime_type)
  ← builds image_part dict
  ← sends to Gemini Vision
  ← receives JSON response
  ← strips fences, parses JSON
        │
        ▼
Returns: {firstName: "Dhanush", lastName: "Shetty", email: "d@d.com", ...}
```

---

## Limitations of the Current Implementation

**1. Only returns a fixed schema.** If your document has different fields (like court case numbers, section references, judgment dates), the current schema won't capture them. You'd need to pass a dynamic schema or create multiple extractor functions.

**2. No validation of the extracted data.** If Gemini returns `{"email": "not an email"}`, the code returns it without complaint. A Pydantic model with email validation would catch this.

**3. `base64` is imported but not used.** Minor — just a leftover. Remove it to keep the code clean.

**4. No PDF support.** The function takes an image (`image/jpeg`, `image/png`). To handle PDFs, you'd need to convert each page to an image first (PyMuPDF can do this: `page.get_pixmap()`).

---

## What Breaks If This File Is Removed

The OCR extraction endpoint fails with `ImportError` when called. The server still starts (assuming the import is inside the endpoint function, not at top-level in `routers/ocr_extract.py`). Check `routers/ocr_extract.py` to confirm — if it imports `extract_document_data` at the top level, the entire server fails to start.

---

## Two Exercises

**Exercise 1:** The schema is hardcoded for contact/identity fields. Add a new function `extract_fir_data(image_blob: bytes) -> Dict[str, Any]` that extracts fields specific to an FIR (First Information Report): `station_name`, `fir_number`, `date_of_occurrence`, `accused_name`, `sections_applied`, `complainant_name`. Use a different system prompt tailored to FIR documents.

**Exercise 2:** Add PDF support. When a PDF is uploaded, use PyMuPDF to render each page to an image, then call `extract_document_data` on each page. Return a list of dicts, one per page. The PyMuPDF call to render a page as JPEG bytes is:
```python
import fitz
doc = fitz.open(stream=pdf_bytes, filetype="pdf")
page = doc[0]
pix = page.get_pixmap()
jpeg_bytes = pix.tobytes("jpeg")
```
