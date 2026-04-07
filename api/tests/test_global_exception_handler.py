"""Tests for the global unhandled-exception handler in main.py."""

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app


# ── Temporary routes for testing ────────────────────────────────────────
# These are added to the real FastAPI app instance so TestClient exercises
# the exception handler registered on `app`.

@app.get("/_test/unhandled")
async def _raise_unhandled():
    raise RuntimeError("boom")


@app.get("/_test/http404")
async def _raise_http404():
    raise HTTPException(status_code=404, detail="not found")


@app.get("/_test/http401")
async def _raise_http401():
    raise HTTPException(status_code=401, detail="unauthorized")


client = TestClient(app, raise_server_exceptions=False)


class TestUnhandledExceptionHandler:
    """Unhandled exceptions must return generic 500 JSON, no stack trace."""

    def test_returns_500_json(self):
        resp = client.get("/_test/unhandled")
        assert resp.status_code == 500
        body = resp.json()
        assert body == {"error": "Internal server error"}

    def test_no_stack_trace_in_body(self):
        resp = client.get("/_test/unhandled")
        text = resp.text
        assert "boom" not in text
        assert "Traceback" not in text
        assert "RuntimeError" not in text

    def test_content_type_is_json(self):
        resp = client.get("/_test/unhandled")
        assert "application/json" in resp.headers["content-type"]


class TestHTTPExceptionsPassThrough:
    """HTTPException (404, 401, etc.) must NOT be caught by the global handler."""

    def test_404_passes_through(self):
        resp = client.get("/_test/http404")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "not found"

    def test_401_passes_through(self):
        resp = client.get("/_test/http401")
        assert resp.status_code == 401
        assert resp.json()["detail"] == "unauthorized"

    def test_422_validation_error(self):
        """Pydantic validation errors (422) should also pass through."""
        # Hit an endpoint that requires a body but send nothing — triggers 422
        resp = client.post("/analyze")
        assert resp.status_code == 422
