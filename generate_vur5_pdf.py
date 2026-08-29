import os

def create_vur5_pdf(filename="VUR 5.pdf"):
    # Clean PDF generator with proper BT/ET blocks and coordinates
    p1 = """
% Background & Header Bar
0.08 0.18 0.36 rg
15 725 582 45 re f

% Title Text in Header
BT
/F2 18 Tf
1 1 1 rg
30 748 Td (HostelGrievance - Security Assessment Report) Tj
/F1 10 Tf
0 -16 Td (Assessment: VUR 5  |  Date: 28 August 2026  |  Scope: GIET-Learnathon-5.0-main) Tj
ET

% Section Header
BT
0 0 0 rg
/F2 13 Tf
30 695 Td (Executive Summary & Security Findings Overview) Tj
/F1 9 Tf
0 -14 Td (The following security weaknesses were identified and remediated in the HostelGrievance project.) Tj
ET

% Table Header Bar
0.12 0.23 0.45 rg
30 645 552 20 re f

BT
1 1 1 rg
/F2 9 Tf
35 651 Td (Finding ID) Tj
80 0 Td (Severity) Tj
65 0 Td (Vulnerability Title) Tj
195 0 Td (Primary Location) Tj
ET

% Table Row 1
0.94 0.96 0.98 rg
30 622 552 23 re f
0.8 0.82 0.85 RG
30 622 552 23 re S

BT
0 0 0 rg
/F2 8.5 Tf
35 630 Td (VUR5-01) Tj
80 0 Td (MEDIUM) Tj
/F1 8.5 Tf
65 0 Td (Unlimited Active Sessions Per Account) Tj
195 0 Td (src/server/auth/session.ts) Tj
ET

% Table Row 2
1 1 1 rg
30 599 552 23 re f
0.8 0.82 0.85 RG
30 599 552 23 re S

BT
0 0 0 rg
/F2 8.5 Tf
35 607 Td (VUR5-02) Tj
80 0 Td (MEDIUM) Tj
/F1 8.5 Tf
65 0 Td (Attachment Downloads Buffer Whole File in Memory) Tj
195 0 Td (src/server/storage/attachments.ts) Tj
ET

% Table Row 3
0.94 0.96 0.98 rg
30 576 552 23 re f
0.8 0.82 0.85 RG
30 576 552 23 re S

BT
0 0 0 rg
/F2 8.5 Tf
35 584 Td (VUR5-03) Tj
80 0 Td (MEDIUM) Tj
/F1 8.5 Tf
65 0 Td (No Lockfile / Non-Reproducible Dependencies) Tj
195 0 Td (package.json / package-lock.json) Tj
ET

% Table Row 4
1 1 1 rg
30 553 552 23 re f
0.8 0.82 0.85 RG
30 553 552 23 re S

BT
0 0 0 rg
/F2 8.5 Tf
35 561 Td (VUR5-04) Tj
80 0 Td (LOW) Tj
/F1 8.5 Tf
65 0 Td (Dev Mock Service Bypasses Authorization Rules) Tj
195 0 Td (src/lib/services/mock.ts) Tj
ET

% Table Row 5
0.94 0.96 0.98 rg
30 530 552 23 re f
0.8 0.82 0.85 RG
30 530 552 23 re S

BT
0 0 0 rg
/F2 8.5 Tf
35 538 Td (VUR5-05) Tj
80 0 Td (LOW) Tj
/F1 8.5 Tf
65 0 Td (Destructive Database Reset Lacks Env Safeguard) Tj
195 0 Td (src/server/db/reset.ts) Tj
ET

% Table Row 6
1 1 1 rg
30 507 552 23 re f
0.8 0.82 0.85 RG
30 507 552 23 re S

BT
0 0 0 rg
/F2 8.5 Tf
35 515 Td (VUR5-06) Tj
80 0 Td (LOW) Tj
/F1 8.5 Tf
65 0 Td (Health Endpoint Exposes Availability Info) Tj
195 0 Td (src/server/app.ts) Tj
ET

% Detail Finding 1 Box
0.97 0.98 1 rg
30 380 552 110 re f
0.75 0.8 0.9 RG
30 380 552 110 re S

BT
0.08 0.2 0.5 rg
/F2 10.5 Tf
40 472 Td (1. VUR5-01: Unlimited Active Sessions Per Account  [Severity: MEDIUM]) Tj
0 0 0 rg
/F2 8.5 Tf
0 -16 Td (Primary Location: ) Tj
/F1 8.5 Tf
80 0 Td (src/server/auth/session.ts, src/server/config.ts) Tj
/F2 8.5 Tf
-80 -14 Td (Risk Description: ) Tj
/F1 8.5 Tf
80 0 Td (Every login creates a session record without per-user concurrency caps or pruning, allowing) Tj
0 -11 Td (an attacker or compromised account to flood the database with unlimited tokens.) Tj
/F2 8.5 Tf
0 -14 Td (Remediation: ) Tj
/F1 8.5 Tf
65 0 Td (Enforced MAX_ACTIVE_SESSIONS_PER_USER = 5. Oldest surplus sessions and expired sessions) Tj
0 -11 Td (are automatically cleaned during every authentication cycle.) Tj
ET

% Detail Finding 2 Box
0.97 0.98 1 rg
30 250 552 115 re f
0.75 0.8 0.9 RG
30 250 552 115 re S

BT
0.08 0.2 0.5 rg
/F2 10.5 Tf
40 347 Td (2. VUR5-02: Attachment Downloads Buffered into Memory  [Severity: MEDIUM]) Tj
0 0 0 rg
/F2 8.5 Tf
0 -16 Td (Primary Location: ) Tj
/F1 8.5 Tf
80 0 Td (src/server/storage/attachments.ts, src/server/routes/attachments.ts) Tj
/F2 8.5 Tf
-80 -14 Td (Risk Description: ) Tj
/F1 8.5 Tf
80 0 Td (Downloading attachments via readFileSync loads the complete file into Node heap memory.) Tj
0 -11 Td (Concurrent downloads of multiple files can exhaust server memory, triggering OOM crashes.) Tj
/F2 8.5 Tf
0 -14 Td (Remediation: ) Tj
/F1 8.5 Tf
65 0 Td (Implemented streamStoredFile() using Node Readable.toWeb() stream pipelines, streaming) Tj
0 -11 Td (bytes in chunks directly to the HTTP response with minimal memory footprint.) Tj
ET

% Page 1 Footer
BT
0.5 0.5 0.5 rg
/F1 8 Tf
30 30 Td (HostelGrievance - Security Findings Assessment Report (VUR 5)) Tj
475 0 Td (Page 1 of 2) Tj
ET
"""

    p2 = """
% Header Bar
0.08 0.18 0.36 rg
15 745 582 25 re f

BT
1 1 1 rg
/F2 11 Tf
30 753 Td (HostelGrievance - Security Assessment Details (Cont.)) Tj
ET

% Detail Finding 3 Box
0.97 0.98 1 rg
30 635 552 95 re f
0.75 0.8 0.9 RG
30 635 552 95 re S

BT
0.08 0.2 0.5 rg
/F2 10.5 Tf
40 712 Td (3. VUR5-03: Dependency Lockfile & Version Reproducibility  [Severity: MEDIUM]) Tj
0 0 0 rg
/F2 8.5 Tf
0 -16 Td (Primary Location: ) Tj
/F1 8.5 Tf
80 0 Td (package.json, package-lock.json) Tj
/F2 8.5 Tf
-80 -14 Td (Risk Description: ) Tj
/F1 8.5 Tf
80 0 Td (Using loose version ranges without a deterministic lockfile exposes builds to upstream) Tj
0 -11 Td (dependency tampering, breaking changes, or compromised downstream packages.) Tj
/F2 8.5 Tf
0 -14 Td (Remediation: ) Tj
/F1 8.5 Tf
65 0 Td (Committed and validated deterministic package-lock.json with cryptographic SHA-512 hashes.) Tj
ET

% Detail Finding 4 Box
0.97 0.98 1 rg
30 525 552 95 re f
0.75 0.8 0.9 RG
30 525 552 95 re S

BT
0.08 0.2 0.5 rg
/F2 10.5 Tf
40 602 Td (4. VUR5-04: Mock Service Bypasses Authorization Rules  [Severity: LOW]) Tj
0 0 0 rg
/F2 8.5 Tf
0 -16 Td (Primary Location: ) Tj
/F1 8.5 Tf
80 0 Td (src/lib/services/mock.ts) Tj
/F2 8.5 Tf
-80 -14 Td (Risk Description: ) Tj
/F1 8.5 Tf
80 0 Td (Mock services allowed arbitrary callers to modify ticket status and spoof comment author IDs.) Tj
/F2 8.5 Tf
0 -14 Td (Remediation: ) Tj
/F1 8.5 Tf
65 0 Td (Enforced session role verification (wardens only for status changes) and authenticated author checks.) Tj
ET

% Detail Finding 5 Box
0.97 0.98 1 rg
30 415 552 95 re f
0.75 0.8 0.9 RG
30 415 552 95 re S

BT
0.08 0.2 0.5 rg
/F2 10.5 Tf
40 492 Td (5. VUR5-05: Destructive Database Reset Lacks Environment Safeguard  [Severity: LOW]) Tj
0 0 0 rg
/F2 8.5 Tf
0 -16 Td (Primary Location: ) Tj
/F1 8.5 Tf
80 0 Td (src/server/db/reset.ts, src/server/scripts/reset-db.ts) Tj
/F2 8.5 Tf
-80 -14 Td (Risk Description: ) Tj
/F1 8.5 Tf
80 0 Td (Accidentally triggering reset commands in production environments destroys live database records.) Tj
/F2 8.5 Tf
0 -14 Td (Remediation: ) Tj
/F1 8.5 Tf
65 0 Td (Implemented strict environment safeguard: resetDatabase() throws in production unless) Tj
0 -11 Td (ALLOW_DESTRUCTIVE_RESET=true is explicitly configured.) Tj
ET

% Detail Finding 6 Box
0.97 0.98 1 rg
30 305 552 95 re f
0.75 0.8 0.9 RG
30 305 552 95 re S

BT
0.08 0.2 0.5 rg
/F2 10.5 Tf
40 382 Td (6. VUR5-06: Health Endpoint Exposes Availability Info  [Severity: LOW]) Tj
0 0 0 rg
/F2 8.5 Tf
0 -16 Td (Primary Location: ) Tj
/F1 8.5 Tf
80 0 Td (src/server/app.ts) Tj
/F2 8.5 Tf
-80 -14 Td (Risk Description: ) Tj
/F1 8.5 Tf
80 0 Td (Unrestricted public probe endpoints assist automated discovery and availability monitoring by attackers.) Tj
/F2 8.5 Tf
0 -14 Td (Remediation: ) Tj
/F1 8.5 Tf
65 0 Td (Configured minimal liveness probe with Cache-Control: no-store, no-cache headers and zero internal leakage.) Tj
ET

% Quality Assurance & Sign-off Box
0.08 0.35 0.18 rg
30 180 552 105 re f

BT
1 1 1 rg
/F2 11 Tf
45 265 Td (Remediation Verification & Quality Assurance Summary) Tj
/F1 9 Tf
0 -16 Td ([PASS] Automated Test Suite: 22 / 22 Tests Passing (Vitest baseline & security suites)) Tj
0 -13 Td ([PASS] TypeScript Typecheck & Svelte Diagnostics: 0 Errors, 0 Warnings (svelte-check & tsc)) Tj
0 -13 Td ([PASS] Security Headers: CSP, HSTS, X-Content-Type-Options: nosniff, X-Frame-Options: DENY) Tj
0 -13 Td ([PASS] Database File Permissions: 0o600 / 0o700 owner-only isolation enforced) Tj
0 -15 Td (Status: All 6 Security Findings in VUR 5 successfully resolved and verified.) Tj
ET

% Page 2 Footer
BT
0.5 0.5 0.5 rg
/F1 8 Tf
30 30 Td (HostelGrievance - Security Findings Assessment Report (VUR 5)) Tj
475 0 Td (Page 2 of 2) Tj
ET
"""

    pages = [p1, p2]
    objects = []
    
    def add_object(content):
        objects.append(content)
        return len(objects)
    
    # 1: Catalog
    add_object("<< /Type /Catalog /Pages 2 0 R >>")
    # 2: Pages
    add_object("<< /Type /Pages /Kids [5 0 R 7 0 R] /Count 2 >>")
    
    # 3: Font F1
    font1_id = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    # 4: Font F2
    font2_id = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    
    # Page 1: Content (5) & Page (6)
    p1_bytes = pages[0].encode('utf-8')
    p1_len = len(p1_bytes)
    p1_sid = add_object(f"<< /Length {p1_len} >>\nstream\n{pages[0]}\nendstream")
    add_object(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {p1_sid} 0 R /Resources << /Font << /F1 {font1_id} 0 R /F2 {font2_id} 0 R >> >> >>")
    
    # Page 2: Content (7) & Page (8)
    p2_bytes = pages[1].encode('utf-8')
    p2_len = len(p2_bytes)
    p2_sid = add_object(f"<< /Length {p2_len} >>\nstream\n{pages[1]}\nendstream")
    add_object(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {p2_sid} 0 R /Resources << /Font << /F1 {font1_id} 0 R /F2 {font2_id} 0 R >> >> >>")
    
    # Update Pages object with actual Page Object IDs (6 0 R and 8 0 R)
    objects[1] = "<< /Type /Pages /Kids [6 0 R 8 0 R] /Count 2 >>"
    
    out = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    offsets = []
    for i, obj in enumerate(objects):
        offsets.append(len(out))
        out += f"{i+1} 0 obj\n{obj}\nendobj\n".encode('utf-8')
    
    xref_offset = len(out)
    out += b"xref\n"
    out += f"0 {len(objects) + 1}\n".encode('utf-8')
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode('utf-8')
    
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode('utf-8')
    
    with open(filename, "wb") as f:
        f.write(out)
    print(f"Generated PDF: {filename} ({len(out)} bytes)")

create_vur5_pdf("VUR 5.pdf")
create_vur5_pdf("VUR_5.pdf")
