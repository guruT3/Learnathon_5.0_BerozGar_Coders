import { Hono } from 'hono';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AppEnv } from '../env.ts';
import { requireUser } from '../auth/session.ts';
import {
	assembleGrievance,
	assembleGrievancesBatch,
	assertCanViewGrievance,
	findUserById,
	listAttachmentRows,
	listCommentRows,
	listGrievanceRows,
	nextAttachmentId,
	nextCommentId,
	nextGrievanceId,
	recordAuditLog,
	requireGrievance,
	touchGrievance
} from '../db/queries.ts';
import type { CommentRow, AttachmentRow } from '../types/index.ts';
import { toPublicAttachment, toPublicComment, toPublicUser } from '../db/map.ts';
import { HttpError } from '../http/errors.ts';
import { parseCategory, statusToDb } from '../http/status.ts';
import {
	bufferFromUpload,
	newStoredName,
	originalBasename,
	writeStoredFile
} from '../storage/attachments.ts';
import {
	MAX_ATTACHMENTS_PER_GRIEVANCE,
	MAX_TOTAL_ATTACHMENT_BYTES_PER_GRIEVANCE
} from '../config.ts';

function nowIso(): string {
	return new Date().toISOString();
}

function readString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function sanitizeComment(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export const grievanceRoutes = new Hono<AppEnv>();

// [SECURITY FIX 2 & 4 - ADD'L] Paginated grievance listing with batch assembly to eliminate N+1 queries
grievanceRoutes.get('/', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);

	const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
	const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10) || 50));
	const category = c.req.query('category') || undefined;
	const status = c.req.query('status') || undefined;
	const search = c.req.query('search') || undefined;

	const { rows, total } = listGrievanceRows(db, {
		page,
		limit,
		category,
		status,
		search,
		studentId: user.role === 'student' ? user.id : undefined
	});

	const data = assembleGrievancesBatch(db, rows);

	return c.json({
		data,
		pagination: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit)
		}
	});
});

