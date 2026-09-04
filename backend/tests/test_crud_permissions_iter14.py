"""
Iteration 14 – Backend permission verification for Customer + Employee CRUD.

Scenarios (per review request):
  1. PUT /api/customers/{cid}          – admin + manager only, employee 403
  2. DELETE /api/customers/{cid}       – admin only
  3. PATCH /api/employees/{eid}        – admin + manager, employee 403
  4. DELETE /api/employees/{eid}       – admin only (regression)
  5. Regression: POST /api/customers/quick duplicate-mobile still returns 409

Run sequentially (tests share created ids):
    pytest /app/backend/tests/test_crud_permissions_iter14.py -v -o addopts=""
"""
import os
import uuid
import pytest
import requests

BASE_URL = "http://localhost:8001"

ADMIN = (os.environ["TEST_ADMIN_EMAIL"], os.environ["TEST_ADMIN_PASSWORD"])
MANAGER = (os.environ["TEST_MANAGER_EMAIL"], os.environ["TEST_MANAGER_PASSWORD"])
EMPLOYEE = (os.environ["TEST_EMPLOYEE_EMAIL"], os.environ["TEST_EMPLOYEE_PASSWORD"])


# ---------- fixtures ----------
def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": _login(*ADMIN),
        "manager": _login(*MANAGER),
        "employee": _login(*EMPLOYEE),
    }


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _rand_mobile():
    # random 10-digit starting with 9
    return "9" + str(uuid.uuid4().int)[:9]


def _rand_pan():
    import random, string
    letters1 = "".join(random.choices(string.ascii_uppercase, k=5))
    digits = "".join(random.choices(string.digits, k=4))
    letters2 = random.choice(string.ascii_uppercase)
    return f"{letters1}{digits}{letters2}"


def _rand_aadhar():
    return "".join([str(uuid.uuid4().int)[i] for i in range(12)])


# ---------- module-level state ----------
STATE = {}


