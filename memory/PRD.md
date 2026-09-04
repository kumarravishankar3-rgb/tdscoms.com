# PRD — TDSC Office Management System

Enterprise mobile app for **Triveni DSC & e-Tender Service Private Limited** covering the six core business modules.

## Stack
- Expo SDK 54 (React Native), Expo Router, TypeScript
- FastAPI + Motor (MongoDB)
- Auth: Email/password (bcrypt) + Emergent Google OAuth
- Storage: Emergent Managed Object Storage (tender documents)

## Roles
`admin`, `manager`, `employee` — enforced on privileged mutations.

## Modules
| Module | Notes |
|---|---|
| Dashboard | KPIs, urgent tenders, quick actions |
| Customers | 36-field contractor profile with auto Customer ID `TRV-CUST-0001…`; sections for eProc2, Railway, CPP, GST, EPFO, DSC, ISO, GEM, PMGSY & Other Portal credentials |
| Employees | Directory + add (admin/manager) |
| Tasks | Todo/Doing/Done pipeline |
| Accounts | Invoice / Expense entries |
| HR | Attendance check-in/out + Leave requests with approval |
| Tenders | List / detail / document upload via Object Storage |

## Customer form mandatory fields
Contractor Name, Mobile No., WhatsApp No., PAN No., Aadhar No. All other fields optional.

## Auto ID
Sequential `TRV-CUST-####` generated atomically via a MongoDB counter on insert.

## Test accounts
See `/app/memory/test_credentials.md`.

---

## Accounts Module — Phase 2 (Vyapar Clone) — DONE 2026-08-30

### Menu Structure (matches Vyapar reference images 5–10)
- Route: `/accounting/menu` (entry from More → Accounting)
- 4 tabs: **My Business • Reports • Bank • Settings**
- **My Business**: SALE (8 items incl Invoice, Payment-In, Estimate, POS…), PURCHASE (4 items), EXPENSE (Add / All / Categories)
- **Reports**: 7 sections (Transaction / Party / GST / Expense / Order / Loan / Item-Stock) with per-row **star favourites** persisted in SecureStore
- **Bank**: Card view with masked account, colour-coded balance (green/red), Share, Bank Book, Manage buttons
- **Settings**: 9 rows (General, Transaction, Invoice Print, Taxes & GST, User Management, SMS, Reminders, Party, Item)

### Sale Invoice screen — `/accounting/invoices/new`
- Credit / Cash toggle, auto Invoice No preview (`SI-000X`)
- Date + Payment Terms dropdown (Net 15/30/45/60/90/Custom) + auto Due On
- Mandatory Customer field → `CustomerSearchModal`
- Add Items line editor with qty × price × GST × discount (server-recalculates)
- Barcode scanner icon placeholder (works on native build)
- Bottom total bar with Save & New / Save

### Multi-field Customer Search + Duplicate Prevention
- `GET /api/customers/search?q=` — regex across name / customer_code / mobile / whatsapp / PAN / Aadhar / email / GST no / contractor_reg_no
- Duplicate detection on `POST /api/customers`, `POST /api/customers/quick`, and `PUT /api/customers/{cid}` — 409 with `matched_on[]` and `existing{...}`
- `POST /api/customers/quick` — inline party add from voucher/invoice screens
- Excludes `NA / N/A / NONE / -` sentinels from unique-field scan

### Inline Item catalog
- `/api/items` full CRUD with case-insensitive name uniqueness (409 on duplicate)
- `ItemSearchModal` reusable — inline "New Item" with Product / Service toggle

### Duplicate Invoice Guard
- `POST /api/invoices` — 409 if same party_id + date + invoice_type already exists (non-cancelled)
- Auto GST calculation on server: `subtotal, total_discount, total_tax, total_amount, balance, status`
- Sale invoices auto-create a linked `/api/income` entry so Dashboard reflects revenue

### New reusable components
- `src/CustomerSearchModal.tsx` (with `AddPartyModal`)
- `src/ItemSearchModal.tsx` (with `AddItemModal`)

### Backend tests
- 27/27 pytest cases green in `test_reports/iteration_2.json`

---

## Voucher Attachments — DONE 2026-08-30

