"""
Backend tests for iteration_4 — new single-doc GET endpoints:
  - GET /api/expenses/{eid}
  - GET /api/income/{iid}
Plus regression on attachment upload/list/delete via these single-doc GETs.

Run:
  TEST_BASE_URL=http://localhost:8001 pytest -v \
    /app/backend/tests/test_voucher_get_endpoints.py
"""
import os
import io
import uuid
import datetime as dt
from urllib.parse import quote

import pytest
import requests

BASE_URL = os.environ.get("TEST_BASE_URL") \
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL") \
    or "http://localhost:8001"
BASE_URL = BASE_URL.rstrip("/")

ADMIN = {"email": os.environ["TEST_ADMIN_EMAIL"], "password": os.environ["TEST_ADMIN_PASSWORD"]}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}


def _tiny_pdf_bytes():
    return (
        b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
        b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n"
        b"2 0 obj<< /Type /Pages /Kids [] /Count 0 >>endobj\n"
        b"xref\n0 3\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n"
        b"trailer<< /Size 3 /Root 1 0 R >>\nstartxref\n120\n%%EOF\n"
    ) * 4


# ============================================================
# Module 1 — GET /api/expenses/{eid}
# ============================================================
class TestExpenseGetEndpoint:
    @pytest.fixture(scope="class")
    def expense(self, h):
        payload = {
            "date": "2026-08-30",
            "category": "OfficeSuppliesTest",
            "amount": 1234,
            "payment_mode": "cash",
            "vendor": "TestVendor",
        }
        r = requests.post(f"{BASE_URL}/api/expenses", json=payload, headers=h, timeout=30)
        assert r.status_code == 200, f"expense create failed: {r.status_code} {r.text}"
        e = r.json()
        assert "id" in e
        assert "expense_no" in e and e["expense_no"]
        assert e.get("attachments") == []
        return e

    def test_get_expense_by_id(self, h, expense):
        eid = expense["id"]
        r = requests.get(f"{BASE_URL}/api/expenses/{eid}", headers=h, timeout=30)
        assert r.status_code == 200, f"GET expense failed: {r.status_code} {r.text}"
        got = r.json()
        assert got["id"] == eid
        assert got["expense_no"] == expense["expense_no"]
        assert got["category"] == "OfficeSuppliesTest"
        assert float(got["amount"]) == 1234.0
        assert got["payment_mode"] == "cash"
        assert got["vendor"] == "TestVendor"
        assert got.get("attachments") == []

    def test_get_expense_invalid_id_404(self, h):
        r = requests.get(f"{BASE_URL}/api/expenses/invalid_id_xyz", headers=h, timeout=30)
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text}"

    def test_expense_attachment_lifecycle_via_get(self, h, expense):
        eid = expense["id"]
        pdf = _tiny_pdf_bytes()
        files = {"file": ("get_exp.pdf", io.BytesIO(pdf), "application/pdf")}
        r = requests.post(f"{BASE_URL}/api/expenses/{eid}/attachments",
                          headers=h, files=files, timeout=30)
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"

        # Re-GET via single-doc endpoint
        r = requests.get(f"{BASE_URL}/api/expenses/{eid}", headers=h, timeout=30)
        assert r.status_code == 200
        atts = r.json().get("attachments") or []
        assert len(atts) == 1, f"expected 1 attachment, got {len(atts)}"
        a = atts[0]
        for k in ("path", "name", "size", "content_type", "uploaded_at", "uploaded_by"):
            assert k in a, f"missing key {k} in attachment: {a}"
        assert a["name"] == "get_exp.pdf"
        assert a["size"] == len(pdf)
        assert a["content_type"] == "application/pdf"

        # Delete
        path_enc = quote(a["path"], safe="")
        r = requests.delete(
            f"{BASE_URL}/api/expenses/{eid}/attachments?path={path_enc}",
            headers=h, timeout=30,
        )
        assert r.status_code == 200, f"delete failed: {r.status_code} {r.text}"
        assert len(r.json()["attachments"]) == 0

        # Re-GET confirms empty
        r = requests.get(f"{BASE_URL}/api/expenses/{eid}", headers=h, timeout=30)
        assert r.status_code == 200
        assert (r.json().get("attachments") or []) == []


# ============================================================
# Module 2 — GET /api/income/{iid}
# ============================================================
class TestIncomeGetEndpoint:
    @pytest.fixture(scope="class")
    def income(self, h):
        payload = {
            "date": "2026-08-30",
            "client_name": "IncomeTestParty",
            "service_category": "DSC Services",
            "service_name": "Class3",
            "amount": 5000,
            "payment_mode": "cash",
        }
        r = requests.post(f"{BASE_URL}/api/income", json=payload, headers=h, timeout=30)
        assert r.status_code == 200, f"income create failed: {r.status_code} {r.text}"
        inc = r.json()
        assert "id" in inc
        assert "income_no" in inc and inc["income_no"]
        assert inc.get("attachments") == []
        return inc

    def test_get_income_by_id(self, h, income):
        iid = income["id"]
        r = requests.get(f"{BASE_URL}/api/income/{iid}", headers=h, timeout=30)
        assert r.status_code == 200, f"GET income failed: {r.status_code} {r.text}"
        got = r.json()
        assert got["id"] == iid
        assert got["income_no"] == income["income_no"]
        assert got["client_name"] == "IncomeTestParty"
        assert got["service_category"] == "DSC Services"
        assert got.get("service_name") == "Class3"
        assert float(got["amount"]) == 5000.0
        assert got["payment_mode"] == "cash"
        assert got.get("attachments") == []

    def test_get_income_invalid_id_404(self, h):
        r = requests.get(f"{BASE_URL}/api/income/invalid_id_xyz", headers=h, timeout=30)
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text}"

    def test_income_attachment_lifecycle_via_get(self, h, income):
        iid = income["id"]
        pdf = _tiny_pdf_bytes()
        files = {"file": ("get_inc.pdf", io.BytesIO(pdf), "application/pdf")}
        r = requests.post(f"{BASE_URL}/api/income/{iid}/attachments",
                          headers=h, files=files, timeout=30)
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"

        # Re-GET single-doc endpoint
        r = requests.get(f"{BASE_URL}/api/income/{iid}", headers=h, timeout=30)
        assert r.status_code == 200
        atts = r.json().get("attachments") or []
        assert len(atts) == 1
        a = atts[0]
        for k in ("path", "name", "size", "content_type", "uploaded_at", "uploaded_by"):
            assert k in a
        assert a["name"] == "get_inc.pdf"

        # Delete
        path_enc = quote(a["path"], safe="")
        r = requests.delete(
            f"{BASE_URL}/api/income/{iid}/attachments?path={path_enc}",
            headers=h, timeout=30,
        )
        assert r.status_code == 200
        assert len(r.json()["attachments"]) == 0

        # Re-GET confirms empty
        r = requests.get(f"{BASE_URL}/api/income/{iid}", headers=h, timeout=30)
        assert r.status_code == 200
        assert (r.json().get("attachments") or []) == []
