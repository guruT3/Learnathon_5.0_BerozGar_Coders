import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(SERVER_DIR, '../..');

export const DEFAULT_DB_PATH =
	process.env.HOSTEL_DB_PATH ?? path.join(REPO_ROOT, 'data', 'hostel.db');

export const DEFAULT_UPLOADS_DIR =
	process.env.HOSTEL_UPLOADS_DIR ?? path.join(REPO_ROOT, 'uploads');

export const API_PORT = Number(process.env.HOSTEL_API_PORT ?? 3001);

export const SESSION_COOKIE = 'hg_session';

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

// [SECURITY FIX 1 - VUR5] Maximum concurrent active sessions per user account
export const MAX_ACTIVE_SESSIONS_PER_USER = 5;

export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024; // 2 MB per file

// [SECURITY FIX 6 - HACKER MATRIX] Maximum allowed image resolution dimension (4K max)
export const MAX_IMAGE_DIMENSION = 4096;

// [SECURITY FIX 3 - ADD'L] Per-grievance attachment count and total size quotas
export const MAX_ATTACHMENTS_PER_GRIEVANCE = 5;
export const MAX_TOTAL_ATTACHMENT_BYTES_PER_GRIEVANCE = 10 * 1024 * 1024; // 10 MB total

export const ALLOWED_ATTACHMENT_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp'
]);

// [SECURITY FIX 1 - ADD'L] HTTPS & HSTS enforcement configuration
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const REQUIRE_HTTPS = process.env.REQUIRE_HTTPS
	? process.env.REQUIRE_HTTPS === 'true'
	: IS_PRODUCTION;
export const HSTS_MAX_AGE_SECONDS = 31536000; // 1 year
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);

// [SECURITY FIX 4 - HACKER MATRIX] Allowed Host headers to prevent Host Header Poisoning
export const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS ?? '127.0.0.1,localhost,::1')
	.split(',')
	.map((s) => s.trim().toLowerCase())
	.filter(Boolean);

// [SECURITY FIX 1 - HACKER MATRIX] Trust Proxy configuration for safe X-Forwarded-For IP resolution
export const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

// [SECURITY FIX 2 - HACKER MATRIX] Maximum entries in rate limit cache to prevent heap memory exhaustion
export const MAX_RATE_LIMIT_ENTRIES = 5000;

// [SECURITY FIX 7 - HACKER MATRIX] SQLite busy timeout & search limits to prevent lock contention DoS
export const SQLITE_BUSY_TIMEOUT_MS = 5000;
export const MAX_SEARCH_QUERY_LENGTH = 100;

// [SECURITY FIX 5 - ADD'L] Restrictive file and directory permissions (owner-only)
export const SECURE_FILE_MODE = 0o600; // rw-------
export const SECURE_DIR_MODE = 0o700;  // rwx------