grievanceRoutes.post('/', async (c) => {
	const db = c.get('db');
	const uploadsDir = c.get('uploadsDir');
	const user = requireUser(c, db);
	if (user.role !== 'student') {
		throw new HttpError(403, 'unauthorized', 'Only students can file grievances.');
	}

	const contentType = c.req.header('content-type') ?? '';
	let title = '';
	let category = '';
	let description = '';
	let upload: File | undefined;

	if (contentType.includes('multipart/form-data')) {
		const body = await c.req.parseBody();
		title = readString(body.title) ?? '';
		category = readString(body.category) ?? '';
		description = readString(body.description) ?? '';
		if (body.file instanceof File) upload = body.file;
		else if (body.attachment instanceof File) upload = body.attachment;
	} else {
		let json: unknown;
		try {
			json = await c.req.json();
		} catch {
			throw new HttpError(400, 'bad_request', 'Request body must be JSON or multipart form data.');
		}
		if (!json || typeof json !== 'object') {
			throw new HttpError(400, 'bad_request', 'Request body must be JSON or multipart form data.');
		}
		title = readString('title' in json ? json.title : undefined) ?? '';
		category = readString('category' in json ? json.category : undefined) ?? '';
		description = readString('description' in json ? json.description : undefined) ?? '';
	}

	title = title.trim();
	description = description.trim();

	// [SECURITY FIX 2] Enforce bounded text fields on creation
	if (title.length < 5 || title.length > 200) {
		throw new HttpError(400, 'bad_request', 'Title must be between 5 and 200 characters.');
	}
	if (description.length < 20 || description.length > 5000) {
		throw new HttpError(400, 'bad_request', 'Description must be between 20 and 5000 characters.');
	}
	const parsedCategory = parseCategory(category);

	let id = '';
	const ts = nowIso();

	let stored: string | undefined;
	let bytes: Buffer | undefined;

	if (upload) {
		bytes = await bufferFromUpload(upload);
		stored = newStoredName(upload.type);
	}

	// [SECURITY FIX 5 & FIX 8 - HACKER MATRIX] Atomic file write and database transaction with atomic ID generation
	try {
		if (stored && bytes) {
			writeStoredFile(uploadsDir, stored, bytes);
		}

		db.transaction(() => {
			id = nextGrievanceId(db);
			db.prepare(
				`INSERT INTO grievances (id, student_id, title, category, description, status, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
			).run(id, user.id, title, parsedCategory, description, ts, ts);

			if (upload && stored && bytes) {
				db.prepare(
					`INSERT INTO attachments (id, grievance_id, original_filename, stored_filename, mime_type, size_bytes, created_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`
				).run(
					nextAttachmentId(db),
					id,
					originalBasename(upload.name),
					stored,
					upload.type,
					bytes.byteLength,
					ts
				);
			}

			// [SECURITY FIX 6] Add audit trail log for grievance creation
			recordAuditLog(db, id, user.id, 'CREATED', null, 'open', ts);
		})();
	} catch (err) {
		if (stored) {
			try {
				rmSync(join(uploadsDir, stored), { force: true });
			} catch {
				// ignore cleanup error
			}
		}
		throw err;
	}

	return c.json({ data: assembleGrievance(db, requireGrievance(db, id)) }, 201);
});

grievanceRoutes.get('/:id/comments', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	const row = requireGrievance(db, c.req.param('id'));
	assertCanViewGrievance(user, row);
	const comments = listCommentRows(db, row.id).map((comment) => {
		const authorRow = findUserById(db, comment.author_id);
		if (!authorRow) {
			throw new HttpError(500, 'internal', 'Internal server error.');
		}
		return toPublicComment(comment, toPublicUser(authorRow));
	});
	return c.json({ data: comments });
});

grievanceRoutes.post('/:id/comments', async (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	const row = requireGrievance(db, c.req.param('id'));
	assertCanViewGrievance(user, row);

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw new HttpError(400, 'bad_request', 'JSON body is required.');
	}
	const text =
		body && typeof body === 'object' && 'body' in body && typeof body.body === 'string'
			? body.body.trim()
			: '';

	// [SECURITY FIX 2] Enforce bounded text fields on comments
	if (!text || text.length > 2000) {
		throw new HttpError(400, 'bad_request', 'Comment must be between 1 and 2000 characters.');
	}

	// Sanitize comment content before saving to prevent Stored XSS
	const sanitizedText = sanitizeComment(text);

	let id = '';
	const ts = nowIso();
	db.transaction(() => {
		id = nextCommentId(db);
		db.prepare(
			`INSERT INTO comments (id, grievance_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)`
		).run(id, row.id, user.id, sanitizedText, ts);
		touchGrievance(db, row.id, ts);
	})();

	const author = findUserById(db, user.id);
	if (!author) {
		throw new HttpError(500, 'internal', 'Internal server error.');
	}
	const commentRow = db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as CommentRow;
	return c.json({ data: toPublicComment(commentRow, toPublicUser(author)) }, 201);
});

grievanceRoutes.post('/:id/attachments', async (c) => {
	const db = c.get('db');
	const uploadsDir = c.get('uploadsDir');
	const user = requireUser(c, db);
	const row = requireGrievance(db, c.req.param('id'));
	if (user.role !== 'student' || row.student_id !== user.id) {
		throw new HttpError(403, 'unauthorized', 'Only the student owner can add attachments.');
	}
	if (row.status === 'resolved') {
		throw new HttpError(409, 'conflict', 'Resolved grievances cannot be edited.');
	}

	// [SECURITY FIX 3 - ADD'L] Check attachment count quota per grievance
	const existingAttachments = listAttachmentRows(db, row.id);
	if (existingAttachments.length >= MAX_ATTACHMENTS_PER_GRIEVANCE) {
		throw new HttpError(
			400,
			'bad_request',
			`A maximum of ${MAX_ATTACHMENTS_PER_GRIEVANCE} attachments is allowed per grievance.`
		);
	}

	const body = await c.req.parseBody();
	const upload =
		body.file instanceof File ? body.file : body.attachment instanceof File ? body.attachment : undefined;
	if (!upload) {
		throw new HttpError(400, 'bad_request', 'A file field named file is required.');
	}

	const bytes = await bufferFromUpload(upload);

	// [SECURITY FIX 3 - ADD'L] Check total storage quota limit per grievance
	const totalExistingBytes = existingAttachments.reduce((sum, a) => sum + a.size_bytes, 0);
	if (totalExistingBytes + bytes.byteLength > MAX_TOTAL_ATTACHMENT_BYTES_PER_GRIEVANCE) {
		throw new HttpError(
			400,
			'bad_request',
			`Total attachment size for this grievance exceeds the ${MAX_TOTAL_ATTACHMENT_BYTES_PER_GRIEVANCE / (1024 * 1024)} MB limit.`
		);
	}

	const stored = newStoredName(upload.type);
	const ts = nowIso();
	let id = '';

	// [SECURITY FIX 5 & FIX 8 - HACKER MATRIX] Atomic file write and database transaction with atomic ID allocation
	try {
		writeStoredFile(uploadsDir, stored, bytes);
		db.transaction(() => {
			id = nextAttachmentId(db);
			db.prepare(
				`INSERT INTO attachments (id, grievance_id, original_filename, stored_filename, mime_type, size_bytes, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			).run(id, row.id, originalBasename(upload.name), stored, upload.type, bytes.byteLength, ts);
			touchGrievance(db, row.id, ts);
		})();
	} catch (err) {
		try {
			rmSync(join(uploadsDir, stored), { force: true });
		} catch {
			// ignore cleanup error
		}
		throw err;
	}

	const saved = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as AttachmentRow;
	return c.json({ data: toPublicAttachment(saved) }, 201);
});

grievanceRoutes.get('/:id', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	const row = requireGrievance(db, c.req.param('id'));
	assertCanViewGrievance(user, row);
	return c.json({ data: assembleGrievance(db, row) });
});

grievanceRoutes.patch('/:id', async (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	const row = requireGrievance(db, c.req.param('id'));
	assertCanViewGrievance(user, row);

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}
	if (!body || typeof body !== 'object') {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}

	const title = 'title' in body ? body.title : undefined;
	const description = 'description' in body ? body.description : undefined;
	const category = 'category' in body ? body.category : undefined;
	const status = 'status' in body ? body.status : undefined;
	const wantsContent = title !== undefined || description !== undefined || category !== undefined;
	const wantsStatus = status !== undefined;

	if (!wantsContent && !wantsStatus) {
		throw new HttpError(400, 'bad_request', 'No updatable fields were provided.');
	}

	switch (user.role) {
		case 'student': {
			if (row.student_id !== user.id) {
				throw new HttpError(403, 'unauthorized', 'You can only edit your own grievances.');
			}
			if (wantsStatus) {
				throw new HttpError(403, 'unauthorized', 'Students cannot modify grievance status.');
			}
			if (row.status === 'resolved') {
				throw new HttpError(409, 'conflict', 'Resolved grievances cannot be edited.');
			}
			let nextTitle = row.title;
			let nextDescription = row.description;
			let nextCategory = row.category;
			if (title !== undefined) {
				if (typeof title !== 'string' || title.trim().length < 5 || title.trim().length > 200) {
					throw new HttpError(400, 'bad_request', 'Title must be between 5 and 200 characters.');
				}
				nextTitle = title.trim();
			}
			if (description !== undefined) {
				if (
					typeof description !== 'string' ||
					description.trim().length < 20 ||
					description.trim().length > 5000
				) {
					throw new HttpError(
						400,
						'bad_request',
						'Description must be between 20 and 5000 characters.'
					);
				}
				nextDescription = description.trim();
			}
			if (category !== undefined) {
				if (typeof category !== 'string') {
					throw new HttpError(400, 'bad_request', 'Invalid grievance category.');
				}
				nextCategory = parseCategory(category);
			}
			const ts = nowIso();
			db.transaction(() => {
				db.prepare(
					'UPDATE grievances SET title = ?, description = ?, category = ?, updated_at = ? WHERE id = ?'
				).run(nextTitle, nextDescription, nextCategory, ts, row.id);

				// [SECURITY FIX 6] Record audit log for grievance edit
				recordAuditLog(
					db,
					row.id,
					user.id,
					'EDITED',
					JSON.stringify({ title: row.title, description: row.description, category: row.category }),
					JSON.stringify({ title: nextTitle, description: nextDescription, category: nextCategory }),
					ts
				);
			})();
			break;
		}
		case 'warden': {
			if (wantsContent) {
				throw new HttpError(403, 'unauthorized', 'Wardens cannot edit grievance content.');
			}
			if (typeof status !== 'string') {
				throw new HttpError(400, 'bad_request', 'Invalid grievance status.');
			}
			const nextStatus = statusToDb(status);
			const ts = nowIso();
			db.transaction(() => {
				db.prepare('UPDATE grievances SET status = ?, updated_at = ? WHERE id = ?').run(
					nextStatus,
					ts,
					row.id
				);

				// [SECURITY FIX 6] Record audit log for status change
				recordAuditLog(db, row.id, user.id, 'STATUS_CHANGE', row.status, nextStatus, ts);
			})();
			break;
		}
		default: {
			const _exhaustive: never = user.role;
			throw new HttpError(500, 'internal', 'Internal server error.');
			void _exhaustive;
		}
	}

	return c.json({ data: assembleGrievance(db, requireGrievance(db, row.id)) });
});
