import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../env.ts';
import { createSession, clearSessionCookie, destroySession, optionalToken, requireUser, setSessionCookie } from '../auth/session.ts';
import { verifyPassword, dummyVerifyPassword } from '../auth/passwords.ts';
import { findUserByEmail } from '../db/queries.ts';
import { toPublicUser } from '../db/map.ts';
import { HttpError } from '../http/errors.ts';
import { MAX_RATE_LIMIT_ENTRIES, TRUST_PROXY } from '../config.ts';

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

// [SECURITY FIX 2 - HACKER MATRIX] Bounded in-memory store with LRU eviction to prevent heap exhaustion DoS
const loginAttempts = new Map<string, RateLimitEntry>();
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// [SECURITY FIX 1 - HACKER MATRIX] Secure client IP resolution with proxy verification
export function getClientIp(c: Context): string {
	if (TRUST_PROXY) {
		const forwarded = c.req.header('x-forwarded-for');
		if (forwarded) {
			const ips = forwarded.split(',').map((ip) => ip.trim());
			const candidate = ips[0];
			if (candidate && /^[a-fA-F0-9.:]+$/.test(candidate) && candidate.length <= 64) {
				return candidate;
			}
		}
	}
	// Fallback to local default / direct connection
	return '127.0.0.1';
}

function pruneExpiredEntries(): void {
	const now = Date.now();
	for (const [key, entry] of loginAttempts.entries()) {
		if (now > entry.resetAt) {
			loginAttempts.delete(key);
		}
	}
}

function checkRateLimit(key: string): void {
	const now = Date.now();
	const entry = loginAttempts.get(key);
	if (entry) {
		if (now > entry.resetAt) {
			loginAttempts.delete(key);
		} else if (entry.count >= MAX_LOGIN_ATTEMPTS) {
			throw new HttpError(429, 'rate_limited', 'Too many failed login attempts. Please try again later.');
		}
	}
}

function recordFailedAttempt(key: string): void {
	const now = Date.now();

	// Enforce strict map capacity limit to prevent memory exhaustion DoS
	if (loginAttempts.size >= MAX_RATE_LIMIT_ENTRIES) {
		pruneExpiredEntries();
		if (loginAttempts.size >= MAX_RATE_LIMIT_ENTRIES) {
			const oldestKey = loginAttempts.keys().next().value;
			if (oldestKey) loginAttempts.delete(oldestKey);
		}
	}

	const entry = loginAttempts.get(key) ?? { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
	if (now > entry.resetAt) {
		entry.count = 1;
		entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
	} else {
		entry.count += 1;
	}
	loginAttempts.set(key, entry);
}

function clearRateLimit(key: string): void {
	loginAttempts.delete(key);
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/login', async (c) => {
	const db = c.get('db');
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}
	if (!body || typeof body !== 'object') {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}
	const email = 'email' in body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
	const password = 'password' in body && typeof body.password === 'string' ? body.password : '';
	if (!email || !password) {
		throw new HttpError(400, 'bad_request', 'Email and password are required.');
	}

	const ip = getClientIp(c);
	const rateLimitKey = `${ip}:${email}`;
	checkRateLimit(rateLimitKey);

	const user = findUserByEmail(db, email);

	// [SECURITY FIX 3 - HACKER MATRIX] Constant-time dummy verification when user is absent to prevent timing attack enumeration
	if (!user) {
		dummyVerifyPassword(password);
		recordFailedAttempt(rateLimitKey);
		throw new HttpError(401, 'unauthenticated', 'Invalid email or password.');
	}

	if (!verifyPassword(password, user.password_hash)) {
		recordFailedAttempt(rateLimitKey);
		throw new HttpError(401, 'unauthenticated', 'Invalid email or password.');
	}

	clearRateLimit(rateLimitKey);
	const token = createSession(db, user.id);
	setSessionCookie(c, token);
	return c.json({ user: toPublicUser(user) });
});

authRoutes.post('/logout', (c) => {
	const db = c.get('db');
	const token = optionalToken(c);
	if (token) {
		destroySession(db, token);
	}
	clearSessionCookie(c);
	return c.json({ ok: true });
});

authRoutes.get('/me', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	return c.json({ user: toPublicUser(user) });
});
