import os
import sys

def simulate_offline_resilience():
    """
    Chaos Script: Simulates total offline state and recovery.
    Problem 5: "The Internet Will Fail."
    """
    print("[CHAOS] Simulating Network Failure (Offline Model)...")
    
    # Enable Offline Mode
    os.environ["JUDICIARY_NETWORK_STATUS"] = "OFFLINE"
    
    from modules.vault.core import ImmutableVault
    vault = ImmutableVault()
    
    mock_doc = {"case_id": "CASE-2026-X", "content": "Test Verdict"}
    mock_hash = vault._compute_zk_hash(mock_doc)
    mock_sig = f"SIG_{mock_hash}"
    
    print("[STEP 1] Attempting to archive document while OFFLINE...")
    vault.archive_document(mock_doc, mock_sig)
    
    if len(vault.offline_queue) == 1:
        print("[SUCCESS] Document correctly queued locally.")
    else:
        print("[FAILURE] Document lost or not queued.")
        sys.exit(1)

    print("[STEP 2] Restoring Network...")
    os.environ["JUDICIARY_NETWORK_STATUS"] = "ONLINE"
    
    vault.force_sync()
    
    if len(vault.ledger) == 1 and len(vault.offline_queue) == 0:
         print("[SUCCESS] Document synced to ledger after recovery.")
         sys.exit(0)
    else:
         print("[FAILURE] Sync failed.")
         sys.exit(1)

if __name__ == "__main__":
    simulate_offline_resilience()
