import { existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DB_PATH, DEFAULT_UPLOADS_DIR, IS_PRODUCTION } from '../config.ts';
import { openDatabase } from './connection.ts';
import { seedDatabase } from './seed.ts';
import { resetUploadsDir } from '../storage/attachments.ts';

function removeIfExists(path: string): void {
	if (existsSync(path)) unlinkSync(path);
}

export function resetDatabase(dbPath = DEFAULT_DB_PATH, uploadsDir = DEFAULT_UPLOADS_DIR): void {
	// [SECURITY FIX 5 - VUR5] Safeguard against accidental execution in production environments
	if (IS_PRODUCTION && process.env.ALLOW_DESTRUCTIVE_RESET !== 'true') {
		throw new Error(
			'CRITICAL SAFEGUARD: Destructive database reset is blocked in production environments. Set ALLOW_DESTRUCTIVE_RESET=true to proceed.'
		);
	}

	removeIfExists(dbPath);
	removeIfExists(`${dbPath}-wal`);
	removeIfExists(`${dbPath}-shm`);
	resetUploadsDir(uploadsDir);
	const db = openDatabase(dbPath);
	seedDatabase(db, uploadsDir);
	db.close();
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
	resetDatabase();
	console.log('Reset complete: data/hostel.db and uploads/ restored to the seeded lab state.');
}
