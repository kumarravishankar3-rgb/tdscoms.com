"""
Backend tests for voucher attachments (iteration_3).
Covers: /api/invoices/{iid}/attachments, /api/expenses/{eid}/attachments,
        /api/income/{iid}/attachments — upload, list persistence via GET,
        delete via ?path=, 10 MB cap enforcement, and 404 on invalid ids.

Base URL priority:
  1. TEST_BASE_URL env var (allows local http://localhost:8001)
  2. EXPO_PUBLIC_BACKEND_URL from /app/frontend/.env
  3. Fallback public preview URL
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
    or "https://hr-tender-hub.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")

ADMIN = {"email": os.environ["TEST_ADMIN_EMAIL"], "password": os.environ["TEST_ADMIN_PASSWORD"]}


# -----------------------
# Shared helpers / fixtures
# -----------------------
@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}


def _rand_mobile():
    # 10 digits starting with a valid Indian prefix
    return "9" + str(uuid.uuid4().int)[-9:]


def _tiny_pdf_bytes():
    # Minimal PDF header + trailer; ~ a few hundred bytes
    return (
        b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
        b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n"
        b"2 0 obj<< /Type /Pages /Kids [] /Count 0 >>endobj\n"
        b"xref\n0 3\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n"
        b"trailer<< /Size 3 /Root 1 0 R >>\nstartxref\n120\n%%EOF\n"
    ) * 4  # ~1 KB


def _png_bytes(size_bytes=1024):
    # 1x1 PNG then padded with a comment/junk chunk to hit `size_bytes` approx
    base = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xdc\xccY\xe7\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    if size_bytes <= len(base):
        return base
    return base + b"\x00" * (size_bytes - len(base))


# ============================================================
# Module 1 — Invoice attachments
# ============================================================
class TestInvoiceAttachments:
    @pytest.fixture(scope="class")
    def context(self, h):
        """Create a fresh customer + fresh sale invoice; return ids."""
        # Create fresh customer via /customers/quick with random mobile to avoid dup
        cust_payload = {
            "name": f"TEST_AttachParty_{uuid.uuid4().hex[:6]}",
            "mobile": _rand_mobile(),
        }
        r = requests.post(f"{BASE_URL}/api/customers/quick", json=cust_payload,
                          headers=h, timeout=30)
        assert r.status_code == 200, f"quick party failed: {r.status_code} {r.text}"
        cust = r.json()

        # Create sale invoice for today with unique amount (adds extra dup safety even though party is unique)
        today = dt.date.today().isoformat()
        inv_payload = {
            "invoice_type": "sale",
            "payment_type": "credit",
            "date": today,
            "party_id": cust["id"],
            "party_name": cust["name"],
            "party_mobile": cust.get("mobile"),
            "items": [],
            "total_amount": 500.0,
            "paid_amount": 0.0,
            "notes": "TEST attachment invoice",
        }
        r = requests.post(f"{BASE_URL}/api/invoices", json=inv_payload,
                          headers=h, timeout=30)
        assert r.status_code == 200, f"invoice create failed: {r.status_code} {r.text}"
        inv = r.json()
        assert inv.get("attachments") == []
        return {"customer": cust, "invoice": inv}

    def test_upload_first_attachment(self, h, context):
        iid = context["invoice"]["id"]
        pdf = _tiny_pdf_bytes()
        files = {"file": ("test1.pdf", io.BytesIO(pdf), "application/pdf")}
        r = requests.post(f"{BASE_URL}/api/invoices/{iid}/attachments",
                          headers=h, files=files, timeout=30)
        assert r.status_code == 200, f"upload1 failed: {r.status_code} {r.text}"
        body = r.json()
        assert body["id"] == iid
        atts = body.get("attachments") or []
        assert len(atts) == 1, f"expected 1 attachment, got {len(atts)}"
        a = atts[0]
        for k in ("path", "name", "size", "content_type", "uploaded_at", "uploaded_by"):
            assert k in a, f"missing key {k} in attachment: {a}"
        assert a["name"] == "test1.pdf"
        assert a["size"] == len(pdf)
        assert a["content_type"] == "application/pdf"
        # store for downstream
        context["first_att"] = a

    def test_upload_second_attachment_and_get(self, h, context):
        iid = context["invoice"]["id"]
        png = _png_bytes(2048)
        files = {"file": ("test2.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{BASE_URL}/api/invoices/{iid}/attachments",
                          headers=h, files=files, timeout=30)
        assert r.status_code == 200, f"upload2 failed: {r.status_code} {r.text}"
        body = r.json()
        atts = body["attachments"]
        assert len(atts) == 2, f"expected 2 attachments, got {len(atts)}"
        # GET verification
        r2 = requests.get(f"{BASE_URL}/api/invoices/{iid}", headers=h, timeout=30)
        assert r2.status_code == 200
        got = r2.json()
        assert len(got["attachments"]) == 2
        names = sorted([a["name"] for a in got["attachments"]])
        assert names == ["test1.pdf", "test2.png"]
        context["second_att"] = atts[1]

    def test_delete_one_attachment(self, h, context):
        iid = context["invoice"]["id"]
        # Fetch current attachments and pick the first one to delete
        r = requests.get(f"{BASE_URL}/api/invoices/{iid}", headers=h, timeout=30)
        assert r.status_code == 200
        atts = r.json()["attachments"]
        assert len(atts) == 2
        target = next(a for a in atts if a["name"] == "test1.pdf")
        path_enc = quote(target["path"], safe="")
        r = requests.delete(
            f"{BASE_URL}/api/invoices/{iid}/attachments?path={path_enc}",
            headers=h, timeout=30,
        )
        assert r.status_code == 200, f"delete failed: {r.status_code} {r.text}"
        body = r.json()
        assert len(body["attachments"]) == 1
        assert body["attachments"][0]["name"] == "test2.png"

    def test_upload_exceeds_10mb(self, h, context):
        iid = context["invoice"]["id"]
        # 12 MB of zero bytes
        big = b"\x00" * (12 * 1024 * 1024)
        files = {"file": ("big.bin", io.BytesIO(big), "application/octet-stream")}
        r = requests.post(f"{BASE_URL}/api/invoices/{iid}/attachments",
                          headers=h, files=files, timeout=60)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"
        detail = (r.json() or {}).get("detail", "")
        assert "10 MB" in detail or "10MB" in detail, f"unexpected detail: {detail}"

    def test_invalid_iid_upload_returns_404(self, h):
        bad = f"inv-does-not-exist-{uuid.uuid4().hex[:6]}"
        files = {"file": ("x.pdf", io.BytesIO(_tiny_pdf_bytes()), "application/pdf")}
        r = requests.post(f"{BASE_URL}/api/invoices/{bad}/attachments",
                          headers=h, files=files, timeout=30)
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text}"

    def test_invalid_iid_delete_returns_404(self, h):
        bad = f"inv-does-not-exist-{uuid.uuid4().hex[:6]}"
        r = requests.delete(
            f"{BASE_URL}/api/invoices/{bad}/attachments?path={quote('x/y.pdf', safe='')}",
            headers=h, timeout=30,
        )
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text}"


# ============================================================
# Module 2 — Expense attachments
# ============================================================
class TestExpenseAttachments:
    @pytest.fixture(scope="class")
    def expense(self, h):
        today = dt.date.today().isoformat()
        payload = {
            "date": today,
            "category": "Office",
            "amount": 1500,
            "payment_mode": "cash",
            "description": "TEST attach expense",
        }
        r = requests.post(f"{BASE_URL}/api/expenses", json=payload, headers=h, timeout=30)
        assert r.status_code == 200, f"expense create failed: {r.status_code} {r.text}"
        e = r.json()
        assert e.get("attachments") == []
        return e

    def test_upload_and_delete(self, h, expense):
        eid = expense["id"]
        pdf = _tiny_pdf_bytes()
        files = {"file": ("exp1.pdf", io.BytesIO(pdf), "application/pdf")}
        r = requests.post(f"{BASE_URL}/api/expenses/{eid}/attachments",
                          headers=h, files=files, timeout=30)
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
        body = r.json()
        assert body["id"] == eid
        assert len(body["attachments"]) == 1
        att = body["attachments"][0]
        assert att["name"] == "exp1.pdf"
        assert att["size"] == len(pdf)

        # Delete
        path_enc = quote(att["path"], safe="")
        r = requests.delete(
            f"{BASE_URL}/api/expenses/{eid}/attachments?path={path_enc}",
            headers=h, timeout=30,
        )
        assert r.status_code == 200, f"delete failed: {r.status_code} {r.text}"
        assert len(r.json()["attachments"]) == 0

    def test_upload_exceeds_10mb(self, h, expense):
        eid = expense["id"]
        big = b"\x00" * (12 * 1024 * 1024)
        files = {"file": ("big.bin", io.BytesIO(big), "application/octet-stream")}
        r = requests.post(f"{BASE_URL}/api/expenses/{eid}/attachments",
                          headers=h, files=files, timeout=60)
        assert r.status_code == 400
        detail = (r.json() or {}).get("detail", "")
        assert "10 MB" in detail


# ============================================================
# Module 3 — Income attachments
# ============================================================
class TestIncomeAttachments:
    @pytest.fixture(scope="class")
    def income(self, h):
        today = dt.date.today().isoformat()
        payload = {
            "date": today,
            "client_name": f"TEST_IncomeClient_{uuid.uuid4().hex[:6]}",
            "service_category": "Consulting",
            "amount": 2500,
            "payment_mode": "cash",
        }
        r = requests.post(f"{BASE_URL}/api/income", json=payload, headers=h, timeout=30)
        assert r.status_code == 200, f"income create failed: {r.status_code} {r.text}"
        inc = r.json()
        assert inc.get("attachments") == []
        return inc

    def test_upload_and_delete(self, h, income):
        iid = income["id"]
        png = _png_bytes(1024)
        files = {"file": ("inc1.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{BASE_URL}/api/income/{iid}/attachments",
                          headers=h, files=files, timeout=30)
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
        body = r.json()
        assert body["id"] == iid
        assert len(body["attachments"]) == 1
        att = body["attachments"][0]
        assert att["name"] == "inc1.png"
        assert att["content_type"] == "image/png"

        # Delete
        path_enc = quote(att["path"], safe="")
        r = requests.delete(
            f"{BASE_URL}/api/income/{iid}/attachments?path={path_enc}",
            headers=h, timeout=30,
        )
        assert r.status_code == 200, f"delete failed: {r.status_code} {r.text}"
        assert len(r.json()["attachments"]) == 0
