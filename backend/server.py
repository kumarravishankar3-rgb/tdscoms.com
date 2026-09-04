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
from invoice_pdf import build_invoice_pdf
from customer_pdf import build_customer_pdf
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
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip().rstrip("/")
if not STORAGE_BASE:
    logger_boot = logging.getLogger(__name__)
    logger_boot.warning("INTEGRATION_PROXY_URL not configured — object storage will fail until set")
STORAGE_URL = (STORAGE_BASE + "/objstore/api/v1/storage") if STORAGE_BASE else ""
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
    customer_code: Optional[str] = None  # auto TDSC-CUST-ID-00000001

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

    # Contractor Registration
    contractor_reg_no: Optional[str] = None
    registration_class: Optional[str] = None
    registration_validity: Optional[str] = None

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
    contractor_reg_no: Optional[str] = None
    registration_class: Optional[str] = None
    registration_validity: Optional[str] = None
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
    office_id: Optional[str] = None
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
    office_id: Optional[str] = None
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


class SubTask(BaseModel):
    id: str = Field(default_factory=lambda: new_id("sub"))
    title: str
    done: bool = False
    note: Optional[str] = None
    order: int = 0


class StageHistoryEntry(BaseModel):
    stage_id: str
    stage_name: str
    moved_at: datetime = Field(default_factory=now_utc)
    moved_by: Optional[str] = None
    moved_by_name: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    note: Optional[str] = None


class Task(BaseModel):
    id: str = Field(default_factory=lambda: new_id("tsk"))
    task_no: Optional[str] = None       # TSK-0001
    title: str
    description: Optional[str] = None

    task_type_id: Optional[str] = None
    task_type_name: Optional[str] = None

    # Per-task custom stages (task creator/admin defines them)
    stages: List[dict] = Field(default_factory=list)  # [{id,name,order,color?}]
    current_stage_id: Optional[str] = None
    current_stage_name: Optional[str] = None
    stage_history: List[dict] = Field(default_factory=list)

    sub_tasks: List[dict] = Field(default_factory=list)

    voucher_no: Optional[str] = None
    voucher_date: Optional[str] = None
    total_amount: Optional[float] = 0
    paid_amount: Optional[float] = 0
    dues_amount: Optional[float] = 0

    deadline: Optional[str] = None

    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None

    # Linked customer (denormalised for quick display)
    customer_id: Optional[str] = None
    customer_code: Optional[str] = None
    customer_name: Optional[str] = None
    customer_mobile: Optional[str] = None
    customer_pan: Optional[str] = None
    customer_address: Optional[str] = None

    priority: str = "medium"
    status: str = "todo"

    attachments: List[dict] = Field(default_factory=list)

    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class TaskInput(BaseModel):
    title: str
    description: Optional[str] = None
    task_type_id: Optional[str] = None
    stages: Optional[List[dict]] = None   # optional initial stages [{name,color?}]
    sub_tasks: Optional[List[dict]] = None
    voucher_no: Optional[str] = None
    voucher_date: Optional[str] = None
    total_amount: Optional[float] = 0
    paid_amount: Optional[float] = 0
    deadline: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    customer_id: Optional[str] = None
    customer_code: Optional[str] = None
    customer_name: Optional[str] = None
    customer_mobile: Optional[str] = None
    customer_pan: Optional[str] = None
    customer_address: Optional[str] = None
    priority: str = "medium"


class StageInput(BaseModel):
    name: str
    color: Optional[str] = None


