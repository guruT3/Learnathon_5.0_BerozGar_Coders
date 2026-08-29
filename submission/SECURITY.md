# Security Architecture & Posture Report (SECURITY.md)

**Project:** HostelGrievance Portal  
**Document:** Security Assessment, Hardening Posture & Blast Radius Analysis  
**Date:** 29 August 2026  

---

## 1. Executive Summary & Protected Posture

The **HostelGrievance** application has undergone a comprehensive defense-in-depth security transformation. Originally designed as a vulnerable baseline, the application now adheres to modern web application security principles, enforcing strict role-based access control (RBAC), multi-layered input validation, cryptographic session token handling, secure streaming storage, and robust denial-of-service protections.

### Key Security Posture Highlights:
* **Zero-Trust Authorization:** Object-level boundaries enforced on all database queries and route handlers. Students are strictly confined to their own records; wardens can manage ticket lifecycles without editing student content.
* **Cryptographic Defense:** Passwords hashed with `scrypt` using unique salts; active session tokens hashed with SHA-256 in the database; constant-time equality comparisons prevent timing attacks.
* **Hardened File Storage Pipeline:** Binary magic-byte inspections, dimension boundary checks (max 4K), sanitized filenames, and streaming response delivery prevent memory exhaustion, path traversal, and malicious polyglot uploads.
* **Resilient Infrastructure Controls:** Strict CORS allowlists, anti-CSRF protections, Content Security Policy (CSP), HSTS enforcement, and rate limiting with LRU memory bounding.

---

## 2. Summary of Major Security Changes

### A. Authentication & Session Management
1. **Hashed Session Tokens:** Session bearer tokens in cookies are stored as SHA-256 hashes in SQLite. Compromise of a database backup does not yield active session tokens.
2. **Session Lifecycle & Caps:** Maximum of 5 concurrent active sessions per user account. Expired and surplus sessions are pruned automatically upon login.
3. **Anti-Brute Force & Anti-Timing Defense:** Rolling rate limiter (max 5 failed attempts per 15 minutes) with memory-bounded LRU eviction and dummy `scrypt` hashing for absent users to equalize timing.
4. **Cookie Hardening:** Session cookies issued with `HttpOnly: true`, `SameSite: 'Lax'`, and `Secure: REQUIRE_HTTPS`.

### B. Access Control & Business Logic
1. **Authoritative Ownership Checks:** Enforced `assertCanViewGrievance()` across grievance details, comment feeds, and attachment downloads.
2. **Role Separation:** Wardens are forbidden from mutating student grievance descriptions; students are strictly forbidden from modifying ticket statuses (`open`, `in_progress`, `resolved`).
3. **Audit Trail Logging:** All grievance creations, status changes, and edits are logged to an append-only `grievance_audit_logs` table.

### C. Input Handling & Data Storage
1. **Bounded Input Validation:** Database schema `CHECK` constraints and API-level length validations on all text fields.
2. **Stored XSS Prevention:** Server-side HTML entity escaping (`sanitizeComment()`) combined with Svelte 5 contextual auto-escaping.
3. **Attachment Validation:** Magic-byte validation, 2 MB size limits, 5-attachment count quotas, 10 MB total size quotas, and dimension checks (max 4096×4096px).
4. **N+1 Query Elimination:** Implemented batch loading `assembleGrievancesBatch()` to execute fixed-count SQL queries regardless of list size.

---

## 3. Threat Assumptions & Deployment Model

1. **TLS Termination:** In production deployments, the application is assumed to run behind a reverse proxy (e.g., Nginx, Traefik, AWS ALB) that terminates HTTPS and forwards traffic to the local Hono API.
2. **Environment Variables:** Production environments configure `NODE_ENV=production`, `REQUIRE_HTTPS=true`, `TRUST_PROXY=true`, and strict `ALLOWED_ORIGINS` / `ALLOWED_HOSTS`.
3. **Filesystem Isolation:** The application process runs as a dedicated non-root service account with exclusive read/write access (`0o600` / `0o700`) to `data/` and `uploads/`.

---

## 4. Blast Radius Analysis

The table below describes the resulting blast radius and containment controls if a specific security control fails:

| Component Failed | Failure Scenario | Protective Containment Controls | Remaining Blast Radius |
|---|---|---|---|
| **Frontend Route Guard** | Attacker bypasses client-side SvelteKit route guards or tampers with `localStorage`. | Authoritative server-side `requireUser()` and RBAC checks reject all unauthorized API requests with 401/403. | **Zero data leakage.** The attacker only sees an empty UI layout; no sensitive data is returned by the API. |
| **Database Read Leak** | Attacker gains read-only access to a database backup file (`hostel.db`). | Passwords hashed with `scrypt`; active session tokens stored as SHA-256 hashes. | Attacker cannot impersonate active sessions. High offline computation cost to brute-force salted passwords. |
| **Single User Account Compromised** | A student account credential is stolen via phishing. | `assertCanViewGrievance()` confines access strictly to that student's records; max 5 active session limit. | Impact is strictly limited to that student's grievances. Other students' data and warden features remain completely protected. |
| **Malicious File Upload Attempt** | Attacker uploads a corrupted binary or polyglot file. | Extension allowlist, magic-byte checks, dimension bounds (max 4K), randomized disk naming, and `Content-Disposition: attachment` header. | File cannot be executed on server or rendered inline as HTML/JS in victim's browser. |
| **High Concurrency / Traffic Spike** | Attacker attempts concurrent search and creation flooding. | Bounded LRU rate limiting, SQLite `busy_timeout = 5000ms`, atomic transactions, and search query length caps. | Server prevents process crashes and OOM conditions; rate-limited clients receive HTTP 429. |

---

## 5. Remaining Risks & Operational Recommendations

1. **Multi-Factor Authentication (MFA):** Adding TOTP-based 2FA for administrative/warden accounts is recommended for enterprise deployment.
2. **Distributed Cache (Redis):** If scaling horizontally across multiple server instances, transition the in-memory rate-limiter and session store to Redis.
3. **FTS5 Full-Text Search:** If the database grows beyond 50,000 grievance records, replace SQLite `LIKE '%...%'` queries with an indexed FTS5 virtual table.
