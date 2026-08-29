import type { Database } from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { HttpError } from '../http/errors.ts';
import type {
	AttachmentRow,
	CommentRow,
	GrievanceRow,
	PublicAttachment,
	PublicComment,
	PublicGrievance,
	SessionUser,
	UserRow
} from '../types/index.ts';
import { toPublicAttachment, toPublicComment, toPublicGrievance, toPublicUser } from './map.ts';
import { MAX_SEARCH_QUERY_LENGTH } from '../config.ts';

export interface GrievanceListOptions {
	page?: number;
	limit?: number;
	category?: string;
	status?: string;
	search?: string;
	studentId?: string;
}

export function findUserByEmail(db: Database, email: string): UserRow | undefined {
	return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
}

export function findUserById(db: Database, id: string): UserRow | undefined {
	return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function userCount(db: Database): number {
	const row = db.prepare('SELECT count(*) AS count FROM users').get() as { count: number };
	return row ? row.count : 0;
}

export function listAllGrievanceRows(db: Database): GrievanceRow[] {
	return db.prepare('SELECT * FROM grievances ORDER BY created_at DESC').all() as GrievanceRow[];
}

export function listGrievanceRowsForStudent(db: Database, studentId: string): GrievanceRow[] {
	return db
		.prepare('SELECT * FROM grievances WHERE student_id = ? ORDER BY created_at DESC')
		.all(studentId) as GrievanceRow[];
}

// [SECURITY FIX 2 - ADD'L & FIX 7 - HACKER MATRIX] Paginated & bounded search database queries
export function listGrievanceRows(
	db: Database,
	options: GrievanceListOptions = {}
): { rows: GrievanceRow[]; total: number } {
	const page = Math.max(1, options.page ?? 1);
	const limit = Math.min(100, Math.max(1, options.limit ?? 50));
	const offset = (page - 1) * limit;

	const whereClauses: string[] = [];
	const params: (string | number)[] = [];

	if (options.studentId) {
		whereClauses.push('student_id = ?');
		params.push(options.studentId);
	}
	if (options.category) {
		whereClauses.push('category = ?');
		params.push(options.category);
	}
	if (options.status) {
		whereClauses.push('status = ?');
		params.push(options.status);
	}
	if (options.search && options.search.trim()) {
		// [SECURITY FIX 7 - HACKER MATRIX] Bounded & sanitized wildcard search to prevent query DoS
		const cleanSearch = options.search.trim().slice(0, MAX_SEARCH_QUERY_LENGTH);
		whereClauses.push('(title LIKE ? OR description LIKE ?)');
		const searchTerm = `%${cleanSearch}%`;
		params.push(searchTerm, searchTerm);
	}

	const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

	const countRow = db.prepare(`SELECT count(*) AS count FROM grievances ${whereSql}`).get(...params) as { count: number };
	const total = countRow ? countRow.count : 0;

	const rows = db
		.prepare(`SELECT * FROM grievances ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
		.all(...params, limit, offset) as GrievanceRow[];

	return { rows, total };
}

export function findGrievanceById(db: Database, id: string): GrievanceRow | undefined {
	return db.prepare('SELECT * FROM grievances WHERE id = ?').get(id) as GrievanceRow | undefined;
}

export function requireGrievance(db: Database, id: string): GrievanceRow {
	const row = findGrievanceById(db, id);
	if (!row) {
		throw new HttpError(404, 'not_found', 'Grievance was not found.');
	}
	return row;
}

export function listCommentRows(db: Database, grievanceId: string): CommentRow[] {
	return db
		.prepare('SELECT * FROM comments WHERE grievance_id = ? ORDER BY created_at ASC')
		.all(grievanceId) as CommentRow[];
}

export function listAttachmentRows(db: Database, grievanceId: string): AttachmentRow[] {
	return db
		.prepare('SELECT * FROM attachments WHERE grievance_id = ? ORDER BY created_at ASC')
		.all(grievanceId) as AttachmentRow[];
}

export function findAttachmentRow(db: Database, id: string): AttachmentRow | undefined {
	return db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as AttachmentRow | undefined;
}

export function touchGrievance(db: Database, id: string, updatedAt: string): void {
	db.prepare('UPDATE grievances SET updated_at = ? WHERE id = ?').run(updatedAt, id);
}

// [SECURITY FIX 8 - HACKER MATRIX] Atomic sequential ID generation
export function nextGrievanceId(db: Database): string {
	const rows = db.prepare("SELECT id FROM grievances WHERE id LIKE 'GRV-%'").all() as { id: string }[];
	let maxNum = 0;
	for (const row of rows) {
		const match = row.id.match(/^GRV-(\d+)$/);
		if (match) {
			const n = parseInt(match[1], 10);
			if (!isNaN(n) && n > maxNum) maxNum = n;
		}
	}
	return `GRV-${String(maxNum + 1).padStart(4, '0')}`;
}

export function nextCommentId(db: Database): string {
	const suffix = randomBytes(4).toString('hex');
	const rows = db.prepare("SELECT id FROM comments WHERE id LIKE 'cmt-%'").all() as { id: string }[];
	let maxNum = 0;
	for (const row of rows) {
		const match = row.id.match(/^cmt-(\d+)/);
		if (match) {
			const n = parseInt(match[1], 10);
			if (!isNaN(n) && n > maxNum) maxNum = n;
		}
	}
	return `cmt-${maxNum + 1}-${suffix}`;
}

export function nextAttachmentId(db: Database): string {
	const suffix = randomBytes(4).toString('hex');
	const rows = db.prepare("SELECT id FROM attachments WHERE id LIKE 'att-%'").all() as { id: string }[];
	let maxNum = 0;
	for (const row of rows) {
		const match = row.id.match(/^att-(\d+)/);
		if (match) {
			const n = parseInt(match[1], 10);
			if (!isNaN(n) && n > maxNum) maxNum = n;
		}
	}
	return `att-${maxNum + 1}-${suffix}`;
}

export function assertCanViewGrievance(user: SessionUser, grievance: GrievanceRow): void {
	if (user.role === 'student' && grievance.student_id !== user.id) {
		throw new HttpError(403, 'unauthorized', 'You are not authorized to view this grievance.');
	}
}

export function assembleGrievance(db: Database, row: GrievanceRow): PublicGrievance {
	const studentRow = findUserById(db, row.student_id);
	if (!studentRow) {
		throw new HttpError(500, 'internal', 'Student was not found.');
	}
	const attachmentRows = listAttachmentRows(db, row.id);
	const attachments = attachmentRows.map(toPublicAttachment);

	const commentRows = listCommentRows(db, row.id);
	const comments = commentRows.map((c) => {
		const authorRow = findUserById(db, c.author_id);
		if (!authorRow) {
			throw new HttpError(500, 'internal', 'Comment author was not found.');
		}
		return toPublicComment(c, toPublicUser(authorRow));
	});

	return toPublicGrievance(row, toPublicUser(studentRow), attachments, comments);
}

// [SECURITY FIX 4 - ADD'L] Batch object assembly to completely eliminate N+1 query amplification
export function assembleGrievancesBatch(db: Database, rows: GrievanceRow[]): PublicGrievance[] {
	if (rows.length === 0) return [];

	const grievanceIds = rows.map((r) => r.id);
	const studentIds = Array.from(new Set(rows.map((r) => r.student_id)));

	// 1. Batch load all student users (1 query)
	const studentPlaceholders = studentIds.map(() => '?').join(',');
	const studentUsers = db
		.prepare(`SELECT id, name, email, role, room, created_at FROM users WHERE id IN (${studentPlaceholders})`)
		.all(...studentIds) as UserRow[];
	const studentMap = new Map(studentUsers.map((u) => [u.id, toPublicUser(u)]));

	// 2. Batch load all attachments (1 query)
	const grievancePlaceholders = grievanceIds.map(() => '?').join(',');
	const allAttachments = db
		.prepare(
			`SELECT * FROM attachments WHERE grievance_id IN (${grievancePlaceholders}) ORDER BY created_at ASC`
		)
		.all(...grievanceIds) as AttachmentRow[];
	const attachmentMap = new Map<string, PublicAttachment[]>();
	for (const att of allAttachments) {
		const list = attachmentMap.get(att.grievance_id) ?? [];
		list.push(toPublicAttachment(att));
		attachmentMap.set(att.grievance_id, list);
	}

	// 3. Batch load all comments (1 query)
	const allComments = db
		.prepare(
			`SELECT * FROM comments WHERE grievance_id IN (${grievancePlaceholders}) ORDER BY created_at ASC`
		)
		.all(...grievanceIds) as CommentRow[];

	// 4. Batch load all unique comment authors (1 query)
	const authorIds = Array.from(new Set(allComments.map((c) => c.author_id)));
	const authorMap = new Map<string, UserRow>();
	if (authorIds.length > 0) {
		const authorPlaceholders = authorIds.map(() => '?').join(',');
		const authorUsers = db
			.prepare(`SELECT id, name, email, role, room, created_at FROM users WHERE id IN (${authorPlaceholders})`)
			.all(...authorIds) as UserRow[];
		for (const author of authorUsers) {
			authorMap.set(author.id, author);
		}
	}

	const commentMap = new Map<string, PublicComment[]>();
	for (const c of allComments) {
		const author = authorMap.get(c.author_id);
		const publicAuthor = author
			? toPublicUser(author)
			: { id: c.author_id, name: 'Unknown', email: '', role: 'student' as const };
		const list = commentMap.get(c.grievance_id) ?? [];
		list.push(toPublicComment(c, publicAuthor));
		commentMap.set(c.grievance_id, list);
	}

	// 5. In-memory assembly in O(N) time with 0 extra queries
	return rows.map((row) => {
		const student = studentMap.get(row.student_id) ?? {
			id: row.student_id,
			name: 'Unknown',
			email: '',
			role: 'student' as const
		};
		const attachments = attachmentMap.get(row.id) ?? [];
		const comments = commentMap.get(row.id) ?? [];
		return toPublicGrievance(row, student, attachments, comments);
	});
}

// [SECURITY FIX 6] Record audit log entries
export function recordAuditLog(
	db: Database,
	grievanceId: string,
	actorId: string,
	action: string,
	previousValue: string | null = null,
	newValue: string | null = null,
	createdAt: string = new Date().toISOString()
): void {
	db.prepare(
		`INSERT INTO grievance_audit_logs (grievance_id, actor_id, action, previous_value, new_value, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)`
	).run(grievanceId, actorId, action, previousValue, newValue, createdAt);
}
