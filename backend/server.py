import os
import uuid
import logging
import secrets
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional

import bcrypt
import httpx
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, UploadFile, File, Form
from fastapi.responses import Response
from fastapi.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
from pydantic import BaseModel, Field, EmailStr
from starlette.middleware.cors import CORSMiddleware


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ============ MongoDB ============
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ============ Object Storage ============
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "triveni-business-manager"
_storage_key: Optional[str] = None


def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    global _storage_key
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 503:
        _storage_key = None
        key = init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ============ App ============
app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ============ Models ============
class User(BaseModel):
    user_id: str
    email: EmailStr
    name: str
    role: str = "employee"  # admin, manager, employee
    picture: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class SignupInput(BaseModel):
    email: EmailStr
    name: str
    password: str
    role: str = "employee"


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class SessionExchangeInput(BaseModel):
    session_id: str


class AuthResponse(BaseModel):
    session_token: str
    user: User


class Customer(BaseModel):
    id: str = Field(default_factory=lambda: new_id("cus"))
    customer_code: Optional[str] = None  # auto TRV-CUST-0001

    # Basic (mandatory: name, mobile, whatsapp, pan, aadhar)
    name: str  # Contractor name
    address: Optional[str] = None
    mobile: str
    whatsapp: str
    email: Optional[str] = None
    pan: str
    aadhar: str

    # eproc2
    eproc2_user_id: Optional[str] = None
    eproc2_password: Optional[str] = None
    eproc2_email: Optional[str] = None

    # Railway
    railway_user_id: Optional[str] = None
    railway_password: Optional[str] = None
    railway_email: Optional[str] = None

    # CPP
    cpp_user_id: Optional[str] = None
    cpp_password: Optional[str] = None
    cpp_email: Optional[str] = None

    # GST
    gst_no: Optional[str] = None
    gst_password: Optional[str] = None
    gst_email: Optional[str] = None

    # EPFO
    epfo_user_id: Optional[str] = None
    epfo_password: Optional[str] = None
    epfo_email: Optional[str] = None

    # Other portal
    other_portal_user_id: Optional[str] = None
    other_portal_password: Optional[str] = None
    other_portal_email: Optional[str] = None

    # Digital Signature
    dsc_serial_no: Optional[str] = None
    dsc_issued_date: Optional[str] = None
    dsc_expired_date: Optional[str] = None

    # ISO
    iso_user_id: Optional[str] = None
    iso_password: Optional[str] = None

    # GEM
    gem_user_id: Optional[str] = None
    gem_password: Optional[str] = None
    gem_email: Optional[str] = None

    # PMGSY
    pmgsy_user_id: Optional[str] = None
    pmgsy_password: Optional[str] = None
    pmgsy_email: Optional[str] = None

    notes: Optional[str] = None
    attachments: List[dict] = Field(default_factory=list)  # [{path,name,size,content_type,uploaded_at}]
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class CustomerInput(BaseModel):
    name: str
    address: Optional[str] = None
    mobile: str
    whatsapp: str
    email: Optional[str] = None
    pan: str
    aadhar: str
    eproc2_user_id: Optional[str] = None
    eproc2_password: Optional[str] = None
    eproc2_email: Optional[str] = None
    railway_user_id: Optional[str] = None
    railway_password: Optional[str] = None
    railway_email: Optional[str] = None
    cpp_user_id: Optional[str] = None
    cpp_password: Optional[str] = None
    cpp_email: Optional[str] = None
    gst_no: Optional[str] = None
    gst_password: Optional[str] = None
    gst_email: Optional[str] = None
    epfo_user_id: Optional[str] = None
    epfo_password: Optional[str] = None
    epfo_email: Optional[str] = None
    other_portal_user_id: Optional[str] = None
    other_portal_password: Optional[str] = None
    other_portal_email: Optional[str] = None
    dsc_serial_no: Optional[str] = None
    dsc_issued_date: Optional[str] = None
    dsc_expired_date: Optional[str] = None
    iso_user_id: Optional[str] = None
    iso_password: Optional[str] = None
    gem_user_id: Optional[str] = None
    gem_password: Optional[str] = None
    gem_email: Optional[str] = None
    pmgsy_user_id: Optional[str] = None
    pmgsy_password: Optional[str] = None
    pmgsy_email: Optional[str] = None
    notes: Optional[str] = None