### Backend
- `Invoice`, `Expense`, `Income` models now carry `attachments: List[dict]`
- Endpoints: `POST/DELETE /api/invoices/{iid}/attachments`, `POST/DELETE /api/expenses/{eid}/attachments`, `POST/DELETE /api/income/{iid}/attachments`
- Uses Emergent Object Storage. 10 MB per-file cap enforced (HTTP 400 on excess). Any file type accepted.
- Metadata stored: `path, name, size, content_type, uploaded_at, uploaded_by`
- 9/9 pytest cases green in `test_reports/iteration_3.json`

### Frontend
- Reusable `AttachmentsSection` component (`src/AttachmentsSection.tsx`) — supports two modes:
  1. Draft (new voucher): queue files locally, upload after save
  2. Existing voucher: immediate upload/delete against the server
- File-type-aware icons (PDF red, Image purple, Excel green, others blue)
- Integrated in: Sale Invoice / Purchase Bill new form, Expense new form, Payment-In (Income) new form
- New Invoice detail view (`/accounting/invoices/[id]`) shows attachments with add/delete
- New Invoice list view (`/accounting/invoices?type=sale|purchase`) shows attachment-count chip
- Menu updated with "All Sale Invoices" and "All Purchase Bills" list entries

---

## Task Customer Details + Auto-Tasks on Sale Voucher — DONE 2026-08-30

### Task Customer Details block
- `Task` / `TaskInput` / `TaskUpdate` now carry: `customer_id, customer_code, customer_name, customer_mobile, customer_pan, customer_address`
- `/tasks/new` shows a **Customer Details** card with **Search** button opening `CustomerSearchModal` (multi-field: ID/Name/Mobile/PAN/Aadhar/EPFO/GST/Reg No) with inline "New Party" support and duplicate blocking
- `/tasks/[id]` shows the saved customer details block (ID / Name / Mobile / PAN / Address)

### Auto-created tasks on Sale Voucher save
- Every sale invoice save triggers 2 tasks (best-effort, invoice not blocked on failure):
  1. **Service Task** — priority `high`, deadline = invoice_date + `default_deadline_days`
  2. **Follow-up Task** — priority `high` (medium if paid), deadline = invoice_date + `default_followup_days`
- Both tasks carry: customer_id/code/name/mobile/PAN/address, voucher_no, voucher_date, total_amount, paid_amount, dues_amount, assignee (from service setting)

### Admin Service-wise Task Assignment
- Screen: `/accounting/settings/service-tasks` (wired in Vyapar Settings tab under "Automation")
- Global toggle: **Auto-create Tasks on Sale Voucher** (ON by default)
- Per-service settings: default employee picker, service deadline days, follow-up deadline days, per-service auto toggle
- Backend endpoints: `GET/POST/PATCH/DELETE /api/settings/service-tasks`, `GET/PUT /api/settings/auto-task-toggle`
- 5 defaults auto-seeded: DSC, GST, Tender, Income Tax, Registration Service
- Service matching: first line item name (case-insensitive slug) → service_key. Fallback → first setting.

### Testing
- iteration_5: 17 pytest cases → 16 green, 1 minor UX defect (label-only POST needed service_key)
- iteration_6: fix applied (`Optional[str]=None`), rerun **17/17 green**

---

## Sale Invoice PDF + Permissions + Payment Details — DONE 2026-08-30

### PDF generation (matches reference layout)
- `GET /api/invoices/{iid}/pdf` — server-side ReportLab PDF, supports **Bearer header** OR `?token=` query for browser open
- Company constants hard-coded to actual TDSC branding (name, address, phone, email, GSTIN, state, bank SBI SME BIHARSHARIFF, A/C 42137607814, IFSC SBIN0063706, signatory अंजू कुमारी)
- Sections: company header (left) / Tax Invoice + meta grid (right) → Bill To → items table with dark header + total row → Amount in words + Amounts breakdown (Sub Total / Total / Received / Balance) → Description + Terms + For/Signatory (3-col) → Bank Details block
- Payment mode & cash denomination shown in Description block

### Permissions (role-gated)
- **Print** (`GET /api/invoices/{iid}/pdf`): any authenticated user (admin + employee)
- **Edit** (`PATCH /api/invoices/{iid}`): **admin only** (403 for employee)
- **Delete** (`DELETE /api/invoices/{iid}`): **admin only** (was admin_or_manager)
- Frontend list & detail views hide Edit/Delete buttons for non-admin

