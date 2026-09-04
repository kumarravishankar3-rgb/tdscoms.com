"""
Iteration 15 – Backend verification for:
  - GET  /api/customers/{cid}/pdf          (any authenticated user)
  - POST /api/customers/bulk-delete        (admin only)
  - Regression: PUT /api/customers/{cid} + DELETE /api/customers/{cid} role gates

Runs sequentially (module-level STATE shared across classes).
Run with:
  pytest /app/backend/tests/test_customer_pdf_bulk_iter15.py -v -o addopts="" \
    --junitxml=/app/test_reports/pytest/iter15_customer_pdf_bulk.xml
"""
import os
import re
import pytest
import requests

BASE_URL = "http://localhost:8001"

ADMIN = {"email": os.environ["TEST_ADMIN_EMAIL"], "password": os.environ["TEST_ADMIN_PASSWORD"]}
MANAGER = {"email": os.environ["TEST_MANAGER_EMAIL"], "password": os.environ["TEST_MANAGER_PASSWORD"]}
EMPLOYEE = {"email": os.environ["TEST_EMPLOYEE_EMAIL"], "password": os.environ["TEST_EMPLOYEE_PASSWORD"]}

STATE: dict = {}


def _login(creds: dict) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    tk = r.json().get("session_token") or r.json().get("token")
    assert tk, f"No session token in login response: {r.json()}"
    return tk


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module", autouse=True)
def bootstrap_tokens():
    STATE["admin"] = _login(ADMIN)
    STATE["manager"] = _login(MANAGER)
    STATE["employee"] = _login(EMPLOYEE)
    yield


# ---------------------------------------------------------------------------
# 1) Customer Print PDF endpoint
# ---------------------------------------------------------------------------
class TestCustomerPDF:
    def test_list_pick_customer(self):
        r = requests.get(f"{BASE_URL}/api/customers", headers=_hdr(STATE["admin"]), timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) > 0, "Need at least one customer for PDF test"
        STATE["pdf_cid"] = arr[0]["id"]
        STATE["pdf_code"] = arr[0].get("customer_code") or "customer"

    def _assert_pdf(self, resp: requests.Response):
        assert resp.status_code == 200, f"expected 200, got {resp.status_code} body={resp.text[:200]}"
        assert resp.headers.get("Content-Type", "").startswith("application/pdf"), \
            f"Content-Type={resp.headers.get('Content-Type')}"
        disp = resp.headers.get("Content-Disposition", "")
        assert disp.startswith("inline;"), f"Content-Disposition={disp}"
        assert 'filename="' in disp, f"Content-Disposition missing filename: {disp}"
        # Filename should match TDSC-CUST-ID-XXXXXXXX.pdf if the customer has a code
        m = re.search(r'filename="([^"]+)"', disp)
        assert m, f"No filename in {disp}"
        fname = m.group(1)
        assert fname.endswith(".pdf"), f"filename not pdf: {fname}"
        if STATE.get("pdf_code", "").startswith("TDSC-CUST-ID-"):
            assert re.match(r"^TDSC-CUST-ID-\d{8}\.pdf$", fname), \
                f"filename does not match TDSC-CUST-ID-XXXXXXXX.pdf: {fname}"
        # PDF magic + size
        assert resp.content.startswith(b"%PDF-"), f"body does not start with %PDF-: {resp.content[:20]!r}"
        assert len(resp.content) > 2048, f"PDF size {len(resp.content)} <= 2 KB"

    def test_pdf_admin_bearer(self):
        cid = STATE["pdf_cid"]
        r = requests.get(f"{BASE_URL}/api/customers/{cid}/pdf",
                         headers=_hdr(STATE["admin"]), timeout=30)
        self._assert_pdf(r)

    def test_pdf_manager_bearer(self):
        cid = STATE["pdf_cid"]
        r = requests.get(f"{BASE_URL}/api/customers/{cid}/pdf",
                         headers=_hdr(STATE["manager"]), timeout=30)
        self._assert_pdf(r)

    def test_pdf_employee_bearer(self):
        cid = STATE["pdf_cid"]
        r = requests.get(f"{BASE_URL}/api/customers/{cid}/pdf",
                         headers=_hdr(STATE["employee"]), timeout=30)
        self._assert_pdf(r)

    def test_pdf_query_token(self):
        cid = STATE["pdf_cid"]
        r = requests.get(f"{BASE_URL}/api/customers/{cid}/pdf",
                         params={"token": STATE["admin"]}, timeout=30)
        self._assert_pdf(r)

    def test_pdf_missing_token(self):
        cid = STATE["pdf_cid"]
        r = requests.get(f"{BASE_URL}/api/customers/{cid}/pdf", timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code}"

    def test_pdf_invalid_token(self):
        cid = STATE["pdf_cid"]
        r = requests.get(f"{BASE_URL}/api/customers/{cid}/pdf",
                         headers=_hdr("not-a-real-token"), timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code}"

    def test_pdf_invalid_cid(self):
        r = requests.get(f"{BASE_URL}/api/customers/does-not-exist-xyz/pdf",
                         headers=_hdr(STATE["admin"]), timeout=15)
        assert r.status_code == 404, f"expected 404, got {r.status_code}"


