import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string): string {
	const salt = randomBytes(16).toString('hex');
	const hash = scryptSync(password, salt, 64).toString('hex');
	return `scrypt:${salt}:${hash}`;
}

function constantTimeCompare(actual: Buffer, expected: Buffer): boolean {
	if (actual.length !== expected.length) {
		const dummy = Buffer.alloc(actual.length, 0);
		timingSafeEqual(actual, dummy);
		return false;
	}
	return timingSafeEqual(actual, expected);
}

export function verifyPassword(password: string, stored: string): boolean {
	const parts = stored.split(':');
	if (parts.length === 2) {
		const [scheme, hash] = parts;
		if (scheme !== 'sha256' || !hash) return false;
		const actual = createHash('sha256').update(password).digest();
		const expected = Buffer.from(hash, 'hex');
		return constantTimeCompare(actual, expected);
	}
	if (parts.length === 3) {
		const [scheme, salt, hash] = parts;
		if (scheme !== 'scrypt' || !salt || !hash) return false;
		const actual = scryptSync(password, salt, 64);
		const expected = Buffer.from(hash, 'hex');
		return constantTimeCompare(actual, expected);
	}
	return false;
}

// [SECURITY FIX 3 - HACKER MATRIX] Dummy scrypt computation to equalize execution timing when a user does not exist
const DUMMY_SALT = '0123456789abcdef0123456789abcdef';
export function dummyVerifyPassword(password: string): void {
	try {
		scryptSync(password || 'dummy_timing_protection_password', DUMMY_SALT, 64);
	} catch {
		// Ignore any calculation error
	}
}
