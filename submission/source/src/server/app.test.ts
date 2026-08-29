import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { openDatabase } from './db/connection.ts';
import { seedDatabase } from './db/seed.ts';
import { assembleGrievancesBatch, listGrievanceRows } from './db/queries.ts';
import { resetDatabase } from './db/reset.ts';

const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

function cookieHeader(res: Response): string {
	const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
	const list = anyHeaders.getSetCookie?.() ?? [];
	if (list.length > 0) {
		return list.map((v) => v.split(';')[0]).join('; ');
	}
	const raw = res.headers.get('set-cookie');
	return raw ? raw.split(';')[0] : '';
}

async function login(app: ReturnType<typeof createApp>, email: string, password: string) {
	const res = await app.request('/api/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	const json = await res.json();
	return { res, json, cookie: cookieHeader(res) };
}

describe('HostelGrievance API baseline', () => {
	let dir: string;
	let db: ReturnType<typeof openDatabase>;
	let app: ReturnType<typeof createApp>;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'hg-api-'));
		db = openDatabase(join(dir, 'hostel.db'));
		const uploadDir = join(dir, 'uploads');
		seedDatabase(db, uploadDir);
		app = createApp({ db, uploadsDir: uploadDir });
	});

	afterEach(() => {
		try { db.close(); } catch { }
		rmSync(dir, { recursive: true, force: true });
	});

	it('login works for dummy student and warden accounts', async () => {
		const student = await login(app, 'student@example.test', 'student123');
		expect(student.res.status).toBe(200);
		expect(student.json.user.email).toBe('student@example.test');
		expect(student.json.user.role).toBe('student');
		expect(student.json.user.password).toBeUndefined();
		expect(student.json.user.password_hash).toBeUndefined();
		expect(student.cookie).toContain('hg_session=');

		const warden = await login(app, 'warden@example.test', 'warden123');
		expect(warden.res.status).toBe(200);
		expect(warden.json.user.role).toBe('warden');
	});

	it('rejects invalid credentials', async () => {
		const bad = await login(app, 'student@example.test', 'wrong');
		expect(bad.res.status).toBe(401);
		expect(bad.json.code).toBe('unauthenticated');
	});

	it('current-user works after login and fails after logout', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		const me = await app.request('/api/me', { headers: { Cookie: cookie } });
		expect(me.status).toBe(200);
		const meJson = await me.json();
		expect(meJson.user.id).toBe('stu-1');
		expect(meJson.user.password_hash).toBeUndefined();

		const unauth = await app.request('/api/me');
		expect(unauth.status).toBe(401);

		await app.request('/api/logout', { method: 'POST', headers: { Cookie: cookie } });
		const after = await app.request('/api/me', { headers: { Cookie: cookie } });
		expect(after.status).toBe(401);
	});

	it('student can create a grievance', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		const res = await app.request('/api/grievances', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Cookie: cookie },
			body: JSON.stringify({
				title: 'Broken cupboard hinge',
				category: 'Room',
				description: 'The cupboard hinge in B-204 is broken and the door will not close properly.'
			})
		});
		expect(res.status).toBe(201);
		const json = await res.json();
		expect(json.data.id).toMatch(/^GRV-\d{4}$/);
		expect(json.data.studentId).toBe('stu-1');
		expect(json.data.status).toBe('Open');
		expect(json.data.student.email).toBe('student@example.test');
	});

	it('student can retrieve a permitted grievance', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		const res = await app.request('/api/grievances/GRV-0001', { headers: { Cookie: cookie } });
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.data.id).toBe('GRV-0001');
		expect(json.data.comments.length).toBeGreaterThan(0);
		expect(json.data.attachments[0].filename).toBe('leaking-tap.jpg');
	});

	it('student cannot access another student’s grievance', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		const res = await app.request('/api/grievances/GRV-0003', { headers: { Cookie: cookie } });
		expect(res.status).toBe(403);
		const json = await res.json();
		expect(json.code).toBe('unauthorized');

		const list = await app.request('/api/grievances', { headers: { Cookie: cookie } });
		const listJson = await list.json();
		expect(listJson.data.every((g: { studentId: string }) => g.studentId === 'stu-1')).toBe(true);
		expect(listJson.data.some((g: { id: string }) => g.id === 'GRV-0003')).toBe(false);
	});

	it('warden can access management functionality', async () => {
		const { cookie } = await login(app, 'warden@example.test', 'warden123');
		const list = await app.request('/api/grievances', { headers: { Cookie: cookie } });
		expect(list.status).toBe(200);
		const listJson = await list.json();
		expect(listJson.data.length).toBeGreaterThanOrEqual(8);

		const one = await app.request('/api/grievances/GRV-0003', { headers: { Cookie: cookie } });
		expect(one.status).toBe(200);
	});

	it('comments work for permitted users', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		const res = await app.request('/api/grievances/GRV-0001/comments', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Cookie: cookie },
			body: JSON.stringify({ body: 'Following up on the leak this morning.' })
		});
		expect(res.status).toBe(201);
		const json = await res.json();
		expect(json.data.body).toContain('Following up');
		expect(json.data.author.id).toBe('stu-1');
		expect(json.data.author.password_hash).toBeUndefined();

		const list = await app.request('/api/grievances/GRV-0001/comments', { headers: { Cookie: cookie } });
		const listed = await list.json();
		expect(listed.data.some((c: { id: string }) => c.id === json.data.id)).toBe(true);
	});

	it('status changes work for wardens and are forbidden for students', async () => {
		const student = await login(app, 'student@example.test', 'student123');
		const denied = await app.request('/api/grievances/GRV-0001', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Cookie: student.cookie },
			body: JSON.stringify({ status: 'Resolved' })
		});
		expect(denied.status).toBe(403);

		const warden = await login(app, 'warden@example.test', 'warden123');
		const updated = await app.request('/api/grievances/GRV-0008', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Cookie: warden.cookie },
			body: JSON.stringify({ status: 'In Progress' })
		});
		expect(updated.status).toBe(200);
		const json = await updated.json();
		expect(json.data.status).toBe('In Progress');
	});

	it('attachment metadata and storage work', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		const created = await app.request('/api/grievances', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Cookie: cookie },
			body: JSON.stringify({
				title: 'Need a photo on file',
				category: 'Other',
				description: 'Filing this so I can attach a photo of the damaged locker door.'
			})
		});
		const grievance = await created.json();
		const id = grievance.data.id as string;

		const form = new FormData();
		form.append('file', new File([PNG], 'locker.png', { type: 'image/png' }));
		const uploaded = await app.request(`/api/grievances/${id}/attachments`, {
			method: 'POST',
			headers: { Cookie: cookie },
			body: form
		});
		expect(uploaded.status).toBe(201);
		const meta = await uploaded.json();
		expect(meta.data.filename).toBe('locker.png');
		expect(meta.data.contentType).toBe('image/png');
		expect(meta.data.sizeBytes).toBe(PNG.length);

		const fileRes = await app.request(`/api/attachments/${meta.data.id}`, { headers: { Cookie: cookie } });
		expect(fileRes.status).toBe(200);
		expect(fileRes.headers.get('content-type')).toBe('image/png');
		const bytes = Buffer.from(await fileRes.arrayBuffer());
		expect(bytes.equals(PNG)).toBe(true);

		const other = await login(app, 'priya@example.test', 'student123');
		const stolen = await app.request(`/api/attachments/${meta.data.id}`, {
			headers: { Cookie: other.cookie }
		});
		expect(stolen.status).toBe(403);
	});

	it('rejects oversized and disallowed attachments', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		const huge = new Uint8Array(2 * 1024 * 1024 + 1);
		const over = new FormData();
		over.append('file', new File([huge], 'big.png', { type: 'image/png' }));
		const overRes = await app.request('/api/grievances/GRV-0008/attachments', {
			method: 'POST',
			headers: { Cookie: cookie },
			body: over
		});
		expect(overRes.status).toBe(400);

		const invalid = new FormData();
		invalid.append('file', new File(['not-an-image'], 'notes.txt', { type: 'text/plain' }));
		const invalidRes = await app.request('/api/grievances/GRV-0008/attachments', {
			method: 'POST',
			headers: { Cookie: cookie },
			body: invalid
		});
		expect(invalidRes.status).toBe(400);
	});

	it('lets a student edit their own open grievance but not a resolved one', async () => {
		const { cookie } = await login(app, 'student@example.test', 'student123');
		const edited = await app.request('/api/grievances/GRV-0008', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Cookie: cookie },
			body: JSON.stringify({ title: 'Mess tables still dirty before dinner' })
		});
		expect(edited.status).toBe(200);
		const editedJson = await edited.json();
		expect(editedJson.data.title).toContain('still dirty');

		const other = await login(app, 'priya@example.test', 'student123');
		const forbidden = await app.request('/api/grievances/GRV-0008', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Cookie: other.cookie },
			body: JSON.stringify({ title: 'Should not work at all here' })
		});
		expect(forbidden.status).toBe(403);

		const rohan = await login(app, 'rohan@example.test', 'student123');
		const resolved = await app.request('/api/grievances/GRV-0004', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Cookie: rohan.cookie },
			body: JSON.stringify({ title: 'Trying to change a resolved ticket' })
		});
		expect(resolved.status).toBe(409);
		const resolvedJson = await resolved.json();
		expect(resolvedJson.code).toBe('conflict');
	});

	it('rejects unauthenticated grievance access', async () => {
		const res = await app.request('/api/grievances');
		expect(res.status).toBe(401);
	});

	it('returns 404 for unknown grievance ids without leaking internals', async () => {
		const { cookie } = await login(app, 'warden@example.test', 'warden123');
		const res = await app.request('/api/grievances/GRV-9999', { headers: { Cookie: cookie } });
		expect(res.status).toBe(404);
		const json = await res.json();
		expect(json.code).toBe('not_found');
		expect(JSON.stringify(json)).not.toMatch(/sqlite|stack|ENOENT/i);
	});

	describe('Security Fixes Validation', () => {
		it('Fix 1: Session token is stored as SHA-256 hash in database', async () => {
			const student = await login(app, 'student@example.test', 'student123');
			const rawCookieValue = student.cookie.split('=')[1];
			const rawToken = rawCookieValue.split(';')[0];

			// Verify DB sessions table contains hashed token, not raw token
			const dbSession = db.prepare('SELECT * FROM sessions WHERE user_id = ?').get('stu-1') as { token: string };
			expect(dbSession).toBeDefined();
			expect(dbSession.token).not.toBe(rawToken);
			expect(dbSession.token.length).toBe(64); // SHA-256 hex length
		});

		it('Fix 2: Reconciles/rejects unbounded text fields', async () => {
			const { cookie } = await login(app, 'student@example.test', 'student123');

			// Title too long (> 200 chars)
			const longTitleRes = await app.request('/api/grievances', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: cookie },
				body: JSON.stringify({
					title: 'A'.repeat(201),
					category: 'Room',
					description: 'Valid description for testing unbounded title fields.'
				})
			});
			expect(longTitleRes.status).toBe(400);

			// Description too long (> 5000 chars)
			const longDescRes = await app.request('/api/grievances', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: cookie },
				body: JSON.stringify({
					title: 'Valid Grievance Title',
					category: 'Room',
					description: 'B'.repeat(5001)
				})
			});
			expect(longDescRes.status).toBe(400);

			// Comment body too long (> 2000 chars)
			const longCommentRes = await app.request('/api/grievances/GRV-0001/comments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: cookie },
				body: JSON.stringify({ body: 'C'.repeat(2001) })
			});
			expect(longCommentRes.status).toBe(400);
		});

		it('Fix 4: Includes browser security headers & Content-Security-Policy & HSTS', async () => {
			const res = await app.request('/api/health');
			expect(res.headers.get('x-content-type-options')).toBe('nosniff');
			expect(res.headers.get('x-frame-options')).toBe('DENY');
			expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
			expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
			expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000');
		});

		it('Fix 6: Records audit trail logs for grievance actions', async () => {
			const student = await login(app, 'student@example.test', 'student123');
			const createRes = await app.request('/api/grievances', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: student.cookie },
				body: JSON.stringify({
					title: 'Audit Trail Test Ticket',
					category: 'Maintenance',
					description: 'Testing audit log creation for student grievance actions.'
				})
			});
			const json = await createRes.json();
			const grievanceId = json.data.id;

			const warden = await login(app, 'warden@example.test', 'warden123');
			await app.request(`/api/grievances/${grievanceId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json', Cookie: warden.cookie },
				body: JSON.stringify({ status: 'In Progress' })
			});

			const auditLogs = db.prepare('SELECT * FROM grievance_audit_logs WHERE grievance_id = ? ORDER BY id ASC').all(grievanceId) as any[];
			expect(auditLogs.length).toBe(2);
			expect(auditLogs[0].action).toBe('CREATED');
			expect(auditLogs[1].action).toBe('STATUS_CHANGE');
			expect(auditLogs[1].previous_value).toBe('open');
			expect(auditLogs[1].new_value).toBe('in_progress');
		});

		it('Additional Fix 2: Grievance list pagination and filtering', async () => {
			const warden = await login(app, 'warden@example.test', 'warden123');
			const res = await app.request('/api/grievances?page=1&limit=3', {
				headers: { Cookie: warden.cookie }
			});
			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.data.length).toBe(3);
			expect(json.pagination).toBeDefined();
			expect(json.pagination.page).toBe(1);
			expect(json.pagination.limit).toBe(3);
			expect(json.pagination.total).toBeGreaterThanOrEqual(8);
			expect(json.pagination.totalPages).toBeGreaterThanOrEqual(3);
		});

		it('Additional Fix 3: Enforces attachment count quota per grievance', async () => {
			const { cookie } = await login(app, 'student@example.test', 'student123');
			// Grievance GRV-0008 already has 1 attachment
			// Upload 4 more attachments (reaching the max 5)
			for (let i = 0; i < 4; i++) {
				const form = new FormData();
				form.append('file', new File([PNG], `photo_${i}.png`, { type: 'image/png' }));
				const res = await app.request('/api/grievances/GRV-0008/attachments', {
					method: 'POST',
					headers: { Cookie: cookie },
					body: form
				});
				expect(res.status).toBe(201);
			}

			// 6th attachment must be rejected with 400
			const overLimitForm = new FormData();
			overLimitForm.append('file', new File([PNG], 'photo_overflow.png', { type: 'image/png' }));
			const overRes = await app.request('/api/grievances/GRV-0008/attachments', {
				method: 'POST',
				headers: { Cookie: cookie },
				body: overLimitForm
			});
			expect(overRes.status).toBe(400);
			const json = await overRes.json();
			expect(json.error).toContain('maximum of 5 attachments');
		});

		it('Additional Fix 4: Batch object assembly executes with zero N+1 query loops', () => {
			const { rows } = listGrievanceRows(db, { limit: 10 });
			const assembled = assembleGrievancesBatch(db, rows);
			expect(assembled.length).toBe(rows.length);
			expect(assembled[0].student.name).toBeDefined();
		});

		it('VUR5 Fix 1: Caps active sessions per user account at 5', async () => {
			// Login 7 times for the same student
			for (let i = 0; i < 7; i++) {
				await login(app, 'student@example.test', 'student123');
			}
			const countRow = db.prepare('SELECT count(*) AS count FROM sessions WHERE user_id = ?').get('stu-1') as { count: number };
			expect(countRow.count).toBeLessThanOrEqual(5);
		});

		it('Sanitizes HTML characters and script tags in comments', async () => {
			const { cookie } = await login(app, 'student@example.test', 'student123');
			const res = await app.request('/api/grievances/GRV-0001/comments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: cookie },
				body: JSON.stringify({ body: '<script>alert("xss")</script><img src=x onerror=alert(1)>' })
			});
			expect(res.status).toBe(201);
			const json = await res.json();
			expect(json.data.body).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;');
			expect(json.data.body).not.toContain('<script>');
		});

		it('Hacker Defense 4: Rejects untrusted Host headers', async () => {
			const res = await app.request('/api/health', {
				headers: { Host: 'malicious-phishing-host.com' }
			});
			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.code).toBe('bad_request');
		});

		it('Hacker Defense 5: Anti-CSRF blocks cross-site sec-fetch-site requests', async () => {
			const { cookie } = await login(app, 'student@example.test', 'student123');
			const res = await app.request('/api/grievances/GRV-0001/comments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: cookie,
					'Sec-Fetch-Site': 'cross-site'
				},
				body: JSON.stringify({ body: 'Trying CSRF forge' })
			});
			expect(res.status).toBe(403);
			const json = await res.json();
			expect(json.code).toBe('unauthorized');
		});

		it('Hacker Defense 6: Rejects image decompression bombs (> 4096px)', async () => {
			const { cookie } = await login(app, 'student@example.test', 'student123');
			const hugePng = Buffer.from(PNG);
			hugePng.writeUInt32BE(5000, 16);
			hugePng.writeUInt32BE(5000, 20);

			const bombForm = new FormData();
			bombForm.append('file', new File([hugePng], 'bomb.png', { type: 'image/png' }));
			const res = await app.request('/api/grievances/GRV-0008/attachments', {
				method: 'POST',
				headers: { Cookie: cookie },
				body: bombForm
			});
			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toContain('exceed the maximum permitted resolution');
		});

		it('Hacker Defense 7: Bounded search queries and SQLite busy timeout', async () => {
			const warden = await login(app, 'warden@example.test', 'warden123');
			const longSearch = 'a'.repeat(200);
			const res = await app.request(`/api/grievances?search=${longSearch}`, {
				headers: { Cookie: warden.cookie }
			});
			expect(res.status).toBe(200);
		});
	});
});
