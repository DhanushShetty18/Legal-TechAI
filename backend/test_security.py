"""Security regression tests.

Run from the backend directory:  python -m pytest test_security.py -v

Each test pins one fix from docs/AUDIT.md, so the hole cannot quietly reopen.
"""

import os

import pytest
from fastapi import HTTPException

import security


# ---------------------------------------------------------------- passwords
def test_password_is_not_stored_in_plain_text():
    stored = security.hash_password("hunter2")
    assert "hunter2" not in stored
    assert stored.startswith("pbkdf2_sha256$")


def test_password_round_trip():
    stored = security.hash_password("hunter2")
    assert security.verify_password("hunter2", stored)
    assert not security.verify_password("hunter3", stored)


def test_same_password_hashes_differently_each_time():
    # A per-user salt means two users with the same password look different.
    assert security.hash_password("same") != security.hash_password("same")


def test_old_fake_hash_format_never_verifies():
    assert not security.verify_password("x", "xnotreallyhashed")


# ------------------------------------------------------------------ uploads
@pytest.mark.parametrize(
    "client_name",
    ["../../main.py", "/etc/passwd", "..\\..\\evil.pdf", "", None, "a/../../b.txt"],
)
def test_upload_path_always_stays_inside_upload_dir(tmp_path, client_name):
    path = security.safe_upload_path(str(tmp_path), client_name)
    assert os.path.dirname(os.path.realpath(path)) == os.path.realpath(tmp_path)


def test_upload_keeps_only_allow_listed_extensions(tmp_path):
    assert security.safe_upload_path(str(tmp_path), "deed.PDF").endswith(".pdf")
    assert security.safe_upload_path(str(tmp_path), "run.sh").endswith(".bin")


def test_two_uploads_with_the_same_name_do_not_overwrite(tmp_path):
    a = security.safe_upload_path(str(tmp_path), "deed.pdf")
    b = security.safe_upload_path(str(tmp_path), "deed.pdf")
    assert a != b


# ---------------------------------------------------------------- admin key
def test_admin_routes_closed_when_no_key_configured(monkeypatch):
    monkeypatch.delenv("ADMIN_API_KEY", raising=False)
    with pytest.raises(HTTPException) as caught:
        security.require_admin_key("anything")
    assert caught.value.status_code == 403


def test_admin_routes_reject_wrong_key(monkeypatch):
    monkeypatch.setenv("ADMIN_API_KEY", "correct")
    with pytest.raises(HTTPException) as caught:
        security.require_admin_key("wrong")
    assert caught.value.status_code == 401


def test_admin_routes_accept_right_key(monkeypatch):
    monkeypatch.setenv("ADMIN_API_KEY", "correct")
    security.require_admin_key("correct")


# --------------------------------------------------------------------- CORS
def test_cors_is_never_a_wildcard_by_default(monkeypatch):
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    assert "*" not in security.allowed_origins()


def test_cors_reads_comma_separated_env(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://a.com, https://b.com ,")
    assert security.allowed_origins() == ["https://a.com", "https://b.com"]


# -------------------------------------------------------------- signatures
def test_demo_signature_bypass_is_gone():
    import verification

    assert not verification.verify_digital_signature({"a": 1}, "SIG_BYPASS_DEMO", "")


# -------------------------------------------------------------------- roles
def test_self_service_roles_exclude_privileged_ones():
    for privileged in ("judge", "clerk", "admin"):
        assert privileged not in security.SELF_SERVICE_ROLES
