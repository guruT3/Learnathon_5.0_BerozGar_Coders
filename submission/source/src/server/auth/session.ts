import { randomBytes, createHash } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { MAX_ACTIVE_SESSIONS_PER_USER, REQUIRE_HTTPS, SESSION_COOKIE, SESSION_TTL_SECONDS } from '../config.ts';
import { HttpError } from '../http/errors.ts';
import type { SessionUser } from '../types/index.ts';

function nowIso(): string {
	return new Date().toISOString();
}

function expiryIso(): string {
	return new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
}

export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function cleanExpiredSessions(db: Database): void {
	db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
}

export function createSession(db: Database, userId: string): string {
	// [SECURITY FIX 1 - VUR5] Clean expired sessions on new login
	cleanExpiredSessions(db);

	const token = randomBytes(32).toString('base64url');
	const tokenHash = hashSessionToken(token);

	db.transaction(() => {
		db.prepare(
			'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
		).run(tokenHash, userId, nowIso(), expiryIso());

		// [SECURITY FIX 1 - VUR5] Limit active sessions per user, revoking oldest surplus sessions
		db.prepare(
			`DELETE FROM sessions
			 WHERE user_id = ?
			   AND token NOT IN (
				   SELECT token FROM sessions
				   WHERE user_id = ?
				   ORDER BY created_at DESC
				   LIMIT ?
			   )`
		).run(userId, userId, MAX_ACTIVE_SESSIONS_PER_USER);
	})();

	return token;
}

export function destroySession(db: Database, token: string): void {
	const tokenHash = hashSessionToken(token);
	db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenHash);
}

export function readSessionUser(db: Database, token: string): SessionUser | undefined {
	const tokenHash = hashSessionToken(token);
	const row = db
		.prepare(
			`SELECT u.id, u.name, u.email, u.role, u.room, u.created_at, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
		)
		.get(tokenHash, nowIso()) as (SessionUser & { expires_at: string }) | undefined;
	if (!row) return undefined;
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		role: row.role,
		room: row.room,
		created_at: row.created_at
	};
}

export function setSessionCookie(c: Context, token: string): void {
	setCookie(c, SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: REQUIRE_HTTPS,
		sameSite: 'Lax',
		maxAge: SESSION_TTL_SECONDS
	});
}

export function clearSessionCookie(c: Context): void {
	deleteCookie(c, SESSION_COOKIE, {
		path: '/',
		secure: REQUIRE_HTTPS
	});
}

export function requireUser(c: Context, db: Database): SessionUser {
	const token = getCookie(c, SESSION_COOKIE);
	if (!token) {
		throw new HttpError(401, 'unauthenticated', 'Authentication required.');
	}
	const user = readSessionUser(db, token);
	if (!user) {
		throw new HttpError(401, 'unauthenticated', 'Authentication required.');
	}
	return user;
}

export function optionalToken(c: Context): string | undefined {
	return getCookie(c, SESSION_COOKIE);
}