# ---------------------------------------------------------------------------
# 2) Bulk-delete endpoint
# ---------------------------------------------------------------------------
class TestBulkDelete:
    def test_create_three(self):
        ids = []
        for i, mob in enumerate(["9111100011", "9111100022", "9111100033"], start=1):
            # try create; if duplicate exists, delete and recreate for a clean slate
            payload = {"name": f"BulkDelIter15-{i}", "mobile": mob}
            r = requests.post(f"{BASE_URL}/api/customers/quick", json=payload,
                              headers=_hdr(STATE["admin"]), timeout=15)
            if r.status_code == 409:
                existing = r.json().get("detail", {}).get("existing", {})
                dup_id = existing.get("id")
                if dup_id:
                    requests.delete(f"{BASE_URL}/api/customers/{dup_id}",
                                    headers=_hdr(STATE["admin"]), timeout=15)
                r = requests.post(f"{BASE_URL}/api/customers/quick", json=payload,
                                  headers=_hdr(STATE["admin"]), timeout=15)
            assert r.status_code == 200, f"create failed for {mob}: {r.status_code} {r.text}"
            ids.append(r.json()["id"])
        STATE["c1"], STATE["c2"], STATE["c3"] = ids

    def test_manager_forbidden(self):
        c1, c2, c3 = STATE["c1"], STATE["c2"], STATE["c3"]
        r = requests.post(f"{BASE_URL}/api/customers/bulk-delete",
                          json={"ids": [c1, c2]},
                          headers=_hdr(STATE["manager"]), timeout=15)
        assert r.status_code == 403, f"expected 403 for manager, got {r.status_code} {r.text}"
        # all 3 still exist
        for cid in [c1, c2, c3]:
            g = requests.get(f"{BASE_URL}/api/customers/{cid}",
                             headers=_hdr(STATE["admin"]), timeout=15)
            assert g.status_code == 200, f"customer {cid} missing after manager bulk-delete attempt"

    def test_employee_forbidden(self):
        c1, c2 = STATE["c1"], STATE["c2"]
        r = requests.post(f"{BASE_URL}/api/customers/bulk-delete",
                          json={"ids": [c1, c2]},
                          headers=_hdr(STATE["employee"]), timeout=15)
        assert r.status_code == 403, f"expected 403 for employee, got {r.status_code} {r.text}"

    def test_admin_success_deletes_two(self):
        c1, c2, c3 = STATE["c1"], STATE["c2"], STATE["c3"]
        r = requests.post(f"{BASE_URL}/api/customers/bulk-delete",
                          json={"ids": [c1, c2]},
                          headers=_hdr(STATE["admin"]), timeout=15)
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text}"
        body = r.json()
        assert body.get("deleted") == 2, f"expected deleted=2, got {body}"
        # verify
        for cid in [c1, c2]:
            g = requests.get(f"{BASE_URL}/api/customers/{cid}",
                             headers=_hdr(STATE["admin"]), timeout=15)
            assert g.status_code == 404, f"customer {cid} should be 404, got {g.status_code}"
        g3 = requests.get(f"{BASE_URL}/api/customers/{c3}",
                          headers=_hdr(STATE["admin"]), timeout=15)
        assert g3.status_code == 200, f"c3 should still exist, got {g3.status_code}"

    def test_empty_ids(self):
        r = requests.post(f"{BASE_URL}/api/customers/bulk-delete",
                          json={"ids": []},
                          headers=_hdr(STATE["admin"]), timeout=15)
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text}"
        assert r.json().get("deleted") == 0

    def test_nonexistent_ids(self):
        r = requests.post(f"{BASE_URL}/api/customers/bulk-delete",
                          json={"ids": ["fake_1", "fake_2"]},
                          headers=_hdr(STATE["admin"]), timeout=15)
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text}"
        assert r.json().get("deleted") == 0

    def test_cleanup_c3(self):
        c3 = STATE["c3"]
        r = requests.delete(f"{BASE_URL}/api/customers/{c3}",
                            headers=_hdr(STATE["admin"]), timeout=15)
        assert r.status_code == 200
        g = requests.get(f"{BASE_URL}/api/customers/{c3}",
                         headers=_hdr(STATE["admin"]), timeout=15)
        assert g.status_code == 404


