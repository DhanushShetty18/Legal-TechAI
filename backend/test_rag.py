import requests
import json
from pprint import pprint

BASE_URL = "http://127.0.0.1:8000/rag"

sections = [
    {
        "section_number": "101",
        "act_name": "BNS",
        "section_title": "Murder - Definition and punishment",
        "text": "Whoever commits murder shall be punished with death, or imprisonment for life, and shall also be liable to fine. A person is guilty of murder if the act by which the death is caused is done with the intention of causing death."
    },
    {
        "section_number": "102",
        "act_name": "BNS",
        "section_title": "Culpable homicide not amounting to murder",
        "text": "Whoever causes death by doing an act with the intention of causing death, or with the intention of causing such bodily injury as is likely to cause death, or with the knowledge that he is likely by such act to cause death, commits the offence of culpable homicide. If it is done without premeditation in a sudden fight, it is not murder."
    },
    {
        "section_number": "103",
        "act_name": "BNS",
        "section_title": "Punishment for murder",
        "text": "The punishment for murder is death or imprisonment for life and fine. This applies to all cases falling under Section 101."
    },
    {
        "section_number": "301",
        "act_name": "BNS",
        "section_title": "Theft - Definition",
        "text": "Whoever, intending to take dishonestly any movable property out of the possession of any person without that person's consent, moves that property in order to such taking, is said to commit theft."
    },
    {
        "section_number": "302",
        "act_name": "BNS",
        "section_title": "Punishment for theft",
        "text": "Whoever commits theft shall be punished with imprisonment of either description for a term which may extend to three years, or with fine, or with both."
    },
    {
        "section_number": "303",
        "act_name": "BNS",
        "section_title": "Theft in a dwelling house",
        "text": "Whoever commits theft in any building, tent or vessel, which building, tent or vessel is used as a human dwelling, or used for the custody of property, shall be punished with imprisonment of either description for a term which may extend to seven years, and shall also be liable to fine."
    },
    {
        "section_number": "315",
        "act_name": "BNS",
        "section_title": "Criminal breach of trust",
        "text": "Whoever, being in any manner entrusted with property, or with any dominion over property, dishonestly misappropriates or converts to his own use that property, or dishonestly uses or disposes of that property in violation of any direction of law, commits criminal breach of trust."
    },
    {
        "section_number": "316",
        "act_name": "BNS",
        "section_title": "Cheating and dishonestly inducing delivery of property (Fraud)",
        "text": "Whoever cheats and thereby dishonestly induces the person deceived to deliver any property to any person, or to make, alter or destroy the whole or any part of a valuable security, shall be punished with imprisonment of either description for a term which may extend to seven years, and shall also be liable to fine."
    },
    {
        "section_number": "400",
        "act_name": "BNS",
        "section_title": "Bail conditions for non-bailable offenses",
        "text": "In non-bailable offenses, bail may be granted subject to conditions such as surrendering the passport, appearing before the investigating officer as and when required, and not tampering with evidence or contacting witnesses. The court has discretion to impose any other condition considered necessary."
    },
    {
        "section_number": "401",
        "act_name": "BNS",
        "section_title": "Evidence admissibility in electronic form",
        "text": "Any information contained in an electronic record which is printed on a paper, stored, recorded or copied in optical or magnetic media produced by a computer shall be deemed to be a document, if the conditions regarding the reliability and integrity of the electronic record are satisfied."
    }
]

print("Adding sections...")
for sec in sections:
    try:
        response = requests.post(f"{BASE_URL}/add-section", json=sec)
        print(f"Added section {sec['section_number']}: {response.status_code}")
    except Exception as e:
        print(f"Error adding section {sec['section_number']}: {e}")

print("\n--- Testing RAG Query ---")
test_query = {
    "question": "What is the definition of theft and its punishment, and what happens if someone commits theft in a dwelling house? Also mention what Section 999 says."
}

try:
    response = requests.post(f"{BASE_URL}/query", json=test_query)
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print("\nAnswer:")
        print(data["answer"])
        print("\nCitations Extracted:")
        print(data["citations"])
        print("\nHallucination Flags:")
        print(data["hallucination_flags"])
    else:
        print("Response:", response.text)
except Exception as e:
    print("Error querying:", e)
