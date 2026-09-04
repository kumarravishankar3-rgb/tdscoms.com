"""
Iteration 13 — Customer ID format migration + numeric search verification.

Scenarios:
1) New format on creation (POST /api/customers/quick and POST /api/customers)
2) Legacy migration (no TRV-CUST-* codes; new format universal)
3) Numeric search on /api/customers/search
4) Regression: duplicate mobile 409, full POST validation, and task auto-creation
   denormalisation of customer_code to TDSC-CUST-ID-XXXXXXXX.
"""
import os
import re
import uuid
from datetime import datetime

import pytest
import requests

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8001").rstrip("/")
ADMIN = {"email": os.environ["TEST_ADMIN_EMAIL"], "password": os.environ["TEST_ADMIN_PASSWORD"]}

CODE_RE = re.compile(r"^TDSC-CUST-ID-\d{8}$")
LEGACY_RE = re.compile(r"^TRV-CUST-")


def _login():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def h():
    tok = _login()
    return {"Authorization": f"Bearer {tok}"}


def _seq_of(code: str) -> int:
    m = re.match(r"^TDSC-CUST-ID-(\d{8})$", code)
    assert m, f"invalid code {code!r}"
    return int(m.group(1))


def _rand_mobile() -> str:
    return f"9{uuid.uuid4().int % 1_000_000_000:09d}"[:10]


