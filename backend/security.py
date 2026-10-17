"""Small, dependency-free security helpers shared across the API.

Everything here uses the Python standard library only, so it adds nothing to
requirements.txt and is easy to read end to end.
"""

import hashlib
import hmac
import os
import secrets
import uuid
from typing import List, Optional

from fastapi import Header, HTTPException

MAX_UPLOAD_BYTES = 12 * 1024 * 1024

_DEFAULT_ORIGINS = (
    "http://localhost:3000,"
    "https://legaltechai.in,"
    "https://www.legaltechai.in"
)

# Extensions we are willing to keep on disk. Anything else is stored as ".bin".
_SAFE_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".txt"}

# Roles a person may pick for themselves at sign-up. Judge, clerk and admin are
# granted by an administrator, never self-selected.
SELF_SERVICE_ROLES = {"citizen", "lawyer"}

_PBKDF2_ITERATIONS = 600_000


# --------------------------------------------------------------------- CORS
def allowed_origins() -> List[str]:
    """Browser origins allowed to call the API, from ALLOWED_ORIGINS (comma-separated)."""
    raw = os.getenv("ALLOWED_ORIGINS", _DEFAULT_ORIGINS)
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def demo_routes_enabled() -> bool:
    """The /demo router is mounted only when ENABLE_DEMO_ROUTES=1."""
    return os.getenv("ENABLE_DEMO_ROUTES", "") == "1"


# ------------------------------------------------------------------ uploads
def safe_upload_path(upload_dir: str, client_filename: Optional[str]) -> str:
    """A server-chosen path inside ``upload_dir``. The client's name is used only
    for its extension, and only if that extension is on the allow-list."""
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(os.path.basename(client_filename or ""))[1].lower()
    if ext not in _SAFE_EXTENSIONS:
        ext = ".bin"
    path = os.path.join(upload_dir, f"{uuid.uuid4().hex}{ext}")

    # Belt and braces: the resolved path must still sit inside upload_dir.
    root = os.path.realpath(upload_dir)
    if os.path.commonpath([root, os.path.realpath(path)]) != root:
        raise HTTPException(status_code=400, detail="Invalid file name.")
    return path


# ---------------------------------------------------------------- passwords
def hash_password(password: str) -> str:
    """PBKDF2-SHA256 with a random per-user salt. Stored as iterations$salt$hash."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time check of a password against a value from hash_password()."""
    try:
        scheme, iterations, salt_hex, digest_hex = stored.split("$")
    except (AttributeError, ValueError):
        return False
    if scheme != "pbkdf2_sha256":
        return False
    candidate = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations)
    )
    return hmac.compare_digest(candidate.hex(), digest_hex)


# -------------------------------------------------------------- admin key
def require_admin_key(x_admin_key: Optional[str] = Header(default=None)) -> None:
    """Guards write access to shared data (e.g. the legal knowledge base).

    Set ADMIN_API_KEY on the server. If it is not set, the guarded routes are
    closed entirely rather than open to everyone.
    """
    expected = os.getenv("ADMIN_API_KEY", "")
    if not expected:
        raise HTTPException(status_code=403, detail="This endpoint is disabled.")
    if not x_admin_key or not hmac.compare_digest(x_admin_key, expected):
        raise HTTPException(status_code=401, detail="Missing or invalid admin key.")