# ---------------------------------------------------------------------------
# 3) Regression – iteration_14 role gates for PUT / DELETE customer
# ---------------------------------------------------------------------------
class TestRegressionRoleGates:
    def test_setup_customer(self):
        payload = {"name": "RegressIter15", "mobile": "9111100099"}
        r = requests.post(f"{BASE_URL}/api/customers/quick", json=payload,
                          headers=_hdr(STATE["admin"]), timeout=15)
        if r.status_code == 409:
            dup_id = r.json().get("detail", {}).get("existing", {}).get("id")
            if dup_id:
                requests.delete(f"{BASE_URL}/api/customers/{dup_id}",
                                headers=_hdr(STATE["admin"]), timeout=15)
            r = requests.post(f"{BASE_URL}/api/customers/quick", json=payload,
                              headers=_hdr(STATE["admin"]), timeout=15)
        assert r.status_code == 200, f"setup create: {r.status_code} {r.text}"
        STATE["reg_cid"] = r.json()["id"]
        STATE["reg_customer"] = r.json()

    def test_manager_put_allowed(self):
        cid = STATE["reg_cid"]
        base = STATE["reg_customer"]
        body = {
            "name": "RegressIter15-mgr",
            "mobile": base["mobile"],
            "whatsapp": base["whatsapp"],
            "pan": base["pan"],
            "aadhar": base["aadhar"],
            "email": base.get("email"),
            "gst_no": base.get("gst_no"),
            "address": base.get("address"),
        }
        r = requests.put(f"{BASE_URL}/api/customers/{cid}", json=body,
                         headers=_hdr(STATE["manager"]), timeout=15)
        assert r.status_code == 200, f"manager PUT expected 200, got {r.status_code} {r.text}"
        assert r.json().get("name") == "RegressIter15-mgr"

    def test_employee_put_forbidden(self):
        cid = STATE["reg_cid"]
        base = STATE["reg_customer"]
        body = {
            "name": "RegressIter15-emp",
            "mobile": base["mobile"],
            "whatsapp": base["whatsapp"],
            "pan": base["pan"],
            "aadhar": base["aadhar"],
        }
        r = requests.put(f"{BASE_URL}/api/customers/{cid}", json=body,
                         headers=_hdr(STATE["employee"]), timeout=15)
        assert r.status_code == 403, f"employee PUT expected 403, got {r.status_code}"

    def test_manager_delete_forbidden(self):
        cid = STATE["reg_cid"]
        r = requests.delete(f"{BASE_URL}/api/customers/{cid}",
                            headers=_hdr(STATE["manager"]), timeout=15)
        assert r.status_code == 403, f"manager DELETE expected 403, got {r.status_code}"
        # still exists
        g = requests.get(f"{BASE_URL}/api/customers/{cid}",
                         headers=_hdr(STATE["admin"]), timeout=15)
        assert g.status_code == 200

    def test_employee_delete_forbidden(self):
        cid = STATE["reg_cid"]
        r = requests.delete(f"{BASE_URL}/api/customers/{cid}",
                            headers=_hdr(STATE["employee"]), timeout=15)
        assert r.status_code == 403, f"employee DELETE expected 403, got {r.status_code}"

    def test_cleanup_admin_delete(self):
        cid = STATE["reg_cid"]
        r = requests.delete(f"{BASE_URL}/api/customers/{cid}",
                            headers=_hdr(STATE["admin"]), timeout=15)
        assert r.status_code == 200