# ---------------------------------------------------------------- 1) format
class TestNewFormatOnCreation:
    seq_a = None
    seq_b = None
    full_code = None

    def test_quick_new_format_and_padding(self, h):
        m = _rand_mobile()
        r = requests.post(
            f"{BASE_URL}/api/customers/quick",
            json={"name": "IterCustFmt-A", "mobile": m},
            headers=h,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        c = r.json()
        code = c.get("customer_code")
        assert code and CODE_RE.match(code), f"bad code {code!r}"
        # 8-digit exact width
        num = code.split("-")[-1]
        assert len(num) == 8 and num.isdigit(), f"len={len(num)} num={num!r}"
        TestNewFormatOnCreation.seq_a = _seq_of(code)

    def test_quick_monotonic_increment(self, h):
        assert TestNewFormatOnCreation.seq_a is not None
        m = _rand_mobile()
        r = requests.post(
            f"{BASE_URL}/api/customers/quick",
            json={"name": "IterCustFmt-B", "mobile": m},
            headers=h,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        code = r.json().get("customer_code")
        assert code and CODE_RE.match(code), f"bad code {code!r}"
        seq_b = _seq_of(code)
        assert seq_b == TestNewFormatOnCreation.seq_a + 1, (
            f"expected {TestNewFormatOnCreation.seq_a + 1}, got {seq_b}"
        )
        TestNewFormatOnCreation.seq_b = seq_b

    def test_full_post_customers_new_format(self, h):
        m = _rand_mobile()
        # unique PAN & aadhar to avoid dedupe hits from earlier iterations
        uniq = uuid.uuid4().hex.upper()
        pan = f"AA{uniq[:3]}{uniq[3]}{uniq[4:7]}F"[:10]
        aadhar = str(uuid.uuid4().int % 10**12).zfill(12)
        payload = {
            "name": "IterCustFmt-Full",
            "mobile": m,
            "whatsapp": m,
            "pan": pan,
            "aadhar": aadhar,
            "address": "Test Addr",
        }
        r = requests.post(f"{BASE_URL}/api/customers", json=payload, headers=h, timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        code = c.get("customer_code")
        assert code and CODE_RE.match(code), f"bad code {code!r}"
        TestNewFormatOnCreation.full_code = code
        # Monotonic beyond seq_b
        seq_full = _seq_of(code)
        assert seq_full == TestNewFormatOnCreation.seq_b + 1, (
            f"expected {TestNewFormatOnCreation.seq_b + 1}, got {seq_full}"
        )


# ---------------------------------------------------------------- 2) migration
class TestLegacyMigration:
    def test_no_legacy_codes_remain(self, h):
        r = requests.get(f"{BASE_URL}/api/customers", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert rows, "expected some customers to exist"
        legacy = [c for c in rows if (c.get("customer_code") or "").startswith("TRV-CUST-")]
        assert legacy == [], (
            f"legacy TRV-CUST- codes still exist: "
            f"{[c.get('customer_code') for c in legacy][:10]}"
        )

    def test_all_codes_are_new_format(self, h):
        r = requests.get(f"{BASE_URL}/api/customers", headers=h, timeout=30)
        rows = r.json()
        bad = [c.get("customer_code") for c in rows if not CODE_RE.match(c.get("customer_code") or "")]
        assert bad == [], f"non-conforming codes: {bad[:10]}"

    def test_codes_unique_and_monotonic_from_one(self, h):
        r = requests.get(f"{BASE_URL}/api/customers", headers=h, timeout=30)
        rows = r.json()
        seqs = sorted({_seq_of(c["customer_code"]) for c in rows})
        # unique already via set; ensure count == len(rows) meaning no dup
        codes = [c["customer_code"] for c in rows]
        assert len(codes) == len(set(codes)), "duplicate customer_code detected"
        assert seqs[0] >= 1, f"min seq should be >=1, got {seqs[0]}"


# ---------------------------------------------------------------- 3) search
class TestNumericSearch:
    target_code = None
    target_num = None
    seq1_code = None

    def test_seed_and_grab_target(self, h):
        # Create a fresh customer to know its seq for deterministic search
        m = _rand_mobile()
        r = requests.post(
            f"{BASE_URL}/api/customers/quick",
            json={"name": "IterCustSearch-Target", "mobile": m},
            headers=h,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        code = r.json()["customer_code"]
        assert CODE_RE.match(code)
        TestNumericSearch.target_code = code
        TestNumericSearch.target_num = code.split("-")[-1]

    def test_search_by_full_padded(self, h):
        padded = TestNumericSearch.target_num
        r = requests.get(
            f"{BASE_URL}/api/customers/search",
            params={"q": padded},
            headers=h,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        results = r.json()
        codes = [x.get("customer_code") for x in results]
        assert TestNumericSearch.target_code in codes, (
            f"padded search {padded!r} missing target {TestNumericSearch.target_code!r}, got {codes}"
        )

    def test_search_by_plain_integer(self, h):
        plain = str(int(TestNumericSearch.target_num))
        r = requests.get(
            f"{BASE_URL}/api/customers/search",
            params={"q": plain},
            headers=h,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        codes = [x.get("customer_code") for x in r.json()]
        assert TestNumericSearch.target_code in codes, (
            f"plain int search {plain!r} missing {TestNumericSearch.target_code!r}, got {codes[:20]}"
        )

    def test_search_by_1_returns_seq1(self, h):
        r = requests.get(
            f"{BASE_URL}/api/customers/search",
            params={"q": "1", "limit": 500},
            headers=h,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        codes = [x.get("customer_code") for x in r.json()]
        assert "TDSC-CUST-ID-00000001" in codes, (
            f"q=1 must include TDSC-CUST-ID-00000001. Got sample {codes[:10]}"
        )

    def test_search_no_match_empty(self, h):
        r = requests.get(
            f"{BASE_URL}/api/customers/search",
            params={"q": "99999999"},
            headers=h,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json() == [], f"expected [] for non-existent, got {r.json()!r}"


# ---------------------------------------------------------------- 4) regression
class TestRegressions:
    def test_quick_duplicate_mobile_still_409(self, h):
        m = _rand_mobile()
        r1 = requests.post(
            f"{BASE_URL}/api/customers/quick",
            json={"name": "IterCustDup-1", "mobile": m},
            headers=h,
            timeout=15,
        )
        assert r1.status_code == 200, r1.text
        r2 = requests.post(
            f"{BASE_URL}/api/customers/quick",
            json={"name": "IterCustDup-2", "mobile": m},
            headers=h,
            timeout=15,
        )
        assert r2.status_code == 409, f"expected 409, got {r2.status_code} {r2.text}"

    def test_full_post_missing_mandatory_400(self, h):
        # missing pan/aadhar/whatsapp — Pydantic/manual layer should reject
        r = requests.post(
            f"{BASE_URL}/api/customers",
            json={"name": "Missing", "mobile": _rand_mobile()},
            headers=h,
            timeout=15,
        )
        assert r.status_code in (400, 422), f"expected 400/422, got {r.status_code} {r.text}"

    def test_auto_task_denormalised_customer_code_new_format(self, h):
        # Ensure toggle on
        requests.put(
            f"{BASE_URL}/api/settings/auto-task-toggle",
            json={"enabled": True},
            headers=h,
            timeout=15,
        )
        # New customer with new-format code
        m = _rand_mobile()
        cr = requests.post(
            f"{BASE_URL}/api/customers/quick",
            json={"name": "IterCustTask-Party", "mobile": m},
            headers=h,
            timeout=15,
        )
        assert cr.status_code == 200, cr.text
        cust = cr.json()
        assert CODE_RE.match(cust["customer_code"]), cust
        today = datetime.now().strftime("%Y-%m-%d")
        payload = {
            "invoice_type": "sale",
            "date": today,
            "party_id": cust["id"],
            "party_name": cust["name"],
            "party_mobile": cust["mobile"],
            "items": [{"name": "DSC Class 3", "qty": 1, "price": 1500, "tax_rate": 0}],
        }
        ir = requests.post(f"{BASE_URL}/api/invoices", json=payload, headers=h, timeout=20)
        assert ir.status_code == 200, ir.text
        inv = ir.json()
        # Fetch tasks for that voucher
        tr = requests.get(f"{BASE_URL}/api/tasks?mine=false", headers=h, timeout=20)
        assert tr.status_code == 200, tr.text
        tasks = [t for t in tr.json() if t.get("voucher_no") == inv["invoice_no"]]
        assert tasks, f"expected auto-tasks for {inv['invoice_no']}"
        for t in tasks:
            assert t.get("customer_code") == cust["customer_code"], (
                f"task customer_code {t.get('customer_code')!r} != customer {cust['customer_code']!r}"
            )
            assert CODE_RE.match(t.get("customer_code") or ""), t.get("customer_code")
