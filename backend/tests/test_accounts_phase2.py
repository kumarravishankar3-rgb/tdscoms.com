"""
Phase 2 backend tests for the Accounts module (Triveni).

Covers ONLY the newly-added endpoints per the review request:
  1) GET  /api/customers/search       (multi-field regex search)
  2) POST /api/customers              (duplicate prevention 409)
     POST /api/customers/quick        (duplicate prevention 409)
     PUT  /api/customers/{cid}        (update duplicate guard 409)
  3) /api/items                       (CRUD + duplicate name 409)
  4) /api/invoices                    (CRUD + GST calc + duplicate 409)

Auth: admin login via /api/auth/login (email/password).
Base URL: internal http://localhost:8001 (per instructions).
Test-created data is prefixed with "TEST_" and unique per run, cleaned up in fixtures.
"""
import os
import uuid
import pytest
import requests


BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8001")
ADMIN = {"email": "admin@triveni.com", "password": "Admin@123"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    return body["session_token"], body["user"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def admin_ctx():
    tok, u = _login(ADMIN)
    return {"token": tok, "user": u}


# unique suffix per test-run to avoid clashes with previously-seeded data
RUN = uuid.uuid4().hex[:6].upper()


# ---------------- 1) Customer multi-field search + 2) Duplicate prevention ----------------
class TestCustomerSearchAndDuplicate:
    """Creates one base customer, then exercises search + duplicate guards.

    Uses a class-level cleanup registry so all TEST_-prefixed customers we
    create in this class are removed at teardown.
    """
    created_ids: list = []
    base_id = None
    base_code = None
    base_mobile = None
    base_pan = None
    base_gst = None
    base_email = None
    base_whatsapp = None
    alt_id = None
    alt_mobile = None

    @classmethod
    def teardown_class(cls):
        try:
            tok, _ = _login(ADMIN)
            for cid in cls.created_ids:
                requests.delete(f"{BASE_URL}/api/customers/{cid}", headers=_h(tok), timeout=15)
        except Exception:
            pass

    def test_create_base_customer_success(self, admin_ctx):
        payload = {
            "name": f"TEST_{RUN}_Base",
            "address": "1 Test Rd",
            "mobile": f"9876{RUN[:6]}",
            "whatsapp": f"9876{RUN[:6]}",
            "email": f"test_{RUN.lower()}@example.com",
            "pan": f"ABCDE{RUN[:4]}K",       # 10-char pan-shape
            "aadhar": f"1111{RUN}22",
            "gst_no": f"29ABCDE{RUN[:4]}KZ5",
        }
        r = requests.post(f"{BASE_URL}/api/customers", json=payload,
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == payload["name"]
        assert body["customer_code"] and body["customer_code"].startswith("TRV-CUST-")
        # store for later
        TestCustomerSearchAndDuplicate.created_ids.append(body["id"])
        TestCustomerSearchAndDuplicate.base_id = body["id"]
        TestCustomerSearchAndDuplicate.base_code = body["customer_code"]
        TestCustomerSearchAndDuplicate.base_mobile = payload["mobile"]
        TestCustomerSearchAndDuplicate.base_pan = payload["pan"]
        TestCustomerSearchAndDuplicate.base_gst = payload["gst_no"]
        TestCustomerSearchAndDuplicate.base_email = payload["email"]
        TestCustomerSearchAndDuplicate.base_whatsapp = payload["whatsapp"]

    # ---- (1) Search ----
    def test_search_by_mobile_substring(self, admin_ctx):
        sub = TestCustomerSearchAndDuplicate.base_mobile[:4]  # "9876"
        r = requests.get(f"{BASE_URL}/api/customers/search",
                         params={"q": sub}, headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200, r.text
        ids = [c["id"] for c in r.json()]
        assert TestCustomerSearchAndDuplicate.base_id in ids

    def test_search_by_customer_code(self, admin_ctx):
        code = TestCustomerSearchAndDuplicate.base_code
        r = requests.get(f"{BASE_URL}/api/customers/search",
                         params={"q": code}, headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert TestCustomerSearchAndDuplicate.base_id in ids

    def test_search_by_pan_prefix(self, admin_ctx):
        r = requests.get(f"{BASE_URL}/api/customers/search",
                         params={"q": "ABCDE"}, headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert TestCustomerSearchAndDuplicate.base_id in ids

    def test_search_by_email(self, admin_ctx):
        r = requests.get(f"{BASE_URL}/api/customers/search",
                         params={"q": f"test_{RUN.lower()}"}, headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert TestCustomerSearchAndDuplicate.base_id in ids

    def test_search_by_gst(self, admin_ctx):
        r = requests.get(f"{BASE_URL}/api/customers/search",
                         params={"q": TestCustomerSearchAndDuplicate.base_gst[:8]},
                         headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert TestCustomerSearchAndDuplicate.base_id in ids

    def test_search_by_name_case_insensitive(self, admin_ctx):
        r = requests.get(f"{BASE_URL}/api/customers/search",
                         params={"q": f"test_{RUN.lower()}_base"},
                         headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert TestCustomerSearchAndDuplicate.base_id in ids

    def test_search_empty_returns_recent_customers(self, admin_ctx):
        r = requests.get(f"{BASE_URL}/api/customers/search",
                         params={"q": "", "limit": 25},
                         headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        assert len(arr) > 0
        # Should include our just-created customer (sorted by created_at desc)
        assert any(c["id"] == TestCustomerSearchAndDuplicate.base_id for c in arr)

    # ---- (2) Duplicate prevention on POST /customers ----
    def _dup_payload(self, override: dict) -> dict:
        # produce a payload that DOES NOT share any unique field with base
        # except the ones explicitly overridden.
        u = uuid.uuid4().hex[:6].upper()
        p = {
            "name": f"TEST_{RUN}_Dup_{u}",
            "address": "dup addr",
            "mobile": f"8000{u}",
            "whatsapp": f"7000{u}",
            "email": f"dup_{u.lower()}@example.com",
            "pan": f"ZZZZZ{u[:4]}A",
            "aadhar": f"2222{u}33",
            "gst_no": f"29ZZZZZ{u[:4]}KZ5",
        }
        p.update(override)
        return p

    def _assert_409_shape(self, r, field_upper: str):
        assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text}"
        body = r.json()
        detail = body.get("detail")
        assert isinstance(detail, dict), f"detail should be dict, got {type(detail)}: {detail}"
        assert "message" in detail
        assert "matched_on" in detail and isinstance(detail["matched_on"], list)
        assert field_upper in detail["matched_on"], f"expected {field_upper} in matched_on={detail['matched_on']}"
        ex = detail.get("existing")
        assert isinstance(ex, dict)
        for k in ("id", "customer_code", "name", "mobile", "pan"):
            assert k in ex

    def test_dup_by_mobile(self, admin_ctx):
        p = self._dup_payload({"mobile": TestCustomerSearchAndDuplicate.base_mobile})
        r = requests.post(f"{BASE_URL}/api/customers", json=p,
                          headers=_h(admin_ctx["token"]), timeout=15)
        self._assert_409_shape(r, "MOBILE")

    def test_dup_by_pan(self, admin_ctx):
        p = self._dup_payload({"pan": TestCustomerSearchAndDuplicate.base_pan})
        r = requests.post(f"{BASE_URL}/api/customers", json=p,
                          headers=_h(admin_ctx["token"]), timeout=15)
        self._assert_409_shape(r, "PAN")

    def test_dup_by_gst(self, admin_ctx):
        p = self._dup_payload({"gst_no": TestCustomerSearchAndDuplicate.base_gst})
        r = requests.post(f"{BASE_URL}/api/customers", json=p,
                          headers=_h(admin_ctx["token"]), timeout=15)
        self._assert_409_shape(r, "GST_NO")

    def test_dup_by_email(self, admin_ctx):
        p = self._dup_payload({"email": TestCustomerSearchAndDuplicate.base_email})
        r = requests.post(f"{BASE_URL}/api/customers", json=p,
                          headers=_h(admin_ctx["token"]), timeout=15)
        self._assert_409_shape(r, "EMAIL")

    def test_dup_by_whatsapp(self, admin_ctx):
        p = self._dup_payload({"whatsapp": TestCustomerSearchAndDuplicate.base_whatsapp})
        r = requests.post(f"{BASE_URL}/api/customers", json=p,
                          headers=_h(admin_ctx["token"]), timeout=15)
        self._assert_409_shape(r, "WHATSAPP")

    # ---- Duplicate on /customers/quick ----
    def test_quick_add_dup_by_mobile(self, admin_ctx):
        r = requests.post(f"{BASE_URL}/api/customers/quick",
                          json={"name": f"TEST_{RUN}_Quick", "mobile": TestCustomerSearchAndDuplicate.base_mobile},
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 409, r.text
        detail = r.json().get("detail")
        assert isinstance(detail, dict)
        assert "existing" in detail
        assert detail["existing"]["id"] == TestCustomerSearchAndDuplicate.base_id

    # ---- Duplicate guard on PUT /customers/{cid} ----
    def test_put_customer_dup_by_alt_mobile(self, admin_ctx):
        # Create a second customer, then try to PUT base -> alt's mobile
        u = uuid.uuid4().hex[:6].upper()
        alt = {
            "name": f"TEST_{RUN}_Alt",
            "address": "alt",
            "mobile": f"7654{u}",
            "whatsapp": f"7654{u}",
            "email": f"alt_{u.lower()}@example.com",
            "pan": f"YYYYY{u[:4]}A",
            "aadhar": f"3333{u}44",
        }
        r = requests.post(f"{BASE_URL}/api/customers", json=alt,
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200, r.text
        alt_id = r.json()["id"]
        TestCustomerSearchAndDuplicate.created_ids.append(alt_id)
        TestCustomerSearchAndDuplicate.alt_id = alt_id
        TestCustomerSearchAndDuplicate.alt_mobile = alt["mobile"]

        # Now PUT base with alt's mobile -> 409
        update = {
            "name": f"TEST_{RUN}_Base_upd",
            "address": "1 Test Rd",
            "mobile": alt["mobile"],  # collision
            "whatsapp": TestCustomerSearchAndDuplicate.base_whatsapp,
            "email": TestCustomerSearchAndDuplicate.base_email,
            "pan": TestCustomerSearchAndDuplicate.base_pan,
            "aadhar": f"1111{RUN}22",
            "gst_no": TestCustomerSearchAndDuplicate.base_gst,
        }
        r2 = requests.put(f"{BASE_URL}/api/customers/{TestCustomerSearchAndDuplicate.base_id}",
                          json=update, headers=_h(admin_ctx["token"]), timeout=15)
        assert r2.status_code == 409, r2.text
        detail = r2.json().get("detail")
        assert isinstance(detail, dict)
        assert "existing" in detail
        assert detail["existing"]["id"] == alt_id


# ---------------- 3) Items API ----------------
class TestItems:
    item_id = None
    created_ids: list = []
    item_name = None

    @classmethod
    def teardown_class(cls):
        try:
            tok, _ = _login(ADMIN)
            for iid in cls.created_ids:
                requests.delete(f"{BASE_URL}/api/items/{iid}", headers=_h(tok), timeout=15)
        except Exception:
            pass

    def test_create_item(self, admin_ctx):
        name = f"TEST_DSC_Class3_{RUN}"
        payload = {"name": name, "sale_price": 2500, "tax_rate": 18, "is_service": True}
        r = requests.post(f"{BASE_URL}/api/items", json=payload,
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == name
        assert body["is_service"] is True
        assert body["sale_price"] == 2500
        assert body["tax_rate"] == 18
        assert body["item_code"] and body["item_code"].startswith("ITM-")
        TestItems.item_id = body["id"]
        TestItems.item_name = name
        TestItems.created_ids.append(body["id"])

    def test_create_item_duplicate_name_case_insensitive(self, admin_ctx):
        payload = {"name": TestItems.item_name.lower(), "sale_price": 999, "tax_rate": 5}
        r = requests.post(f"{BASE_URL}/api/items", json=payload,
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 409, r.text
        detail = r.json().get("detail")
        assert isinstance(detail, dict)
        assert "existing" in detail
        assert detail["existing"]["id"] == TestItems.item_id

    def test_get_items_search(self, admin_ctx):
        r = requests.get(f"{BASE_URL}/api/items", params={"q": "DSC"},
                         headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert any(i["id"] == TestItems.item_id for i in arr)

    def test_patch_item(self, admin_ctx):
        r = requests.patch(f"{BASE_URL}/api/items/{TestItems.item_id}",
                           json={"name": TestItems.item_name, "sale_price": 2800, "tax_rate": 18, "is_service": True},
                           headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["sale_price"] == 2800
        # verify via GET
        r2 = requests.get(f"{BASE_URL}/api/items", params={"q": TestItems.item_name},
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r2.status_code == 200
        match = [i for i in r2.json() if i["id"] == TestItems.item_id]
        assert match and match[0]["sale_price"] == 2800

    def test_delete_item_admin(self, admin_ctx):
        r = requests.delete(f"{BASE_URL}/api/items/{TestItems.item_id}",
                            headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json().get("deleted") == 1
        # remove from cleanup list
        TestItems.created_ids = [x for x in TestItems.created_ids if x != TestItems.item_id]


# ---------------- 4) Invoices API ----------------
class TestInvoices:
    customer_id = None
    customer_name = None
    customer_mobile = None
    sale_inv_id = None
    sale_inv_no = None
    purchase_inv_id = None
    purchase_inv_no = None
    inv_date = "2026-01-20"
    other_date = "2026-01-21"

    created_customer_ids: list = []
    created_invoice_ids: list = []

    @classmethod
    def teardown_class(cls):
        try:
            tok, _ = _login(ADMIN)
            for iid in cls.created_invoice_ids:
                requests.delete(f"{BASE_URL}/api/invoices/{iid}", headers=_h(tok), timeout=15)
            for cid in cls.created_customer_ids:
                requests.delete(f"{BASE_URL}/api/customers/{cid}", headers=_h(tok), timeout=15)
        except Exception:
            pass

    def _create_party(self, admin_ctx):
        u = uuid.uuid4().hex[:6].upper()
        payload = {
            "name": f"TEST_{RUN}_InvParty_{u}",
            "address": "party addr",
            "mobile": f"6000{u}",
            "whatsapp": f"6000{u}",
            "email": f"party_{u.lower()}@example.com",
            "pan": f"PPPPP{u[:4]}A",
            "aadhar": f"4444{u}55",
        }
        r = requests.post(f"{BASE_URL}/api/customers", json=payload,
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        TestInvoices.created_customer_ids.append(body["id"])
        return body

    def test_create_sale_invoice_gst_calc(self, admin_ctx):
        party = self._create_party(admin_ctx)
        TestInvoices.customer_id = party["id"]
        TestInvoices.customer_name = party["name"]
        TestInvoices.customer_mobile = party["mobile"]

        payload = {
            "invoice_type": "sale",
            "payment_type": "cash",
            "date": TestInvoices.inv_date,
            "party_id": party["id"],
            "party_name": party["name"],
            "party_mobile": party["mobile"],
            "items": [{
                "name": "TEST_ItemLine",
                "qty": 2,
                "unit": "PCS",
                "price": 1000,
                "tax_rate": 18,
                "discount": 100,
            }],
        }
        r = requests.post(f"{BASE_URL}/api/invoices", json=payload,
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # Server-calc: subtotal=2*1000=2000, discount=100, taxable=1900, tax=342, total=2242
        assert body["subtotal"] == 2000, body
        assert body["total_discount"] == 100
        assert body["total_tax"] == 342
        assert body["total_amount"] == 2242
        assert body["paid_amount"] == 2242  # cash → auto-paid
        assert body["balance"] == 0
        assert body["status"] == "paid"
        assert body["invoice_no"] and body["invoice_no"].startswith("SI-")
        TestInvoices.sale_inv_id = body["id"]
        TestInvoices.sale_inv_no = body["invoice_no"]
        TestInvoices.created_invoice_ids.append(body["id"])

    def test_duplicate_sale_invoice_409(self, admin_ctx):
        payload = {
            "invoice_type": "sale",
            "payment_type": "cash",
            "date": TestInvoices.inv_date,
            "party_id": TestInvoices.customer_id,
            "party_name": TestInvoices.customer_name,
            "items": [{
                "name": "TEST_AnotherLine",
                "qty": 1, "unit": "PCS", "price": 500, "tax_rate": 18, "discount": 0,
            }],
        }
        r = requests.post(f"{BASE_URL}/api/invoices", json=payload,
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 409, r.text
        detail = r.json().get("detail")
        assert isinstance(detail, dict)
        assert "existing" in detail
        assert detail["existing"]["invoice_no"] == TestInvoices.sale_inv_no
        assert detail["existing"]["id"] == TestInvoices.sale_inv_id

    def test_create_purchase_bill_prefix(self, admin_ctx):
        # different party or different date to avoid duplicate guard (purchase w/ sale is different type)
        # actually duplicate check keys on invoice_type too, but we'll use another party for safety
        party2 = self._create_party(admin_ctx)
        payload = {
            "invoice_type": "purchase",
            "payment_type": "credit",
            "date": TestInvoices.inv_date,
            "party_id": party2["id"],
            "party_name": party2["name"],
            "items": [{
                "name": "TEST_PurchaseLine",
                "qty": 1, "unit": "PCS", "price": 800, "tax_rate": 18, "discount": 0,
            }],
        }
        r = requests.post(f"{BASE_URL}/api/invoices", json=payload,
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["invoice_no"] and body["invoice_no"].startswith("PB-")
        assert body["invoice_type"] == "purchase"
        # credit unpaid → balance == total
        assert body["balance"] == body["total_amount"]
        assert body["status"] in ("unpaid", "partial")
        TestInvoices.purchase_inv_id = body["id"]
        TestInvoices.purchase_inv_no = body["invoice_no"]
        TestInvoices.created_invoice_ids.append(body["id"])

    def test_list_invoices_filter_by_type(self, admin_ctx):
        r = requests.get(f"{BASE_URL}/api/invoices", params={"invoice_type": "sale"},
                         headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert all(i["invoice_type"] == "sale" for i in arr)
        assert any(i["id"] == TestInvoices.sale_inv_id for i in arr)

    def test_list_invoices_filter_by_party(self, admin_ctx):
        r = requests.get(f"{BASE_URL}/api/invoices",
                         params={"party_id": TestInvoices.customer_id},
                         headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert len(arr) >= 1
        for i in arr:
            assert i["party_id"] == TestInvoices.customer_id
        assert any(i["id"] == TestInvoices.sale_inv_id for i in arr)

    def test_list_invoices_filter_by_date_range(self, admin_ctx):
        r = requests.get(f"{BASE_URL}/api/invoices",
                         params={"from_date": TestInvoices.inv_date, "to_date": TestInvoices.inv_date},
                         headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        arr = r.json()
        for i in arr:
            assert i["date"] == TestInvoices.inv_date
        assert any(i["id"] == TestInvoices.sale_inv_id for i in arr)

    def test_delete_invoice_admin(self, admin_ctx):
        r = requests.delete(f"{BASE_URL}/api/invoices/{TestInvoices.purchase_inv_id}",
                            headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json().get("deleted") == 1
        # Verify gone
        r2 = requests.get(f"{BASE_URL}/api/invoices/{TestInvoices.purchase_inv_id}",
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r2.status_code == 404
        TestInvoices.created_invoice_ids = [x for x in TestInvoices.created_invoice_ids
                                            if x != TestInvoices.purchase_inv_id]
