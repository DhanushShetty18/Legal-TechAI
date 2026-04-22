import sys

def inject_contradictory_data():
    """
    Chaos Script: Simulates a "Hallucination Audit" by feeding contradictory data.
    """
    print("[CHAOS] Starting Hallucination Audit (Mock Case)...")
    
    mock_case_data = {
        "extracted_facts": [
            {"type": "incident_time", "value": "22:00", "source": "FIR_Report_v1.pdf"},
            {"type": "incident_time", "value": "10:00", "source": "Medical_Report_Final.pdf"}
        ]
    }
    
    from backend.modules.summarizer.core import CaseSummarizer
    summarizer = CaseSummarizer()
    
    result = summarizer.summarize_case(mock_case_data)
    
    print("\n[AI OUTPUT]")
    print(result)
    
    if "DIVERGENT FACTS DETECTED" in result:
        print("\n[SUCCESS] AI correctly flagged the contradiction instead of hallucinating a single truth.")
        sys.exit(0)
    else:
        print("\n[FAILURE] AI hallucinated a resolved timeline without flagging the conflict.")
        sys.exit(1)

if __name__ == "__main__":
    inject_contradictory_data()
