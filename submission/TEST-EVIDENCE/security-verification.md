# Security Verification & Test Evidence (TEST-EVIDENCE)

**Project:** HostelGrievance Portal  
**Date:** 29 August 2026  
**Scope:** Automated Test Execution, Type Integrity & Hardening Proof  

---

## 1. Automated Vitest Security Suite Execution

```text
> hostelgrievance@0.0.1 test
> vitest run

 RUN  v4.1.11 D:/final project/GIET-Learnathon-5.0-main

 ✓ src/server/app.test.ts (27 tests) 3306ms

 Test Files  1 passed (1)
      Tests  27 passed (27)
   Duration  3.70s
```

### Verified Test Cases Breakdown:
1. **Baseline Authentication:**
   * Student and Warden account authentication (`student@example.test`, `warden@example.test`).
   * Rejection of invalid credentials (401 Unauthorized).
   * Session retrieval via `/api/me` and session invalidation upon `/api/logout`.
2. **Access Control & IDOR Protection:**
   * Student creating a valid grievance (`GRV-xxxx`).
   * Student retrieving own grievance.
   * Student accessing another student's grievance returns **403 Forbidden**.
   * Warden accessing all grievances across students.
3. **Comment & Status Authorization:**
   * Permitted users commenting on permitted tickets.
   * Student status change attempt returns **403 Forbidden**.
   * Warden successfully updates grievance status to `In Progress` / `Resolved`.
   * Editing resolved grievances rejected with **409 Conflict**.
4. **File Storage & Attachment Hardening:**
   * PNG attachment upload and streaming byte retrieval.
   * Cross-student attachment access rejected with **403 Forbidden**.
   * Oversized attachment (> 2 MB) rejected with **400 Bad Request**.
   * Disallowed MIME types (`.txt`) rejected with **400 Bad Request**.
   * Quota limit: 6th attachment rejected with **400 Bad Request**.
5. **Hacker Defense Validations:**
   * **Token Hashing:** DB stores 64-character SHA-256 hash, never raw token.
   * **Unbounded Fields:** Titles > 200 chars, descriptions > 5000 chars, comments > 2000 chars rejected with 400.
   * **Security Headers:** CSP, HSTS, X-Content-Type-Options, X-Frame-Options present.
   * **Audit Logging:** Grievance creation and status mutations logged in `grievance_audit_logs`.
   * **Pagination:** Querying `page=1&limit=3` returns paginated metadata.
   * **Batch Querying:** `assembleGrievancesBatch()` executes in fixed O(1) queries.
   * **Active Session Caps:** Maximum 5 concurrent sessions per user account enforced.
   * **Comment Sanitization:** `<script>alert("xss")</script>` stored and returned as safe escaped entities.
   * **Host Header Poisoning:** Requests with untrusted `Host` headers rejected with **400 Bad Request**.
   * **Anti-CSRF:** Requests with `Sec-Fetch-Site: cross-site` rejected with **403 Forbidden**.
   * **Pixel Decompression Bomb:** Image with dimensions > 4096px rejected with **400 Bad Request**.
   * **Wildcard Search Limits:** Long searches > 100 chars truncated safely without locking SQLite.

---

## 2. Static Typing & Diagnostics Verification

```text
> hostelgrievance@0.0.1 typecheck
> svelte-kit sync && svelte-check --tsconfig ./tsconfig.json && tsc --noEmit -p tsconfig.server.json

Loading svelte-check in workspace: d:\final project\GIET-Learnathon-5.0-main
Getting Svelte diagnostics...

svelte-check found 0 errors and 0 warnings
```

---

## 3. Manual Verification Steps for Evaluators

1. **Start the application:**
   ```sh
   npm run dev:all
   ```
2. **Test Student Role Boundary:**
   * Log in with `student@example.test` / `student123`.
   * Attempt to open `http://localhost:5173/warden` -> Redirected back to `/student`.
   * Open Developer Tools and send `PATCH /api/grievances/GRV-0001` with `{"status": "Resolved"}` -> API responds with `403 Forbidden`.
3. **Test Insecure File Upload:**
   * Create a text file named `test.png` containing plain text.
   * Upload via grievance form -> API responds with `400 Bad Request: File content does not match PNG image format.`
4. **Test Audit Trail:**
   * Log in as `warden@example.test` / `warden123` and change any ticket status.
   * Query database: `sqlite3 data/hostel.db "SELECT * FROM grievance_audit_logs;"` -> Confirm record logged with timestamp and actor ID.
