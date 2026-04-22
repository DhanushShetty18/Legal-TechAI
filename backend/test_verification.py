import requests
import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE_URL = "http://localhost:8000"

def test_verification():
    print("Testing Identity Verification...")
    
    # 1. Create User
    user_data = {
        "email": "verifiable_citizen@test.com",
        "full_name": "Verified Citizen",
        "role": "citizen",
        "password": "password123"
    }
    
    try:
        res = requests.post(f"{BASE_URL}/users/", json=user_data)
        if res.status_code == 200:
            user_id = res.json()['id']
            print(f"User created: {user_id}")
        elif "Email already registered" in res.text:
            # Quick hack to get ID if exists
            # In real test, we would query DB or use distinct email
            print("User exists, assuming ID 2 for test flow") 
            user_id = 2 
        else:
            print(f"Failed to create user: {res.text}")
            return
    except Exception as e:
        print(f"Connection failed: {e}")
        return

    # 2. Verify Identity (Success Case)
    print("Attempting valid verification...")
    res = requests.post(f"{BASE_URL}/users/{user_id}/verify", data={"govt_id": "123456789"})
    print(f"Valid Verify Response: {res.json()}")
    assert res.json()['status'] == 'verified'

    # 3. Verify Identity (Failure Case)
    print("Attempting fraudulent verification...")
    res = requests.post(f"{BASE_URL}/users/{user_id}/verify", data={"govt_id": "999999000"})
    print(f"Fraud Verify Response: {res.json()}")
    assert res.json()['status'] == 'failed'
    
    print("Verification Module Test Passed.")

if __name__ == "__main__":
    test_verification()