class StagePatch(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = None


class TaskUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    deadline: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    voucher_no: Optional[str] = None
    voucher_date: Optional[str] = None
    total_amount: Optional[float] = None
    paid_amount: Optional[float] = None
    sub_tasks: Optional[List[dict]] = None
    customer_id: Optional[str] = None
    customer_code: Optional[str] = None
    customer_name: Optional[str] = None
    customer_mobile: Optional[str] = None
    customer_pan: Optional[str] = None
    customer_address: Optional[str] = None


class MoveStageInput(BaseModel):
    stage_id: str
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    note: Optional[str] = None


class WorkflowStage(BaseModel):
    id: str = Field(default_factory=lambda: new_id("stg"))
    name: str
    order: int
    color: Optional[str] = None
    role_hint: Optional[str] = None


class Workflow(BaseModel):
    id: str = Field(default_factory=lambda: new_id("wf"))
    name: str
    stages: List[dict]
    created_at: datetime = Field(default_factory=now_utc)


class WorkflowInput(BaseModel):
    name: str
    stages: List[dict]  # [{name, order, color?}]


class TaskType(BaseModel):
    id: str = Field(default_factory=lambda: new_id("tt"))
    name: str
    key: Optional[str] = None
    workflow_id: Optional[str] = None
    is_default: bool = False
    created_at: datetime = Field(default_factory=now_utc)


class TaskTypeInput(BaseModel):
    name: str
    workflow_id: Optional[str] = None


class ServiceTaskSetting(BaseModel):
    id: str = Field(default_factory=lambda: new_id("sts"))
    service_key: str                  # normalized: 'dsc', 'gst', 'tender', 'income_tax', ...
    service_label: str                # display: 'DSC Service'
    default_assignee_id: Optional[str] = None
    default_assignee_name: Optional[str] = None
    default_deadline_days: int = 7
    default_followup_days: int = 3
    auto_task_enabled: bool = True
    created_at: datetime = Field(default_factory=now_utc)


class ServiceTaskSettingInput(BaseModel):
    service_key: Optional[str] = None
    service_label: str
    default_assignee_id: Optional[str] = None
    default_assignee_name: Optional[str] = None
    default_deadline_days: int = 7
    default_followup_days: int = 3
    auto_task_enabled: bool = True


class AutoTaskGlobalToggle(BaseModel):
    enabled: bool


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


# ============ Accounting Phase 1 Models ============
INCOME_CATEGORIES = ["DSC Services", "E-Tender Services", "Railway Registration", "Contractor Registration", "GST/Tax Services", "Other Services"]
EXPENSE_CATEGORIES = ["Office Rent", "Salary", "Electricity", "Internet", "Travel", "Marketing", "Software/Subscription", "Office Expenses", "Other"]
PAYMENT_MODES = ["cash", "bank", "upi", "cheque"]


class BankAccount(BaseModel):
    id: str = Field(default_factory=lambda: new_id("bnk"))
    name: str
    bank_name: str
    account_no: str
    ifsc: Optional[str] = None
    opening_balance: float = 0.0
    is_active: bool = True
    created_at: datetime = Field(default_factory=now_utc)


class BankAccountInput(BaseModel):
    name: str
    bank_name: str
    account_no: str
    ifsc: Optional[str] = None
    opening_balance: float = 0.0
    is_active: bool = True


class Income(BaseModel):
    id: str = Field(default_factory=lambda: new_id("inc"))
    income_no: Optional[str] = None    # INC-0001
    date: str                          # YYYY-MM-DD
    client_id: Optional[str] = None
    client_name: str
    client_mobile: Optional[str] = None
    service_category: str
    service_name: Optional[str] = None
    amount: float
    payment_mode: str                  # cash / bank / upi / cheque
    bank_account_id: Optional[str] = None
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    remarks: Optional[str] = None
    attachments: List[dict] = Field(default_factory=list)
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class IncomeInput(BaseModel):
    date: str
    client_id: Optional[str] = None
    client_name: str
    client_mobile: Optional[str] = None
    service_category: str
    service_name: Optional[str] = None
    amount: float
    payment_mode: str
    bank_account_id: Optional[str] = None
    employee_id: Optional[str] = None
    employee_name: Optional[str] = None
    remarks: Optional[str] = None


class Expense(BaseModel):
    id: str = Field(default_factory=lambda: new_id("exp"))
    expense_no: Optional[str] = None
    date: str
    category: str
    amount: float
    payment_mode: str
    bank_account_id: Optional[str] = None
    vendor: Optional[str] = None
    description: Optional[str] = None
    status: str = "pending"  # pending, verified, approved, rejected
    verified_by: Optional[str] = None
    approved_by: Optional[str] = None
    attachments: List[dict] = Field(default_factory=list)
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class ExpenseInput(BaseModel):
    date: str
    category: str
    amount: float
    payment_mode: str
    bank_account_id: Optional[str] = None
    vendor: Optional[str] = None
    description: Optional[str] = None


class ExpenseDecision(BaseModel):
    action: str  # verify | approve | reject


# ============ Items (Inventory / catalog) ============
class Item(BaseModel):
    id: str = Field(default_factory=lambda: new_id("itm"))
    item_code: Optional[str] = None
    name: str
    unit: str = "PCS"
    hsn_sac: Optional[str] = None
    sale_price: float = 0.0
    purchase_price: float = 0.0
    tax_rate: float = 0.0  # GST %
    is_service: bool = False
    stock: float = 0.0
    low_stock_alert: float = 0.0
    description: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class ItemInput(BaseModel):
    name: str
    unit: str = "PCS"
    hsn_sac: Optional[str] = None
    sale_price: float = 0.0
    purchase_price: float = 0.0
    tax_rate: float = 0.0
    is_service: bool = False
    stock: float = 0.0
    low_stock_alert: float = 0.0
    description: Optional[str] = None


# ============ Invoices (Sale / Purchase) ============
class InvoiceItem(BaseModel):
    item_id: Optional[str] = None
    name: str
    qty: float = 1
    unit: str = "PCS"
    price: float = 0.0
    tax_rate: float = 0.0  # % GST
    discount: float = 0.0
    amount: float = 0.0    # qty*price - discount + tax


class Invoice(BaseModel):
    id: str = Field(default_factory=lambda: new_id("inv"))
    invoice_no: Optional[str] = None    # SI-0001 / PB-0001
    invoice_type: str = "sale"          # sale | purchase
    payment_type: str = "credit"        # credit | cash
    payment_mode: str = "cash"          # cash | bank_transfer | cheque | upi | other
    date: str                            # YYYY-MM-DD
    payment_terms: Optional[str] = None  # Net 15/30/45/60/90 or Custom
    due_date: Optional[str] = None
    party_id: str
    party_name: str
    party_mobile: Optional[str] = None
    party_gst: Optional[str] = None
    items: List[InvoiceItem] = Field(default_factory=list)
    subtotal: float = 0.0
    total_discount: float = 0.0
    total_tax: float = 0.0
    total_amount: float = 0.0
    paid_amount: float = 0.0
    balance: float = 0.0
    status: str = "unpaid"  # unpaid | partial | paid | cancelled
    notes: Optional[str] = None
    attachments: List[dict] = Field(default_factory=list)
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class InvoiceInput(BaseModel):
    invoice_type: str = "sale"
    payment_type: str = "credit"
    payment_mode: str = "cash"
    date: str
    payment_terms: Optional[str] = None
    due_date: Optional[str] = None
    party_id: str
    party_name: str
    party_mobile: Optional[str] = None
    party_gst: Optional[str] = None
    items: List[InvoiceItem] = Field(default_factory=list)
    total_amount: float = 0.0
    paid_amount: float = 0.0
    notes: Optional[str] = None


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
    tender_code: Optional[str] = None  # auto TND-0001

    # Core
    name_of_work: str
    estimated_cost: Optional[float] = None
    contractor_class: Optional[str] = None
    nit_no: Optional[str] = None
    department: Optional[str] = None
    district: Optional[str] = None
    last_date: Optional[str] = None      # last date of tender submission
    status: str = "open"  # open, submitted, awarded, lost
    description: Optional[str] = None

    # File slots
    nit_copy: Optional[dict] = None      # {path,name,size,content_type,uploaded_at}
    boq: Optional[dict] = None           # single file
    other_documents: List[dict] = Field(default_factory=list)  # multiple files

    # Backward-compat (kept optional; new UI does not use these)
    title: Optional[str] = None
    reference_no: Optional[str] = None
    value: Optional[float] = None
    submission_deadline: Optional[str] = None
    file_path: Optional[str] = None
    file_name: Optional[str] = None

    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class TenderInput(BaseModel):
    name_of_work: str
    estimated_cost: Optional[float] = None
    contractor_class: Optional[str] = None
    nit_no: Optional[str] = None
    department: Optional[str] = None
    district: Optional[str] = None
    last_date: Optional[str] = None
    status: str = "open"
    description: Optional[str] = None


class OfficeSettings(BaseModel):
    # Global settings (per-office location moved to Office model)
    start_time: str = "09:00"      # HH:MM 24h
    grace_minutes: int = 10
    late_fine_per_day: float = 100.0
    working_days_per_month: int = 26


class OfficeSettingsInput(BaseModel):
    start_time: Optional[str] = None
    grace_minutes: Optional[int] = None
    late_fine_per_day: Optional[float] = None
    working_days_per_month: Optional[int] = None


class Office(BaseModel):
    id: str = Field(default_factory=lambda: new_id("off"))
    name: str
    address: Optional[str] = None
    lat: float
    lng: float
    radius_m: int = 20
    created_at: datetime = Field(default_factory=now_utc)


class OfficeInput(BaseModel):
    name: str
    address: Optional[str] = None
    lat: float
    lng: float
    radius_m: int = 20


class OfficeUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_m: Optional[int] = None


class PunchRecord(BaseModel):
    id: str = Field(default_factory=lambda: new_id("pn"))
    user_id: str
    user_name: str
    employee_code: Optional[str] = None
    office_id: Optional[str] = None
    office_name: Optional[str] = None
    type: str  # "in" | "out"
    date: str  # YYYY-MM-DD
    time: str  # HH:MM:SS
    lat: Optional[float] = None
    lng: Optional[float] = None
    accuracy: Optional[float] = None
    distance_m: Optional[float] = None
    within_geofence: bool = True
    is_late: bool = False
    selfie_path: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


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
    base = (os.environ.get("EMERGENT_AUTH_BASE_URL") or "").rstrip("/")
    if not base:
        raise HTTPException(status_code=500, detail="EMERGENT_AUTH_BASE_URL not configured")
    async with httpx.AsyncClient(timeout=30) as hx:
        r = await hx.get(
            f"{base}/auth/v1/env/oauth/session-data",
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


@api_router.delete("/auth/me")
async def delete_my_account(current: User = Depends(get_current_user)):
    """Self-service account deletion (App Store / Play Store compliance).
    Removes the user, their sessions, and anonymizes personally-identifiable
    references so their business data (tasks, invoices) does not orphan.
    Admins cannot self-delete via this endpoint to avoid locking the tenant out.
    """
    if current.role == "admin":
        # Prevent lockout — an admin must be removed by another admin.
        raise HTTPException(status_code=400, detail="Admin accounts cannot self-delete. Please contact another admin.")
    uid = current.user_id
    email = current.email
    # Delete auth sessions
    await db.user_sessions.delete_many({"user_id": uid})
    # Delete user document
    await db.users.delete_one({"user_id": uid})
    # Anonymize employee link if present
    try:
        await db.employees.update_many(
            {"user_id": uid},
            {"$set": {"user_id": None, "status": "inactive", "deleted_at": datetime.now(timezone.utc).isoformat()}},
        )
    except Exception:
        pass
    logger.info("Account deleted (self-service): %s / %s", uid, email)
    return {"ok": True, "deleted": True}


# ============ Customers ============
async def _find_customer_duplicate(payload_dict: dict, exclude_id: Optional[str] = None) -> Optional[dict]:
    """Return existing customer doc if any unique field matches (mobile/whatsapp/pan/aadhar/gst_no/contractor_reg_no/email)."""
    unique_pairs = []
    for f in ("mobile", "whatsapp", "pan", "aadhar", "gst_no", "contractor_reg_no", "email"):
        val = (payload_dict.get(f) or "").strip()
        if val and val.upper() not in ("NA", "N/A", "NONE", "-"):
            unique_pairs.append({f: val})
    if not unique_pairs:
        return None
    q: dict = {"$or": unique_pairs}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    return await db.customers.find_one(q, {"_id": 0})


@api_router.post("/customers", response_model=Customer)
async def create_customer(payload: CustomerInput, current: User = Depends(get_current_user)):
    # Validate mandatory fields (Pydantic already enforces presence; also block empty strings)
    missing = []
    for k in ("name", "mobile", "whatsapp", "pan", "aadhar"):
        if not (getattr(payload, k) or "").strip():
            missing.append(k)
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing mandatory: {', '.join(missing)}")

    # Duplicate check across mobile/PAN/Aadhar/GST/email/whatsapp/reg_no
    dup = await _find_customer_duplicate(payload.dict())
    if dup:
        matched_on = []
        for f in ("mobile", "whatsapp", "pan", "aadhar", "gst_no", "contractor_reg_no", "email"):
            if (getattr(payload, f, None) or "").strip() and (dup.get(f) or "").strip() == (getattr(payload, f) or "").strip():
                matched_on.append(f.upper())
        raise HTTPException(status_code=409, detail={
            "message": f"Customer already exists ({', '.join(matched_on)} match)",
            "matched_on": matched_on,
            "existing": {
                "id": dup.get("id"),
                "customer_code": dup.get("customer_code"),
                "name": dup.get("name"),
                "mobile": dup.get("mobile"),
                "pan": dup.get("pan"),
            },
        })

    # Atomically increment counter to build unique customer_code like TDSC-CUST-ID-00000001
    counter = await db.counters.find_one_and_update(
        {"_id": "customer_code"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    seq = (counter or {}).get("seq") or 1
    code = f"TDSC-CUST-ID-{seq:08d}"

    c = Customer(**payload.dict(), customer_code=code, created_by=current.user_id)
    await db.customers.insert_one(c.dict())
    return c


class QuickPartyInput(BaseModel):
    name: str
    mobile: str
    whatsapp: Optional[str] = None
    pan: Optional[str] = None
    aadhar: Optional[str] = None
    email: Optional[str] = None
    gst_no: Optional[str] = None
    address: Optional[str] = None


@api_router.post("/customers/quick", response_model=Customer)
async def quick_add_party(payload: QuickPartyInput, current: User = Depends(get_current_user)):
    """Simplified inline party add for voucher/invoice screens. Auto-fills whatsapp=mobile, aadhar/pan as N/A if missing."""
    if not payload.name.strip() or not payload.mobile.strip():
        raise HTTPException(status_code=400, detail="Name and mobile are required")
    body = payload.dict()
    body["whatsapp"] = body.get("whatsapp") or body["mobile"]
    body["pan"] = body.get("pan") or "NA"
    body["aadhar"] = body.get("aadhar") or "NA"
    dup = await _find_customer_duplicate(body)
    if dup:
        raise HTTPException(status_code=409, detail={
            "message": "Party already exists (matched mobile/PAN/Aadhar/GST/email)",
            "existing": {
                "id": dup.get("id"),
                "customer_code": dup.get("customer_code"),
                "name": dup.get("name"),
                "mobile": dup.get("mobile"),
            },
        })
    counter = await db.counters.find_one_and_update(
        {"_id": "customer_code"}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER,
    )
    seq = (counter or {}).get("seq") or 1
    code = f"TDSC-CUST-ID-{seq:08d}"
    c = Customer(
        name=body["name"].strip(), mobile=body["mobile"].strip(), whatsapp=body["whatsapp"].strip(),
        pan=body["pan"], aadhar=body["aadhar"], email=body.get("email"), gst_no=body.get("gst_no"),
        address=body.get("address"), customer_code=code, created_by=current.user_id,
    )
    await db.customers.insert_one(c.dict())
    return c


@api_router.get("/customers/search", response_model=List[Customer])
async def search_customers(q: str = "", limit: int = 25, current: User = Depends(get_current_user)):
    """Search customers by any of: name, customer_code, mobile, whatsapp, PAN, Aadhar, email, GST no, contractor_reg_no.

    Special handling: if the query is a pure integer or padded number (e.g. "56" or "00000056"),
    we ALSO search the padded 8-digit form so the customer_code TDSC-CUST-ID-00000056 is found."""
    s = (q or "").strip()
    if not s:
        docs = await db.customers.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
        return [Customer(**d) for d in docs]
    import re
    rx = {"$regex": re.escape(s), "$options": "i"}
    or_clauses = [
        {"name": rx}, {"customer_code": rx}, {"mobile": rx}, {"whatsapp": rx},
        {"pan": rx}, {"aadhar": rx}, {"email": rx}, {"gst_no": rx}, {"contractor_reg_no": rx},
    ]
    # If query is purely digits, also match zero-padded 8-digit form on customer_code
    if s.isdigit():
        padded = s.zfill(8)
        or_clauses.append({"customer_code": {"$regex": re.escape(padded), "$options": "i"}})
    query = {"$or": or_clauses}
    docs = await db.customers.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [Customer(**d) for d in docs]


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
async def update_customer(cid: str, payload: CustomerInput, current: User = Depends(require_admin_or_manager)):
    dup = await _find_customer_duplicate(payload.dict(), exclude_id=cid)
    if dup:
        raise HTTPException(status_code=409, detail={
            "message": "Another customer already has these unique fields (mobile/PAN/Aadhar/GST/email/reg no)",
            "existing": {"id": dup.get("id"), "customer_code": dup.get("customer_code"), "name": dup.get("name")},
        })
    await db.customers.update_one({"id": cid}, {"$set": payload.dict()})
    d = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return Customer(**d)


@api_router.post("/customers/bulk-delete")
async def bulk_delete_customers(payload: dict, current: User = Depends(require_admin)):
    ids = [i for i in (payload.get("ids") or []) if i]
    if not ids:
        return {"deleted": 0}
    res = await db.customers.delete_many({"id": {"$in": ids}})
    return {"deleted": res.deleted_count}


@api_router.get("/customers/{cid}/pdf")
async def get_customer_pdf(cid: str, token: Optional[str] = None, authorization: Optional[str] = Header(default=None)):
    tk = None
    if authorization and authorization.startswith("Bearer "):
        tk = authorization[7:]
    elif token:
        tk = token
    if not tk:
        raise HTTPException(status_code=401, detail="Auth required")
    session = await db.user_sessions.find_one({"session_token": tk}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    c = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    pdf_bytes = await run_in_threadpool(build_customer_pdf, c)
    fname = f"{(c.get('customer_code') or 'customer').replace(' ', '_')}.pdf"
    return Response(content=pdf_bytes, media_type="application/pdf",
                   headers={"Content-Disposition": f'inline; filename="{fname}"'})


@api_router.delete("/customers/{cid}")
async def delete_customer(cid: str, current: User = Depends(require_admin)):
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


@api_router.patch("/employees/{eid}", response_model=Employee)
async def update_employee(eid: str, payload: dict, current: User = Depends(require_admin_or_manager)):
    allowed = {"name", "email", "office_id", "designation", "posting_branch", "role", "pay", "da", "hra", "ma", "ta", "other1", "other2", "ded_epfo", "ded_esic", "ded_advance", "ded_advance_installments", "ded_other", "mobile", "emergency_mobile", "address", "bank_account_no", "bank_ifsc", "bank_name", "account_holder_name", "pan", "aadhar", "date_of_birth", "date_of_joining", "epfo_no", "esic_no"}
    updates = {k: v for k, v in payload.items() if k in allowed and v is not None}
    if updates:
        # If salary fields changed, recompute gross/net
        if any(k in updates for k in ("pay","da","hra","ma","ta","other1","other2","ded_epfo","ded_esic","ded_advance","ded_other")):
            current_doc = await db.employees.find_one({"id": eid}, {"_id": 0}) or {}
            merged = {**current_doc, **updates}
            merged = _compute_salary(merged)
            updates["gross_amount"] = merged["gross_amount"]
            updates["net_total"] = merged["net_total"]
        await db.employees.update_one({"id": eid}, {"$set": updates})
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


# ============ Workflows & Task Types ============
DEFAULT_STAGES = [
    {"name": "Received", "order": 0, "color": "#3B82F6"},
    {"name": "In Progress", "order": 1, "color": "#F59E0B"},
    {"name": "Under Review", "order": 2, "color": "#8B5CF6"},
    {"name": "Completed", "order": 3, "color": "#10B981"},
]

DEFAULT_TASK_TYPES = [
    {"key": "digital_signature", "name": "Digital Signature"},
    {"key": "tender", "name": "Tender"},
    {"key": "contractor_registration", "name": "Contractor Registration Class"},
    {"key": "gst_registration", "name": "GST Registration"},
]


def _stage_with_ids(stages: List[dict]) -> List[dict]:
    out = []
    for i, s in enumerate(sorted(stages, key=lambda x: x.get("order", 0))):
        d = dict(s)
        d.setdefault("id", new_id("stg"))
        d["order"] = i
        out.append(d)
    return out


async def _ensure_seed_workflows_and_types():
    # Default workflow
    wf = await db.workflows.find_one({"name": "Standard 4-Stage"}, {"_id": 0})
    if not wf:
        wf = Workflow(name="Standard 4-Stage", stages=_stage_with_ids(DEFAULT_STAGES)).dict()
        await db.workflows.insert_one(wf)
    wf_id = wf["id"]
    # Default task types
    for tt in DEFAULT_TASK_TYPES:
        existing = await db.task_types.find_one({"key": tt["key"]}, {"_id": 0})
        if not existing:
            new_tt = TaskType(name=tt["name"], key=tt["key"], workflow_id=wf_id, is_default=True).dict()
            await db.task_types.insert_one(new_tt)


@api_router.get("/workflows", response_model=List[Workflow])
async def list_workflows(current: User = Depends(get_current_user)):
    docs = await db.workflows.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return [Workflow(**d) for d in docs]


@api_router.post("/workflows", response_model=Workflow)
async def create_workflow(payload: WorkflowInput, current: User = Depends(require_admin_or_manager)):
    wf = Workflow(name=payload.name, stages=_stage_with_ids(payload.stages))
    await db.workflows.insert_one(wf.dict())
    return wf


@api_router.get("/task-types", response_model=List[TaskType])
async def list_task_types(current: User = Depends(get_current_user)):
    docs = await db.task_types.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return [TaskType(**d) for d in docs]


@api_router.post("/task-types", response_model=TaskType)
async def create_task_type(payload: TaskTypeInput, current: User = Depends(require_admin_or_manager)):
    # Default to standard workflow if none
    workflow_id = payload.workflow_id
    if not workflow_id:
        wf = await db.workflows.find_one({"name": "Standard 4-Stage"}, {"_id": 0})
        workflow_id = wf["id"] if wf else None
    key = payload.name.lower().replace(" ", "_")[:30]
    tt = TaskType(name=payload.name.strip(), key=key, workflow_id=workflow_id, is_default=False)
    await db.task_types.insert_one(tt.dict())
    return tt


@api_router.delete("/task-types/{ttid}")
async def delete_task_type(ttid: str, current: User = Depends(require_admin)):
    doc = await db.task_types.find_one({"id": ttid}, {"_id": 0})
    if doc and doc.get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete default task type")
    res = await db.task_types.delete_one({"id": ttid})
    return {"deleted": res.deleted_count}


# ============ Tasks ============
def _sub_tasks_with_ids(items: List[dict]) -> List[dict]:
    out = []
    for i, s in enumerate(items or []):
        d = dict(s)
        d.setdefault("id", new_id("sub"))
        d.setdefault("done", False)
        d["order"] = i
        out.append(d)
    return out


async def _resolve_type(task_type_id: Optional[str]):
    if not task_type_id:
        return None
    return await db.task_types.find_one({"id": task_type_id}, {"_id": 0})


def _order_stages(stages: List[dict]) -> List[dict]:
    out = []
    for i, s in enumerate(sorted(stages or [], key=lambda x: x.get("order", 0))):
        d = dict(s)
        d.setdefault("id", new_id("stg"))
        d["order"] = i
        out.append(d)
    return out


@api_router.post("/tasks", response_model=Task)
async def create_task(payload: TaskInput, current: User = Depends(get_current_user)):
    # Auto task_no
    counter = await db.counters.find_one_and_update(
        {"_id": "task_no"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    seq = (counter or {}).get("seq") or 1
    task_no = f"TSK-{seq:04d}"

    tt = await _resolve_type(payload.task_type_id)

    stages = _order_stages(payload.stages or [])
    first = stages[0] if stages else None

    total = float(payload.total_amount or 0)
    paid = float(payload.paid_amount or 0)
    dues = round(total - paid, 2)

    subs = _sub_tasks_with_ids(payload.sub_tasks or [])

    initial_history = []
    if first:
        initial_history.append({
            "stage_id": first["id"],
            "stage_name": first["name"],
            "moved_at": now_utc().isoformat(),
            "moved_by": current.user_id,
            "moved_by_name": current.name,
            "assignee_id": payload.assignee_id,
            "assignee_name": payload.assignee_name,
            "note": "Task created",
        })

    t = Task(
        task_no=task_no,
        title=payload.title.strip(),
        description=payload.description,
        task_type_id=(tt or {}).get("id"),
        task_type_name=(tt or {}).get("name"),
        stages=stages,
        current_stage_id=(first or {}).get("id"),
        current_stage_name=(first or {}).get("name"),
        stage_history=initial_history,
        sub_tasks=subs,
        voucher_no=payload.voucher_no,
        voucher_date=payload.voucher_date,
        total_amount=total, paid_amount=paid, dues_amount=dues,
        deadline=payload.deadline,
        assignee_id=payload.assignee_id, assignee_name=payload.assignee_name,
        customer_id=payload.customer_id, customer_code=payload.customer_code,
        customer_name=payload.customer_name, customer_mobile=payload.customer_mobile,
        customer_pan=payload.customer_pan, customer_address=payload.customer_address,
        priority=payload.priority,
        created_by=current.user_id, created_by_name=current.name,
    )
    await db.tasks.insert_one(t.dict())
    return t


@api_router.get("/tasks", response_model=List[Task])
async def list_tasks(mine: bool = False, current: User = Depends(get_current_user)):
    q: dict = {}
    if mine or current.role == "employee":
        q = {"$or": [{"assignee_id": current.user_id}, {"created_by": current.user_id}]}
    docs = await db.tasks.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Task(**d) for d in docs]


@api_router.get("/tasks/{tid}", response_model=Task)
async def get_task(tid: str, current: User = Depends(get_current_user)):
    d = await db.tasks.find_one({"id": tid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return Task(**d)


@api_router.patch("/tasks/{tid}", response_model=Task)
async def update_task(tid: str, payload: TaskUpdate, current: User = Depends(require_admin_or_manager)):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if "sub_tasks" in updates:
        updates["sub_tasks"] = _sub_tasks_with_ids(updates["sub_tasks"])
    # Recompute dues if amounts changed
    if "total_amount" in updates or "paid_amount" in updates:
        cur = await db.tasks.find_one({"id": tid}, {"_id": 0}) or {}
        total = float(updates.get("total_amount", cur.get("total_amount") or 0) or 0)
        paid = float(updates.get("paid_amount", cur.get("paid_amount") or 0) or 0)
        updates["total_amount"] = total
        updates["paid_amount"] = paid
        updates["dues_amount"] = round(total - paid, 2)
    if updates:
        await db.tasks.update_one({"id": tid}, {"$set": updates})
    d = await db.tasks.find_one({"id": tid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return Task(**d)


@api_router.post("/tasks/{tid}/move-stage", response_model=Task)
async def move_stage(tid: str, payload: MoveStageInput, current: User = Depends(get_current_user)):
    t = await db.tasks.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    stages = t.get("stages") or []
    stage = next((s for s in stages if s["id"] == payload.stage_id), None)
    if not stage:
        raise HTTPException(status_code=400, detail="Invalid stage for this task")
    history_entry = {
        "stage_id": stage["id"],
        "stage_name": stage["name"],
        "moved_at": now_utc().isoformat(),
        "moved_by": current.user_id,
        "moved_by_name": current.name,
        "assignee_id": payload.assignee_id or t.get("assignee_id"),
        "assignee_name": payload.assignee_name or t.get("assignee_name"),
        "note": payload.note,
    }
    total_stages = len(stages)
    if stage["order"] == 0:
        new_status = "todo"
    elif stage["order"] == total_stages - 1:
        new_status = "done"
    else:
        new_status = "doing"
    updates = {
        "current_stage_id": stage["id"],
        "current_stage_name": stage["name"],
        "status": new_status,
    }
    if payload.assignee_id is not None:
        updates["assignee_id"] = payload.assignee_id
        updates["assignee_name"] = payload.assignee_name
    await db.tasks.update_one({"id": tid}, {"$set": updates, "$push": {"stage_history": history_entry}})
    d = await db.tasks.find_one({"id": tid}, {"_id": 0})
    return Task(**d)


@api_router.post("/tasks/{tid}/stages", response_model=Task)
async def add_stage(tid: str, payload: StageInput, current: User = Depends(get_current_user)):
    t = await db.tasks.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    stages = list(t.get("stages") or [])
    new_stage = {"id": new_id("stg"), "name": payload.name.strip(), "color": payload.color, "order": len(stages)}
    stages.append(new_stage)
    stages = _order_stages(stages)
    updates: dict = {"stages": stages}
    # If task had no current stage yet, set this as current
    if not t.get("current_stage_id"):
        updates["current_stage_id"] = new_stage["id"]
        updates["current_stage_name"] = new_stage["name"]
    await db.tasks.update_one({"id": tid}, {"$set": updates})
    d = await db.tasks.find_one({"id": tid}, {"_id": 0})
    return Task(**d)


@api_router.patch("/tasks/{tid}/stages/{sid}", response_model=Task)
async def edit_stage(tid: str, sid: str, payload: StagePatch, current: User = Depends(get_current_user)):
    t = await db.tasks.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    stages = list(t.get("stages") or [])
    updated = False
    for s in stages:
        if s["id"] == sid:
            if payload.name is not None: s["name"] = payload.name.strip()
            if payload.color is not None: s["color"] = payload.color
            if payload.order is not None: s["order"] = int(payload.order)
            updated = True
            break
    if not updated:
        raise HTTPException(status_code=404, detail="Stage not found")
    stages = _order_stages(stages)
    updates: dict = {"stages": stages}
    if t.get("current_stage_id") == sid and payload.name:
        updates["current_stage_name"] = payload.name.strip()
    await db.tasks.update_one({"id": tid}, {"$set": updates})
    d = await db.tasks.find_one({"id": tid}, {"_id": 0})
    return Task(**d)


@api_router.delete("/tasks/{tid}/stages/{sid}", response_model=Task)
async def remove_stage(tid: str, sid: str, current: User = Depends(get_current_user)):
    t = await db.tasks.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    stages = [s for s in (t.get("stages") or []) if s["id"] != sid]
    stages = _order_stages(stages)
    updates: dict = {"stages": stages}
    if t.get("current_stage_id") == sid:
        first = stages[0] if stages else None
        updates["current_stage_id"] = (first or {}).get("id")
        updates["current_stage_name"] = (first or {}).get("name")
    await db.tasks.update_one({"id": tid}, {"$set": updates})
    d = await db.tasks.find_one({"id": tid}, {"_id": 0})
    return Task(**d)


class BulkDeleteInput(BaseModel):
    ids: List[str] = Field(default_factory=list)


@api_router.post("/tasks/bulk-delete")
async def bulk_delete_tasks(payload: BulkDeleteInput, current: User = Depends(require_admin)):
    ids = [i for i in (payload.ids or []) if i]
    if not ids:
        return {"deleted": 0}
    res = await db.tasks.delete_many({"id": {"$in": ids}})
    return {"deleted": res.deleted_count}


@api_router.delete("/tasks/{tid}")
async def delete_task(tid: str, current: User = Depends(require_admin)):
    res = await db.tasks.delete_one({"id": tid})
    return {"deleted": res.deleted_count}


@api_router.post("/tasks/{tid}/attachments", response_model=Task)
async def upload_task_file(tid: str, file: UploadFile = File(...), current: User = Depends(get_current_user)):
    t = await db.tasks.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds 10 MB limit ({len(data) // 1024} KB)")
    ext = (file.filename or "file").rsplit(".", 1)[-1].lower()
    ext = ext if len(ext) <= 8 else "bin"
    path = f"{APP_NAME}/uploads/{current.user_id}/{uuid.uuid4().hex}.{ext}"
    ct = file.content_type or "application/octet-stream"
    await run_in_threadpool(put_object, path, data, ct)
    attachment = {
        "path": path, "name": file.filename or f"file.{ext}", "size": len(data),
        "content_type": ct, "uploaded_at": now_utc().isoformat(), "uploaded_by": current.user_id,
    }
    await db.tasks.update_one({"id": tid}, {"$push": {"attachments": attachment}})
    d = await db.tasks.find_one({"id": tid}, {"_id": 0})
    return Task(**d)


@api_router.delete("/tasks/{tid}/attachments", response_model=Task)
async def delete_task_attachment(tid: str, path: str, current: User = Depends(get_current_user)):
    t = await db.tasks.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.tasks.update_one({"id": tid}, {"$pull": {"attachments": {"path": path}}})
    d = await db.tasks.find_one({"id": tid}, {"_id": 0})
    return Task(**d)


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


# ============ Accounting: Bank Accounts ============
@api_router.get("/bank-accounts", response_model=List[BankAccount])
async def list_bank_accounts(current: User = Depends(get_current_user)):
    docs = await db.bank_accounts.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return [BankAccount(**d) for d in docs]


@api_router.post("/bank-accounts", response_model=BankAccount)
async def create_bank_account(payload: BankAccountInput, current: User = Depends(require_admin_or_manager)):
    b = BankAccount(**payload.dict())
    await db.bank_accounts.insert_one(b.dict())
    return b


@api_router.patch("/bank-accounts/{bid}", response_model=BankAccount)
async def update_bank_account(bid: str, payload: BankAccountInput, current: User = Depends(require_admin_or_manager)):
    await db.bank_accounts.update_one({"id": bid}, {"$set": payload.dict()})
    d = await db.bank_accounts.find_one({"id": bid}, {"_id": 0})
    if not d: raise HTTPException(status_code=404, detail="Not found")
    return BankAccount(**d)


@api_router.delete("/bank-accounts/{bid}")
async def delete_bank_account(bid: str, current: User = Depends(require_admin)):
    res = await db.bank_accounts.delete_one({"id": bid})
    return {"deleted": res.deleted_count}


# ============ Accounting: Income ============
@api_router.get("/accounting/meta")
async def accounting_meta(current: User = Depends(get_current_user)):
    return {
        "income_categories": INCOME_CATEGORIES,
        "expense_categories": EXPENSE_CATEGORIES,
        "payment_modes": PAYMENT_MODES,
    }


async def _next_no(counter_key: str, prefix: str) -> str:
    counter = await db.counters.find_one_and_update(
        {"_id": counter_key}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER,
    )
    seq = (counter or {}).get("seq") or 1
    return f"{prefix}-{seq:04d}"


@api_router.post("/income", response_model=Income)
async def create_income(payload: IncomeInput, current: User = Depends(get_current_user)):
    no = await _next_no("income_no", "INC")
    inc = Income(**payload.dict(), income_no=no, created_by=current.user_id, created_by_name=current.name)
    await db.income.insert_one(inc.dict())
    return inc


@api_router.get("/income", response_model=List[Income])
async def list_income(client_id: Optional[str] = None, from_date: Optional[str] = None, to_date: Optional[str] = None, current: User = Depends(get_current_user)):
    q: dict = {}
    if client_id: q["client_id"] = client_id
    if from_date or to_date:
        q["date"] = {}
        if from_date: q["date"]["$gte"] = from_date
        if to_date: q["date"]["$lte"] = to_date
    docs = await db.income.find(q, {"_id": 0}).sort("date", -1).to_list(1000)
    return [Income(**d) for d in docs]


@api_router.get("/income/{iid}", response_model=Income)
async def get_income(iid: str, current: User = Depends(get_current_user)):
    d = await db.income.find_one({"id": iid}, {"_id": 0})
    if not d: raise HTTPException(status_code=404, detail="Not found")
    return Income(**d)


@api_router.delete("/income/{iid}")
async def delete_income(iid: str, current: User = Depends(require_admin_or_manager)):
    res = await db.income.delete_one({"id": iid})
    return {"deleted": res.deleted_count}


# ============ Accounting: Expense ============
@api_router.post("/expenses", response_model=Expense)
async def create_expense(payload: ExpenseInput, current: User = Depends(get_current_user)):
    no = await _next_no("expense_no", "EXP")
    e = Expense(**payload.dict(), expense_no=no, created_by=current.user_id, created_by_name=current.name)
    await db.expenses.insert_one(e.dict())
    return e


@api_router.get("/expenses", response_model=List[Expense])
async def list_expenses(status: Optional[str] = None, from_date: Optional[str] = None, to_date: Optional[str] = None, current: User = Depends(get_current_user)):
    q: dict = {}
    if status: q["status"] = status
    if from_date or to_date:
        q["date"] = {}
        if from_date: q["date"]["$gte"] = from_date
        if to_date: q["date"]["$lte"] = to_date
    docs = await db.expenses.find(q, {"_id": 0}).sort("date", -1).to_list(1000)
    return [Expense(**d) for d in docs]


@api_router.post("/expenses/{eid}/decision", response_model=Expense)
async def decide_expense(eid: str, payload: ExpenseDecision, current: User = Depends(get_current_user)):
    e = await db.expenses.find_one({"id": eid}, {"_id": 0})
    if not e: raise HTTPException(status_code=404, detail="Not found")
    if payload.action == "verify":
        if current.role not in ("admin", "manager"):
            raise HTTPException(status_code=403, detail="Only accounts/manager can verify")
        upd = {"status": "verified", "verified_by": current.user_id}
    elif payload.action == "approve":
        if current.role != "admin":
            raise HTTPException(status_code=403, detail="Only admin can approve")
        upd = {"status": "approved", "approved_by": current.user_id}
    elif payload.action == "reject":
        if current.role not in ("admin", "manager"):
            raise HTTPException(status_code=403, detail="Only admin/manager can reject")
        upd = {"status": "rejected"}
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    await db.expenses.update_one({"id": eid}, {"$set": upd})
    d = await db.expenses.find_one({"id": eid}, {"_id": 0})
    return Expense(**d)


@api_router.delete("/expenses/{eid}")
async def delete_expense(eid: str, current: User = Depends(require_admin)):
    res = await db.expenses.delete_one({"id": eid})
    return {"deleted": res.deleted_count}


@api_router.get("/expenses/{eid}", response_model=Expense)
async def get_expense(eid: str, current: User = Depends(get_current_user)):
    d = await db.expenses.find_one({"id": eid}, {"_id": 0})
    if not d: raise HTTPException(status_code=404, detail="Not found")
    return Expense(**d)


# ============ Items (catalog) ============
@api_router.get("/items", response_model=List[Item])
async def list_items(q: Optional[str] = None, current: User = Depends(get_current_user)):
    query: dict = {}
    if q:
        import re
        rx = {"$regex": re.escape(q), "$options": "i"}
        query = {"$or": [{"name": rx}, {"item_code": rx}, {"hsn_sac": rx}]}
    docs = await db.items.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Item(**d) for d in docs]


@api_router.post("/items", response_model=Item)
async def create_item(payload: ItemInput, current: User = Depends(get_current_user)):
    # unique by name (case-insensitive)
    existing = await db.items.find_one({"name": {"$regex": f"^{payload.name.strip()}$", "$options": "i"}}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail={"message": f"Item '{payload.name}' already exists", "existing": {"id": existing["id"], "name": existing["name"]}})
    code = await _next_no("item_code", "ITM")
    itm = Item(**payload.dict(), item_code=code, created_by=current.user_id)
    await db.items.insert_one(itm.dict())
    return itm


@api_router.patch("/items/{iid}", response_model=Item)
async def update_item(iid: str, payload: ItemInput, current: User = Depends(get_current_user)):
    await db.items.update_one({"id": iid}, {"$set": payload.dict()})
    d = await db.items.find_one({"id": iid}, {"_id": 0})
    if not d: raise HTTPException(status_code=404, detail="Not found")
    return Item(**d)


@api_router.delete("/items/{iid}")
async def delete_item(iid: str, current: User = Depends(require_admin_or_manager)):
    res = await db.items.delete_one({"id": iid})
    return {"deleted": res.deleted_count}


# ============ Auto-task settings & helpers (used on Sale Invoice save) ============
DEFAULT_SERVICES = [
    ("dsc", "DSC Service"),
    ("gst", "GST Service"),
    ("tender", "Tender Service"),
    ("income_tax", "Income Tax Service"),
    ("registration", "Registration Service"),
]


async def _seed_default_service_settings():
    for key, label in DEFAULT_SERVICES:
        existing = await db.service_task_settings.find_one({"service_key": key}, {"_id": 0})
        if not existing:
            s = ServiceTaskSetting(service_key=key, service_label=label,
                                   default_deadline_days=7, default_followup_days=3, auto_task_enabled=True)
            await db.service_task_settings.insert_one(s.dict())


def _slug(s: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "_" for ch in (s or "")).strip("_")


async def _match_service_setting(inv):
    if inv.items:
        docs = await db.service_task_settings.find({}, {"_id": 0}).to_list(50)
        for it in inv.items:
            nm = (it.name or "").lower()
            slug = _slug(it.name)
            for s in docs:
                if s["service_key"] and (
                    s["service_key"] in slug
                    or s["service_key"] in nm
                    or s["service_label"].lower() in nm
                ):
                    return s
    return await db.service_task_settings.find_one({}, {"_id": 0})


async def _get_global_auto_toggle() -> bool:
    doc = await db.app_settings.find_one({"_id": "auto_task_on_invoice"}, {"_id": 0}) or {}
    val = doc.get("enabled")
    return True if val is None else bool(val)


async def _auto_create_tasks_for_invoice(inv, current: User):
    if not await _get_global_auto_toggle():
        return []
    setting = await _match_service_setting(inv)
    if not setting or not setting.get("auto_task_enabled", True):
        return []

    cust = await db.customers.find_one({"id": inv.party_id}, {"_id": 0}) if inv.party_id else None
    cust_pan = (cust or {}).get("pan")
    cust_addr = (cust or {}).get("address")
    cust_code = (cust or {}).get("customer_code")

    service_label = setting["service_label"]
    deadline_days = int(setting.get("default_deadline_days") or 7)
    followup_days = int(setting.get("default_followup_days") or 3)
    assignee_id = setting.get("default_assignee_id")
    assignee_name = setting.get("default_assignee_name")

    def _add_days(d: str, days: int) -> str:
        try:
            base = datetime.strptime(d, "%Y-%m-%d")
        except Exception:
            base = datetime.utcnow()
        return (base + timedelta(days=days)).strftime("%Y-%m-%d")

    common_customer = dict(
        customer_id=inv.party_id, customer_code=cust_code, customer_name=inv.party_name,
        customer_mobile=inv.party_mobile, customer_pan=cust_pan, customer_address=cust_addr,
    )
    common_voucher = dict(
        voucher_no=inv.invoice_no, voucher_date=inv.date,
        total_amount=inv.total_amount, paid_amount=inv.paid_amount,
        dues_amount=round(inv.total_amount - inv.paid_amount, 2),
    )

    tasks_created = []
    service_task = Task(
        task_no=await _next_no("task_no", "TSK"),
        title=f"{service_label} — {inv.party_name}",
        description=f"Auto-generated on {inv.invoice_no}. Complete {service_label}.",
        deadline=_add_days(inv.date, deadline_days),
        assignee_id=assignee_id, assignee_name=assignee_name,
        priority="high", status="todo",
        created_by=current.user_id, created_by_name=current.name,
        **common_customer, **common_voucher,
    )
    await db.tasks.insert_one(service_task.dict())
    tasks_created.append(service_task.dict())

    followup_task = Task(
        task_no=await _next_no("task_no", "TSK"),
        title=f"Payment Follow-up — {inv.party_name}",
        description=f"Follow-up on {inv.invoice_no}. Balance: ₹{round(inv.balance, 2)}",
        deadline=_add_days(inv.date, followup_days),
        assignee_id=assignee_id, assignee_name=assignee_name,
        priority="medium" if inv.balance <= 0 else "high", status="todo",
        created_by=current.user_id, created_by_name=current.name,
        **common_customer, **common_voucher,
    )
    await db.tasks.insert_one(followup_task.dict())
    tasks_created.append(followup_task.dict())
    return tasks_created


@api_router.get("/settings/service-tasks", response_model=List[ServiceTaskSetting])
async def list_service_task_settings(current: User = Depends(get_current_user)):
    await _seed_default_service_settings()
    docs = await db.service_task_settings.find({}, {"_id": 0}).sort("service_label", 1).to_list(200)
    return [ServiceTaskSetting(**d) for d in docs]


@api_router.post("/settings/service-tasks", response_model=ServiceTaskSetting)
async def create_service_task_setting(payload: ServiceTaskSettingInput, current: User = Depends(require_admin)):
    key = _slug(payload.service_key or payload.service_label)
    if not key:
        raise HTTPException(status_code=400, detail="service_key or service_label required")
    existing = await db.service_task_settings.find_one({"service_key": key}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail=f"Service '{payload.service_label}' already exists")
    data = payload.dict()
    data["service_key"] = key
    s = ServiceTaskSetting(**data)
    await db.service_task_settings.insert_one(s.dict())
    return s


@api_router.patch("/settings/service-tasks/{sid}", response_model=ServiceTaskSetting)
async def update_service_task_setting(sid: str, payload: ServiceTaskSettingInput, current: User = Depends(require_admin)):
    updates = payload.dict()
    updates["service_key"] = _slug(updates.get("service_key") or updates.get("service_label", ""))
    await db.service_task_settings.update_one({"id": sid}, {"$set": updates})
    d = await db.service_task_settings.find_one({"id": sid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return ServiceTaskSetting(**d)


@api_router.delete("/settings/service-tasks/{sid}")
async def delete_service_task_setting(sid: str, current: User = Depends(require_admin)):
    res = await db.service_task_settings.delete_one({"id": sid})
    return {"deleted": res.deleted_count}


@api_router.get("/settings/auto-task-toggle")
async def get_auto_task_toggle(current: User = Depends(get_current_user)):
    return {"enabled": await _get_global_auto_toggle()}


@api_router.put("/settings/auto-task-toggle")
async def set_auto_task_toggle(payload: AutoTaskGlobalToggle, current: User = Depends(require_admin)):
    await db.app_settings.update_one(
        {"_id": "auto_task_on_invoice"},
        {"$set": {"enabled": bool(payload.enabled)}},
        upsert=True,
    )
    return {"enabled": bool(payload.enabled)}


# ============ Invoices (Sale / Purchase) ============
def _recalc_invoice(items: List[InvoiceItem]):
    subtotal = 0.0; total_discount = 0.0; total_tax = 0.0; total_amount = 0.0
    out: List[InvoiceItem] = []
    for it in items:
        line = it.qty * it.price
        after_disc = max(0.0, line - it.discount)
        tax = round(after_disc * (it.tax_rate or 0) / 100.0, 2)
        amt = round(after_disc + tax, 2)
        it_copy = it.copy(update={"amount": amt})
        out.append(it_copy)
        subtotal += line
        total_discount += it.discount
        total_tax += tax
        total_amount += amt
    return out, round(subtotal, 2), round(total_discount, 2), round(total_tax, 2), round(total_amount, 2)


@api_router.post("/invoices", response_model=Invoice)
async def create_invoice(payload: InvoiceInput, current: User = Depends(get_current_user)):
    if not payload.party_id or not payload.party_name.strip():
        raise HTTPException(status_code=400, detail="Party (Customer) is required")
    # Duplicate check: same party + date + total_amount within same invoice_type (guard rail)
    dup = await db.invoices.find_one({
        "party_id": payload.party_id,
        "date": payload.date,
        "invoice_type": payload.invoice_type,
        "status": {"$ne": "cancelled"},
    }, {"_id": 0})
    if dup:
        raise HTTPException(status_code=409, detail={
            "message": f"An invoice already exists for this party on {payload.date}",
            "existing": {"id": dup.get("id"), "invoice_no": dup.get("invoice_no"), "total_amount": dup.get("total_amount")},
        })
    items, subtotal, tdisc, ttax, ttotal = _recalc_invoice(payload.items or [])
    prefix = "SI" if payload.invoice_type == "sale" else "PB"
    counter_key = "sale_invoice_no" if payload.invoice_type == "sale" else "purchase_bill_no"
    no = await _next_no(counter_key, prefix)
    total = ttotal if ttotal > 0 else float(payload.total_amount or 0)
    paid = float(payload.paid_amount or 0)
    if payload.payment_type == "cash": paid = total
    balance = round(total - paid, 2)
    status = "paid" if balance <= 0 and total > 0 else ("partial" if paid > 0 else "unpaid")
    inv = Invoice(
        invoice_no=no, invoice_type=payload.invoice_type, payment_type=payload.payment_type,
        payment_mode=payload.payment_mode or "cash",
        date=payload.date, payment_terms=payload.payment_terms, due_date=payload.due_date,
        party_id=payload.party_id, party_name=payload.party_name, party_mobile=payload.party_mobile, party_gst=payload.party_gst,
        items=items, subtotal=subtotal, total_discount=tdisc, total_tax=ttax, total_amount=total,
        paid_amount=paid, balance=balance, status=status, notes=payload.notes,
        created_by=current.user_id, created_by_name=current.name,
    )
    await db.invoices.insert_one(inv.dict())
    # Auto-create tasks (best-effort — do not fail invoice on error)
    try:
        if payload.invoice_type == "sale":
            await _auto_create_tasks_for_invoice(inv, current)
    except Exception as e:
        logger.exception("Auto-task creation failed: %s", e)
    return inv


@api_router.get("/invoices", response_model=List[Invoice])
async def list_invoices(invoice_type: Optional[str] = None, party_id: Optional[str] = None, from_date: Optional[str] = None, to_date: Optional[str] = None, current: User = Depends(get_current_user)):
    q: dict = {}
    if invoice_type: q["invoice_type"] = invoice_type
    if party_id: q["party_id"] = party_id
    if from_date or to_date:
        q["date"] = {}
        if from_date: q["date"]["$gte"] = from_date
        if to_date: q["date"]["$lte"] = to_date
    docs = await db.invoices.find(q, {"_id": 0}).sort("date", -1).to_list(500)
    return [Invoice(**d) for d in docs]


@api_router.get("/invoices/{iid}", response_model=Invoice)
async def get_invoice(iid: str, current: User = Depends(get_current_user)):
    d = await db.invoices.find_one({"id": iid}, {"_id": 0})
    if not d: raise HTTPException(status_code=404, detail="Not found")
    return Invoice(**d)


@api_router.get("/invoices/{iid}/pdf")
async def get_invoice_pdf(iid: str, token: Optional[str] = None, authorization: Optional[str] = Header(default=None)):
    # Accept token either via Authorization header (via dependency) OR ?token=... (browser)
    tk = None
    if authorization and authorization.startswith("Bearer "):
        tk = authorization[7:]
    elif token:
        tk = token
    if not tk:
        raise HTTPException(status_code=401, detail="Auth required")
    session = await db.user_sessions.find_one({"session_token": tk}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    d = await db.invoices.find_one({"id": iid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Invoice not found")
    # Fetch customer for address
    cust = await db.customers.find_one({"id": d.get("party_id")}, {"_id": 0}) if d.get("party_id") else None
    pdf_bytes = await run_in_threadpool(build_invoice_pdf, d, cust)
    fname = f"{d.get('invoice_no') or 'invoice'}_{(d.get('date') or '').replace('-','')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{fname}"'},
    )


@api_router.patch("/invoices/{iid}", response_model=Invoice)
async def update_invoice(iid: str, payload: InvoiceInput, current: User = Depends(require_admin)):
    existing = await db.invoices.find_one({"id": iid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Invoice not found")
    items, subtotal, tdisc, ttax, ttotal = _recalc_invoice(payload.items or [])
    total = ttotal if ttotal > 0 else float(payload.total_amount or 0)
    paid = float(payload.paid_amount or 0)
    if payload.payment_type == "cash":
        paid = total
    balance = round(total - paid, 2)
    status = "paid" if balance <= 0 and total > 0 else ("partial" if paid > 0 else "unpaid")
    updates = {
        "invoice_type": payload.invoice_type, "payment_type": payload.payment_type,
        "payment_mode": payload.payment_mode or "cash",
        "date": payload.date, "payment_terms": payload.payment_terms, "due_date": payload.due_date,
        "party_id": payload.party_id, "party_name": payload.party_name,
        "party_mobile": payload.party_mobile, "party_gst": payload.party_gst,
        "items": [it.dict() for it in items],
        "subtotal": subtotal, "total_discount": tdisc, "total_tax": ttax,
        "total_amount": total, "paid_amount": paid, "balance": balance, "status": status,
        "notes": payload.notes,
    }
    await db.invoices.update_one({"id": iid}, {"$set": updates})
    d = await db.invoices.find_one({"id": iid}, {"_id": 0})
    return Invoice(**d)


@api_router.delete("/invoices/{iid}")
async def delete_invoice(iid: str, current: User = Depends(require_admin)):
    res = await db.invoices.delete_one({"id": iid})
    return {"deleted": res.deleted_count}


# ============ Voucher Attachments (generic: invoices / expenses / incomes) ============
VOUCHER_MAX_BYTES = 10 * 1024 * 1024  # 10 MB per file
_VOUCHER_COLLECTIONS = {"invoices": "invoices", "expenses": "expenses", "incomes": "income"}


async def _voucher_attach(kind: str, oid: str, file: UploadFile, current: User):
    if kind not in _VOUCHER_COLLECTIONS:
        raise HTTPException(status_code=400, detail="Invalid voucher kind")
    coll_name = _VOUCHER_COLLECTIONS[kind]
    coll = getattr(db, coll_name)
    doc = await coll.find_one({"id": oid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail=f"{kind[:-1].title()} not found")
    data = await file.read()
    if len(data) > VOUCHER_MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"File exceeds 10 MB limit ({len(data)//1024} KB)")
    ext = (file.filename or "file").rsplit(".", 1)[-1].lower()
    ext = ext if len(ext) <= 8 else "bin"
    path = f"{APP_NAME}/uploads/{current.user_id}/{uuid.uuid4().hex}.{ext}"
    ct = file.content_type or "application/octet-stream"
    await run_in_threadpool(put_object, path, data, ct)
    attachment = {
        "path": path,
        "name": file.filename or f"file.{ext}",
        "size": len(data),
        "content_type": ct,
        "uploaded_at": now_utc().isoformat(),
        "uploaded_by": current.user_id,
    }
    await coll.update_one({"id": oid}, {"$push": {"attachments": attachment}})
    updated = await coll.find_one({"id": oid}, {"_id": 0})
    return updated


async def _voucher_detach(kind: str, oid: str, path: str):
    if kind not in _VOUCHER_COLLECTIONS:
        raise HTTPException(status_code=400, detail="Invalid voucher kind")
    coll = getattr(db, _VOUCHER_COLLECTIONS[kind])
    doc = await coll.find_one({"id": oid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail=f"{kind[:-1].title()} not found")
    await coll.update_one({"id": oid}, {"$pull": {"attachments": {"path": path}}})
    return await coll.find_one({"id": oid}, {"_id": 0})


@api_router.post("/invoices/{iid}/attachments", response_model=Invoice)
async def upload_invoice_file(iid: str, file: UploadFile = File(...), current: User = Depends(get_current_user)):
    d = await _voucher_attach("invoices", iid, file, current)
    return Invoice(**d)


@api_router.delete("/invoices/{iid}/attachments", response_model=Invoice)
async def delete_invoice_attachment(iid: str, path: str, current: User = Depends(get_current_user)):
    d = await _voucher_detach("invoices", iid, path)
    return Invoice(**d)


@api_router.post("/expenses/{eid}/attachments", response_model=Expense)
async def upload_expense_file(eid: str, file: UploadFile = File(...), current: User = Depends(get_current_user)):
    d = await _voucher_attach("expenses", eid, file, current)
    return Expense(**d)


@api_router.delete("/expenses/{eid}/attachments", response_model=Expense)
async def delete_expense_attachment(eid: str, path: str, current: User = Depends(get_current_user)):
    d = await _voucher_detach("expenses", eid, path)
    return Expense(**d)


@api_router.post("/income/{iid}/attachments", response_model=Income)
async def upload_income_file(iid: str, file: UploadFile = File(...), current: User = Depends(get_current_user)):
    d = await _voucher_attach("incomes", iid, file, current)
    return Income(**d)


@api_router.delete("/income/{iid}/attachments", response_model=Income)
async def delete_income_attachment(iid: str, path: str, current: User = Depends(get_current_user)):
    d = await _voucher_detach("incomes", iid, path)
    return Income(**d)


# ============ Accounting: Dashboard, Cash & Bank Book, Ledgers ============
def _sum(docs: list, key: str = "amount") -> float:
    return round(sum(float(d.get(key) or 0) for d in docs), 2)


@api_router.get("/accounting/dashboard")
async def accounting_dashboard(current: User = Depends(get_current_user)):
    from datetime import timedelta as _td
    today = datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.now() - _td(days=1)).strftime("%Y-%m-%d")
    month = today[:7]

    inc_today = await db.income.find({"date": today}, {"_id": 0}).to_list(500)
    exp_today = await db.expenses.find({"date": today}, {"_id": 0}).to_list(500)
    inc_yest = await db.income.find({"date": yesterday}, {"_id": 0}).to_list(500)
    exp_yest = await db.expenses.find({"date": yesterday}, {"_id": 0}).to_list(500)
    inc_month = await db.income.find({"date": {"$regex": f"^{month}"}}, {"_id": 0}).to_list(2000)
    exp_month = await db.expenses.find({"date": {"$regex": f"^{month}"}, "status": {"$in": ["verified", "approved", "pending"]}}, {"_id": 0}).to_list(2000)
    all_inc = await db.income.find({}, {"_id": 0}).to_list(5000)
    all_exp = await db.expenses.find({"status": {"$in": ["verified", "approved", "pending"]}}, {"_id": 0}).to_list(5000)

    cash_income = _sum([d for d in all_inc if d.get("payment_mode") == "cash"])
    cash_expense = _sum([d for d in all_exp if d.get("payment_mode") == "cash"])
    cash_in_hand = round(cash_income - cash_expense, 2)

    bank_accounts = await db.bank_accounts.find({}, {"_id": 0}).to_list(200)
    bank_balances = []
    total_bank = 0.0
    for b in bank_accounts:
        cred = _sum([d for d in all_inc if d.get("bank_account_id") == b["id"]])
        deb = _sum([d for d in all_exp if d.get("bank_account_id") == b["id"]])
        bal = round(float(b.get("opening_balance") or 0) + cred - deb, 2)
        total_bank += bal
        bank_balances.append({"id": b["id"], "name": b["name"], "bank_name": b["bank_name"], "account_no": b["account_no"], "balance": bal})

    tasks = await db.tasks.find({}, {"_id": 0, "dues_amount": 1, "created_at": 1}).to_list(5000)
    total_outstanding = round(sum(float(t.get("dues_amount") or 0) for t in tasks if (t.get("dues_amount") or 0) > 0), 2)

    # Aging buckets from tasks
    now = datetime.now(timezone.utc)
    buckets = {"0-30": 0.0, "31-60": 0.0, "61-90": 0.0, "90+": 0.0}
    for t in tasks:
        due = float(t.get("dues_amount") or 0)
        if due <= 0: continue
        ca = t.get("created_at")
        if ca and hasattr(ca, "tzinfo"):
            if ca.tzinfo is None: ca = ca.replace(tzinfo=timezone.utc)
            age = (now - ca).days
        else: age = 0
        if age <= 30: buckets["0-30"] += due
        elif age <= 60: buckets["31-60"] += due
        elif age <= 90: buckets["61-90"] += due
        else: buckets["90+"] += due

    # Monthly series (last 7 months)
    series = []
    for i in range(6, -1, -1):
        d = (datetime.now() - _td(days=30 * i))
        ym = d.strftime("%Y-%m")
        mi = _sum([r for r in all_inc if (r.get("date") or "").startswith(ym)])
        me = _sum([r for r in all_exp if (r.get("date") or "").startswith(ym)])
        series.append({"label": d.strftime("%b"), "income": mi, "expense": me})

    # Top services / employees (this month)
    from collections import defaultdict
    svc_map, emp_map = defaultdict(float), defaultdict(float)
    for r in inc_month:
        svc_map[r.get("service_category") or "Other"] += float(r.get("amount") or 0)
        if r.get("employee_name"): emp_map[r["employee_name"]] += float(r.get("amount") or 0)
    top_services = [{"name": k, "amount": round(v, 2)} for k, v in sorted(svc_map.items(), key=lambda x: -x[1])[:5]]
    top_employees = [{"name": k, "amount": round(v, 2)} for k, v in sorted(emp_map.items(), key=lambda x: -x[1])[:5]]

    recent_collections = sorted(all_inc, key=lambda x: (x.get("date") or "", x.get("created_at") or ""), reverse=True)[:5]
    recent_expenses = sorted(all_exp, key=lambda x: (x.get("date") or "", x.get("created_at") or ""), reverse=True)[:5]

    return {
        "today_income": _sum(inc_today),
        "today_expense": _sum(exp_today),
        "yesterday_income": _sum(inc_yest),
        "yesterday_expense": _sum(exp_yest),
        "cash_in_hand": cash_in_hand,
        "total_bank": round(total_bank, 2),
        "bank_balances": bank_balances,
        "total_outstanding": total_outstanding,
        "outstanding_clients": sum(1 for t in tasks if (t.get("dues_amount") or 0) > 0),
        "pending_expense_approvals": await db.expenses.count_documents({"status": "pending"}),
        "month_income": _sum(inc_month),
        "month_expense": _sum(exp_month),
        "month_profit": round(_sum(inc_month) - _sum(exp_month), 2),
        "monthly_series": series,
        "top_services": top_services,
        "top_employees": top_employees,
        "recent_collections": recent_collections,
        "recent_expenses": recent_expenses,
        "aging_buckets": {k: round(v, 2) for k, v in buckets.items()},
    }


@api_router.get("/accounting/cash-book")
async def cash_book(from_date: Optional[str] = None, to_date: Optional[str] = None, current: User = Depends(get_current_user)):
    q_inc: dict = {"payment_mode": "cash"}
    q_exp: dict = {"payment_mode": "cash"}
    if from_date or to_date:
        d: dict = {}
        if from_date: d["$gte"] = from_date
        if to_date: d["$lte"] = to_date
        q_inc["date"] = d; q_exp["date"] = d
    inc = await db.income.find(q_inc, {"_id": 0}).to_list(2000)
    exp = await db.expenses.find(q_exp, {"_id": 0}).to_list(2000)
    entries = []
    for d in inc:
        entries.append({"date": d["date"], "type": "in", "amount": d["amount"], "party": d.get("client_name"), "category": d.get("service_category"), "no": d.get("income_no"), "id": d["id"]})
    for d in exp:
        entries.append({"date": d["date"], "type": "out", "amount": d["amount"], "party": d.get("vendor"), "category": d.get("category"), "no": d.get("expense_no"), "id": d["id"]})
    entries.sort(key=lambda x: x["date"])
    running = 0.0
    for e in entries:
        running += e["amount"] if e["type"] == "in" else -e["amount"]
        e["running"] = round(running, 2)
    total_in = _sum([e for e in entries if e["type"] == "in"])
    total_out = _sum([e for e in entries if e["type"] == "out"])
    return {"entries": entries, "total_in": total_in, "total_out": total_out, "closing": round(total_in - total_out, 2)}


@api_router.get("/accounting/bank-book")
async def bank_book(bank_id: str, from_date: Optional[str] = None, to_date: Optional[str] = None, current: User = Depends(get_current_user)):
    b = await db.bank_accounts.find_one({"id": bank_id}, {"_id": 0})
    if not b: raise HTTPException(status_code=404, detail="Bank account not found")
    q_inc: dict = {"bank_account_id": bank_id}
    q_exp: dict = {"bank_account_id": bank_id}
    if from_date or to_date:
        d: dict = {}
        if from_date: d["$gte"] = from_date
        if to_date: d["$lte"] = to_date
        q_inc["date"] = d; q_exp["date"] = d
    inc = await db.income.find(q_inc, {"_id": 0}).to_list(2000)
    exp = await db.expenses.find(q_exp, {"_id": 0}).to_list(2000)
    entries = []
    for d in inc:
        entries.append({"date": d["date"], "type": "credit", "amount": d["amount"], "party": d.get("client_name"), "category": d.get("service_category"), "no": d.get("income_no"), "id": d["id"]})
    for d in exp:
        entries.append({"date": d["date"], "type": "debit", "amount": d["amount"], "party": d.get("vendor"), "category": d.get("category"), "no": d.get("expense_no"), "id": d["id"]})
    entries.sort(key=lambda x: x["date"])
    running = float(b.get("opening_balance") or 0)
    for e in entries:
        running += e["amount"] if e["type"] == "credit" else -e["amount"]
        e["running"] = round(running, 2)
    return {"bank": b, "entries": entries, "closing": round(running, 2)}


@api_router.get("/accounting/client-ledger")
async def client_ledger(client_id: str, current: User = Depends(get_current_user)):
    client = await db.customers.find_one({"id": client_id}, {"_id": 0})
    if not client: raise HTTPException(status_code=404, detail="Client not found")
    inc = await db.income.find({"client_id": client_id}, {"_id": 0}).sort("date", -1).to_list(1000)
    # Total service value + dues from tasks (basic linking: matching customer via voucher_no or assignee — here we just show all tasks with this client via task.description or nothing)
    total_received = _sum(inc)
    return {
        "client": {"id": client["id"], "name": client["name"], "mobile": client.get("mobile"), "customer_code": client.get("customer_code")},
        "income_entries": inc,
        "total_received": total_received,
    }


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
async def _save_tender_file(current: User, file: UploadFile) -> dict:
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:  # tenders can be a bit bigger, 25 MB cap
        raise HTTPException(status_code=400, detail="File exceeds 25 MB limit")
    ext = (file.filename or "file").rsplit(".", 1)[-1].lower()
    ext = ext if len(ext) <= 8 else "bin"
    path = f"{APP_NAME}/uploads/{current.user_id}/{uuid.uuid4().hex}.{ext}"
    ct = file.content_type or "application/octet-stream"
    await run_in_threadpool(put_object, path, data, ct)
    return {
        "path": path, "name": file.filename or f"file.{ext}", "size": len(data),
        "content_type": ct, "uploaded_at": now_utc().isoformat(), "uploaded_by": current.user_id,
    }


@api_router.post("/tenders", response_model=Tender)
async def create_tender(payload: TenderInput, current: User = Depends(get_current_user)):
    counter = await db.counters.find_one_and_update(
        {"_id": "tender_code"}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER,
    )
    seq = (counter or {}).get("seq") or 1
    tender_code = f"TND-{seq:04d}"
    t = Tender(**payload.dict(), tender_code=tender_code, title=payload.name_of_work,
               submission_deadline=payload.last_date, value=payload.estimated_cost,
               created_by=current.user_id)
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
    updates = payload.dict()
    updates["title"] = payload.name_of_work
    updates["value"] = payload.estimated_cost
    updates["submission_deadline"] = payload.last_date
    await db.tenders.update_one({"id": tid}, {"$set": updates})
    d = await db.tenders.find_one({"id": tid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return Tender(**d)


@api_router.delete("/tenders/{tid}")
async def delete_tender(tid: str, current: User = Depends(require_admin_or_manager)):
    res = await db.tenders.delete_one({"id": tid})
    return {"deleted": res.deleted_count}


@api_router.post("/tenders/{tid}/nit-copy", response_model=Tender)
async def upload_nit_copy(tid: str, file: UploadFile = File(...), current: User = Depends(get_current_user)):
    d = await db.tenders.find_one({"id": tid}, {"_id": 0})
    if not d: raise HTTPException(status_code=404, detail="Tender not found")
    meta = await _save_tender_file(current, file)
    await db.tenders.update_one({"id": tid}, {"$set": {"nit_copy": meta}})
    d2 = await db.tenders.find_one({"id": tid}, {"_id": 0})
    return Tender(**d2)


@api_router.post("/tenders/{tid}/boq", response_model=Tender)
async def upload_boq(tid: str, file: UploadFile = File(...), current: User = Depends(get_current_user)):
    d = await db.tenders.find_one({"id": tid}, {"_id": 0})
    if not d: raise HTTPException(status_code=404, detail="Tender not found")
    meta = await _save_tender_file(current, file)
    await db.tenders.update_one({"id": tid}, {"$set": {"boq": meta}})
    d2 = await db.tenders.find_one({"id": tid}, {"_id": 0})
    return Tender(**d2)


@api_router.post("/tenders/{tid}/documents", response_model=Tender)
async def upload_tender_document(tid: str, file: UploadFile = File(...), current: User = Depends(get_current_user)):
    d = await db.tenders.find_one({"id": tid}, {"_id": 0})
    if not d: raise HTTPException(status_code=404, detail="Tender not found")
    meta = await _save_tender_file(current, file)
    await db.tenders.update_one({"id": tid}, {"$push": {"other_documents": meta}})
    d2 = await db.tenders.find_one({"id": tid}, {"_id": 0})
    return Tender(**d2)


@api_router.delete("/tenders/{tid}/documents", response_model=Tender)
async def delete_tender_document(tid: str, path: str, current: User = Depends(get_current_user)):
    await db.tenders.update_one({"id": tid}, {"$pull": {"other_documents": {"path": path}}})
    d = await db.tenders.find_one({"id": tid}, {"_id": 0})
    return Tender(**d)


# Legacy single-file upload — keep so any lingering UI works
@api_router.post("/tenders/{tid}/upload", response_model=Tender)
async def upload_tender_file(tid: str, file: UploadFile = File(...), current: User = Depends(get_current_user)):
    d = await db.tenders.find_one({"id": tid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Tender not found")
    meta = await _save_tender_file(current, file)
    await db.tenders.update_one({"id": tid}, {"$set": {"other_documents_legacy": meta, "file_path": meta["path"], "file_name": meta["name"]}, "$push": {"other_documents": meta}})
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


# ============ Office Settings ============
async def get_office_settings_doc() -> dict:
    doc = await db.office_settings.find_one({"_id": "singleton"}, {"_id": 0})
    if not doc:
        default = OfficeSettings().dict()
        await db.office_settings.insert_one({"_id": "singleton", **default})
        return default
    return doc


@api_router.get("/office-settings", response_model=OfficeSettings)
async def get_office_settings(current: User = Depends(get_current_user)):
    doc = await get_office_settings_doc()
    return OfficeSettings(**doc)


@api_router.put("/office-settings", response_model=OfficeSettings)
async def update_office_settings(payload: OfficeSettingsInput, current: User = Depends(require_admin)):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if updates:
        await db.office_settings.update_one({"_id": "singleton"}, {"$set": updates}, upsert=True)
    doc = await get_office_settings_doc()
    return OfficeSettings(**doc)


# ============ Offices (multi-office) ============
@api_router.get("/offices", response_model=List[Office])
async def list_offices(current: User = Depends(get_current_user)):
    docs = await db.offices.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [Office(**d) for d in docs]


@api_router.post("/offices", response_model=Office)
async def create_office(payload: OfficeInput, current: User = Depends(require_admin)):
    o = Office(**payload.dict())
    await db.offices.insert_one(o.dict())
    return o


@api_router.patch("/offices/{oid}", response_model=Office)
async def update_office(oid: str, payload: OfficeUpdate, current: User = Depends(require_admin)):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if updates:
        await db.offices.update_one({"id": oid}, {"$set": updates})
    d = await db.offices.find_one({"id": oid}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    return Office(**d)


@api_router.delete("/offices/{oid}")
async def delete_office(oid: str, current: User = Depends(require_admin)):
    res = await db.offices.delete_one({"id": oid})
    return {"deleted": res.deleted_count}


# ============ Punches ============
def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    import math
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _parse_hhmm(s: str) -> tuple:
    try:
        h, m = s.split(":")
        return int(h), int(m)
    except Exception:
        return 9, 0


@api_router.post("/punches", response_model=PunchRecord)
async def create_punch(
    type: str = Form(...),  # "in" or "out"
    lat: Optional[float] = Form(None),
    lng: Optional[float] = Form(None),
    accuracy: Optional[float] = Form(None),
    selfie: UploadFile = File(...),
    current: User = Depends(get_current_user),
):
    if type not in ("in", "out"):
        raise HTTPException(status_code=400, detail="type must be 'in' or 'out'")

    now = datetime.now(timezone.utc)
    # local IST for date/time display (server can be UTC)
    ist = now.astimezone(tz=None) if True else now
    date_str = ist.strftime("%Y-%m-%d")
    time_str = ist.strftime("%H:%M:%S")

    # Enforce 10 punches per day (counting both in+out)
    todays = await db.punches.count_documents({"user_id": current.user_id, "date": date_str})
    if todays >= 10:
        raise HTTPException(status_code=400, detail="Daily punch limit reached (10)")

    # Selfie mandatory
    if not selfie:
        raise HTTPException(status_code=400, detail="Selfie is mandatory")
    data = await selfie.read()
    if not data:
        raise HTTPException(status_code=400, detail="Selfie is empty")
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Selfie exceeds 10 MB limit")

    settings = await get_office_settings_doc()

    # Resolve employee's assigned office; auto-provision employee record if missing
    emp = await db.employees.find_one({"email": current.email}, {"_id": 0})
    if not emp:
        # Auto-create a stub employee for this user so admin can just assign an office
        counter = await db.counters.find_one_and_update(
            {"_id": "employee_code"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        seq = (counter or {}).get("seq") or 1
        ddmmyyyy = _ddmmyyyy(None)
        stub = Employee(
            name=current.name, email=current.email, role=current.role,
            employee_code=f"TDSC{seq:02d}{ddmmyyyy}",
        )
        await db.employees.insert_one(stub.dict())
        emp = stub.dict()

    office = None
    if emp.get("office_id"):
        office = await db.offices.find_one({"id": emp["office_id"]}, {"_id": 0})
    within = True
    distance = None
    if type == "in":
        if not office:
            raise HTTPException(status_code=400, detail="You are not assigned to any office. Ask admin to assign a posting office.")
        if lat is None or lng is None:
            raise HTTPException(status_code=400, detail="Location required for punch-in")
        distance = _haversine_m(lat, lng, office["lat"], office["lng"])
        radius = int(office.get("radius_m") or 20)
        within = distance <= radius
        if not within:
            raise HTTPException(status_code=400, detail=f"You are {int(distance)} m from '{office['name']}'. Must be within {radius} m to punch in.")
    else:
        # punch-out anywhere
        if lat is not None and lng is not None and office:
            distance = _haversine_m(lat, lng, office["lat"], office["lng"])
            within = distance <= int(office.get("radius_m") or 20)

    # Late detection on punch-in
    is_late = False
    if type == "in":
        sh, sm = _parse_hhmm(settings.get("start_time") or "09:00")
        grace = int(settings.get("grace_minutes") or 0)
        limit = ist.replace(hour=sh, minute=sm, second=0, microsecond=0) + timedelta(minutes=grace)
        is_late = ist > limit

    # Upload selfie
    ext = (selfie.filename or "img").rsplit(".", 1)[-1].lower()
    ext = ext if len(ext) <= 8 else "jpg"
    path = f"{APP_NAME}/uploads/{current.user_id}/{uuid.uuid4().hex}.{ext}"
    await run_in_threadpool(put_object, path, data, selfie.content_type or "image/jpeg")

    emp_code = emp.get("employee_code") if emp else None

    rec = PunchRecord(
        user_id=current.user_id, user_name=current.name, employee_code=emp_code,
        office_id=(office or {}).get("id"), office_name=(office or {}).get("name"),
        type=type, date=date_str, time=time_str,
        lat=lat, lng=lng, accuracy=accuracy, distance_m=distance,
        within_geofence=within, is_late=is_late, selfie_path=path,
    )
    await db.punches.insert_one(rec.dict())
    return rec


@api_router.get("/punches", response_model=List[PunchRecord])
async def list_punches(date: Optional[str] = None, month: Optional[str] = None, user_id: Optional[str] = None, current: User = Depends(get_current_user)):
    q: dict = {}
    if current.role in ("admin", "manager"):
        if user_id:
            q["user_id"] = user_id
    else:
        q["user_id"] = current.user_id
    if date:
        q["date"] = date
    if month:  # YYYY-MM
        q["date"] = {"$regex": f"^{month}"}
    docs = await db.punches.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [PunchRecord(**d) for d in docs]


@api_router.get("/punches/today/summary")
async def today_summary(current: User = Depends(get_current_user)):
    date_str = datetime.now().strftime("%Y-%m-%d")
    docs = await db.punches.find({"user_id": current.user_id, "date": date_str}, {"_id": 0}).sort("created_at", 1).to_list(50)
    ins = [d for d in docs if d["type"] == "in"]
    outs = [d for d in docs if d["type"] == "out"]
    late_count = sum(1 for d in ins if d.get("is_late"))
    return {
        "date": date_str,
        "count": len(docs),
        "remaining": max(0, 10 - len(docs)),
        "last_type": docs[-1]["type"] if docs else None,
        "last_time": docs[-1]["time"] if docs else None,
        "punches_in": len(ins),
        "punches_out": len(outs),
        "late_count": late_count,
        "records": docs,
    }


# ============ Payroll ============
@api_router.get("/payroll")
async def payroll_summary(month: str, current: User = Depends(require_admin_or_manager)):
    # month = YYYY-MM
    settings = await get_office_settings_doc()
    working_days = int(settings.get("working_days_per_month") or 26)
    fine_per_day = float(settings.get("late_fine_per_day") or 0)
    employees = await db.employees.find({}, {"_id": 0}).to_list(500)
    result = []
    for e in employees:
        gross = float(e.get("gross_amount") or 0)
        per_day = gross / working_days if working_days else 0

        # Attendance: distinct dates with at least one punch-in this month
        dates = await db.punches.distinct("date", {
            "user_id": {"$exists": True},
            "type": "in",
            "date": {"$regex": f"^{month}"},
        })
        # Filter dates to this employee via email->user
        user_doc = await db.users.find_one({"email": e.get("email")}, {"_id": 0, "user_id": 1})
        emp_user_id = user_doc.get("user_id") if user_doc else None
        emp_dates = []
        if emp_user_id:
            emp_dates = await db.punches.distinct("date", {"user_id": emp_user_id, "type": "in", "date": {"$regex": f"^{month}"}})
        days_present = len(emp_dates)

        # Late days this month
        late_days = 0
        if emp_user_id:
            late_days = await db.punches.count_documents({"user_id": emp_user_id, "type": "in", "is_late": True, "date": {"$regex": f"^{month}"}})

        earned = round(per_day * days_present, 2)
        late_fine = round(fine_per_day * late_days, 2)
        deductions = float(e.get("ded_epfo") or 0) + float(e.get("ded_esic") or 0) + float(e.get("ded_advance") or 0) + float(e.get("ded_other") or 0)
        net = round(earned - late_fine - deductions, 2)
        result.append({
            "employee_id": e.get("id"),
            "employee_code": e.get("employee_code"),
            "name": e.get("name"),
            "designation": e.get("designation"),
            "gross_configured": gross,
            "per_day": round(per_day, 2),
            "days_present": days_present,
            "working_days": working_days,
            "earned": earned,
            "late_days": late_days,
            "late_fine": late_fine,
            "deductions": round(deductions, 2),
            "net_payable": net,
        })
    return {"month": month, "settings": {"working_days_per_month": working_days, "late_fine_per_day": fine_per_day}, "employees": result}


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


@api_router.get("/health")
async def api_health():
    return {"status": "ok"}


@app.api_route("/health", methods=["GET", "HEAD"], include_in_schema=False)
async def app_health():
    return {"status": "ok"}


@app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
async def app_root():
    """Root handler for Kubernetes/LB probes that hit '/' on the backend port.
    Returns 200 so the load balancer keeps the container marked healthy."""
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

        # Migration: TRV-CUST-XXXX → TDSC-CUST-ID-00000XXX (8-digit padded)
        try:
            cursor = db.customers.find({"customer_code": {"$regex": "^TRV-CUST-"}}, {"_id": 0, "id": 1, "customer_code": 1})
            legacy = await cursor.to_list(10000)
            max_seq = 0
            migrated = 0
            for c in legacy:
                old = c.get("customer_code") or ""
                try:
                    seq = int(old.rsplit("-", 1)[-1])
                except Exception:
                    continue
                if seq > max_seq: max_seq = seq
                new_code = f"TDSC-CUST-ID-{seq:08d}"
                await db.customers.update_one({"id": c["id"]}, {"$set": {"customer_code": new_code}})
                # Also propagate to tasks with denormalised customer_code
                await db.tasks.update_many({"customer_code": old}, {"$set": {"customer_code": new_code}})
                migrated += 1
            if migrated > 0:
                # Bump counter so future codes continue from max_seq
                counter_doc = await db.counters.find_one({"_id": "customer_code"}, {"_id": 0}) or {}
                current_seq = int(counter_doc.get("seq") or 0)
                if current_seq < max_seq:
                    await db.counters.update_one({"_id": "customer_code"}, {"$set": {"seq": max_seq}}, upsert=True)
                logger.info("Migrated %d customer_codes from TRV-CUST-* to TDSC-CUST-ID-* format", migrated)
        except Exception as _e:
            logger.exception("Customer code migration failed: %s", _e)

        # Seed demo accounts — controlled by SEED_DEMO_ACCOUNTS env var.
        # Disabled by default in production. Enable only in preview environments by
        # setting SEED_DEMO_ACCOUNTS=true AND providing SEED_*_PASSWORD values via env.
        if os.environ.get("SEED_DEMO_ACCOUNTS", "false").lower() in ("1", "true", "yes"):
            admin_email = os.environ.get("SEED_ADMIN_EMAIL", "admin@triveni.com")
            admin_pass = os.environ.get("SEED_ADMIN_PASSWORD")
            if admin_pass and not await db.users.find_one({"email": admin_email}):
                admin = User(user_id=new_id("usr"), email=admin_email, name="Triveni Admin", role="admin")
                doc = admin.dict()
                doc["password_hash"] = hash_password(admin_pass)
                await db.users.insert_one(doc)
                logger.info("Seeded admin user")

            mgr_email = os.environ.get("SEED_MANAGER_EMAIL", "manager@triveni.com")
            mgr_pass = os.environ.get("SEED_MANAGER_PASSWORD")
            if mgr_pass and not await db.users.find_one({"email": mgr_email}):
                mgr = User(user_id=new_id("usr"), email=mgr_email, name="Ravi Manager", role="manager")
                doc = mgr.dict()
                doc["password_hash"] = hash_password(mgr_pass)
                await db.users.insert_one(doc)

            emp_email = os.environ.get("SEED_EMPLOYEE_EMAIL", "employee@triveni.com")
            emp_pass = os.environ.get("SEED_EMPLOYEE_PASSWORD")
            if emp_pass and not await db.users.find_one({"email": emp_email}):
                emp = User(user_id=new_id("usr"), email=emp_email, name="Anita Employee", role="employee")
                doc = emp.dict()
                doc["password_hash"] = hash_password(emp_pass)
                await db.users.insert_one(doc)
        else:
            logger.info("SEED_DEMO_ACCOUNTS disabled — skipping demo user seeding")

        try:
            await run_in_threadpool(init_storage)
            logger.info("Storage initialized")
        except Exception as e:
            logger.warning(f"Storage init failed at startup (non-fatal): {e}")

        # Seed default workflow + task types
        try:
            await _ensure_seed_workflows_and_types()
        except Exception as e:
            logger.warning(f"Seed workflows failed: {e}")
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
