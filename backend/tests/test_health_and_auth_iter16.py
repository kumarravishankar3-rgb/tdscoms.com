"""
Iteration 16 – Deployment blocker fix verification.

Scope:
  1) GET /health          -> 200 {"status":"ok"}
  2) GET /api/health      -> 200 {"status":"ok"}
  3) POST /api/auth/login (admin) still returns session_token
  4) POST /api/auth/session with a fake session_id still routes to the
     default upstream (EMERGENT_AUTH_BASE_URL unset) and rejects with 401
     "Invalid session" – proving the upstream call fires but rejects
     invalid sessions rather than 500 / connection error.
  5) Regression – iteration_15 green endpoints:
        - GET  /api/customers/{cid}/pdf
        - POST /api/customers/bulk-delete

Run:
  pytest /app/backend/tests/test_health_and_auth_iter16.py -v -o addopts="" \
    --junitxml=/app/test_reports/pytest/iter16_health_auth.xml
"""
import re
import pytest
import requests

BASE_URL = "http://localhost:8001"

ADMIN = {"email": "admin@triveni.com", "password": "Admin@123"}
MANAGER = {"email": "manager@triveni.com", "password": "Manager@123"}
EMPLOYEE = {"email": "employee@triveni.com", "password": "Employee@123"}

STATE: dict = {}


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


def _login(creds: dict) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    body = r.json()
    tk = body.get("session_token") or body.get("token")
    assert tk, f"No session token in login response: {body}"
    return tk


# ---------------------------------------------------------------------------
# 1) & 2) Health endpoints
# ---------------------------------------------------------------------------
class TestHealth:
    def test_root_health(self):
        r = requests.get(f"{BASE_URL}/health", timeout=10)
        assert r.status_code == 200, f"GET /health -> {r.status_code} {r.text}"
        assert r.json() == {"status": "ok"}, f"body={r.text}"

    def test_api_health(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200, f"GET /api/health -> {r.status_code} {r.text}"
        assert r.json() == {"status": "ok"}, f"body={r.text}"


# ---------------------------------------------------------------------------
# 3) Auth regression – email/password login still works
# ---------------------------------------------------------------------------
class TestAuthLoginRegression:
    def test_admin_login_returns_session_token(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
        assert r.status_code == 200, f"admin login -> {r.status_code} {r.text}"
        body = r.json()
        assert "session_token" in body, f"missing session_token in {body}"
        assert isinstance(body["session_token"], str) and len(body["session_token"]) >= 16, \
            f"suspicious token: {body['session_token']!r}"
        assert body.get("user", {}).get("email") == "admin@triveni.com", f"user={body.get('user')}"
        assert body.get("user", {}).get("role") == "admin", f"role={body.get('user', {}).get('role')}"
        STATE["admin"] = body["session_token"]

    def test_admin_token_usable_on_me(self):
        assert "admin" in STATE, "prior test did not populate token"
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(STATE["admin"]), timeout=15)
        assert r.status_code == 200, f"/auth/me -> {r.status_code} {r.text}"
        assert r.json().get("email") == "admin@triveni.com"

    def test_wrong_password_still_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN["email"], "password": "WRONG"},
                          timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"


# ---------------------------------------------------------------------------
# 4) Google session exchange – default upstream still reachable + rejects fake
# ---------------------------------------------------------------------------
class TestSessionExchangeDefaultUpstream:
    def test_fake_session_returns_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/session",
                          json={"session_id": "fake_iter16_session_id_definitely_invalid"},
                          timeout=45)  # generous timeout for real upstream call
        assert r.status_code == 401, (
            f"expected 401 Invalid session (proves upstream fired and rejected), "
            f"got {r.status_code} {r.text[:200]}"
        )
        detail = r.json().get("detail")
        assert detail == "Invalid session", f"unexpected detail: {detail!r}"

    def test_missing_session_id_422(self):
        r = requests.post(f"{BASE_URL}/api/auth/session", json={}, timeout=15)
        # FastAPI validation should reject empty body with 422
        assert r.status_code == 422, f"expected 422 for missing session_id, got {r.status_code} {r.text}"


