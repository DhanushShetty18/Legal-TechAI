import requests
import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE_URL = "http://localhost:8000"

def test_summary():
    print("Testing AI Summarizer...")
    
    # 1. Create User
    user_payload = {"email": "judge_user@test.com", "full_name": "Justice Test", "role": "judge", "password": "pw"}
    try:
        u_res = requests.post(f"{BASE_URL}/users/", json=user_payload)
        user_id = u_res.json().get('id', 2)
    except:
        user_id = 2

    # 2. Create Complex Case
    case_payload = {
        "title": "Corporate Fraud Case",
        "description": "Urgent attention required. The defendant company allegedly falsified accounts.",
        "case_type": "CRIMINAL",
        "status": "OPEN"
    }
    c_res = requests.post(f"{BASE_URL}/cases/?user_id={user_id}", json=case_payload)
    if c_res.status_code != 200:
        print(f"Failed to create case: {c_res.text}")
        return

    case_id = c_res.json()['id']
    print(f"Created Case ID: {case_id}")

    # 3. Generate Summary
    print(f"Requesting summary for Case {case_id}...")
    s_res = requests.get(f"{BASE_URL}/cases/{case_id}/summary")
    
    if s_res.status_code == 200:
        data = s_res.json()
        print("Summary Generated Successfully:")
        print(f"Summary: {data['summary'][:50]}...")
        print(f"Recommendation: {data['recommendation']}")
        
        # Verify specific logic
        assert "High Priority" in data['recommendation'], "Urgent case should be High Priority"
        assert len(data['key_dates']) > 0
    else:
        print(f"Summary Failed: {s_res.text}")
        assert False

    print("Summarizer Module Test Passed.")

if __name__ == "__main__":
    test_summary()
