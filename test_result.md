#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
user_problem_statement: |
  Vyapar-style Accounts Module: Complete menu structure (My Business/Reports/Bank/Settings tabs),
  Sale Invoice form with Credit/Cash toggle, Payment Terms, Customer field (mandatory), Add Items with barcode scanner,
  and multi-field Customer Search + Duplicate Prevention (block duplicate customer entries by mobile/PAN/Aadhar/GST/email,
  block duplicate invoices for same party+date). Inline "New Party" / "New Item" adds in voucher screens.

backend:
  - task: "Customer multi-field search API"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "GET /api/customers/search?q= searches name/customer_code/mobile/whatsapp/PAN/Aadhar/email/GST/reg_no via regex."

  - task: "Duplicate customer detection on POST /customers and POST /customers/quick"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Blocks creation with 409 if mobile/whatsapp/PAN/Aadhar/GST/email/reg_no already exists. Returns existing customer summary."

  - task: "Item catalog CRUD (/api/items) with duplicate check"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "GET (with q= search) / POST / PATCH / DELETE. Case-insensitive name uniqueness."

  - task: "Invoice CRUD (/api/invoices) with GST calc + duplicate invoice check"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Auto invoice_no (SI-000x / PB-000x). Duplicate check on party_id+date+type. GST calc on server. Sale invoices auto-create linked Income entry via /api/income."

  - task: "PUT /customers duplicate guard"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Update also runs _find_customer_duplicate excluding current id."

frontend:
  - task: "Vyapar-style Accounts Menu (/accounting/menu)"
    implemented: true
    working: true
    file: "frontend/app/accounting/menu.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Four tabs (My Business / Reports / Bank / Settings). Accordion sections with icons. Bank tab shows card view with balance color + share. Report tab has star favourites persisted in SecureStore."

  - task: "Sale Invoice form (/accounting/invoices/new)"
    implemented: true
    working: true
    file: "frontend/app/accounting/invoices/new.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Credit/Cash toggle, Invoice No preview, Date/Payment Terms/Due On grid, Customer mandatory field with search, Add Items line editor, Total bar bottom + Save & New / Save buttons."

  - task: "CustomerSearchModal reusable component"
    implemented: true
    working: true
    file: "frontend/src/CustomerSearchModal.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Multi-field debounced search via /api/customers/search, inline Add New Party sheet with duplicate error surfacing."

  - task: "ItemSearchModal reusable component"
    implemented: true
    working: true
    file: "frontend/src/ItemSearchModal.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Search /api/items with debounce, barcode icon placeholder (alerts on web), inline Add New Item sheet with Product/Service toggle."

  - task: "Business tab search extended to include Aadhar/Email/Reg No"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/business.tsx"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Filter now covers name/mobile/whatsapp/pan/aadhar/email/customer_code/contractor_reg_no/gst_no. Placeholder updated accordingly."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "Customer multi-field search API"
    - "Duplicate customer detection on POST /customers and POST /customers/quick"
    - "Item catalog CRUD (/api/items) with duplicate check"
    - "Invoice CRUD (/api/invoices) with GST calc + duplicate invoice check"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Implemented Phase 2 of Accounts module: Vyapar-style menu (4 tabs), Sale Invoice form matching the reference image, CustomerSearchModal + ItemSearchModal reusable components, backend endpoints for /api/customers/search, /api/customers/quick, /api/items, /api/invoices with duplicate detection at customer, item, and invoice level. Verified via curl: SI-0001 created with correct GST 18% (₹2500→₹2950), second invoice for same party+date returned 409 with existing invoice info. Please run backend tests for high-priority tasks in test_plan. Admin: admin@triveni.com / Admin@123.

# --- 2026-08-30 attachments iteration ---

