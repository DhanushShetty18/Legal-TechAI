import requests
import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE_URL = "http://localhost:8000"

def test_search():
    print("Testing Case Search...")
    
    # 1. Search for a known case (CASE-DE113E20 from previous run, or create new).
    # Let's create a new one to be sure.
    
    # Create User
    user_payload = {"email": "search_tester@test.com", "full_name": "Search Tester", "role": "citizen", "password": "pw"}
    try:
        u_res = requests.post(f"{BASE_URL}/users/", json=user_payload)
        user_id = u_res.json().get('id', 2) # Fallback if exists
    except:
        user_id = 2

    # Create Case
    case_payload = {
        "title": "Searchable Case",
        "description": "This case should be found via search.",
        "case_type": "CIVIL",
        "status": "OPEN"
    }
    c_res = requests.post(f"{BASE_URL}/cases/?user_id={user_id}", json=case_payload)
    if c_res.status_code != 200:
        print(f"Failed to create case: {c_res.text}")
        return

    case_data = c_res.json()
    case_number = case_data['case_number']
    print(f"Created Case: {case_number}")

    # 2. Search Success
    print(f"Searching for {case_number}...")
    s_res = requests.get(f"{BASE_URL}/cases/search?q={case_number}")
    if s_res.status_code == 200:
        print("Search Successful!")
        print(s_res.json())
    else:
        print(f"Search Failed: {s_res.text}")
        assert False, "Search should have found the case"

    # 3. Search Fail
    print("Searching for invalid case...")
    f_res = requests.get(f"{BASE_URL}/cases/search?q=INVALID-CASE")
    assert f_res.status_code == 404
    print("Invalid search correctly returned 404")
    
    print("Search Module Test Passed.")

if __name__ == "__main__":
    test_search()
