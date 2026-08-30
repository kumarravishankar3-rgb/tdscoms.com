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
