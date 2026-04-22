from datetime import datetime
import random
from backend.modules.infrastructure.schemas import Evidence

class CameraModule:
    def __init__(self):
        self.device_id = "CAM-001-SECURE"

    def capture_frame(self, frame_data: bytes) -> Evidence:
        """
        Captures a frame and performs anti-forgery checks.
        """
        if not self._analyze_frame_jitter(frame_data):
            raise ValueError("Anti-Forgery Check Failed: Static/Injected Stream Detected")
        
        if not self._check_liveness(frame_data):
             raise ValueError("Anti-Forgery Check Failed: Liveness Check Failed")

        # Create Evidence Object
        import hashlib
        frame_hash = hashlib.sha256(frame_data).hexdigest()
        
        return Evidence(
            type="VideoFrame",
            format="image/jpeg",
            hash=frame_hash,
            captured_at=datetime.utcnow(),
            source_metadata={
                "device_id": self.device_id,
                "liveness_verified": True,
                "jitter_analysis_pass": True
            }
        )

    def _analyze_frame_jitter(self, frame_data: bytes) -> bool:
        """
        Mock implementation of Frame-Jitter Analysis.
        In reality, this would analyze micro-movements in the CMOS sensor.
        If the stream is perfectly stable (digital injection), it fails.
        """
        # Mock: Check if specific 'marker' bytes related to digital injection are present
        # In a real scenario, this would be complex signal processing.
        # For Chaos testing: we can check for a specific 'INJECTED' byte pattern
        if b"INJECTED_STATIC_STREAM" in frame_data:
            return False
        return True

    def _check_liveness(self, frame_data: bytes) -> bool:
        """
        Mock implementation of Biometric Liveness.
        """
        # Mock: Fail if 'DEAD_Video' marker is found
        if b"SPOOF_MOUTH_MOVEMENT" in frame_data:
            return False
        return True
