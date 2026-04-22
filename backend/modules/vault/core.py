import hashlib
import json
from typing import Any, Dict
from datetime import datetime
from backend.modules.infrastructure.schemas import Evidence

class ImmutableVault:
    def __init__(self):
        self.ledger = [] # Mock distributed ledger
        self.offline_queue = [] # Queue for offline sync

    def archive_document(self, document: Dict[str, Any], identity_signature: str) -> str:
        """
        Archives a document with Zero-Knowledge Hashing and Identity Linkage.
        """
        # 1. Local Capture & Hashing
        doc_hash = self._compute_zk_hash(document)
        
        # 2. Identity Verification (Stub)
        if not self._verify_identity_signature(doc_hash, identity_signature):
             raise ValueError("Security Alert: Document signature invalid or identity unverified.")

        # 3. Canonical Mapping (already assumed to be in schema format)
        entry = {
            "hash": doc_hash,
            "signature": identity_signature,
            "timestamp": datetime.utcnow().isoformat(),
            "status": "SYNCED"
        }
        
        # 4. Resilient Sync
        if self._is_offline():
            entry["status"] = "QUEUED"
            self.offline_queue.append(entry)
            print("[VAULT] System Offline. Document queued for sync.")
            return doc_hash
        
        self.ledger.append(entry)
        print(f"[VAULT] Document {doc_hash[:8]}... permanently archived on ledger.")
        return doc_hash

    def _compute_zk_hash(self, data: Dict[str, Any]) -> str:
        # Sort keys for deterministic hashing
        canonical = json.dumps(data, sort_keys=True).encode()
        return hashlib.sha256(canonical).hexdigest()

    def _verify_identity_signature(self, data_hash: str, signature: str) -> bool:
        # Mock Verification
        # In real ZK, we prove we know the signer without revealing them.
        # Here we just check if signature contains the hash.
        return signature == f"SIG_{data_hash}"

    def _is_offline(self) -> bool:
        # Mock offline state check
        # This will be toggled by the Chaos Script
        import os
        return os.environ.get("JUDICIARY_NETWORK_STATUS") == "OFFLINE"
    
    def force_sync(self):
        """
        Retry syncing queued documents.
        """
        print(f"[VAULT] Attempting to sync {len(self.offline_queue)} documents...")
        synced_count = 0
        for entry in list(self.offline_queue):
            if not self._is_offline():
                entry["status"] = "SYNCED"
                self.ledger.append(entry)
                self.offline_queue.remove(entry)
                synced_count += 1
        print(f"[VAULT] Synced {synced_count} documents.")

