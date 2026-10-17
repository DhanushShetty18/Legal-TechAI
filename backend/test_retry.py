"""The Gemini retry wrapper must actually retry.

Run from the backend directory:  python -m pytest test_retry.py -v
"""

import pytest

from modules.ai.gemini_integration import retry_on_failure


def test_a_transient_failure_is_retried_not_crashed():
    calls = {"n": 0}

    @retry_on_failure(retries=3, delay=0)
    def flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            raise ConnectionError("transient")
        return "ok"

    # Before the fix this raised UnboundLocalError on the first retry.
    assert flaky() == "ok"
    assert calls["n"] == 2


def test_a_permanent_failure_is_raised_after_all_attempts():
    calls = {"n": 0}

    @retry_on_failure(retries=2, delay=0)
    def always_fails():
        calls["n"] += 1
        raise ValueError("permanent")

    with pytest.raises(ValueError):
        always_fails()
    assert calls["n"] == 3
