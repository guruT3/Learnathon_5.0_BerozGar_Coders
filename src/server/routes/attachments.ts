import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { requireUser } from '../auth/session.ts';
import { assertCanViewGrievance, findAttachmentRow, requireGrievance } from '../db/queries.ts';
import { streamStoredFile } from '../storage/attachments.ts';
import { HttpError } from '../http/errors.ts';

export const attachmentRoutes = new Hono<AppEnv>();

// [SECURITY FIX 2 - VUR5] Stream file chunks to client instead of buffering full file into memory
attachmentRoutes.get('/:id', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	const row = findAttachmentRow(db, c.req.param('id'));
	if (!row) {
		throw new HttpError(404, 'not_found', 'Attachment was not found.');
	}
	const grievance = requireGrievance(db, row.grievance_id);
	assertCanViewGrievance(user, grievance);

	const { stream, size } = streamStoredFile(c.get('uploadsDir'), row.stored_filename);
	// Strip all ASCII control characters (0-31, 127), quotes, and backslashes
	const sanitizedFilename = row.original_filename.replace(/[\x00-\x1F\x7F"\\]/g, '_');
	const encodedFilename = encodeURIComponent(row.original_filename);
	const safeMimeType = row.mime_type.replace(/[\x00-\x1F\x7F]/g, '');

	c.header('Content-Type', safeMimeType);
	c.header('Content-Length', String(size || row.size_bytes));
	c.header('X-Content-Type-Options', 'nosniff');
	c.header(
		'Content-Disposition',
		`attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodedFilename}`
	);
	return c.body(stream);
});
