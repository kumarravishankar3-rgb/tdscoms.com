# PRD — Triveni Business Manager

Enterprise mobile app for **Triveni DSC & e-Tender Service Private Limited** covering the six business modules requested by the customer.

## Stack
- Expo SDK 54 (React Native), Expo Router, TypeScript, `expo-secure-store`, `@expo/vector-icons`
- FastAPI + Motor (MongoDB)
- Auth: Email/password (bcrypt + session_token) + Emergent Google OAuth
- Storage: Emergent Managed Object Storage (tender documents)

## Roles
`admin`, `manager`, `employee` — enforced on privileged mutations (create employee, decide leave, edit accounts).

## Modules & Screens
| Module | Screens |
|---|---|
| Dashboard | Hero + KPI grid + Urgent tenders + Quick actions |
| Business  | Customers list, Accounts (invoice/expense), add flows |
| Tasks     | Filterable list (all/todo/doing/done), toggle status, create |
| More      | Profile, module launcher, logout |
| Employees | List + add (admin/manager only) |
| HR        | Attendance (check-in/out), Leaves (request + approve) |
| Tenders   | List, detail, create, PDF/document upload via Object Storage |

## Auth flow
- `/api/auth/signup` and `/api/auth/login` return `{session_token, user}` (7-day session).
- Emergent Google: `WebBrowser.openAuthSessionAsync` on native, `window.location` on web, then `POST /api/auth/session {session_id}`.
- Token stored in SecureStore (mobile) / localStorage (web).

## Object Storage
- Backend `init_storage()` on startup, `PUT /objects/{path}` from `/api/tenders/{id}/upload`.
- Downloads served by `/api/files/{path}` (Bearer or `?token=` for web `<img>`/openURL).

## Test accounts
See `/app/memory/test_credentials.md`.
