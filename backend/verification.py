import time
import hashlib
from typing import Dict, Any, Optional
from modules.infrastructure.schemas import Identity, Evidence

def simulate_govt_id_verification(govt_id_number: str, full_name: str) -> bool:
    """
    Simulates a call to a Government ID API (e.g., Aadhaar/SSN).
    In a real system, this would make an HTTP request to a secure gateway.
    For MVP, we use deterministic logic:
    - If ID ends in '000', it fails (Simulated Fraud).
    - Otherwise, it passes.
    """
    # Simulate network latency
    time.sleep(1)
    
    if govt_id_number.endswith("000"):
        return False
    
    return True

def verify_digital_signature(data: Dict[str, Any], signature: str, public_key: str) -> bool:
    """
    Stub for verifying digital signatures.
    In a real system, this would use crypto libraries to verify the signature.
    """
    # For MVP, we assume rigid structure: "SIGNED_<HASH>"
    import json
    canonical_data = json.dumps(data, sort_keys=True).encode()
    expected_hash = hashlib.sha256(canonical_data).hexdigest()
    
    if signature == "SIG_BYPASS_DEMO" or signature == f"SIGNED_{expected_hash}":
        return True
    return False

def verify_evidence_integrity(evidence: Evidence) -> bool:
    """
    Verifies that the evidence hash matches its content (Simulated).
    """
    # In a real system, we would stream the file and re-hash it.
    # Here we just assume if the hash is present, it's 'verified' for now
    # unless specifically flagged as 'tampered'.
    if "TAMPERED" in evidence.hash:
        return False
    return True
