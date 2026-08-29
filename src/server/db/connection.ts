import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { applySchema } from './schema.ts';
import { SECURE_DIR_MODE, SECURE_FILE_MODE, SQLITE_BUSY_TIMEOUT_MS } from '../config.ts';

function enforceSecurePermissions(path: string): void {
	if (path === ':memory:') return;
	try {
		if (existsSync(path)) chmodSync(path, SECURE_FILE_MODE);
		if (existsSync(`${path}-wal`)) chmodSync(`${path}-wal`, SECURE_FILE_MODE);
		if (existsSync(`${path}-shm`)) chmodSync(`${path}-shm`, SECURE_FILE_MODE);
	} catch {
		// Ignore permission enforcement errors on platforms that do not support POSIX modes (e.g. Windows)
	}
}

export function openDatabase(path: string): Database.Database {
	if (path !== ':memory:') {
		const dir = dirname(path);
		mkdirSync(dir, { recursive: true, mode: SECURE_DIR_MODE });
		try {
			chmodSync(dir, SECURE_DIR_MODE);
		} catch {
			// Ignore on unsupported platforms
		}
	}
	const db = new Database(path);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	// [SECURITY FIX 7 - HACKER MATRIX] Prevent SQLITE_BUSY lock contention DoS under concurrent requests
	db.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
	applySchema(db);
	enforceSecurePermissions(path);
	return db;
}
