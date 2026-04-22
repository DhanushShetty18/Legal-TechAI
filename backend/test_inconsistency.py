import os
import io
import json
from fastapi.testclient import TestClient
from dotenv import load_dotenv

# Load env before importing main
load_dotenv()

from main import app

client = TestClient(app)

def test_inconsistency_detection():
    print("Testing Inconsistency Detection Pipeline...")
    
    if not os.environ.get("GEMINI_API_KEY"):
        print("WARNING: GEMINI_API_KEY not found in environment. This may fail.")

    doc_a_content = "The incident occurred on 15-08-2023 at 9:00 PM. The accused was wearing a red shirt and stole a gold chain. He acted alone."
    doc_b_content = "I saw the incident on 15-08-2023 at 11:00 PM. The accused had an accomplice and stole a silver chain. He was wearing a red shirt."
    
    files = [
        ("files", ("FIR.txt", io.BytesIO(doc_a_content.encode("utf-8")), "text/plain")),
        ("files", ("Witness_Statement.txt", io.BytesIO(doc_b_content.encode("utf-8")), "text/plain"))
    ]

    print("Sending request to /inconsistency/detect-inconsistencies...")
    response = client.post("/inconsistency/detect-inconsistencies", files=files)
    
    if response.status_code != 200:
        print(f"FAILED: {response.status_code}")
        print(response.text)
        return
        
    data = response.json()
    print("\n--- INCONSISTENCY REPORT ---")
    print(json.dumps(data, indent=2))
    
    print(f"\nTotal Contradictions: {data['total_contradictions']}")
    print(f"High Severity: {data['high_severity']}")
    
    if data["total_contradictions"] >= 3:
        print("SUCCESS! Detected expected temporal, factual, and logical contradictions.")
    else:
        print(f"WARNING: Expected around 3 contradictions, found {data['total_contradictions']}.")

if __name__ == "__main__":
    test_inconsistency_detection()
