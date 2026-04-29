"""
End-to-end test for the Inconsistency Detection pipeline.

Test 1 — Classic contradictions (factual, temporal, logical)
Test 2 — Physical impossibility (Mumbai → Pune in 15 minutes)
"""

import os
import io
import json
from fastapi.testclient import TestClient
from dotenv import load_dotenv

# Load env before importing main
load_dotenv()

from main import app

client = TestClient(app)

ENDPOINT = "/inconsistency/detect-inconsistencies"


def _post_docs(doc_pairs: list[tuple[str, str]]):
    """Helper: POST multiple text documents and return the response."""
    files = [
        ("files", (name, io.BytesIO(text.encode("utf-8")), "text/plain"))
        for name, text in doc_pairs
    ]
    return client.post(ENDPOINT, files=files)


def test_classic_contradictions():
    """Temporal (9pm vs 11pm), factual (gold vs silver), logical (alone vs accomplice)."""
    print("=" * 60)
    print("TEST 1 — Classic contradictions")
    print("=" * 60)

    doc_a = (
        "The incident occurred on 15-08-2023 at 9:00 PM. "
        "The accused was wearing a red shirt and stole a gold chain. "
        "He acted alone."
    )
    doc_b = (
        "I saw the incident on 15-08-2023 at 11:00 PM. "
        "The accused had an accomplice and stole a silver chain. "
        "He was wearing a red shirt."
    )

    resp = _post_docs([("FIR.txt", doc_a), ("Witness_Statement.txt", doc_b)])

    if resp.status_code != 200:
        print(f"FAILED: HTTP {resp.status_code}")
        print(resp.text)
        return

    data = resp.json()
    print(json.dumps(data, indent=2))
    print(f"\nTotal contradictions : {data['total_contradictions']}")
    print(f"High severity        : {data['high_severity']}")

    if data["total_contradictions"] >= 3:
        print("✅ SUCCESS — detected expected temporal, factual, and logical contradictions.\n")
    else:
        print(f"⚠️  WARNING — expected ≥3 contradictions, found {data['total_contradictions']}.\n")


def test_physical_impossibility():
    """Accused in Mumbai at 9:00 PM and Pune at 9:15 PM — physically impossible."""
    print("=" * 60)
    print("TEST 2 — Physical impossibility (Mumbai ↔ Pune)")
    print("=" * 60)

    doc_a = (
        "The accused was seen at the crime scene in Mumbai at 9:00 PM on 20-03-2024."
    )
    doc_b = (
        "The accused was present at his residence in Pune at 9:15 PM on 20-03-2024 "
        "according to the CCTV footage."
    )

    resp = _post_docs([("FIR_Mumbai.txt", doc_a), ("CCTV_Report_Pune.txt", doc_b)])

    if resp.status_code != 200:
        print(f"FAILED: HTTP {resp.status_code}")
        print(resp.text)
        return

    data = resp.json()
    print(json.dumps(data, indent=2))

    phys = [
        c for c in data["contradictions"]
        if c["contradiction_type"] == "PHYSICAL_IMPOSSIBILITY"
    ]
    if phys:
        print(f"\n✅ SUCCESS — {len(phys)} PHYSICAL_IMPOSSIBILITY contradiction(s) detected.")
        for p in phys:
            print(f"   → {p['impossibility_reason']}")
    else:
        print("⚠️  WARNING — no PHYSICAL_IMPOSSIBILITY contradiction found.")

    print()


def test_minimum_file_validation():
    """Ensure the endpoint rejects a single-file upload."""
    print("=" * 60)
    print("TEST 3 — Minimum file validation (expect 400)")
    print("=" * 60)

    resp = _post_docs([("single.txt", "Some content.")])

    if resp.status_code == 400:
        print(f"✅ Correctly rejected with HTTP 400: {resp.json()['detail']}\n")
    else:
        print(f"⚠️  Unexpected status {resp.status_code}\n")


if __name__ == "__main__":
    test_minimum_file_validation()
    test_classic_contradictions()
    test_physical_impossibility()
