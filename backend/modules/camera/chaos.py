import sys
import time

def inject_malicious_stream():
    """
    Chaos Script: Simulates a "Virtual Camera" attack.
    It generates a stream that lacks natural sensor jitter.
    """
    print("[CHAOS] Starting Virtual Camera Injection Attack...")
    time.sleep(1)
    
    malicious_frame = b"HEADER_INFO_INJECTED_STATIC_STREAM_FOOTER"
    
    from backend.modules.camera.core import CameraModule
    cam = CameraModule()
    
    try:
        print("[CHAOS] Attempting to feed static stream to Camera Module...")
        evidence = cam.capture_frame(malicious_frame)
        print(f"[FAILURE] System accepted malicious stream! Evidence ID: {evidence.id}")
        sys.exit(1)
    except ValueError as e:
        print(f"[SUCCESS] System detected attack: {e}")
        sys.exit(0)

if __name__ == "__main__":
    inject_malicious_stream()
