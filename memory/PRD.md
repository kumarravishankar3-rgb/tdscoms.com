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