backend_new_tasks:
  - task: "Attachments field on Invoice / Expense / Income models"
    file: "backend/server.py"
    working: true
    priority: "high"
    needs_retesting: true
    notes: "Attachments: List[dict] added on Invoice, Expense, Income models. Default empty list."

  - task: "POST /api/invoices/{iid}/attachments + DELETE"
    file: "backend/server.py"
    working: true
    priority: "high"
    needs_retesting: true
    notes: "Emergent object storage, 10 MB per-file cap, returns updated Invoice with attachments list. Delete via ?path=<encoded>."

  - task: "POST /api/expenses/{eid}/attachments + DELETE"
    file: "backend/server.py"
    working: true
    priority: "high"
    needs_retesting: true

  - task: "POST /api/income/{iid}/attachments + DELETE"
    file: "backend/server.py"
    working: true
    priority: "high"
    needs_retesting: true

frontend_new_tasks:
  - task: "AttachmentsSection reusable component (draft + server modes)"
    file: "frontend/src/AttachmentsSection.tsx"
    working: true
    priority: "high"
    needs_retesting: false

  - task: "Sale/Purchase Invoice new form supports multiple attachments (queue-then-upload after save)"
    file: "frontend/app/accounting/invoices/new.tsx"
    working: true
    priority: "high"
    needs_retesting: false

  - task: "Expense new form supports multiple attachments"
    file: "frontend/app/accounting/expenses/new.tsx"
    working: true
    priority: "high"
    needs_retesting: false

  - task: "Income (Payment-In) new form supports multiple attachments"
    file: "frontend/app/accounting/income/new.tsx"
    working: true
    priority: "high"
    needs_retesting: false

  - task: "Invoice detail view (/accounting/invoices/[id]) with attachments + delete"
    file: "frontend/app/accounting/invoices/[id].tsx"
    working: true
    priority: "high"
    needs_retesting: false

  - task: "Invoice list view (/accounting/invoices) with attachments-count chip"
    file: "frontend/app/accounting/invoices/index.tsx"
    working: true
    priority: "medium"
    needs_retesting: false

# --- 2026-08-30 attachments COMPLETION iteration ---

backend_new_tasks:
  - task: "GET /api/expenses/{eid} single-item endpoint (needed for expense detail view)"
    file: "backend/server.py"
    working: true
    priority: "high"
    needs_retesting: true

  - task: "GET /api/income/{iid} single-item endpoint (needed for income detail view)"
    file: "backend/server.py"
    working: true
    priority: "high"
    needs_retesting: true

frontend_new_tasks:
  - task: "Expense detail view (/accounting/expenses/[id]) with attachments add/delete + Verify/Approve/Reject actions"
    file: "frontend/app/accounting/expenses/[id].tsx"
    working: true
    priority: "high"
    needs_retesting: true

  - task: "Income detail view (/accounting/income/[id]) with attachments add/delete"
    file: "frontend/app/accounting/income/[id].tsx"
    working: true
    priority: "high"
    needs_retesting: true

  - task: "Expense list rows now navigable + attachment count chip"
    file: "frontend/app/accounting/expenses/index.tsx"
    working: true
    priority: "medium"
    needs_retesting: true

  - task: "Income list rows now navigable + attachment count chip"
    file: "frontend/app/accounting/income/index.tsx"
    working: true
    priority: "medium"
    needs_retesting: true

# --- 2026-08-30 auto-tasks + service settings iteration ---

backend_new_tasks:
  - task: "Task model + TaskInput + TaskUpdate now carry customer_id / customer_code / customer_name / customer_mobile / customer_pan / customer_address"
    file: "backend/server.py"
    priority: high
    needs_retesting: true

  - task: "ServiceTaskSetting model + endpoints (/api/settings/service-tasks GET/POST/PATCH/DELETE)"
    file: "backend/server.py"
    priority: high
    needs_retesting: true

  - task: "Global toggle /api/settings/auto-task-toggle (GET/PUT)"
    file: "backend/server.py"
    priority: high
    needs_retesting: true

  - task: "Auto-task hook on sale invoice creation — creates Service Task + Follow-up Task, matches setting by first line item name (dsc/gst/tender/income_tax/registration), applies assignee + deadline_days + followup_days, denormalises customer fields, best-effort (does not fail invoice on error)"
    file: "backend/server.py"
    priority: high
    needs_retesting: true

