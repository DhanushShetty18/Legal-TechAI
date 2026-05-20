import os
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
from unittest.mock import patch, MagicMock
from modules.ocr_extractor import extract_document_data

def create_mock_image() -> bytes:
    """Create a mock document image containing fake data."""
    img = Image.new('RGB', (800, 600), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    text = "Document Proof\\nName: Jane Smith..."
    
    try:
        font = ImageFont.truetype("arial.ttf", 24)
    except IOError:
        font = ImageFont.load_default()
        
    d.text((50, 50), text, fill=(0, 0, 0), font=font)
    
    buffer = BytesIO()
    img.save(buffer, format="JPEG")
    return buffer.getvalue()

@patch('modules.ocr_extractor.genai.GenerativeModel')
def test_ocr_extraction(mock_model_class):
    # Setup mock
    mock_model_instance = MagicMock()
    mock_model_class.return_value = mock_model_instance
    mock_response = MagicMock()
    mock_response.text = '''```json
    {
        "firstName": "Jane",
        "lastName": "Smith",
        "companyName": "Tech Innovations LLC",
        "addressStreet1": "456 Elm Street Apt 4B",
        "addressStreet2": null,
        "city": "Metropolis",
        "stateProvince": "NY",
        "postalZipCode": "10001",
        "telephone": "(555) 987-6543",
        "mobile": "(555) 123-4567",
        "herdNo": null,
        "email": null
    }
    ```'''
    mock_model_instance.generate_content.return_value = mock_response

    # 1. Generate a mock image in memory
    image_bytes = create_mock_image()
    
    # 2. Extract data 
    extracted_data = extract_document_data(image_bytes, mime_type="image/jpeg")
    
    # 3. Assertions
    assert extracted_data.get("firstName") == "Jane", f"Expected 'Jane', got {extracted_data.get('firstName')}"
    assert extracted_data.get("lastName") == "Smith", f"Expected 'Smith', got {extracted_data.get('lastName')}"
    assert extracted_data.get("companyName") == "Tech Innovations LLC", f"Expected 'Tech Innovations LLC', got {extracted_data.get('companyName')}"
    assert "456 Elm Street" in extracted_data.get("addressStreet1", ""), f"Address 1 mismatch: {extracted_data.get('addressStreet1')}"
    assert extracted_data.get("city") == "Metropolis", f"City mismatch: {extracted_data.get('city')}"
    assert extracted_data.get("stateProvince") == "NY", f"State mismatch: {extracted_data.get('stateProvince')}"
    assert extracted_data.get("postalZipCode") == "10001", f"Zip mismatch: {extracted_data.get('postalZipCode')}"
    
    # Phone numbers
    assert "555" in str(extracted_data.get("telephone", "")), "Telephone mismatch"
    assert "555" in str(extracted_data.get("mobile", "")), "Mobile mismatch"
    
    # Checking missing values are properly empty or null
    assert not extracted_data.get("herdNo"), "Herd No should be empty or null"
    assert not extracted_data.get("email"), "Email should be empty or null"
    
    print("All tests passed successfully!")

if __name__ == "__main__":
    import pytest
    pytest.main(["-v", "test_ocr_extractor.py"])