### Payment details (3 new form fields)
- `payment_mode` field added to `Invoice` + `InvoiceInput` (default `cash`, options: cash / bank_transfer / cheque / upi / other)
- Invoice form new section "PAYMENT DETAILS" with **Paid Amount** input, **Dues** auto-calc (Total − Paid), **Payment Mode** dropdown (5 options with icons)
- Cash payment_type auto-fills paid = total; credit allows partial pay entry
- Backend recalculates `paid_amount, balance, status` on both POST and PATCH
- PDF shows "Payment Mode: <mode>" in Description block

### Testing
- 18/18 pytest cases green in `test_reports/iteration_7.json`
- Covers: 5 payment modes + default, POST persistence, PATCH full-pay + item add + recalc, 404 guards, **403 role guard live-tested with employee@triveni.com**, PDF via both Bearer + ?token, PDF for employee (Print allowed), missing/invalid token → 401

---

## Task Module: Edit / Delete / Bulk Delete — DONE 2026-08-31

### Backend
- `PATCH /api/tasks/{tid}` → **admin + manager** only (403 for employee)
- `DELETE /api/tasks/{tid}` → **admin only** (was admin+manager, tightened)
- `POST /api/tasks/bulk-delete` → **admin only**, body `{ids:[...]}`, returns `{deleted:N}`; empty & non-existent ids handled safely

### Frontend
- Tasks tab (`/(tabs)/tasks.tsx`) now has:
  - Header checkbox icon (admin only) → enters selection mode
  - Long-press any row → also enters selection mode with that row pre-selected
  - Per-row checkboxes + Select All / Deselect All toggle in header
  - Bottom bar with Cancel + `Delete Selected (N)` (admin only, disabled at 0)
  - Row-level Edit (`admin+manager`) and Delete (`admin`) inline buttons
- Task detail header (`/tasks/[id].tsx`): Edit + Delete buttons with role gating
- Task new form (`/tasks/new.tsx`) now supports `edit_id` param → loads existing task and calls `PATCH` on save; header switches to "Edit Task"

### Testing
- 18/18 pytest cases green in `test_reports/iteration_12.json`
- Frontend role visibility spot-check: admin sees everything, manager sees Edit only, employee sees no admin controls

---

## Customer ID Format Change — DONE 2026-08-31

### Format
- **Old**: `TRV-CUST-0056` (4-digit)
- **New**: `TDSC-CUST-ID-00000056` (8-digit zero-padded)
- Prefix change applies to future customers AND back-fills existing 52 customer records

### Backend
- `POST /api/customers` and `POST /api/customers/quick` now emit `TDSC-CUST-ID-{seq:08d}`
- Startup migration: rewrites every `TRV-CUST-XXXX` → `TDSC-CUST-ID-<8-padded>`, preserving the sequence number
- Also propagates new codes to denormalised `customer_code` field on Task rows (auto-task and manual)
- Counter bumped to max existing seq so future codes continue monotonically

### Search enhancement
- `GET /api/customers/search?q=`
  - Plain integer like `q=56` → matches `TDSC-CUST-ID-00000056` (adds an explicit zero-padded 8-digit regex clause to the $or query)
  - Full padded number `q=00000056` → matches exactly one customer
  - Existing multi-field search (name, mobile, PAN, Aadhar, email, GST, reg-no) unchanged

### Testing
- 14/14 pytest cases green in `test_reports/iteration_13.json`
- Covers new format on both creation endpoints, monotonic increment, zero legacy TRV-CUST left, numeric search variants, and sale-invoice auto-task denorm regression

---

## Customer + Employee CRUD with Role Permissions — DONE 2026-08-31

### Backend
- `PUT /api/customers/{cid}` → **admin + manager** (was any user), 403 for employee
- `DELETE /api/customers/{cid}` → **admin only** (was admin+manager)
- `PATCH /api/employees/{eid}` (admin+manager) — expanded allowed fields to include name, email, date_of_joining (previously blocked)
- `DELETE /api/employees/{eid}` — remains admin-only (regression-tested)