class Employee(BaseModel):
    id: str = Field(default_factory=lambda: new_id("emp"))
    employee_code: Optional[str] = None  # TDSC{seq}{DDMMYYYY}

    # Basic
    name: str
    address: Optional[str] = None
    mobile: Optional[str] = None
    emergency_mobile: Optional[str] = None
    email: str
    photo_path: Optional[str] = None
    pan: Optional[str] = None
    aadhar: Optional[str] = None
    date_of_joining: Optional[str] = None  # DD-MM-YYYY or YYYY-MM-DD
    date_of_birth: Optional[str] = None

    # Bank
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_name: Optional[str] = None
    account_holder_name: Optional[str] = None

    # Employment
    designation: Optional[str] = None
    posting_branch: Optional[str] = None
    role: str = "employee"
    epfo_no: Optional[str] = None
    esic_no: Optional[str] = None

    # Salary components
    pay: Optional[float] = 0
    da: Optional[float] = 0
    hra: Optional[float] = 0
    ma: Optional[float] = 0
    ta: Optional[float] = 0
    other1: Optional[float] = 0
    other2: Optional[float] = 0
    gross_amount: Optional[float] = 0

    # Deductions
    ded_epfo: Optional[float] = 0
    ded_esic: Optional[float] = 0
    ded_advance: Optional[float] = 0
    ded_advance_installments: Optional[str] = None
    ded_other: Optional[float] = 0
    net_total: Optional[float] = 0

    salary: Optional[float] = None  # backward-compat kept
    created_at: datetime = Field(default_factory=now_utc)


class EmployeeInput(BaseModel):
    name: str
    address: Optional[str] = None
    mobile: Optional[str] = None
    emergency_mobile: Optional[str] = None
    email: EmailStr
    pan: Optional[str] = None
    aadhar: Optional[str] = None
    date_of_joining: Optional[str] = None
    date_of_birth: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_name: Optional[str] = None
    account_holder_name: Optional[str] = None
    designation: Optional[str] = None
    posting_branch: Optional[str] = None
    role: str = "employee"
    epfo_no: Optional[str] = None
    esic_no: Optional[str] = None
    pay: Optional[float] = 0
    da: Optional[float] = 0
    hra: Optional[float] = 0
    ma: Optional[float] = 0
    ta: Optional[float] = 0
    other1: Optional[float] = 0
    other2: Optional[float] = 0
    ded_epfo: Optional[float] = 0
    ded_esic: Optional[float] = 0
    ded_advance: Optional[float] = 0
    ded_advance_installments: Optional[str] = None
    ded_other: Optional[float] = 0


class Task(BaseModel):
    id: str = Field(default_factory=lambda: new_id("tsk"))
    title: str
    description: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    priority: str = "medium"  # low, medium, high
    status: str = "todo"  # todo, doing, done
    due_date: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class TaskInput(BaseModel):
    title: str
    description: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    priority: str = "medium"
    status: str = "todo"
    due_date: Optional[str] = None


class TaskUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None


class AccountEntry(BaseModel):
    id: str = Field(default_factory=lambda: new_id("acc"))
    type: str  # invoice, expense
    title: str
    party: Optional[str] = None  # customer/vendor
    amount: float
    status: str = "pending"  # pending, paid
    date: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class AccountInput(BaseModel):
    type: str
    title: str
    party: Optional[str] = None
    amount: float
    status: str = "pending"
    date: Optional[str] = None
    notes: Optional[str] = None


class Attendance(BaseModel):
    id: str = Field(default_factory=lambda: new_id("att"))
    user_id: str
    user_name: str
    date: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    status: str = "present"  # present, absent, half-day
    created_at: datetime = Field(default_factory=now_utc)