# ================================================================
# Scenario 1 – PUT /api/customers/{cid}
# ================================================================
class TestCustomerPut:
    def test_01_admin_creates_customer_A(self, tokens):
        payload = {"name": "CustCRUD-A", "mobile": "9997770001"}
        r = requests.post(f"{BASE_URL}/api/customers/quick", json=payload, headers=_h(tokens["admin"]), timeout=15)
        # If a leftover exists from previous run, delete it first
        if r.status_code == 409:
            # find it via search and delete as admin
            s = requests.get(f"{BASE_URL}/api/customers/search",
                             params={"q": "9997770001", "limit": 500},
                             headers=_h(tokens["admin"]), timeout=15)
            assert s.status_code == 200
            for c in s.json():
                if c.get("mobile") == "9997770001":
                    requests.delete(f"{BASE_URL}/api/customers/{c['id']}", headers=_h(tokens["admin"]), timeout=15)
            r = requests.post(f"{BASE_URL}/api/customers/quick", json=payload, headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200, f"quick create failed: {r.status_code} {r.text}"
        cust = r.json()
        assert cust["name"] == "CustCRUD-A"
        assert cust["mobile"] == "9997770001"
        STATE["cust_a_id"] = cust["id"]

    def test_02_admin_put_full_body_updates_address(self, tokens):
        cid = STATE["cust_a_id"]
        body = {
            "name": "CustCRUD-A-adm-upd",
            "mobile": "9997770001",
            "whatsapp": "9997770001",
            "pan": _rand_pan(),
            "aadhar": _rand_aadhar(),
            "address": "admin-updated",
        }
        r = requests.put(f"{BASE_URL}/api/customers/{cid}", json=body, headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200, f"admin PUT failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["name"] == "CustCRUD-A-adm-upd"
        assert data["address"] == "admin-updated"
        # GET confirms persistence
        g = requests.get(f"{BASE_URL}/api/customers/{cid}", headers=_h(tokens["admin"]), timeout=15)
        assert g.status_code == 200
        assert g.json()["address"] == "admin-updated"

    def test_03_manager_put_updates_name(self, tokens):
        cid = STATE["cust_a_id"]
        # Get current state and update name via full PUT
        g = requests.get(f"{BASE_URL}/api/customers/{cid}", headers=_h(tokens["manager"]), timeout=15)
        assert g.status_code == 200
        cur = g.json()
        body = {
            "name": "CustCRUD-A-mgr-upd",
            "mobile": cur.get("mobile") or "9997770001",
            "whatsapp": cur.get("whatsapp") or "9997770001",
            "pan": cur.get("pan") or _rand_pan(),
            "aadhar": cur.get("aadhar") or _rand_aadhar(),
            "address": cur.get("address") or "",
        }
        r = requests.put(f"{BASE_URL}/api/customers/{cid}", json=body, headers=_h(tokens["manager"]), timeout=15)
        assert r.status_code == 200, f"manager PUT failed: {r.status_code} {r.text}"
        assert r.json()["name"] == "CustCRUD-A-mgr-upd"

    def test_04_employee_put_forbidden(self, tokens):
        cid = STATE["cust_a_id"]
        body = {
            "name": "hack",
            "mobile": "9997770001",
            "whatsapp": "9997770001",
            "pan": _rand_pan(),
            "aadhar": _rand_aadhar(),
        }
        r = requests.put(f"{BASE_URL}/api/customers/{cid}", json=body, headers=_h(tokens["employee"]), timeout=15)
        assert r.status_code == 403, f"employee PUT should 403, got {r.status_code}: {r.text}"

    def test_05_admin_put_invalid_cid_404(self, tokens):
        body = {
            "name": "x",
            "mobile": _rand_mobile(),
            "whatsapp": _rand_mobile(),
            "pan": _rand_pan(),
            "aadhar": _rand_aadhar(),
        }
        r = requests.put(f"{BASE_URL}/api/customers/does-not-exist-{uuid.uuid4().hex}",
                         json=body, headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"

    def test_06_cleanup_cust_a(self, tokens):
        cid = STATE.get("cust_a_id")
        if cid:
            requests.delete(f"{BASE_URL}/api/customers/{cid}", headers=_h(tokens["admin"]), timeout=15)


# ================================================================
# Scenario 2 – DELETE /api/customers/{cid} (admin only)
# ================================================================
class TestCustomerDelete:
    def test_01_admin_creates_customer_B(self, tokens):
        payload = {"name": "CustCRUD-B", "mobile": "9997770002"}
        r = requests.post(f"{BASE_URL}/api/customers/quick", json=payload, headers=_h(tokens["admin"]), timeout=15)
        if r.status_code == 409:
            s = requests.get(f"{BASE_URL}/api/customers/search",
                             params={"q": "9997770002", "limit": 500},
                             headers=_h(tokens["admin"]), timeout=15)
            for c in s.json():
                if c.get("mobile") == "9997770002":
                    requests.delete(f"{BASE_URL}/api/customers/{c['id']}", headers=_h(tokens["admin"]), timeout=15)
            r = requests.post(f"{BASE_URL}/api/customers/quick", json=payload, headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200, f"quick create failed: {r.status_code} {r.text}"
        STATE["cust_b_id"] = r.json()["id"]

    def test_02_manager_delete_forbidden(self, tokens):
        cid = STATE["cust_b_id"]
        r = requests.delete(f"{BASE_URL}/api/customers/{cid}", headers=_h(tokens["manager"]), timeout=15)
        assert r.status_code == 403, f"manager DELETE should 403, got {r.status_code}: {r.text}"
        # still exists
        g = requests.get(f"{BASE_URL}/api/customers/{cid}", headers=_h(tokens["admin"]), timeout=15)
        assert g.status_code == 200

    def test_03_employee_delete_forbidden(self, tokens):
        cid = STATE["cust_b_id"]
        r = requests.delete(f"{BASE_URL}/api/customers/{cid}", headers=_h(tokens["employee"]), timeout=15)
        assert r.status_code == 403, f"employee DELETE should 403, got {r.status_code}: {r.text}"

    def test_04_admin_delete_ok(self, tokens):
        cid = STATE["cust_b_id"]
        r = requests.delete(f"{BASE_URL}/api/customers/{cid}", headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200, f"admin DELETE failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("deleted") == 1, f"expected deleted:1, got {body}"
        # GET now 404
        g = requests.get(f"{BASE_URL}/api/customers/{cid}", headers=_h(tokens["admin"]), timeout=15)
        assert g.status_code == 404


# ================================================================
# Scenario 3 – PATCH /api/employees/{eid}
# ================================================================
class TestEmployeePatch:
    def test_01_pick_existing_employee(self, tokens):
        r = requests.get(f"{BASE_URL}/api/employees", headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200, f"list employees failed: {r.status_code} {r.text}"
        emps = r.json()
        assert len(emps) > 0, "no employees to patch"
        first = emps[0]
        STATE["emp_id"] = first["id"]
        STATE["emp_orig_name"] = first.get("name")
        STATE["emp_orig_designation"] = first.get("designation")

    def test_02_admin_patch_name(self, tokens):
        eid = STATE["emp_id"]
        r = requests.patch(f"{BASE_URL}/api/employees/{eid}",
                           json={"name": "EmpEditTest-Admin"},
                           headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200, f"admin PATCH failed: {r.status_code} {r.text}"
        assert r.json()["name"] == "EmpEditTest-Admin"
        # verify via GET
        g = requests.get(f"{BASE_URL}/api/employees/{eid}", headers=_h(tokens["admin"]), timeout=15)
        assert g.status_code == 200 and g.json()["name"] == "EmpEditTest-Admin"

    def test_03_manager_patch_name_and_designation(self, tokens):
        eid = STATE["emp_id"]
        r = requests.patch(f"{BASE_URL}/api/employees/{eid}",
                           json={"name": "EmpEditTest-Mgr", "designation": "Test Desig"},
                           headers=_h(tokens["manager"]), timeout=15)
        assert r.status_code == 200, f"manager PATCH failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["name"] == "EmpEditTest-Mgr"
        assert data["designation"] == "Test Desig"

    def test_04_employee_patch_forbidden(self, tokens):
        eid = STATE["emp_id"]
        r = requests.patch(f"{BASE_URL}/api/employees/{eid}",
                           json={"name": "hack"},
                           headers=_h(tokens["employee"]), timeout=15)
        assert r.status_code == 403, f"employee PATCH should 403, got {r.status_code}: {r.text}"

    def test_05_restore_original(self, tokens):
        eid = STATE["emp_id"]
        restore = {}
        if STATE.get("emp_orig_name"):
            restore["name"] = STATE["emp_orig_name"]
        if STATE.get("emp_orig_designation") is not None:
            restore["designation"] = STATE["emp_orig_designation"] or ""
        if restore:
            r = requests.patch(f"{BASE_URL}/api/employees/{eid}", json=restore,
                               headers=_h(tokens["admin"]), timeout=15)
            assert r.status_code == 200
            if restore.get("name"):
                assert r.json()["name"] == restore["name"]


# ================================================================
# Scenario 4 – DELETE /api/employees/{eid} (admin only)
# ================================================================
class TestEmployeeDelete:
    def test_01_create_fresh_employee(self, tokens):
        payload = {
            "name": "EmpDelTest",
            "email": f"empdeltest-{uuid.uuid4().hex[:6]}@t.com",
            "mobile": "9997770003",
            "role": "employee",
        }
        r = requests.post(f"{BASE_URL}/api/employees", json=payload,
                          headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200, f"create employee failed: {r.status_code} {r.text}"
        STATE["emp_del_id"] = r.json()["id"]

    def test_02_manager_delete_forbidden(self, tokens):
        eid = STATE["emp_del_id"]
        r = requests.delete(f"{BASE_URL}/api/employees/{eid}", headers=_h(tokens["manager"]), timeout=15)
        assert r.status_code == 403, f"manager DELETE should 403, got {r.status_code}: {r.text}"

    def test_03_employee_delete_forbidden(self, tokens):
        eid = STATE["emp_del_id"]
        r = requests.delete(f"{BASE_URL}/api/employees/{eid}", headers=_h(tokens["employee"]), timeout=15)
        assert r.status_code == 403, f"employee DELETE should 403, got {r.status_code}: {r.text}"

    def test_04_admin_delete_ok(self, tokens):
        eid = STATE["emp_del_id"]
        r = requests.delete(f"{BASE_URL}/api/employees/{eid}", headers=_h(tokens["admin"]), timeout=15)
        assert r.status_code == 200, f"admin DELETE failed: {r.status_code} {r.text}"
        assert r.json().get("deleted") == 1
        g = requests.get(f"{BASE_URL}/api/employees/{eid}", headers=_h(tokens["admin"]), timeout=15)
        assert g.status_code == 404


# ================================================================
# Scenario 5 – Regression: /api/customers/quick duplicate-mobile 409
# ================================================================
class TestQuickDuplicateRegression:
    def test_01_create_and_duplicate_admin(self, tokens):
        mobile = _rand_mobile()
        payload = {"name": f"DupReg-{uuid.uuid4().hex[:5]}", "mobile": mobile}
        r1 = requests.post(f"{BASE_URL}/api/customers/quick", json=payload,
                           headers=_h(tokens["admin"]), timeout=15)
        assert r1.status_code == 200, f"initial create failed: {r1.status_code} {r1.text}"
        cid = r1.json()["id"]
        STATE.setdefault("cleanup_ids", []).append(cid)

        # duplicate with admin
        r2 = requests.post(f"{BASE_URL}/api/customers/quick",
                           json={"name": "DupReg-dup", "mobile": mobile},
                           headers=_h(tokens["admin"]), timeout=15)
        assert r2.status_code == 409, f"admin duplicate should 409, got {r2.status_code}: {r2.text}"

        # duplicate with manager
        r3 = requests.post(f"{BASE_URL}/api/customers/quick",
                           json={"name": "DupReg-dup-mgr", "mobile": mobile},
                           headers=_h(tokens["manager"]), timeout=15)
        assert r3.status_code == 409, f"manager duplicate should 409, got {r3.status_code}: {r3.text}"

        # duplicate with employee
        r4 = requests.post(f"{BASE_URL}/api/customers/quick",
                           json={"name": "DupReg-dup-emp", "mobile": mobile},
                           headers=_h(tokens["employee"]), timeout=15)
        assert r4.status_code == 409, f"employee duplicate should 409, got {r4.status_code}: {r4.text}"

    def test_99_cleanup(self, tokens):
        for cid in STATE.get("cleanup_ids", []):
            requests.delete(f"{BASE_URL}/api/customers/{cid}", headers=_h(tokens["admin"]), timeout=15)
