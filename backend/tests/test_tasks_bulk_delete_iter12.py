"""
Iteration-12 backend regression tests — Task Edit / Delete / Bulk-Delete with role permissions.

Scenarios covered (matches review_request):
  1) PATCH /api/tasks/{tid} — admin+manager allowed, employee 403, invalid 404
  2) DELETE /api/tasks/{tid} — admin only (manager/employee 403)
  3) POST /api/tasks/bulk-delete — admin only, empty/nonexistent ids no-op
  4) Route ordering sanity (bulk-delete must not collide with /{tid}/attachments)
"""
import os
import pytest
import requests

BASE_URL = "https://hr-tender-hub.preview.emergentagent.com"

ADMIN = {"email": "admin@triveni.com", "password": "Admin@123"}
MANAGER = {"email": "manager@triveni.com", "password": "Manager@123"}
EMPLOYEE = {"email": "employee@triveni.com", "password": "Employee@123"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    return body["session_token"], body["user"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def admin_token():
    tok, _ = _login(ADMIN)
    return tok


@pytest.fixture(scope="module")
def manager_token():
    tok, _ = _login(MANAGER)
    return tok


@pytest.fixture(scope="module")
def employee_token():
    tok, _ = _login(EMPLOYEE)
    return tok


def _create_task(admin_token, title):
    r = requests.post(
        f"{BASE_URL}/api/tasks",
        json={"title": title},
        headers=_h(admin_token),
        timeout=15,
    )
    assert r.status_code == 200, f"create task failed: {r.status_code} {r.text}"
    return r.json()


def _get_task(admin_token, tid):
    return requests.get(f"{BASE_URL}/api/tasks/{tid}", headers=_h(admin_token), timeout=15)


# --------------- Scenario 1: PATCH /api/tasks/{tid} ---------------
class TestTaskPatchPermissions:
    """PATCH allowed for admin+manager, forbidden for employee. Invalid id → 404."""

    task_id = None

    def test_1a_create_task_as_admin(self, admin_token):
        t = _create_task(admin_token, "BulkTest-Iter12-A")
        assert t.get("title") == "BulkTest-Iter12-A"
        assert t.get("id")
        assert t.get("task_no")
        TestTaskPatchPermissions.task_id = t["id"]

    def test_1b_patch_as_admin(self, admin_token):
        tid = TestTaskPatchPermissions.task_id
        r = requests.patch(
            f"{BASE_URL}/api/tasks/{tid}",
            json={"title": "BulkTest-Iter12-A-updated"},
            headers=_h(admin_token), timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("title") == "BulkTest-Iter12-A-updated"

    def test_1c_patch_as_manager(self, manager_token, admin_token):
        tid = TestTaskPatchPermissions.task_id
        r = requests.patch(
            f"{BASE_URL}/api/tasks/{tid}",
            json={"title": "BulkTest-Iter12-A-manager"},
            headers=_h(manager_token), timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("title") == "BulkTest-Iter12-A-manager"
        # confirm via GET
        g = _get_task(admin_token, tid)
        assert g.status_code == 200
        assert g.json().get("title") == "BulkTest-Iter12-A-manager"

    def test_1d_patch_as_employee_forbidden(self, employee_token, admin_token):
        tid = TestTaskPatchPermissions.task_id
        r = requests.patch(
            f"{BASE_URL}/api/tasks/{tid}",
            json={"title": "BulkTest-Iter12-A-employee"},
            headers=_h(employee_token), timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"
        # confirm title unchanged
        g = _get_task(admin_token, tid)
        assert g.status_code == 200
        assert g.json().get("title") == "BulkTest-Iter12-A-manager"

    def test_1e_patch_invalid_tid_404(self, admin_token):
        r = requests.patch(
            f"{BASE_URL}/api/tasks/nonexistent_iter12_id",
            json={"title": "does not matter"},
            headers=_h(admin_token), timeout=15,
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"

    def test_1f_cleanup(self, admin_token):
        tid = TestTaskPatchPermissions.task_id
        if tid:
            requests.delete(f"{BASE_URL}/api/tasks/{tid}", headers=_h(admin_token), timeout=15)


# --------------- Scenario 2: DELETE /api/tasks/{tid} ---------------
class TestTaskDeletePermissions:
    """DELETE allowed only for admin. Manager/employee → 403."""

    task_id = None

    def test_2a_create_task_as_admin(self, admin_token):
        t = _create_task(admin_token, "BulkTest-Iter12-B")
        TestTaskDeletePermissions.task_id = t["id"]
        assert TestTaskDeletePermissions.task_id

    def test_2b_delete_as_manager_forbidden(self, manager_token, admin_token):
        tid = TestTaskDeletePermissions.task_id
        r = requests.delete(f"{BASE_URL}/api/tasks/{tid}", headers=_h(manager_token), timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"
        g = _get_task(admin_token, tid)
        assert g.status_code == 200, "task should still exist"

    def test_2c_delete_as_employee_forbidden(self, employee_token, admin_token):
        tid = TestTaskDeletePermissions.task_id
        r = requests.delete(f"{BASE_URL}/api/tasks/{tid}", headers=_h(employee_token), timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"
        g = _get_task(admin_token, tid)
        assert g.status_code == 200

    def test_2d_delete_as_admin_ok(self, admin_token):
        tid = TestTaskDeletePermissions.task_id
        r = requests.delete(f"{BASE_URL}/api/tasks/{tid}", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("deleted") == 1, f"expected deleted:1, got {body}"
        g = _get_task(admin_token, tid)
        assert g.status_code == 404


# --------------- Scenario 3: POST /api/tasks/bulk-delete ---------------
class TestTaskBulkDelete:
    """Bulk-delete admin-only. Manager/employee 403. Empty/nonexistent ids no-op."""

    ids = {"c1": None, "c2": None, "c3": None}

    def test_3a_create_three_tasks(self, admin_token):
        for k, title in [("c1", "BulkTest-C1"), ("c2", "BulkTest-C2"), ("c3", "BulkTest-C3")]:
            t = _create_task(admin_token, title)
            TestTaskBulkDelete.ids[k] = t["id"]
            assert t["id"]

    def test_3b_bulk_delete_as_manager_forbidden(self, manager_token, admin_token):
        payload = {"ids": [TestTaskBulkDelete.ids["c1"], TestTaskBulkDelete.ids["c2"]]}
        r = requests.post(
            f"{BASE_URL}/api/tasks/bulk-delete",
            json=payload, headers=_h(manager_token), timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"
        # verify all 3 still exist
        for k in ("c1", "c2", "c3"):
            g = _get_task(admin_token, TestTaskBulkDelete.ids[k])
            assert g.status_code == 200, f"{k} should still exist"

    def test_3c_bulk_delete_as_employee_forbidden(self, employee_token, admin_token):
        payload = {"ids": [TestTaskBulkDelete.ids["c1"], TestTaskBulkDelete.ids["c2"]]}
        r = requests.post(
            f"{BASE_URL}/api/tasks/bulk-delete",
            json=payload, headers=_h(employee_token), timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"
        for k in ("c1", "c2", "c3"):
            g = _get_task(admin_token, TestTaskBulkDelete.ids[k])
            assert g.status_code == 200

    def test_3d_bulk_delete_as_admin_ok(self, admin_token):
        payload = {"ids": [TestTaskBulkDelete.ids["c1"], TestTaskBulkDelete.ids["c2"]]}
        r = requests.post(
            f"{BASE_URL}/api/tasks/bulk-delete",
            json=payload, headers=_h(admin_token), timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("deleted") == 2, r.text
        # c1 & c2 gone, c3 remains
        assert _get_task(admin_token, TestTaskBulkDelete.ids["c1"]).status_code == 404
        assert _get_task(admin_token, TestTaskBulkDelete.ids["c2"]).status_code == 404
        assert _get_task(admin_token, TestTaskBulkDelete.ids["c3"]).status_code == 200

    def test_3e_bulk_delete_empty_ids(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/tasks/bulk-delete",
            json={"ids": []}, headers=_h(admin_token), timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("deleted") == 0

    def test_3f_bulk_delete_nonexistent_ids(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/tasks/bulk-delete",
            json={"ids": ["nonexistent_1", "nonexistent_2"]},
            headers=_h(admin_token), timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("deleted") == 0

    def test_3g_cleanup_c3(self, admin_token):
        tid = TestTaskBulkDelete.ids["c3"]
        r = requests.delete(f"{BASE_URL}/api/tasks/{tid}", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json().get("deleted") == 1


# --------------- Scenario 4: Route ordering sanity ---------------
class TestRouteOrdering:
    """bulk-delete route registered before /{tid} — must not be shadowed."""

    def test_4a_bulk_delete_route_reachable(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/tasks/bulk-delete",
            json={"ids": []}, headers=_h(admin_token), timeout=15,
        )
        # Must NOT be 404 (route not found) or 405 (method mismatch on /{tid})
        assert r.status_code == 200, f"route ordering broken: {r.status_code} {r.text}"
        body = r.json()
        assert body == {"deleted": 0}, body
