import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, chmodSync, createReadStream, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, MAX_IMAGE_DIMENSION, SECURE_DIR_MODE, SECURE_FILE_MODE } from '../config.ts';
import { HttpError } from '../http/errors.ts';

const MIME_EXTENSION: Record<string, string> = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/gif': '.gif',
	'image/webp': '.webp'
};

export function ensureUploadsDir(dir: string): void {
	mkdirSync(dir, { recursive: true, mode: SECURE_DIR_MODE });
	try {
		chmodSync(dir, SECURE_DIR_MODE);
	} catch {
		// Ignore on unsupported platforms
	}
}

export function resetUploadsDir(dir: string): void {
	if (existsSync(dir)) {
		rmSync(dir, { recursive: true, force: true });
	}
	ensureUploadsDir(dir);
}

export function originalBasename(filename: string): string {
	const base = filename.replace(/\\/g, '/').split('/').pop() ?? 'upload';
	const cleaned = base.replace(/[\0\r\n]/g, '').trim();
	return cleaned.length > 0 ? cleaned.slice(0, 255) : 'upload';
}

export function extensionForMime(mime: string): string {
	return MIME_EXTENSION[mime] ?? '.bin';
}

export function newStoredName(mime: string, originalName?: string): string {
	return originalName ?? `${randomBytes(16).toString('hex')}${extensionForMime(mime)}`;
}

export function validateMagicBytes(bytes: Buffer, mime: string): void {
	if (bytes.length < 4) {
		throw new HttpError(400, 'bad_request', 'Invalid attachment file content.');
	}
	switch (mime) {
		case 'image/jpeg':
			if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
				throw new HttpError(400, 'bad_request', 'File content does not match JPEG image format.');
			}
			break;
		case 'image/png':
			if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
				throw new HttpError(400, 'bad_request', 'File content does not match PNG image format.');
			}
			break;
		case 'image/gif':
			if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x38) {
				throw new HttpError(400, 'bad_request', 'File content does not match GIF image format.');
			}
			break;
		case 'image/webp':
			if (
				bytes.length < 12 ||
				bytes[0] !== 0x52 ||
				bytes[1] !== 0x49 ||
				bytes[2] !== 0x46 ||
				bytes[3] !== 0x46 ||
				bytes[8] !== 0x57 ||
				bytes[9] !== 0x45 ||
				bytes[10] !== 0x42 ||
				bytes[11] !== 0x50
			) {
				throw new HttpError(400, 'bad_request', 'File content does not match WebP image format.');
			}
			break;
		default:
			throw new HttpError(400, 'bad_request', 'Unsupported attachment type.');
	}
}

// [SECURITY FIX 6 - HACKER MATRIX] Image dimension parser to block decompression pixel bombs
export function validateImageDimensions(bytes: Buffer, mime: string): void {
	let width = 0;
	let height = 0;

	try {
		if (mime === 'image/png' && bytes.length >= 24) {
			width = bytes.readUInt32BE(16);
			height = bytes.readUInt32BE(20);
		} else if (mime === 'image/gif' && bytes.length >= 10) {
			width = bytes.readUInt16LE(6);
			height = bytes.readUInt16LE(8);
		} else if (mime === 'image/jpeg' && bytes.length >= 10) {
			let offset = 2;
			while (offset < bytes.length - 8) {
				if (bytes[offset] === 0xff) {
					const marker = bytes[offset + 1];
					if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) {
						height = bytes.readUInt16BE(offset + 5);
						width = bytes.readUInt16BE(offset + 7);
						break;
					} else if (marker === 0xd9 || marker === 0xda) {
						break; // End of image or start of scan
					}
					const length = bytes.readUInt16BE(offset + 2);
					offset += 2 + length;
				} else {
					offset += 1;
				}
			}
		} else if (mime === 'image/webp' && bytes.length >= 30) {
			const chunkType = bytes.toString('latin1', 12, 16);
			if (chunkType === 'VP8 ' && bytes.length >= 30) {
				width = bytes.readUInt16LE(26) & 0x3fff;
				height = bytes.readUInt16LE(28) & 0x3fff;
			} else if (chunkType === 'VP8L' && bytes.length >= 25) {
				const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
				width = 1 + (((b1 & 0x3f) << 8) | b0);
				height = 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
			} else if (chunkType === 'VP8X' && bytes.length >= 30) {
				width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
				height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
			}
		}
	} catch {
		// If dimension parsing encounters corrupted frames, let magic byte validation hold
	}

	if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
		throw new HttpError(
			400,
			'bad_request',
			`Image dimensions (${width}x${height}) exceed the maximum permitted resolution of ${MAX_IMAGE_DIMENSION}x${MAX_IMAGE_DIMENSION} pixels.`
		);
	}
}