frontend_new_tasks:
  - task: "Task Customer Details block (search + auto-fill) on tasks/new.tsx"
    file: "frontend/app/tasks/new.tsx"
    priority: high
    needs_retesting: false
  - task: "Task detail page shows Customer Details block"
    file: "frontend/app/tasks/[id].tsx"
    priority: medium
    needs_retesting: false
  - task: "Admin Service-wise Task Assignment settings screen"
    file: "frontend/app/accounting/settings/service-tasks.tsx"
    priority: high
    needs_retesting: false
  - task: "Menu Settings tab wires Automation → Service-wise Task Assignment"
    file: "frontend/app/accounting/menu.tsx"
    priority: medium
    needs_retesting: false

# --- 2026-08-30 invoice-pdf + edit/patch + payment_mode iteration ---

backend_new_tasks:
  - task: "Invoice payment_mode field (cash/bank_transfer/cheque/upi/other) persists on POST/PATCH"
    file: "backend/server.py"
    priority: high
    needs_retesting: true

  - task: "PATCH /api/invoices/{iid} admin-only edit with recalculated totals & balance"
    file: "backend/server.py"
    priority: high
    needs_retesting: true

  - task: "DELETE /api/invoices/{iid} now admin-only (was admin_or_manager)"
    file: "backend/server.py"
    priority: high
    needs_retesting: true

  - task: "GET /api/invoices/{iid}/pdf renders Tax Invoice matching reference layout — supports Authorization header AND ?token=... query param for browser open"
    file: "backend/invoice_pdf.py + backend/server.py"
    priority: high
    needs_retesting: true

frontend_new_tasks:
  - task: "Invoice form: Paid Amount, Dues (auto), Payment Mode dropdown; also supports edit_id param for PATCH edit flow"
    file: "frontend/app/accounting/invoices/new.tsx"
    priority: high
    needs_retesting: false
  - task: "Invoice list: Print button (all), Edit + Delete (admin only) per row + payment mode chip"
    file: "frontend/app/accounting/invoices/index.tsx"
    priority: high
    needs_retesting: false
  - task: "Invoice detail: Print / Edit (admin) / Delete (admin) header buttons + payment mode display"
    file: "frontend/app/accounting/invoices/[id].tsx"
    priority: high
    needs_retesting: false

# --- 2026-08-31 task edit / delete / bulk-delete iteration ---

backend_new_tasks:
  - task: "PATCH /api/tasks/{tid} restricted to admin+manager"
    file: "backend/server.py"
    priority: high
    needs_retesting: true
  - task: "DELETE /api/tasks/{tid} restricted to admin only (was admin_or_manager)"
    file: "backend/server.py"
    priority: high
    needs_retesting: true
  - task: "POST /api/tasks/bulk-delete admin-only, accepts {ids:[]}, returns {deleted:N}"
    file: "backend/server.py"
    priority: high
    needs_retesting: true

frontend_new_tasks:
  - task: "Tasks list: selection mode, checkboxes, Select All, bulk-delete bar (admin only), Edit/Delete row buttons"
    file: "frontend/app/(tabs)/tasks.tsx"
    priority: high
    needs_retesting: false
  - task: "Tasks new.tsx: supports edit_id param → loads existing task and PATCHes on save"
    file: "frontend/app/tasks/new.tsx"
    priority: high
    needs_retesting: false
  - task: "Task detail header: Edit (admin+manager) + Delete (admin) buttons"
    file: "frontend/app/tasks/[id].tsx"
    priority: medium
    needs_retesting: false