# ---------------------------------------------------------------------------
# 5) Regression spot-check – iter15 green endpoints still work
# ---------------------------------------------------------------------------
class TestIter15Regression:
    @pytest.fixture(scope="class", autouse=True)
    def _tokens(self):
        STATE["admin"] = STATE.get("admin") or _login(ADMIN)
        STATE["manager"] = _login(MANAGER)
        STATE["employee"] = _login(EMPLOYEE)
        yield

    def test_customer_pdf_admin(self):
        # pick first customer
        r = requests.get(f"{BASE_URL}/api/customers", headers=_hdr(STATE["admin"]), timeout=15)
        assert r.status_code == 200, f"list customers -> {r.status_code}"
        arr = r.json()
        assert isinstance(arr, list) and len(arr) > 0, "need at least 1 customer for regression"
        cid = arr[0]["id"]
        code = arr[0].get("customer_code", "")

        pr = requests.get(f"{BASE_URL}/api/customers/{cid}/pdf",
                          headers=_hdr(STATE["admin"]), timeout=30)
        assert pr.status_code == 200, f"pdf -> {pr.status_code} {pr.text[:200]}"
        assert pr.headers.get("Content-Type", "").startswith("application/pdf"), \
            f"CT={pr.headers.get('Content-Type')}"
        assert pr.content.startswith(b"%PDF-"), f"body head={pr.content[:20]!r}"
        assert len(pr.content) > 2048, f"pdf size {len(pr.content)} too small"
        disp = pr.headers.get("Content-Disposition", "")
        assert disp.startswith("inline;") and 'filename="' in disp, f"disp={disp}"
        if code.startswith("TDSC-CUST-ID-"):
            m = re.search(r'filename="([^"]+)"', disp)
            assert m and re.match(r"^TDSC-CUST-ID-\d{8}\.pdf$", m.group(1)), \
                f"filename mismatch: {disp}"

    def test_customer_pdf_missing_token_401(self):
        r = requests.get(f"{BASE_URL}/api/customers", headers=_hdr(STATE["admin"]), timeout=15)
        cid = r.json()[0]["id"]
        pr = requests.get(f"{BASE_URL}/api/customers/{cid}/pdf", timeout=10)
        assert pr.status_code == 401, f"expected 401 without token, got {pr.status_code}"

    def test_bulk_delete_admin_flow(self):
        # create 2 quick customers, bulk-delete them, verify 404
        ids = []
        for i, mob in enumerate(["9111100081", "9111100082"], start=1):
            payload = {"name": f"Iter16Regress-{i}", "mobile": mob}
            r = requests.post(f"{BASE_URL}/api/customers/quick", json=payload,
                              headers=_hdr(STATE["admin"]), timeout=15)
            if r.status_code == 409:
                dup_id = r.json().get("detail", {}).get("existing", {}).get("id")
                if dup_id:
                    requests.delete(f"{BASE_URL}/api/customers/{dup_id}",
                                    headers=_hdr(STATE["admin"]), timeout=15)
                r = requests.post(f"{BASE_URL}/api/customers/quick", json=payload,
                                  headers=_hdr(STATE["admin"]), timeout=15)
            assert r.status_code == 200, f"quick create failed for {mob}: {r.status_code} {r.text}"
            ids.append(r.json()["id"])

        # bulk-delete
        br = requests.post(f"{BASE_URL}/api/customers/bulk-delete",
                          json={"ids": ids}, headers=_hdr(STATE["admin"]), timeout=15)
        assert br.status_code == 200, f"bulk-delete -> {br.status_code} {br.text}"
        assert br.json().get("deleted") == 2, f"expected deleted=2, got {br.json()}"
        # verify gone
        for cid in ids:
            g = requests.get(f"{BASE_URL}/api/customers/{cid}",
                             headers=_hdr(STATE["admin"]), timeout=10)
            assert g.status_code == 404, f"customer {cid} still present after bulk-delete"

    def test_bulk_delete_manager_forbidden(self):
        r = requests.post(f"{BASE_URL}/api/customers/bulk-delete",
                          json={"ids": ["nope"]}, headers=_hdr(STATE["manager"]), timeout=15)
        assert r.status_code == 403, f"manager bulk-delete expected 403, got {r.status_code}"
