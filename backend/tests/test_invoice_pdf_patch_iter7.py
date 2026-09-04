"""
Iteration 7 backend tests:
- payment_mode persistence on POST /api/invoices
- PATCH /api/invoices/{iid} admin-only
- DELETE /api/invoices/{iid} admin-only
- GET /api/invoices/{iid}/pdf (header + query token, 401, 404, employee)
"""
import os
import pytest
import requests
import uuid
from datetime import date, timedelta

BASE_URL = "http://localhost:8001"

ADMIN_EMAIL = os.environ["TEST_ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["TEST_ADMIN_PASSWORD"]
EMPLOYEE_EMAIL = os.environ["TEST_EMPLOYEE_EMAIL"]
EMPLOYEE_PASSWORD = os.environ["TEST_EMPLOYEE_PASSWORD"]


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def employee_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": EMPLOYEE_EMAIL, "password": EMPLOYEE_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"employee login failed: {r.status_code} {r.text}")
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def h_admin(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def h_emp(employee_token):
    return {"Authorization": f"Bearer {employee_token}"}


def _mk_customer(h_admin):
    unique = uuid.uuid4().hex[:8]
    r = requests.post(f"{BASE_URL}/api/customers/quick",
                      headers=h_admin,
                      json={"name": f"TEST_Cust_{unique}", "mobile": f"9{unique[:9]}"})
    assert r.status_code == 200, r.text
    return r.json()


def _mk_invoice_payload(cust, iso_date, payment_mode=None, paid=400, total=1000):
    p = {
        "invoice_type": "sale",
        "payment_type": "credit",
        "date": iso_date,
        "due_date": iso_date,
        "party_id": cust["id"],
        "party_name": cust["name"],
        "items": [{"name": "DSC", "unit": "PCS", "qty": 1, "price": total,
                   "tax_rate": 0, "discount": 0, "amount": 0}],
        "total_amount": total,
        "paid_amount": paid,
    }
    if payment_mode is not None:
        p["payment_mode"] = payment_mode
    return p


# ---------- 1) payment_mode persistence on POST ----------

class TestPaymentModePersistence:
    """POST /api/invoices persists payment_mode for all supported modes + default."""

    @pytest.mark.parametrize("mode", ["upi", "cheque", "bank_transfer", "cash", "other"])
    def test_payment_mode_persists(self, h_admin, mode):
        cust = _mk_customer(h_admin)
        # Unique date per invoice (base + hash offset within mode) to avoid dup 409
        offsets = {"upi": 1, "cheque": 2, "bank_transfer": 3, "cash": 4, "other": 5}
        d = (date.today() + timedelta(days=offsets[mode])).isoformat()
        payload = _mk_invoice_payload(cust, d, payment_mode=mode)
        r = requests.post(f"{BASE_URL}/api/invoices", headers=h_admin, json=payload)
        assert r.status_code == 200, f"{mode} => {r.status_code} {r.text}"
        body = r.json()
        assert body["payment_mode"] == mode, body
        assert body["paid_amount"] == 400, body
        assert body["balance"] == 600, body
        assert body["status"] == "partial", body

        # Verify via GET
        gr = requests.get(f"{BASE_URL}/api/invoices/{body['id']}", headers=h_admin)
        assert gr.status_code == 200
        assert gr.json()["payment_mode"] == mode

    def test_default_payment_mode_is_cash(self, h_admin):
        cust = _mk_customer(h_admin)
        d = (date.today() + timedelta(days=10)).isoformat()
        payload = _mk_invoice_payload(cust, d, payment_mode=None)
        r = requests.post(f"{BASE_URL}/api/invoices", headers=h_admin, json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["payment_mode"] == "cash"


# ---------- 2) PATCH admin-only edit ----------

class TestPatchInvoice:

    @pytest.fixture
    def invoice(self, h_admin):
        cust = _mk_customer(h_admin)
        d = (date.today() + timedelta(days=20)).isoformat()
        r = requests.post(f"{BASE_URL}/api/invoices", headers=h_admin,
                          json=_mk_invoice_payload(cust, d, payment_mode="upi"))
        assert r.status_code == 200, r.text
        return r.json()

    def test_patch_full_pay(self, h_admin, invoice):
        # Modify to fully paid
        upd = {
            "invoice_type": invoice["invoice_type"],
            "payment_type": invoice["payment_type"],
            "payment_mode": invoice["payment_mode"],
            "date": invoice["date"],
            "due_date": invoice["due_date"],
            "party_id": invoice["party_id"],
            "party_name": invoice["party_name"],
            "items": invoice["items"],
            "total_amount": invoice["total_amount"],
            "paid_amount": 1000,
        }
        r = requests.patch(f"{BASE_URL}/api/invoices/{invoice['id']}",
                           headers=h_admin, json=upd)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["paid_amount"] == 1000
        assert b["balance"] == 0
        assert b["status"] == "paid"

    def test_patch_change_mode_and_add_item(self, h_admin, invoice):
        new_items = list(invoice["items"]) + [
            {"name": "EXTRA", "unit": "PCS", "qty": 2, "price": 250,
             "tax_rate": 0, "discount": 0, "amount": 0}
        ]
        upd = {
            "invoice_type": invoice["invoice_type"],
            "payment_type": invoice["payment_type"],
            "payment_mode": "cheque",
            "date": invoice["date"],
            "due_date": invoice["due_date"],
            "party_id": invoice["party_id"],
            "party_name": invoice["party_name"],
            "items": new_items,
            "total_amount": 0,   # let server recalc
            "paid_amount": 100,
        }
        r = requests.patch(f"{BASE_URL}/api/invoices/{invoice['id']}",
                           headers=h_admin, json=upd)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["payment_mode"] == "cheque"
        # Server recalculated: 1000 (item1) + 2*250 (item2) = 1500
        assert b["total_amount"] == 1500, b
        assert b["paid_amount"] == 100
        assert b["balance"] == 1400
        assert b["status"] == "partial"
        assert len(b["items"]) == 2

    def test_patch_invalid_id_404(self, h_admin):
        upd = {
            "invoice_type": "sale", "payment_type": "credit", "payment_mode": "cash",
            "date": date.today().isoformat(), "due_date": date.today().isoformat(),
            "party_id": "nonexistent", "party_name": "x",
            "items": [{"name": "x", "unit": "PCS", "qty": 1, "price": 1,
                       "tax_rate": 0, "discount": 0, "amount": 0}],
            "total_amount": 1, "paid_amount": 0,
        }
        r = requests.patch(f"{BASE_URL}/api/invoices/invalid_id_xyz",
                           headers=h_admin, json=upd)
        assert r.status_code == 404, r.text

    def test_patch_employee_forbidden(self, h_admin, h_emp, invoice):
        upd = {
            "invoice_type": invoice["invoice_type"],
            "payment_type": invoice["payment_type"],
            "payment_mode": "upi",
            "date": invoice["date"], "due_date": invoice["due_date"],
            "party_id": invoice["party_id"], "party_name": invoice["party_name"],
            "items": invoice["items"], "total_amount": invoice["total_amount"],
            "paid_amount": 0,
        }
        r = requests.patch(f"{BASE_URL}/api/invoices/{invoice['id']}",
                           headers=h_emp, json=upd)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"


# ---------- 3) DELETE admin-only ----------

class TestDeleteInvoice:

    def _make_invoice(self, h_admin, day_offset):
        cust = _mk_customer(h_admin)
        d = (date.today() + timedelta(days=day_offset)).isoformat()
        r = requests.post(f"{BASE_URL}/api/invoices", headers=h_admin,
                          json=_mk_invoice_payload(cust, d, payment_mode="cash"))
        assert r.status_code == 200, r.text
        return r.json()

    def test_delete_employee_forbidden(self, h_admin, h_emp):
        inv = self._make_invoice(h_admin, 30)
        r = requests.delete(f"{BASE_URL}/api/invoices/{inv['id']}", headers=h_emp)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"
        # cleanup
        requests.delete(f"{BASE_URL}/api/invoices/{inv['id']}", headers=h_admin)

    def test_delete_admin_ok(self, h_admin):
        inv = self._make_invoice(h_admin, 31)
        r = requests.delete(f"{BASE_URL}/api/invoices/{inv['id']}", headers=h_admin)
        assert r.status_code == 200, r.text
        assert r.json().get("deleted") == 1
        # verify gone
        g = requests.get(f"{BASE_URL}/api/invoices/{inv['id']}", headers=h_admin)
        assert g.status_code == 404


# ---------- 4) GET /api/invoices/{iid}/pdf ----------

class TestInvoicePDF:

    @pytest.fixture(scope="class")
    def pdf_invoice(self, h_admin):
        cust = _mk_customer(h_admin)
        d = (date.today() + timedelta(days=40)).isoformat()
        r = requests.post(f"{BASE_URL}/api/invoices", headers=h_admin,
                          json=_mk_invoice_payload(cust, d, payment_mode="upi"))
        assert r.status_code == 200
        return r.json()

    def test_pdf_header_auth(self, h_admin, pdf_invoice):
        r = requests.get(f"{BASE_URL}/api/invoices/{pdf_invoice['id']}/pdf",
                         headers=h_admin)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        cd = r.headers.get("content-disposition", "")
        assert "inline" in cd and 'filename="' in cd, cd
        # Expected filename pattern SI-####_YYYYMMDD.pdf
        inv_no = pdf_invoice["invoice_no"]
        assert inv_no in cd
        assert r.content.startswith(b"%PDF-"), r.content[:20]
        assert len(r.content) > 2 * 1024, f"pdf too small: {len(r.content)}"

    def test_pdf_query_token(self, admin_token, pdf_invoice):
        r = requests.get(
            f"{BASE_URL}/api/invoices/{pdf_invoice['id']}/pdf",
            params={"token": admin_token},
            # explicitly no Authorization header
        )
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content.startswith(b"%PDF-")

    def test_pdf_missing_token(self, pdf_invoice):
        r = requests.get(f"{BASE_URL}/api/invoices/{pdf_invoice['id']}/pdf")
        assert r.status_code == 401, r.text

    def test_pdf_invalid_token(self, pdf_invoice):
        r = requests.get(f"{BASE_URL}/api/invoices/{pdf_invoice['id']}/pdf",
                         headers={"Authorization": "Bearer not-a-real-token-xyz"})
        assert r.status_code == 401, r.text

    def test_pdf_invalid_iid(self, h_admin):
        r = requests.get(f"{BASE_URL}/api/invoices/nonexistent_iid_xyz/pdf",
                         headers=h_admin)
        assert r.status_code == 404, r.text

    def test_pdf_employee_allowed(self, h_emp, pdf_invoice):
        r = requests.get(f"{BASE_URL}/api/invoices/{pdf_invoice['id']}/pdf",
                         headers=h_emp)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content.startswith(b"%PDF-")