export function assertPermittedAttachment(mime: string, size: number, bytes?: Buffer): void {
	if (!ALLOWED_ATTACHMENT_TYPES.has(mime)) {
		throw new HttpError(400, 'bad_request', 'Attachments must be JPEG, PNG, GIF, or WebP images.');
	}
	if (size <= 0) {
		throw new HttpError(400, 'bad_request', 'Attachment file is empty.');
	}
	if (size > MAX_ATTACHMENT_BYTES) {
		throw new HttpError(400, 'bad_request', 'Attachment must be 2 MB or smaller.');
	}
	if (bytes) {
		validateMagicBytes(bytes, mime);
		validateImageDimensions(bytes, mime);
	}
}

export async function bufferFromUpload(file: File): Promise<Buffer> {
	// [SECURITY FIX 3] Check initial declared size before buffering
	if (file.size > MAX_ATTACHMENT_BYTES) {
		throw new HttpError(400, 'bad_request', 'Attachment must be 2 MB or smaller.');
	}
	if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
		throw new HttpError(400, 'bad_request', 'Attachments must be JPEG, PNG, GIF, or WebP images.');
	}

	// [SECURITY FIX 3] Stream upload with strict byte counter to prevent memory exhaustion
	if (typeof file.stream === 'function') {
		const reader = file.stream().getReader();
		const chunks: Uint8Array[] = [];
		let totalBytes = 0;
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				totalBytes += value.byteLength;
				if (totalBytes > MAX_ATTACHMENT_BYTES) {
					await reader.cancel();
					throw new HttpError(400, 'bad_request', 'Attachment must be 2 MB or smaller.');
				}
				chunks.push(value);
			}
		} catch (err) {
			if (err instanceof HttpError) throw err;
			throw new HttpError(400, 'bad_request', 'Failed to read upload stream.');
		}
		const bytes = Buffer.concat(chunks);
		assertPermittedAttachment(file.type, bytes.byteLength, bytes);
		return bytes;
	}

	const bytes = Buffer.from(await file.arrayBuffer());
	assertPermittedAttachment(file.type, bytes.byteLength, bytes);
	return bytes;
}

export function writeStoredFile(uploadsDir: string, storedName: string, bytes: Buffer): void {
	ensureUploadsDir(uploadsDir);
	const filePath = join(uploadsDir, storedName);
	writeFileSync(filePath, bytes, { mode: SECURE_FILE_MODE });
	try {
		chmodSync(filePath, SECURE_FILE_MODE);
	} catch {
		// Ignore on unsupported platforms
	}
}

export function getStoredFilePath(uploadsDir: string, storedName: string): { fullPath: string; size: number } {
	if (storedName.includes('/') || storedName.includes('\\') || storedName.includes('..')) {
		throw new HttpError(404, 'not_found', 'Attachment file was not found.');
	}
	const root = resolve(uploadsDir);
	const full = resolve(join(uploadsDir, storedName));
	if (full !== root && !full.startsWith(root + sep)) {
		throw new HttpError(404, 'not_found', 'Attachment file was not found.');
	}
	if (!existsSync(full)) {
		throw new HttpError(404, 'not_found', 'Attachment file was not found.');
	}
	const stat = statSync(full);
	return { fullPath: full, size: stat.size };
}

// [SECURITY FIX 2 - VUR5] Stream file chunks to client instead of buffering full file into memory
export function streamStoredFile(uploadsDir: string, storedName: string): { stream: ReadableStream; size: number } {
	const { fullPath, size } = getStoredFilePath(uploadsDir, storedName);
	const nodeStream = createReadStream(fullPath);
	const stream = Readable.toWeb(nodeStream) as ReadableStream;
	return { stream, size };
}

export function readStoredFile(uploadsDir: string, storedName: string): Buffer {
	const { fullPath } = getStoredFilePath(uploadsDir, storedName);
	return readFileSync(fullPath);
}

export function listStoredNames(uploadsDir: string): string[] {
	if (!existsSync(uploadsDir)) return [];
	return readdirSync(uploadsDir).filter((name) => name !== '.gitkeep');
}

// [SECURITY FIX 5] Startup reconciliation to remove orphaned upload files not present in DB
export function reconcileOrphanedFiles(db: import('better-sqlite3').Database, uploadsDir: string): void {
	if (!existsSync(uploadsDir)) return;
	const rows = db.prepare('SELECT stored_filename FROM attachments').all() as { stored_filename: string }[];
	const validFiles = new Set(rows.map((r) => r.stored_filename));
	const diskFiles = listStoredNames(uploadsDir);
	for (const file of diskFiles) {
		if (!validFiles.has(file)) {
			try {
				rmSync(join(uploadsDir, file), { force: true });
			} catch {
				// ignore cleanup errors
			}
		}
	}
}