### Frontend
- **Customer** list rows (`business.tsx`) — inline Edit (admin+manager) + Delete (admin) buttons with confirm dialog
- **Customer** detail (`customers/[id].tsx`) — header Edit + Delete icons with role gating
- **Customer** form (`customers/new.tsx`) — supports `edit_id` param → loads existing customer, calls PUT on save, header switches to "Edit Customer"
- **Employee** list rows (`employees/index.tsx`) — inline Edit + Delete buttons under each row (below Assign Office button)
- **Employee** form (`employees/new.tsx`) — supports `edit_id` → loads existing, calls PATCH on save, header switches to "Edit Employee"
- Cross-platform `confirm()` used for delete dialogs (works on web + native)

### Testing
- 21/21 pytest cases green in `test_reports/iteration_14.json` — admin/manager/employee 403 boundaries on customer PUT/DELETE + employee PATCH/DELETE, duplicate 409 regression, invalid-id 404 on all

---

## Customer Print PDF + Bulk Delete — DONE 2026-08-31

### Backend
- `GET /api/customers/{cid}/pdf` — any authenticated user, generates 7-section profile card:
  1. Personal & Contact
  2. Address
  3. KYC & Identity (PAN/Aadhar/Voter/DL/Passport/GSTIN)
  4. Business & Registration (firm, contractor reg no, class, dept, dates)
  5. Banking (bank, IFSC, A/C, holder)
  6. DSC / Digital signature (serial, dates, class, CA, token)
  7. Notes / Remarks
- Supports Bearer header OR `?token=` query
- `POST /api/customers/bulk-delete` — admin only, `{ids:[]}` → `{deleted:N}` (safe on empty / non-existent)

### Frontend
- Business tab (`(tabs)/business.tsx`):
  - **Print** button on every customer row (all roles) — opens PDF in browser tab / native viewer
  - Selection mode toggle icon in header (admin only) — long-press any row also enters mode
  - Per-row checkbox + Select All / Deselect toggle + live "N selected" counter
  - Bottom bar with Cancel + Delete Selected (N) (admin only)
- Customer detail header (`customers/[id].tsx`): Print button added alongside Edit + Delete

### Testing
- 21/21 pytest cases green (`test_reports/iteration_15.json`) — PDF for all 3 roles, both auth methods, missing/invalid token → 401, invalid cid → 404, bulk-delete role guard for manager/employee/admin, empty & non-existent ids no-op, regression on iter_14 role gates


---

## Deployment Readiness Hardening — DONE 2026-06-15

### Backend
- Global `GET /health` on the app instance → `{"status":"ok"}` (was under `/api` prefix, causing deploy probe 404).
- Removed hardcoded fallback for `EMERGENT_AUTH_BASE_URL` in `/auth/session` — env-driven, 500 if missing.
- Removed hardcoded fallback for `INTEGRATION_PROXY_URL` (Object Storage base) — env-driven, warning logged if missing.
- `SEED_DEMO_ACCOUNTS` default flipped to `false`; when enabled, seed only proceeds if per-role `SEED_*_PASSWORD` env vars are provided (no source-code fallback passwords).
- Backend `/app/backend/.env` now carries preview values for `EMERGENT_AUTH_BASE_URL`, `INTEGRATION_PROXY_URL`, and all `SEED_*_PASSWORD` variables so preview builds keep working.

### App-Store Compliance — In-app Account Deletion
- Backend: `DELETE /api/auth/me` (authenticated). Blocks admin self-delete (prevents tenant lockout), deletes session tokens, deletes user doc, anonymizes any linked employee row.
- Frontend: "Delete My Account" link on More tab (non-admin roles only), native confirmation dialog with data-retention explanation. `deleteAccount()` added to `AuthContext`.
- Verified via curl: admin 400, employee 200, subsequent login 401.

### Deployment agent output
- Status: **warn** (all BLOCKERs cleared; `expo_store_ready: true`, `compilation_passed: true`, `backend_port_8001: true`).
- Remaining WARN items are non-blocking N+1 query optimizations for `/accounting/dashboard` and `/payroll` — safe to defer.

### Test credentials (unchanged)
- Admin: `admin@triveni.com` / `Admin@123` (see `/app/memory/test_credentials.md`)
