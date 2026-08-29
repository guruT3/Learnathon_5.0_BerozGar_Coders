import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { API_PORT, DEFAULT_DB_PATH, DEFAULT_UPLOADS_DIR, IS_PRODUCTION, REQUIRE_HTTPS } from './config.ts';
import { openDatabase } from './db/connection.ts';
import { userCount } from './db/queries.ts';
import { seedDatabase } from './db/seed.ts';
import { ensureUploadsDir, reconcileOrphanedFiles } from './storage/attachments.ts';

const dbPath = DEFAULT_DB_PATH;
const uploadsDir = DEFAULT_UPLOADS_DIR;

ensureUploadsDir(uploadsDir);
const db = openDatabase(dbPath);
if (userCount(db) === 0) {
    seedDatabase(db, uploadsDir);
    console.log(`Seeded database at ${dbPath}`);
}

// [SECURITY FIX 5] Reconcile orphaned files on server startup
reconcileOrphanedFiles(db, uploadsDir);

const app = createApp({ db, uploadsDir });

// [SECURITY FIX 1 - ADD'L] Deployment TLS and security logging
if (IS_PRODUCTION && !REQUIRE_HTTPS) {
    console.warn('⚠️ [SECURITY WARNING]: Running in production mode with REQUIRE_HTTPS=false. Always terminate TLS/HTTPS at reverse proxy or load balancer.');
}

serve({ fetch: app.fetch, port: API_PORT }, (info) => {
    const protocol = REQUIRE_HTTPS ? 'https' : 'http';
    console.log(`HostelGrievance API listening on ${protocol}://127.0.0.1:${info.port} (TLS enforcement: ${REQUIRE_HTTPS ? 'ENABLED' : 'DISABLED'})`);
});
