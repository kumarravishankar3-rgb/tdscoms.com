"""
Backend regression tests for Triveni Business Manager.
Covers: auth, customers, employees, tasks, accounts, HR (attendance/leaves),
tenders (with file upload/download), dashboard.
"""
import os
import io
import uuid
import pytest
import requests

BASE_URL = "https://hr-tender-hub.preview.emergentagent.com"

ADMIN = {"email": os.environ["TEST_ADMIN_EMAIL"], "password": os.environ["TEST_ADMIN_PASSWORD"]}
MANAGER = {"email": os.environ["TEST_MANAGER_EMAIL"], "password": os.environ["TEST_MANAGER_PASSWORD"]}
EMPLOYEE = {"email": os.environ["TEST_EMPLOYEE_EMAIL"], "password": os.environ["TEST_EMPLOYEE_PASSWORD"]}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    return body["session_token"], body["user"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def admin_ctx():
    tok, u = _login(ADMIN)
    return {"token": tok, "user": u}


@pytest.fixture(scope="session")
def manager_ctx():
    tok, u = _login(MANAGER)
    return {"token": tok, "user": u}


@pytest.fixture(scope="session")
def employee_ctx():
    tok, u = _login(EMPLOYEE)
    return {"token": tok, "user": u}


# ---------------- Auth ----------------
class TestAuth:
    def test_root(self):
        r = requests.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_login_admin(self, admin_ctx):
        assert admin_ctx["user"]["role"] == "admin"
        assert admin_ctx["user"]["email"] == ADMIN["email"]

    def test_login_manager(self, manager_ctx):
        assert manager_ctx["user"]["role"] == "manager"

    def test_login_employee(self, employee_ctx):
        assert employee_ctx["user"]["role"] == "employee"

    def test_login_invalid(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "admin@triveni.com", "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me(self, admin_ctx):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN["email"]

    def test_me_no_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 401

    def test_signup_and_logout(self):
        email = f"TEST_{uuid.uuid4().hex[:8]}@triveni.com"
        r = requests.post(f"{BASE_URL}/api/auth/signup",
                          json={"email": email, "name": "Test User", "password": "Test@1234"},
                          timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user"]["email"] == email.lower()
        assert body["user"]["role"] == "employee"
        tok = body["session_token"]

        # duplicate signup should 400
        r2 = requests.post(f"{BASE_URL}/api/auth/signup",
                           json={"email": email, "name": "Test User", "password": "Test@1234"},
                           timeout=15)
        assert r2.status_code == 400

        # logout
        r3 = requests.post(f"{BASE_URL}/api/auth/logout", headers=_h(tok), timeout=15)
        assert r3.status_code == 200
        # After logout, token invalid
        r4 = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok), timeout=15)
        assert r4.status_code == 401


# ---------------- Customers ----------------
class TestCustomers:
    created_id = None

    def test_create_customer_as_employee(self, employee_ctx):
        payload = {"name": "TEST_Cust", "company": "TEST_Co", "email": "cust@test.com", "phone": "9999"}
        r = requests.post(f"{BASE_URL}/api/customers", json=payload, headers=_h(employee_ctx["token"]), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == "TEST_Cust"
        assert body["id"].startswith("cus_")
        TestCustomers.created_id = body["id"]

    def test_list_customers(self, admin_ctx):
        r = requests.get(f"{BASE_URL}/api/customers", headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert TestCustomers.created_id in ids

    def test_get_customer(self, admin_ctx):
        r = requests.get(f"{BASE_URL}/api/customers/{TestCustomers.created_id}",
                         headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Cust"

    def test_update_customer(self, admin_ctx):
        payload = {"name": "TEST_Cust_Upd", "company": "TEST_Co", "phone": "8888"}
        r = requests.put(f"{BASE_URL}/api/customers/{TestCustomers.created_id}",
                         json=payload, headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Cust_Upd"

    def test_delete_customer_employee_forbidden(self, employee_ctx):
        r = requests.delete(f"{BASE_URL}/api/customers/{TestCustomers.created_id}",
                            headers=_h(employee_ctx["token"]), timeout=15)
        assert r.status_code == 403

    def test_delete_customer_admin(self, admin_ctx):
        r = requests.delete(f"{BASE_URL}/api/customers/{TestCustomers.created_id}",
                            headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["deleted"] == 1
        # verify deletion via GET -> 404
        r2 = requests.get(f"{BASE_URL}/api/customers/{TestCustomers.created_id}",
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r2.status_code == 404


# ---------------- Employees ----------------
class TestEmployees:
    created_id = None

    def test_employee_cannot_create(self, employee_ctx):
        r = requests.post(f"{BASE_URL}/api/employees",
                          json={"name": "TEST_E", "email": f"TEST_{uuid.uuid4().hex[:6]}@t.com"},
                          headers=_h(employee_ctx["token"]), timeout=15)
        assert r.status_code == 403

    def test_manager_can_create(self, manager_ctx):
        r = requests.post(f"{BASE_URL}/api/employees",
                          json={"name": "TEST_Emp", "email": f"TEST_{uuid.uuid4().hex[:6]}@t.com",
                                "department": "Ops", "designation": "Analyst", "role": "employee"},
                          headers=_h(manager_ctx["token"]), timeout=15)
        assert r.status_code == 200, r.text
        TestEmployees.created_id = r.json()["id"]

    def test_list_employees_any_role(self, employee_ctx):
        r = requests.get(f"{BASE_URL}/api/employees", headers=_h(employee_ctx["token"]), timeout=15)
        assert r.status_code == 200
        assert any(e["id"] == TestEmployees.created_id for e in r.json())

    def test_manager_cannot_delete(self, manager_ctx):
        r = requests.delete(f"{BASE_URL}/api/employees/{TestEmployees.created_id}",
                            headers=_h(manager_ctx["token"]), timeout=15)
        assert r.status_code == 403

    def test_admin_can_delete(self, admin_ctx):
        r = requests.delete(f"{BASE_URL}/api/employees/{TestEmployees.created_id}",
                            headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200


# ---------------- Tasks ----------------
class TestTasks:
    task_admin_own = None
    task_for_employee = None

    def test_create_task_assigned_to_employee(self, admin_ctx, employee_ctx):
        r = requests.post(f"{BASE_URL}/api/tasks",
                          json={"title": "TEST_task_emp", "assignee_id": employee_ctx["user"]["user_id"],
                                "assignee_name": employee_ctx["user"]["name"], "priority": "high"},
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        TestTasks.task_for_employee = r.json()["id"]

    def test_create_task_admin_only(self, admin_ctx):
        r = requests.post(f"{BASE_URL}/api/tasks",
                          json={"title": "TEST_task_admin",
                                "assignee_id": admin_ctx["user"]["user_id"]},
                          headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        TestTasks.task_admin_own = r.json()["id"]

    def test_employee_sees_only_own(self, employee_ctx):
        r = requests.get(f"{BASE_URL}/api/tasks", headers=_h(employee_ctx["token"]), timeout=15)
        assert r.status_code == 200
        tasks = r.json()
        ids = [t["id"] for t in tasks]
        assert TestTasks.task_for_employee in ids
        assert TestTasks.task_admin_own not in ids
        # All returned tasks should be assigned to employee
        for t in tasks:
            assert t["assignee_id"] == employee_ctx["user"]["user_id"]

    def test_admin_sees_all(self, admin_ctx):
        r = requests.get(f"{BASE_URL}/api/tasks", headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert TestTasks.task_admin_own in ids
        assert TestTasks.task_for_employee in ids

    def test_patch_task_status(self, employee_ctx):
        r = requests.patch(f"{BASE_URL}/api/tasks/{TestTasks.task_for_employee}",
                           json={"status": "doing"}, headers=_h(employee_ctx["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "doing"

    def test_delete_task_admin(self, admin_ctx):
        r = requests.delete(f"{BASE_URL}/api/tasks/{TestTasks.task_admin_own}",
                            headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        r = requests.delete(f"{BASE_URL}/api/tasks/{TestTasks.task_for_employee}",
                            headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200


# ---------------- Accounts ----------------
class TestAccounts:
    aid = None

    def test_employee_cannot_create(self, employee_ctx):
        r = requests.post(f"{BASE_URL}/api/accounts",
                          json={"type": "invoice", "title": "TEST_inv", "amount": 100},
                          headers=_h(employee_ctx["token"]), timeout=15)
        assert r.status_code == 403

    def test_manager_creates(self, manager_ctx):
        r = requests.post(f"{BASE_URL}/api/accounts",
                          json={"type": "invoice", "title": "TEST_inv", "amount": 100.5, "party": "ACME"},
                          headers=_h(manager_ctx["token"]), timeout=15)
        assert r.status_code == 200
        TestAccounts.aid = r.json()["id"]

    def test_list_accounts_all_roles(self, employee_ctx):
        r = requests.get(f"{BASE_URL}/api/accounts", headers=_h(employee_ctx["token"]), timeout=15)
        assert r.status_code == 200
        assert any(a["id"] == TestAccounts.aid for a in r.json())

    def test_update_account_manager(self, manager_ctx):
        r = requests.patch(f"{BASE_URL}/api/accounts/{TestAccounts.aid}",
                           json={"type": "invoice", "title": "TEST_inv2", "amount": 200, "status": "paid"},
                           headers=_h(manager_ctx["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "paid"

    def test_delete_manager_forbidden(self, manager_ctx):
        r = requests.delete(f"{BASE_URL}/api/accounts/{TestAccounts.aid}",
                            headers=_h(manager_ctx["token"]), timeout=15)
        assert r.status_code == 403

    def test_delete_admin(self, admin_ctx):
        r = requests.delete(f"{BASE_URL}/api/accounts/{TestAccounts.aid}",
                            headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200


# ---------------- HR: Attendance & Leaves ----------------
class TestHR:
    leave_id = None

    def test_mark_attendance_idempotent(self, employee_ctx):
        payload = {"date": "2026-01-15", "check_in": "09:00", "status": "present"}
        r1 = requests.post(f"{BASE_URL}/api/attendance", json=payload,
                           headers=_h(employee_ctx["token"]), timeout=15)
        assert r1.status_code == 200
        aid1 = r1.json()["id"]
        payload2 = {"date": "2026-01-15", "check_in": "09:05", "check_out": "18:00", "status": "present"}
        r2 = requests.post(f"{BASE_URL}/api/attendance", json=payload2,
                           headers=_h(employee_ctx["token"]), timeout=15)
        assert r2.status_code == 200
        assert r2.json()["id"] == aid1, "Attendance should be idempotent per user/day"
        assert r2.json()["check_out"] == "18:00"

    def test_list_attendance_employee_own_only(self, employee_ctx):
        r = requests.get(f"{BASE_URL}/api/attendance", headers=_h(employee_ctx["token"]), timeout=15)
        assert r.status_code == 200
        for a in r.json():
            assert a["user_id"] == employee_ctx["user"]["user_id"]

    def test_leave_request(self, employee_ctx):
        r = requests.post(f"{BASE_URL}/api/leaves",
                          json={"leave_type": "casual", "from_date": "2026-02-01",
                                "to_date": "2026-02-02", "reason": "TEST"},
                          headers=_h(employee_ctx["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "pending"
        TestHR.leave_id = r.json()["id"]

    def test_leave_decision_employee_forbidden(self, employee_ctx):
        r = requests.patch(f"{BASE_URL}/api/leaves/{TestHR.leave_id}",
                           json={"status": "approved"},
                           headers=_h(employee_ctx["token"]), timeout=15)
        assert r.status_code == 403

    def test_leave_decision_manager(self, manager_ctx):
        r = requests.patch(f"{BASE_URL}/api/leaves/{TestHR.leave_id}",
                           json={"status": "approved"},
                           headers=_h(manager_ctx["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "approved"


# ---------------- Tenders & Files ----------------
class TestTenders:
    tid = None
    file_path = None

    def test_create_tender(self, manager_ctx):
        r = requests.post(f"{BASE_URL}/api/tenders",
                          json={"title": "TEST_tender", "reference_no": "REF-1", "value": 100000,
                                "submission_deadline": "2026-03-15", "status": "open"},
                          headers=_h(manager_ctx["token"]), timeout=15)
        assert r.status_code == 200
        TestTenders.tid = r.json()["id"]

    def test_list_get_update(self, manager_ctx):
        r = requests.get(f"{BASE_URL}/api/tenders", headers=_h(manager_ctx["token"]), timeout=15)
        assert r.status_code == 200
        assert any(t["id"] == TestTenders.tid for t in r.json())
        r2 = requests.get(f"{BASE_URL}/api/tenders/{TestTenders.tid}",
                          headers=_h(manager_ctx["token"]), timeout=15)
        assert r2.status_code == 200
        r3 = requests.patch(f"{BASE_URL}/api/tenders/{TestTenders.tid}",
                            json={"title": "TEST_tender_upd", "status": "submitted"},
                            headers=_h(manager_ctx["token"]), timeout=15)
        assert r3.status_code == 200
        assert r3.json()["status"] == "submitted"

    def test_upload_and_download(self, manager_ctx):
        content = b"Hello Tender PDF"
        files = {"file": ("test.txt", io.BytesIO(content), "text/plain")}
        r = requests.post(f"{BASE_URL}/api/tenders/{TestTenders.tid}/upload",
                          files=files, headers=_h(manager_ctx["token"]), timeout=60)
        if r.status_code != 200:
            pytest.skip(f"Storage upload failed (integration-dependent): {r.status_code} {r.text[:200]}")
        body = r.json()
        assert body.get("file_path")
        TestTenders.file_path = body["file_path"]
        # Download
        dr = requests.get(f"{BASE_URL}/api/files/{TestTenders.file_path}",
                         headers=_h(manager_ctx["token"]), timeout=60)
        assert dr.status_code == 200
        assert dr.content == content

    def test_download_requires_auth(self):
        if not TestTenders.file_path:
            pytest.skip("no file uploaded")
        r = requests.get(f"{BASE_URL}/api/files/{TestTenders.file_path}", timeout=30)
        assert r.status_code == 401

    def test_delete_tender_employee_forbidden(self, employee_ctx):
        r = requests.delete(f"{BASE_URL}/api/tenders/{TestTenders.tid}",
                            headers=_h(employee_ctx["token"]), timeout=15)
        assert r.status_code == 403

    def test_delete_tender_admin(self, admin_ctx):
        r = requests.delete(f"{BASE_URL}/api/tenders/{TestTenders.tid}",
                            headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200


# ---------------- Dashboard ----------------
class TestDashboard:
    def test_summary(self, admin_ctx):
        r = requests.get(f"{BASE_URL}/api/dashboard/summary",
                         headers=_h(admin_ctx["token"]), timeout=15)
        assert r.status_code == 200
        body = r.json()
        for k in ["customers", "employees", "tasks_total", "tasks_open",
                  "open_tenders", "pending_leaves", "accounts_pending", "urgent_tenders"]:
            assert k in body
        assert isinstance(body["urgent_tenders"], list)
        assert isinstance(body["customers"], int)
