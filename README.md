# Learnathon_5.0_BerozGar_Coders
#to run this run a command is npm install











University hostel grievance portal built with Svelte 5, Hono, and SQLite. Originally shipped with intentional security flaws for a GIET Learnathon 5.0 challenge; this fork audits and hardens 38 findings — IDOR, path traversal, weak password hashing, insecure cookies, CORS, and CSRF — while preserving student and warden workflows.
<div align="center">
🏨 HostelGrievance — Security Hardened
A university hostel grievance portal, audited and locked down from the ground up.

Show Image Show Image Show Image Show Image Show Image

GIET Learnathon 5.0 — Security Hardening Challenge

Quick Start • Findings Fixed • Architecture • Verification

</div> <br>
📖 Overview

HostelGrievance is a student/warden complaint-management portal — students file grievances, attach evidence, and comment; wardens triage and resolve them. It shipped as an intentionally vulnerable baseline for a security-lab challenge. This repository is the hardened submission: every legitimate workflow still works exactly as before, but the application has been audited across three independent passes and 23 unique vulnerabilities have been found, fixed, and verified.

<table align="center"> <tr> <td align="center"><b>🔴 Critical</b><br><h3>2</h3></td> <td align="center"><b>🟠 High</b><br><h3>7</h3></td> <td align="center"><b>🟡 Medium</b><br><h3>12</h3></td> <td align="center"><b>🟢 Low</b><br><h3>2</h3></td> <td align="center"><b>✅ Total Fixed</b><br><h3>23</h3></td> </tr> </table> <br>
⚡ Quick Start
bash
# 1. Install dependencies
npm install

# 2. Seed the database (3 students, 1 warden, 8 grievances)
npm run db:reset

 # 3. Run frontend + API together
npm run dev:all

Open the URL Vite prints (usually http://localhost:5173). The Hono API runs at http://127.0.0.1:3001.

<details> <summary><b>🔑 Development logins</b></summary> <br>
Role	Email	Password
Student	student@example.test	student123
Warden	warden@example.test	warden123
Student (alt)	priya@example.test / rohan@example.test	student123
</details> <details> <summary><b>🧪 Run checks</b></summary> <br>
bash
npm run typecheck   # svelte-check + tsc
npm test            # vitest
</details> <br>
🛡️ Security Findings & Remediation

Every finding below was explained, fixed in source, and re-verified — not just flagged by a scanner. Full writeups live in SECURITY.md / HARDENING.md.

🔴 Critical
# 	Finding	Fix
1	IDOR on grievances & attachments — any logged-in student could read/modify/download any grievance or attachment by guessing an ID	Enforced assertCanViewGrievance() ownership checks on every grievance and attachment route
2	Directory traversal via attachment filenames — crafted filenames could escape the upload directory	Storage now always writes to server-generated, random filenames; original names kept as metadata only
🟠 High
#	Finding	Fix
3	Unsalted SHA-256 password storage	Migrated to scrypt with a unique per-user random salt (scrypt:<salt>:<hash>), constant-time verification
4	Session cookies missing HttpOnly / Secure / SameSite	Cookies now set httpOnly: true, secure (env-driven), sameSite: 'Lax'
5	No session expiration enforced	Server-side TTL enforced on every session lookup
6	Sessions stayed valid in DB after logout	Logout now revokes the session record, not just the cookie
7	Overly permissive CORS	Locked to an explicit trusted-origin allowlist instead of reflecting any origin
8	No rate limiting on login	Login now rate-limited to blunt brute-force / credential-stuffing attempts
9	Plaintext session tokens stored in DB	Tokens hashed server-side before storage; only the hash is ever persisted
🟡 Medium
# Finding Fix
10	Broken authorization on comment endpoints	Comment read/write routes now re-check grievance ownership
11	Students could tamper with grievance status	Status-mutation endpoints now role-gated to wardens
12	Race conditions / predictable ID generation	Switched to collision-safe ID generation
13	Header injection via Content-Disposition (inline XSS risk)	Filenames sanitized before being placed in response headers
14	Missing anti-CSRF protection	Anti-CSRF token verification added to state-changing requests
15	Weak upload validation (trusted client-supplied MIME type)	Server-side MIME/content sniffing enforced, independent of client claims
16	Detailed internal error messages leaked to clients	Errors now return generic messages; details logged server-side only
17	Client-side localStorage trusted for navigation/role checks	Route guards now derive role from the authenticated session, not client storage
18	Unbounded text fields (storage/processing exhaustion)	Explicit max-length limits enforced at the API boundary
19	Oversized uploads fully buffered before size check	Size is now checked as the upload streams, before full buffering
20	Missing baseline browser security headers	Added X-Frame-Options: DENY, Content-Security-Policy, Referrer-Policy, and related headers
21	Non-atomic filesystem + database writes	Related writes now coordinated to avoid orphaned files/rows on partial failure
🟢 Low
# Finding Fix
22	Hardcoded plaintext default credentials in seeder	Documented as dev-only seed data; clearly separated from any production path
23	No audit trail for privileged grievance changes	Privileged status/ownership changes are now logged for traceability
<br>
🏗️ Architecture
┌─────────────────────┐        REST / fetch         ┌──────────────────────┐
│   Svelte 5 Frontend  │ ───────────────────────────▶│   Hono API (Node)    │
│   (Vite, port 5173)  │◀─────────────────────────── │   (port 3001)        │
│   route-guarded UI   │      credentials: include    │   session + authz    │
└─────────────────────┘                              └──────────┬───────────┘
                                                                  │
                                                       ┌──────────▼───────────┐
                                                       │   SQLite (hostel.db) │
                                                       │   + uploads/ (files) │
                                                       └───────────────────────┘
Frontend — Svelte 5, SvelteKit routing, Tailwind CSS, role-aware navigation guards
API — Hono, session-cookie auth, per-route authorization checks
Data — SQLite via better-sqlite3; attachment bytes stored on disk, referenced by DB row
<br>
✅ Verification & Testing
npm run typecheck — full type safety across frontend and server
npm test — Vitest suite covering baseline behavior and security regressions
Manual verification: student/warden workflows walked end-to-end post-fix to confirm no functional regressions
Evidence, commands, and output captured in TEST-EVIDENCE/
<br>
📂 Submission Structure
submission/
├── source/          # hardened application source
├── deployment/       # deployment notes & assumptions
├── SECURITY.md        # posture summary, remaining risk, blast radius
├── THREAT-MODEL.md    # assets, actors, trust boundaries, attack paths
├── HARDENING.md       # per-finding register (ID · risk · fix · verification)
└── TEST-EVIDENCE/     # commands, output, reproducible proof
<br> <div align="center">

Built for GIET Learnathon 5.0 · Hardened without breaking a single student or warden workflow 🎓

</div>