class AttendanceInput(BaseModel):
    date: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    status: str = "present"


class LeaveRequest(BaseModel):
    id: str = Field(default_factory=lambda: new_id("lv"))
    user_id: str
    user_name: str
    leave_type: str  # casual, sick, earned
    from_date: str
    to_date: str
    reason: Optional[str] = None
    status: str = "pending"  # pending, approved, rejected
    created_at: datetime = Field(default_factory=now_utc)


class LeaveInput(BaseModel):
    leave_type: str
    from_date: str
    to_date: str
    reason: Optional[str] = None


class LeaveDecision(BaseModel):
    status: str  # approved or rejected


class Tender(BaseModel):
    id: str = Field(default_factory=lambda: new_id("tnd"))
    title: str
    reference_no: Optional[str] = None
    department: Optional[str] = None
    value: Optional[float] = None
    submission_deadline: Optional[str] = None
    status: str = "open"  # open, submitted, awarded, lost
    description: Optional[str] = None
    file_path: Optional[str] = None
    file_name: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class TenderInput(BaseModel):
    title: str
    reference_no: Optional[str] = None
    department: Optional[str] = None
    value: Optional[float] = None
    submission_deadline: Optional[str] = None
    status: str = "open"
    description: Optional[str] = None


# ============ Auth ============
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_session_token() -> str:
    return secrets.token_urlsafe(48)


async def create_session(user_id: str) -> str:
    token = make_session_token()
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(days=7),
    })
    return token


async def get_current_user(authorization: Optional[str] = Header(None)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session.get("expires_at")
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")
    user_doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    return User(**user_doc)


async def require_admin(current: User = Depends(get_current_user)) -> User:
    if current.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current


async def require_admin_or_manager(current: User = Depends(get_current_user)) -> User:
    if current.role not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Manager or admin access required")
    return current


# ============ Auth routes ============
@api_router.post("/auth/signup", response_model=AuthResponse)
async def signup(payload: SignupInput):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        user_id=new_id("usr"),
        email=payload.email.lower(),
        name=payload.name,
        role=payload.role if payload.role in ("admin", "manager", "employee") else "employee",
    )
    doc = user.dict()
    doc["password_hash"] = hash_password(payload.password)
    await db.users.insert_one(doc)
    token = await create_session(user.user_id)
    return AuthResponse(session_token=token, user=user)


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(payload: LoginInput):
    doc = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if not doc or not doc.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(payload.password, doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    doc.pop("password_hash", None)
    user = User(**doc)
    token = await create_session(user.user_id)
    return AuthResponse(session_token=token, user=user)


@api_router.post("/auth/session", response_model=AuthResponse)
async def exchange_session(payload: SessionExchangeInput):
    async with httpx.AsyncClient(timeout=30) as hx:
        r = await hx.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": payload.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    email = (data.get("email") or "").lower()
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    session_token = data.get("session_token") or make_session_token()

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        existing.pop("password_hash", None)
        user = User(**{**existing, "name": name, "picture": picture})
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
    else:
        user = User(user_id=new_id("usr"), email=email, name=name, picture=picture, role="employee")
        await db.users.insert_one(user.dict())

    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user.user_id,
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(days=7),
    })
    return AuthResponse(session_token=session_token, user=user)


