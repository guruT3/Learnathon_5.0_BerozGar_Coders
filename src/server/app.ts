import { Hono } from 'hono';
import type { Database } from 'better-sqlite3';
import type { AppEnv } from './env.ts';
import { handleError, HttpError } from './http/errors.ts';
import { authRoutes } from './routes/auth.ts';
import { grievanceRoutes } from './routes/grievances.ts';
import { attachmentRoutes } from './routes/attachments.ts';
import { cors } from 'hono/cors';
import { ALLOWED_HOSTS, ALLOWED_ORIGINS, HSTS_MAX_AGE_SECONDS, IS_PRODUCTION, REQUIRE_HTTPS } from './config.ts';

export type CreateAppOptions = {
	db: Database;
	uploadsDir: string;
};

// [SECURITY FIX 4 - HACKER MATRIX] Validate Host header to prevent Host Header Poisoning & Cache Poisoning
function isAllowedHost(host: string | undefined): boolean {
	if (!host) return true; // Default fallback handled gracefully
	const cleanHost = host.split(':')[0].toLowerCase();
	return ALLOWED_HOSTS.some((allowed) => {
		const cleanAllowed = allowed.split(':')[0].toLowerCase();
		return cleanHost === cleanAllowed || cleanHost.endsWith(`.${cleanAllowed}`);
	});
}

export function createApp(options: CreateAppOptions) {
	const app = new Hono<AppEnv>();

	// [SECURITY FIX 4 - HACKER MATRIX & FIX 1 - ADD'L] Host header validation & HTTPS redirection middleware
	app.use('*', async (c, next) => {
		const host = c.req.header('host');
		if (host && !isAllowedHost(host)) {
			throw new HttpError(400, 'bad_request', 'Invalid or untrusted Host header.');
		}

		const proto = c.req.header('x-forwarded-proto');
		if (REQUIRE_HTTPS && proto && proto !== 'https') {
			const safeHost = host && isAllowedHost(host) ? host : '127.0.0.1';
			const url = new URL(c.req.url, `https://${safeHost}`);
			return c.redirect(url.toString(), 301);
		}
		await next();
	});

	// [SECURITY FIX 4 & FIX 1 - ADD'L] Security headers, CSP & HSTS middleware
	app.use('*', async (c, next) => {
		c.set('db', options.db);
		c.set('uploadsDir', options.uploadsDir);
		await next();
		c.header('X-Content-Type-Options', 'nosniff');
		c.header('X-Frame-Options', 'DENY');
		c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
		c.header(
			'Content-Security-Policy',
			"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
		);
		c.header('Strict-Transport-Security', `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains; preload`);
		c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
		c.header('X-XSS-Protection', '0');
	});

	// [SECURITY FIX 10 - VUR5] Restrict CORS to explicitly configured trusted origins or same-origin
	app.use(
		'/api/*',
		cors({
			origin: (origin, c) => {
				if (!origin) return null;
				if (ALLOWED_ORIGINS.length > 0) {
					return ALLOWED_ORIGINS.includes(origin) ? origin : null;
				}
				const host = c.req.header('host');
				if (host) {
					try {
						const url = new URL(origin);
						if (url.host === host) return origin;
					} catch {
						return null;
					}
				}
				return null;
			},
			credentials: true
		})
	);

	// [SECURITY FIX 5 - HACKER MATRIX & FIX 24 - VUR5] Strict Anti-CSRF protection on state-changing requests
	app.use('/api/*', async (c, next) => {
		const method = c.req.method.toUpperCase();
		if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
			const origin = c.req.header('origin');
			const referer = c.req.header('referer');
			const host = c.req.header('host');
			const secFetchSite = c.req.header('sec-fetch-site');

			// Reject cross-site metadata headers automatically
			if (secFetchSite === 'cross-site') {
				throw new HttpError(403, 'unauthorized', 'Cross-site request forgery protection block.');
			}

			if (origin) {
				try {
					const originHost = new URL(origin).host;
					if (host && originHost !== host && ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
						throw new HttpError(403, 'unauthorized', 'Cross-site request forgery protection block.');
					}
				} catch (err) {
					if (err instanceof HttpError) throw err;
					throw new HttpError(403, 'unauthorized', 'Invalid request origin.');
				}
			} else if (referer) {
				try {
					const refererHost = new URL(referer).host;
					if (host && refererHost !== host && ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(`http://${refererHost}`) && !ALLOWED_ORIGINS.includes(`https://${refererHost}`)) {
						throw new HttpError(403, 'unauthorized', 'Cross-site request forgery protection block.');
					}
				} catch (err) {
					if (err instanceof HttpError) throw err;
					throw new HttpError(403, 'unauthorized', 'Invalid request referer.');
				}
			}
		}
		await next();
	});

	app.onError((err, c) => handleError(err, c));

	app.notFound((c) => c.json({ error: 'Not found.', code: 'not_found' }, 404));

	// [SECURITY FIX 36 - VUR5] Minimal health probe with restricted headers
	app.get('/api/health', (c) => {
		c.header('Cache-Control', 'no-store, no-cache, must-revalidate');
		return c.json({ status: 'pass' });
	});

	app.route('/api', authRoutes);
	app.route('/api/grievances', grievanceRoutes);
	app.route('/api/attachments', attachmentRoutes);

	app.all('/api/*', () => {
		throw new HttpError(404, 'not_found', 'Not found.');
	});

	return app;
}
