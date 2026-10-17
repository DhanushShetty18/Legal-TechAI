"""Blocking Gemini calls must never run on the event loop.

An `async def` endpoint that calls a synchronous client freezes the whole
server for every user until that call returns. These tests pin the fix.
Run from the backend directory:  python -m pytest test_concurrency.py -v
"""

import ast
import inspect
import pathlib

import pytest

ROUTERS = pathlib.Path(__file__).parent / "routers"

# Functions that block on the network. Calling one directly from an
# `async def` (instead of via run_in_threadpool) is the bug.
BLOCKING_CALLS = {
    "summarize_legal_document",
    "extract_claims",
    "answer_legal_question",
    "extract_from_document",
    "extract_document_data",
}


def _direct_blocking_calls_in_async(source: str):
    tree = ast.parse(source)
    offenders = []
    for fn in ast.walk(tree):
        if not isinstance(fn, ast.AsyncFunctionDef):
            continue
        for node in ast.walk(fn):
            if isinstance(node, ast.Call):
                name = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
                if name in BLOCKING_CALLS:
                    offenders.append(f"{fn.name} -> {name}()")
                if name == "process" and getattr(node.func, "value", None) is not None:
                    offenders.append(f"{fn.name} -> .process()")
    return offenders


@pytest.mark.parametrize(
    "router", ["ai.py", "summarizer.py", "drafting.py", "inconsistency.py"]
)
def test_no_blocking_ai_call_runs_on_the_event_loop(router):
    source = (ROUTERS / router).read_text()
    assert _direct_blocking_calls_in_async(source) == []


def test_ai_endpoints_are_plain_functions():
    from routers import ai

    for name in ("api_summarize_legal_document", "api_extract_claims",
                 "api_answer_legal_question"):
        assert not inspect.iscoroutinefunction(getattr(ai, name))
