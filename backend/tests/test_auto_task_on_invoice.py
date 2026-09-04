"""
Iteration 5 — Auto-task-on-invoice feature backend regression.

Covers:
1) Task customer_* fields (create + partial patch)
2) /api/settings/service-tasks CRUD (list seeds defaults, patch, create+conflict, delete)
3) /api/settings/auto-task-toggle (GET default true, PUT toggles, GET reflects)
4) Sale invoice auto-task hook (service task + payment follow-up, deadlines/assignee/customer,
   toggle-off suppresses tasks, purchase invoices do not trigger, fallback on unmatched item)

Base URL is localhost:8001 per iteration_5 review request.
"""
import os
import uuid
from datetime import datetime, timedelta

import pytest
import requests

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8001").rstrip("/")

ADMIN = {"email": os.environ["TEST_ADMIN_EMAIL"], "password": os.environ["TEST_ADMIN_PASSWORD"]}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    return body["session_token"], body["user"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def admin():
    tok, u = _login(ADMIN)
    return {"token": tok, "user": u, "h": _h(tok)}


@pytest.fixture(scope="module")
def any_employee(admin):
    r = requests.get(f"{BASE_URL}/api/employees", headers=admin["h"], timeout=15)
    assert r.status_code == 200, r.text
    emps = r.json()
    assert emps, "need at least one employee seeded"
    return emps[0]


# --------------------------------------------------------------------------- 1
class TestTaskCustomerFields:
    """POST /api/tasks and PATCH must persist customer_* fields."""

    tid = None

    def test_create_task_with_customer_fields(self, admin):
        body = {
            "title": "With customer",
            "customer_id": "CID_FAKE",
            "customer_code": "TRV-CUST-9999",
            "customer_name": "CustA",
            "customer_mobile": "9999900001",
            "customer_pan": "ABCDE1234F",
            "customer_address": "Addr Test",
        }
        r = requests.post(f"{BASE_URL}/api/tasks", json=body, headers=admin["h"], timeout=15)
        assert r.status_code == 200, r.text
        t = r.json()
        for k, v in body.items():
            assert t.get(k) == v, f"field {k} mismatch: got {t.get(k)!r} want {v!r}"
        TestTaskCustomerFields.tid = t["id"]

    def test_patch_task_partial_customer_field(self, admin):
        assert TestTaskCustomerFields.tid
        r = requests.patch(
            f"{BASE_URL}/api/tasks/{TestTaskCustomerFields.tid}",
            json={"customer_name": "CustA-updated"},
            headers=admin["h"],
            timeout=15,
        )
        assert r.status_code == 200, r.text

        # Verify via GET
        r2 = requests.get(
            f"{BASE_URL}/api/tasks/{TestTaskCustomerFields.tid}", headers=admin["h"], timeout=15
        )
        assert r2.status_code == 200, r2.text
        t = r2.json()
        assert t["customer_name"] == "CustA-updated"
        # Others intact
        assert t["customer_id"] == "CID_FAKE"
        assert t["customer_code"] == "TRV-CUST-9999"
        assert t["customer_mobile"] == "9999900001"
        assert t["customer_pan"] == "ABCDE1234F"
        assert t["customer_address"] == "Addr Test"

    def test_cleanup(self, admin):
        if TestTaskCustomerFields.tid:
            requests.delete(
                f"{BASE_URL}/api/tasks/{TestTaskCustomerFields.tid}",
                headers=admin["h"],
                timeout=15,
            )


# --------------------------------------------------------------------------- 2
class TestServiceTasksCRUD:
    """/api/settings/service-tasks CRUD."""

    dsc_id = None
    tds_id = None

    def test_list_seeds_defaults(self, admin):
        # Ensure a "fresh call" scenario: wipe the 5 default rows so `_seed_default_service_settings`
        # re-creates them with their default deadline_days=7/followup_days=3/auto_task_enabled=true.
        # Prior test runs may have patched deadlines to 5 — that is out-of-scope for THIS assertion.
        existing = requests.get(
            f"{BASE_URL}/api/settings/service-tasks", headers=admin["h"], timeout=15
        ).json()
        for row in existing:
            if row["service_key"] in {"dsc", "gst", "tender", "income_tax", "registration"}:
                requests.delete(
                    f"{BASE_URL}/api/settings/service-tasks/{row['id']}",
                    headers=admin["h"],
                    timeout=15,
                )

        r = requests.get(
            f"{BASE_URL}/api/settings/service-tasks", headers=admin["h"], timeout=15
        )
        assert r.status_code == 200, r.text
        rows = r.json()
        keys = {row["service_key"] for row in rows}
        for expected in ["dsc", "gst", "tender", "income_tax", "registration"]:
            assert expected in keys, f"default service {expected!r} missing (got {keys})"
        assert len(rows) >= 5, f"expected at least 5 defaults, got {len(rows)}"

        dsc = next(row for row in rows if row["service_key"] == "dsc")
        TestServiceTasksCRUD.dsc_id = dsc["id"]

        for row in rows:
            if row["service_key"] in {"dsc", "gst", "tender", "income_tax", "registration"}:
                assert row["default_deadline_days"] == 7, row
                assert row["default_followup_days"] == 3, row
                assert row["auto_task_enabled"] is True, row

    def test_patch_dsc_setting_assignee(self, admin, any_employee):
        assert TestServiceTasksCRUD.dsc_id
        payload = {
            "service_key": "dsc",
            "service_label": "DSC Service",
            "default_assignee_id": any_employee["id"],
            "default_assignee_name": any_employee["name"],
            "default_deadline_days": 5,
            "default_followup_days": 2,
            "auto_task_enabled": True,
        }
        r = requests.patch(
            f"{BASE_URL}/api/settings/service-tasks/{TestServiceTasksCRUD.dsc_id}",
            json=payload,
            headers=admin["h"],
            timeout=15,
        )
        assert r.status_code == 200, r.text
        upd = r.json()
        assert upd["default_assignee_id"] == any_employee["id"]
        assert upd["default_assignee_name"] == any_employee["name"]
        assert upd["default_deadline_days"] == 5
        assert upd["default_followup_days"] == 2
        assert upd["auto_task_enabled"] is True
        assert upd["service_key"] == "dsc"

    label_only_worked = True

    def test_create_tds_service(self, admin):
        # Clean up any pre-existing tds_filing row from previous test runs
        rows = requests.get(
            f"{BASE_URL}/api/settings/service-tasks", headers=admin["h"], timeout=15
        ).json()
        for row in rows:
            if row["service_key"] == "tds_filing":
                requests.delete(
                    f"{BASE_URL}/api/settings/service-tasks/{row['id']}",
                    headers=admin["h"],
                    timeout=15,
                )

        # Per review request: send only service_label to derive slug key
        body = {"service_label": "TDS Filing"}
        r = requests.post(
            f"{BASE_URL}/api/settings/service-tasks",
            json=body,
            headers=admin["h"],
            timeout=15,
        )
        # If model requires service_key, allow retry with explicit empty key so we can proceed.
        # Flag the ergonomic gap (label-only should have worked) for the report.
        if r.status_code == 422:
            TestServiceTasksCRUD.label_only_worked = False
            r = requests.post(
                f"{BASE_URL}/api/settings/service-tasks",
                json={"service_key": "", "service_label": "TDS Filing"},
                headers=admin["h"],
                timeout=15,
            )
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["service_key"] == "tds_filing", created
        TestServiceTasksCRUD.tds_id = created["id"]

    def test_label_only_post_ergonomics(self):
        # Standalone assertion so the review's "just {service_label}" expectation is
        # visible in the report as a distinct failure rather than an xfail.
        assert TestServiceTasksCRUD.label_only_worked, (
            "POST /api/settings/service-tasks with only {service_label: ...} returned 422 — "
            "ServiceTaskSettingInput requires service_key (no default). Per review, the label "
            "alone should derive the slug key."
        )

    def test_duplicate_tds_returns_409(self, admin):
        if not TestServiceTasksCRUD.tds_id:
            pytest.skip("TDS setting not created")
        r = requests.post(
            f"{BASE_URL}/api/settings/service-tasks",
            json={"service_key": "tds_filing", "service_label": "TDS Filing"},
            headers=admin["h"],
            timeout=15,
        )
        assert r.status_code == 409, f"{r.status_code} {r.text}"

    def test_delete_tds_row(self, admin):
        if not TestServiceTasksCRUD.tds_id:
            pytest.skip("TDS setting not created")
        r = requests.delete(
            f"{BASE_URL}/api/settings/service-tasks/{TestServiceTasksCRUD.tds_id}",
            headers=admin["h"],
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("deleted") == 1


# --------------------------------------------------------------------------- 3
class TestAutoTaskToggle:
    def test_default_toggle_true(self, admin):
        # If a previous test left it off, restore first
        requests.put(
            f"{BASE_URL}/api/settings/auto-task-toggle",
            json={"enabled": True},
            headers=admin["h"],
            timeout=15,
        )
        r = requests.get(
            f"{BASE_URL}/api/settings/auto-task-toggle", headers=admin["h"], timeout=15
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"enabled": True}

    def test_disable_and_reflect(self, admin):
        r = requests.put(
            f"{BASE_URL}/api/settings/auto-task-toggle",
            json={"enabled": False},
            headers=admin["h"],
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"enabled": False}
        r2 = requests.get(
            f"{BASE_URL}/api/settings/auto-task-toggle", headers=admin["h"], timeout=15
        )
        assert r2.json() == {"enabled": False}

    def test_reenable(self, admin):
        r = requests.put(
            f"{BASE_URL}/api/settings/auto-task-toggle",
            json={"enabled": True},
            headers=admin["h"],
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json() == {"enabled": True}


# --------------------------------------------------------------------------- 4
def _create_quick_customer(admin, name_prefix: str):
    mobile = f"911{uuid.uuid4().int % 10_000_000:07d}"
    r = requests.post(
        f"{BASE_URL}/api/customers/quick",
        json={"name": name_prefix, "mobile": mobile},
        headers=admin["h"],
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json(), mobile


def _tasks_for_voucher(admin, voucher_no):
    r = requests.get(
        f"{BASE_URL}/api/tasks?mine=false", headers=admin["h"], timeout=15
    )
    assert r.status_code == 200, r.text
    return [t for t in r.json() if t.get("voucher_no") == voucher_no]


class TestAutoTaskHookOnInvoice:
    """Sale-invoice save must spawn two auto-tasks per DSC service settings."""

    invoice_no = None
    invoice_date = None
    customer_id = None
    customer_mobile = None
    assignee = None

    def test_precondition_dsc_configured(self, admin, any_employee):
        # Ensure toggle on
        requests.put(
            f"{BASE_URL}/api/settings/auto-task-toggle",
            json={"enabled": True},
            headers=admin["h"],
            timeout=15,
        )
        # Ensure DSC has the expected assignee/5/2 days from step 2 (idempotent)
        rows = requests.get(
            f"{BASE_URL}/api/settings/service-tasks", headers=admin["h"], timeout=15
        ).json()
        dsc = next(r for r in rows if r["service_key"] == "dsc")
        requests.patch(
            f"{BASE_URL}/api/settings/service-tasks/{dsc['id']}",
            json={
                "service_key": "dsc",
                "service_label": "DSC Service",
                "default_assignee_id": any_employee["id"],
                "default_assignee_name": any_employee["name"],
                "default_deadline_days": 5,
                "default_followup_days": 2,
                "auto_task_enabled": True,
            },
            headers=admin["h"],
            timeout=15,
        )
        TestAutoTaskHookOnInvoice.assignee = any_employee

    def test_create_sale_invoice_spawns_two_tasks(self, admin):
        cust, mobile = _create_quick_customer(admin, "Auto-Task Party X")
        TestAutoTaskHookOnInvoice.customer_id = cust["id"]
        TestAutoTaskHookOnInvoice.customer_mobile = mobile
        today = datetime.now().strftime("%Y-%m-%d")
        payload = {
            "invoice_type": "sale",
            "date": today,
            "party_id": cust["id"],
            "party_name": cust["name"],
            "party_mobile": cust["mobile"],
            "items": [
                {"name": "DSC Class 3", "qty": 1, "price": 2500, "tax_rate": 18}
            ],
        }
        r = requests.post(
            f"{BASE_URL}/api/invoices", json=payload, headers=admin["h"], timeout=20
        )
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv.get("invoice_no"), inv
        assert abs(inv["total_amount"] - 2950.0) < 0.01, inv
        TestAutoTaskHookOnInvoice.invoice_no = inv["invoice_no"]
        TestAutoTaskHookOnInvoice.invoice_date = today

        tasks = _tasks_for_voucher(admin, inv["invoice_no"])
        assert len(tasks) == 2, f"expected 2 tasks for {inv['invoice_no']}, got {len(tasks)}: {[t['title'] for t in tasks]}"

        svc = next((t for t in tasks if t["title"].startswith("DSC Service —")), None)
        follow = next(
            (t for t in tasks if t["title"].startswith("Payment Follow-up —")), None
        )
        assert svc, f"missing DSC service task in {[t['title'] for t in tasks]}"
        assert follow, f"missing follow-up task in {[t['title'] for t in tasks]}"

        # deadlines
        d5 = (datetime.strptime(today, "%Y-%m-%d") + timedelta(days=5)).strftime("%Y-%m-%d")
        d2 = (datetime.strptime(today, "%Y-%m-%d") + timedelta(days=2)).strftime("%Y-%m-%d")
        assert svc["deadline"] == d5, svc
        assert svc["priority"] == "high", svc
        assert follow["deadline"] == d2, follow

        emp = TestAutoTaskHookOnInvoice.assignee
        for t in tasks:
            assert t["assignee_name"] == emp["name"], t
            assert t["assignee_id"] == emp["id"], t
            assert t["customer_id"] == cust["id"], t
            assert t["customer_name"] == "Auto-Task Party X", t
            assert t["customer_mobile"] == mobile, t
            assert t["voucher_no"] == inv["invoice_no"], t
            assert t["voucher_date"] == today, t
            assert abs(float(t["total_amount"]) - 2950.0) < 0.01, t

    def test_toggle_off_suppresses_tasks(self, admin):
        # Turn off
        r0 = requests.put(
            f"{BASE_URL}/api/settings/auto-task-toggle",
            json={"enabled": False},
            headers=admin["h"],
            timeout=15,
        )
        assert r0.status_code == 200
        try:
            cust, mobile = _create_quick_customer(admin, "Auto-Task Off Party")
            today = datetime.now().strftime("%Y-%m-%d")
            payload = {
                "invoice_type": "sale",
                "date": today,
                "party_id": cust["id"],
                "party_name": cust["name"],
                "party_mobile": cust["mobile"],
                "items": [{"name": "DSC Class 3", "qty": 1, "price": 500, "tax_rate": 0}],
            }
            r = requests.post(
                f"{BASE_URL}/api/invoices", json=payload, headers=admin["h"], timeout=20
            )
            assert r.status_code == 200, r.text
            inv = r.json()
            tasks = _tasks_for_voucher(admin, inv["invoice_no"])
            assert tasks == [], f"expected 0 tasks with toggle off, got {len(tasks)}: {[t['title'] for t in tasks]}"
        finally:
            # Always restore toggle on
            requests.put(
                f"{BASE_URL}/api/settings/auto-task-toggle",
                json={"enabled": True},
                headers=admin["h"],
                timeout=15,
            )

    def test_purchase_invoice_does_not_trigger(self, admin):
        cust, _ = _create_quick_customer(admin, "Auto-Task Purchase Party")
        today = datetime.now().strftime("%Y-%m-%d")
        payload = {
            "invoice_type": "purchase",
            "date": today,
            "party_id": cust["id"],
            "party_name": cust["name"],
            "party_mobile": cust["mobile"],
            "items": [{"name": "DSC Class 3", "qty": 1, "price": 1000, "tax_rate": 0}],
        }
        r = requests.post(
            f"{BASE_URL}/api/invoices", json=payload, headers=admin["h"], timeout=20
        )
        assert r.status_code == 200, r.text
        inv = r.json()
        tasks = _tasks_for_voucher(admin, inv["invoice_no"])
        assert tasks == [], f"purchase must not spawn tasks, got {[t['title'] for t in tasks]}"


# --------------------------------------------------------------------------- 5
class TestAutoTaskGuardRails:
    """Item name that doesn't match any service_key must still create 2 fallback tasks."""

    def test_unmatched_item_uses_fallback_setting(self, admin, any_employee):
        # Ensure toggle on
        requests.put(
            f"{BASE_URL}/api/settings/auto-task-toggle",
            json={"enabled": True},
            headers=admin["h"],
            timeout=15,
        )
        cust, mobile = _create_quick_customer(admin, "Fallback Party")
        today = datetime.now().strftime("%Y-%m-%d")
        payload = {
            "invoice_type": "sale",
            "date": today,
            "party_id": cust["id"],
            "party_name": cust["name"],
            "party_mobile": cust["mobile"],
            "items": [{"name": "Some Other Item", "qty": 1, "price": 100, "tax_rate": 0}],
        }
        r = requests.post(
            f"{BASE_URL}/api/invoices", json=payload, headers=admin["h"], timeout=20
        )
        assert r.status_code == 200, r.text
        inv = r.json()
        tasks = _tasks_for_voucher(admin, inv["invoice_no"])
        assert len(tasks) == 2, (
            f"fallback should still create 2 tasks, got {len(tasks)}: "
            f"{[t['title'] for t in tasks]}"
        )
        # One service and one follow-up (title prefix pattern)
        titles = [t["title"] for t in tasks]
        assert any(t.startswith("Payment Follow-up —") for t in titles), titles
        # Non-followup title exists
        assert any(not t.startswith("Payment Follow-up —") for t in titles), titles