@api_router.get("/auth/me", response_model=User)
async def me(current: User = Depends(get_current_user)):
    return current


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ============ Customers ============
@api_router.post("/customers", response_model=Customer)
async def create_customer(payload: CustomerInput, current: User = Depends(get_current_user)):
    # Validate mandatory fields (Pydantic already enforces presence; also block empty strings)
    missing = []
    for k in ("name", "mobile", "whatsapp", "pan", "aadhar"):
        if not (getattr(payload, k) or "").strip():
            missing.append(k)
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing mandatory: {', '.join(missing)}")

    # Atomically increment counter to build unique customer_code like TRV-CUST-0001
    counter = await db.counters.find_one_and_update(
        {"_id": "customer_code"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    seq = (counter or {}).get("seq") or 1
    code = f"TRV-CUST-{seq:04d}"

    c = Customer(**payload.dict(), customer_code=code, created_by=current.user_id)
    await db.customers.insert_one(c.dict())
    return c


@api_router.get("/customers", response_model=List[Customer])
async def list_customers(current: User = Depends(get_current_user)):
    docs = await db.customers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Customer(**d) for d in docs]


@api_router.get("/customers/{cid}", response_model=Customer)
async def get_customer(cid: str, current: User = Depends(get_current_user)):
    d = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return Customer(**d)


@api_router.put("/customers/{cid}", response_model=Customer)
async def update_customer(cid: str, payload: CustomerInput, current: User = Depends(get_current_user)):
    await db.customers.update_one({"id": cid}, {"$set": payload.dict()})
    d = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return Customer(**d)


@api_router.delete("/customers/{cid}")
async def delete_customer(cid: str, current: User = Depends(require_admin_or_manager)):
    res = await db.customers.delete_one({"id": cid})
    return {"deleted": res.deleted_count}


MAX_CUSTOMER_FILE_BYTES = 10 * 1024 * 1024  # 10 MB


@api_router.post("/customers/{cid}/attachments", response_model=Customer)
async def upload_customer_file(cid: str, file: UploadFile = File(...), current: User = Depends(get_current_user)):
    cust = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    data = await file.read()
    if len(data) > MAX_CUSTOMER_FILE_BYTES:
        raise HTTPException(status_code=400, detail=f"File exceeds 10 MB limit ({len(data) // 1024} KB)")
    ext = (file.filename or "file").rsplit(".", 1)[-1].lower()
    ext = ext if len(ext) <= 8 else "bin"
    path = f"{APP_NAME}/uploads/{current.user_id}/{uuid.uuid4().hex}.{ext}"
    content_type = file.content_type or "application/octet-stream"
    await run_in_threadpool(put_object, path, data, content_type)
    attachment = {
        "path": path,
        "name": file.filename or f"file.{ext}",
        "size": len(data),
        "content_type": content_type,
        "uploaded_at": now_utc().isoformat(),
        "uploaded_by": current.user_id,
    }
    await db.customers.update_one({"id": cid}, {"$push": {"attachments": attachment}})
    updated = await db.customers.find_one({"id": cid}, {"_id": 0})
    return Customer(**updated)


@api_router.delete("/customers/{cid}/attachments", response_model=Customer)
async def delete_customer_attachment(cid: str, path: str, current: User = Depends(get_current_user)):
    cust = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    await db.customers.update_one({"id": cid}, {"$pull": {"attachments": {"path": path}}})
    updated = await db.customers.find_one({"id": cid}, {"_id": 0})
    return Customer(**updated)


# ============ Employees ============
def _ddmmyyyy(date_str: Optional[str]) -> str:
    if not date_str:
        return datetime.now().strftime("%d%m%Y")
    s = date_str.strip()
    # accept YYYY-MM-DD or DD-MM-YYYY or DD/MM/YYYY
    for sep in ("-", "/"):
        parts = s.split(sep)
        if len(parts) == 3:
            if len(parts[0]) == 4:  # YYYY-MM-DD
                return f"{parts[2].zfill(2)}{parts[1].zfill(2)}{parts[0]}"
            else:  # DD-MM-YYYY
                return f"{parts[0].zfill(2)}{parts[1].zfill(2)}{parts[2].zfill(4)}"
    return datetime.now().strftime("%d%m%Y")


def _compute_salary(d: dict) -> dict:
    def f(k):
        try: return float(d.get(k) or 0)
        except: return 0.0
    gross = f("pay") + f("da") + f("hra") + f("ma") + f("ta") + f("other1") + f("other2")
    ded = f("ded_epfo") + f("ded_esic") + f("ded_advance") + f("ded_other")
    d["gross_amount"] = round(gross, 2)
    d["net_total"] = round(gross - ded, 2)
    return d


@api_router.post("/employees", response_model=Employee)
async def create_employee(payload: EmployeeInput, current: User = Depends(require_admin_or_manager)):
    data = payload.dict()
    counter = await db.counters.find_one_and_update(
        {"_id": "employee_code"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    seq = (counter or {}).get("seq") or 1
    ddmmyyyy = _ddmmyyyy(data.get("date_of_joining"))
    code = f"TDSC{seq:02d}{ddmmyyyy}"
    data = _compute_salary(data)
    e = Employee(**data, employee_code=code)
    await db.employees.insert_one(e.dict())
    return e


@api_router.get("/employees", response_model=List[Employee])
async def list_employees(current: User = Depends(get_current_user)):
    docs = await db.employees.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Employee(**d) for d in docs]


@api_router.get("/employees/{eid}", response_model=Employee)
async def get_employee(eid: str, current: User = Depends(get_current_user)):
    d = await db.employees.find_one({"id": eid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return Employee(**d)


@api_router.delete("/employees/{eid}")
async def delete_employee(eid: str, current: User = Depends(require_admin)):
    res = await db.employees.delete_one({"id": eid})
    return {"deleted": res.deleted_count}


@api_router.post("/employees/{eid}/photo", response_model=Employee)
async def upload_employee_photo(eid: str, file: UploadFile = File(...), current: User = Depends(require_admin_or_manager)):
    emp = await db.employees.find_one({"id": eid}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Photo exceeds 10 MB limit")
    ext = (file.filename or "img").rsplit(".", 1)[-1].lower()
    ext = ext if len(ext) <= 8 else "jpg"
    path = f"{APP_NAME}/uploads/{current.user_id}/{uuid.uuid4().hex}.{ext}"
    content_type = file.content_type or "image/jpeg"
    await run_in_threadpool(put_object, path, data, content_type)
    await db.employees.update_one({"id": eid}, {"$set": {"photo_path": path}})
    updated = await db.employees.find_one({"id": eid}, {"_id": 0})
    return Employee(**updated)


# ============ Tasks ============
@api_router.post("/tasks", response_model=Task)
async def create_task(payload: TaskInput, current: User = Depends(get_current_user)):
    t = Task(**payload.dict(), created_by=current.user_id)
    await db.tasks.insert_one(t.dict())
    return t


@api_router.get("/tasks", response_model=List[Task])
async def list_tasks(mine: bool = False, current: User = Depends(get_current_user)):
    q = {}
    if mine or current.role == "employee":
        q = {"assignee_id": current.user_id}
    docs = await db.tasks.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Task(**d) for d in docs]


@api_router.patch("/tasks/{tid}", response_model=Task)
async def update_task(tid: str, payload: TaskUpdate, current: User = Depends(get_current_user)):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if updates:
        await db.tasks.update_one({"id": tid}, {"$set": updates})
    d = await db.tasks.find_one({"id": tid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return Task(**d)


@api_router.delete("/tasks/{tid}")
async def delete_task(tid: str, current: User = Depends(require_admin_or_manager)):
    res = await db.tasks.delete_one({"id": tid})
    return {"deleted": res.deleted_count}


# ============ Accounts ============
@api_router.post("/accounts", response_model=AccountEntry)
async def create_account(payload: AccountInput, current: User = Depends(require_admin_or_manager)):
    a = AccountEntry(**payload.dict(), created_by=current.user_id)
    await db.accounts.insert_one(a.dict())
    return a


@api_router.get("/accounts", response_model=List[AccountEntry])
async def list_accounts(current: User = Depends(get_current_user)):
    docs = await db.accounts.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [AccountEntry(**d) for d in docs]


@api_router.patch("/accounts/{aid}", response_model=AccountEntry)
async def update_account(aid: str, payload: AccountInput, current: User = Depends(require_admin_or_manager)):
    await db.accounts.update_one({"id": aid}, {"$set": payload.dict()})
    d = await db.accounts.find_one({"id": aid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return AccountEntry(**d)


@api_router.delete("/accounts/{aid}")
async def delete_account(aid: str, current: User = Depends(require_admin)):
    res = await db.accounts.delete_one({"id": aid})
    return {"deleted": res.deleted_count}


# ============ HR: Attendance ============
@api_router.post("/attendance", response_model=Attendance)
async def mark_attendance(payload: AttendanceInput, current: User = Depends(get_current_user)):
    existing = await db.attendance.find_one({"user_id": current.user_id, "date": payload.date}, {"_id": 0})
    if existing:
        await db.attendance.update_one({"id": existing["id"]}, {"$set": payload.dict()})
        d = await db.attendance.find_one({"id": existing["id"]}, {"_id": 0})
        return Attendance(**d)
    a = Attendance(**payload.dict(), user_id=current.user_id, user_name=current.name)
    await db.attendance.insert_one(a.dict())
    return a


@api_router.get("/attendance", response_model=List[Attendance])
async def list_attendance(current: User = Depends(get_current_user)):
    q = {} if current.role in ("admin", "manager") else {"user_id": current.user_id}
    docs = await db.attendance.find(q, {"_id": 0}).sort("date", -1).to_list(500)
    return [Attendance(**d) for d in docs]


# ============ HR: Leaves ============
@api_router.post("/leaves", response_model=LeaveRequest)
async def request_leave(payload: LeaveInput, current: User = Depends(get_current_user)):
    lv = LeaveRequest(**payload.dict(), user_id=current.user_id, user_name=current.name)
    await db.leaves.insert_one(lv.dict())
    return lv


@api_router.get("/leaves", response_model=List[LeaveRequest])
async def list_leaves(current: User = Depends(get_current_user)):
    q = {} if current.role in ("admin", "manager") else {"user_id": current.user_id}
    docs = await db.leaves.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [LeaveRequest(**d) for d in docs]


@api_router.patch("/leaves/{lid}", response_model=LeaveRequest)
async def decide_leave(lid: str, payload: LeaveDecision, current: User = Depends(require_admin_or_manager)):
    if payload.status not in ("approved", "rejected", "pending"):
        raise HTTPException(status_code=400, detail="Invalid status")
    await db.leaves.update_one({"id": lid}, {"$set": {"status": payload.status}})
    d = await db.leaves.find_one({"id": lid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return LeaveRequest(**d)


# ============ Tenders ============
@api_router.post("/tenders", response_model=Tender)
async def create_tender(payload: TenderInput, current: User = Depends(get_current_user)):
    t = Tender(**payload.dict(), created_by=current.user_id)
    await db.tenders.insert_one(t.dict())
    return t


@api_router.get("/tenders", response_model=List[Tender])
async def list_tenders(current: User = Depends(get_current_user)):
    docs = await db.tenders.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Tender(**d) for d in docs]


@api_router.get("/tenders/{tid}", response_model=Tender)
async def get_tender(tid: str, current: User = Depends(get_current_user)):
    d = await db.tenders.find_one({"id": tid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return Tender(**d)


@api_router.patch("/tenders/{tid}", response_model=Tender)
async def update_tender(tid: str, payload: TenderInput, current: User = Depends(get_current_user)):
    await db.tenders.update_one({"id": tid}, {"$set": payload.dict()})
    d = await db.tenders.find_one({"id": tid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return Tender(**d)


@api_router.delete("/tenders/{tid}")
async def delete_tender(tid: str, current: User = Depends(require_admin_or_manager)):
    res = await db.tenders.delete_one({"id": tid})
    return {"deleted": res.deleted_count}


@api_router.post("/tenders/{tid}/upload", response_model=Tender)
async def upload_tender_file(tid: str, file: UploadFile = File(...), current: User = Depends(get_current_user)):
    d = await db.tenders.find_one({"id": tid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Tender not found")
    ext = (file.filename or "file").rsplit(".", 1)[-1].lower()
    ext = ext if len(ext) <= 8 else "bin"
    path = f"{APP_NAME}/uploads/{current.user_id}/{uuid.uuid4().hex}.{ext}"
    data = await file.read()
    content_type = file.content_type or "application/octet-stream"
    await run_in_threadpool(put_object, path, data, content_type)
    await db.tenders.update_one({"id": tid}, {"$set": {"file_path": path, "file_name": file.filename}})
    d2 = await db.tenders.find_one({"id": tid}, {"_id": 0})
    return Tender(**d2)


@api_router.get("/files/{full_path:path}")
async def download_file(full_path: str, token: Optional[str] = None, authorization: Optional[str] = Header(None)):
    # allow token via query for <img> tags on web
    if not authorization and token:
        authorization = f"Bearer {token}"
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    tok = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": tok}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    # ownership: verify path belongs to a tender the user can access (any authenticated user for now)
    data, ct = await run_in_threadpool(get_object, full_path)
    return Response(content=data, media_type=ct)


# ============ Dashboard ============
@api_router.get("/dashboard/summary")
async def dashboard_summary(current: User = Depends(get_current_user)):
    customers = await db.customers.count_documents({})
    employees = await db.employees.count_documents({})
    total_tasks = await db.tasks.count_documents({})
    open_tasks = await db.tasks.count_documents({"status": {"$in": ["todo", "doing"]}})
    open_tenders = await db.tenders.count_documents({"status": "open"})
    pending_leaves = await db.leaves.count_documents({"status": "pending"})
    accounts_pending = await db.accounts.count_documents({"status": "pending"})
    urgent = await db.tenders.find({"status": "open"}, {"_id": 0}).sort("submission_deadline", 1).to_list(3)
    return {
        "customers": customers,
        "employees": employees,
        "tasks_total": total_tasks,
        "tasks_open": open_tasks,
        "open_tenders": open_tenders,
        "pending_leaves": pending_leaves,
        "accounts_pending": accounts_pending,
        "urgent_tenders": [Tender(**t).dict() for t in urgent],
    }


@api_router.get("/")
async def root():
    return {"service": "Triveni Business Manager API", "status": "ok"}


# ============ Startup ============
@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("user_id")
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.customers.create_index("id", unique=True)
        await db.employees.create_index("id", unique=True)
        await db.tasks.create_index("id", unique=True)
        await db.accounts.create_index("id", unique=True)
        await db.tenders.create_index("id", unique=True)
        await db.attendance.create_index("id", unique=True)
        await db.leaves.create_index("id", unique=True)

        # Seed admin
        admin_email = "admin@triveni.com"
        if not await db.users.find_one({"email": admin_email}):
            admin = User(user_id=new_id("usr"), email=admin_email, name="Triveni Admin", role="admin")
            doc = admin.dict()
            doc["password_hash"] = hash_password("Admin@123")
            await db.users.insert_one(doc)
            logger.info("Seeded admin user")

        # Seed a manager
        mgr_email = "manager@triveni.com"
        if not await db.users.find_one({"email": mgr_email}):
            mgr = User(user_id=new_id("usr"), email=mgr_email, name="Ravi Manager", role="manager")
            doc = mgr.dict()
            doc["password_hash"] = hash_password("Manager@123")
            await db.users.insert_one(doc)

        # Seed an employee
        emp_email = "employee@triveni.com"
        if not await db.users.find_one({"email": emp_email}):
            emp = User(user_id=new_id("usr"), email=emp_email, name="Anita Employee", role="employee")
            doc = emp.dict()
            doc["password_hash"] = hash_password("Employee@123")
            await db.users.insert_one(doc)

        try:
            await run_in_threadpool(init_storage)
            logger.info("Storage initialized")
        except Exception as e:
            logger.warning(f"Storage init failed at startup (non-fatal): {e}")
    except Exception as e:
        logger.error(f"Startup error: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
