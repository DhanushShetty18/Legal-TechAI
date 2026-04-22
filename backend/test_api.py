import requests
import os
import sys

# Add parent directory to path if running directly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE_URL = "http://localhost:8000"

def test_api():
    print("Testing API...")

    # 1. Create User
    user_data = {
        "email": "citizen@test.com",
        "full_name": "Test Citizen",
        "role": "citizen",
        "password": "securepassword"
    }
    try:
        response = requests.post(f"{BASE_URL}/users/", json=user_data)
        if response.status_code == 200:
            user = response.json()
            print(f"User created: {user['id']}")
            user_id = user['id']
        elif response.status_code == 400 and "Email already registered" in response.text:
            print("User already exists, skipping creation.")
            # Fetch existing user for ID (hacky for test)
            # In a real test we'd reset DB or use unique emails
            # For now let's just assume ID 1
            user_id = 1
        else:
            print(f"Failed to create user: {response.text}")
            return
    except Exception as e:
        print(f"Connection failed: {e}")
        return

    # 2. Create Case
    case_data = {
        "title": "Test Case via Camera",
        "description": "Dispute over land",
        "priority": "NORMAL"
    }
    response = requests.post(f"{BASE_URL}/cases/?user_id={user_id}", json=case_data)
    if response.status_code == 200:
        case = response.json()
        print(f"Case created: {case['case_number']}")
        case_id = case['id']
    else:
        print(f"Failed to create case: {response.text}")
        return

    # 3. Upload Document
    # Create a dummy file
    with open("test_doc.txt", "w") as f:
        f.write("This is a test document content for hash verification.")
    
    files = {'file': ('test_doc.txt', open('test_doc.txt', 'rb'), 'text/plain')}
    data = {
        'case_id': case_id,
        'uploader_id': user_id,
        'capture_method': 'camera'
    }
    
    response = requests.post(f"{BASE_URL}/documents/", files=files, data=data)
    if response.status_code == 200:
        doc = response.json()
        print(f"Document uploaded: {doc['id']}, Hash: {doc['file_hash']}")
    else:
        print(f"Failed to upload document: {response.text}")
    
    # Clean up
    os.remove("test_doc.txt")
    print("Test Complete.")

if __name__ == "__main__":
    test_api()
