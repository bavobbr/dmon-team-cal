import { readFileSync, writeFileSync } from 'fs';
import { env } from '$env/dynamic/private';
const { SITE_USER, SITE_PASSWORD } = env;

const SITE_BASE = 'https://app.twizzit.com';

const COOKIE_FILE = '/tmp/dmon-cookie-cache.json';

function readCache<T>(path: string): T | null {
	try { return JSON.parse(readFileSync(path, 'utf8')) as T; } catch { return null; }
}
function writeCache(path: string, data: unknown) {
	try { writeFileSync(path, JSON.stringify(data)); } catch { /* ignore */ }
}

// ─── Site session cookie cache ────────────────────────────────────────────────

interface CookieCache {
	cookieHeader: string;
	expiresAt: number;
}

let cookieCache: CookieCache | null = null;
let cookieInFlight: Promise<string> | null = null;

export async function getSiteCookie(): Promise<string> {
	const BUFFER_MS = 10 * 60 * 1000;
	if (!cookieCache) cookieCache = readCache<CookieCache>(COOKIE_FILE);
	if (cookieCache && Date.now() < cookieCache.expiresAt - BUFFER_MS) {
		return cookieCache.cookieHeader;
	}
	if (cookieInFlight) return cookieInFlight;

	cookieInFlight = (async () => {
		// Step 1: GET /login to extract CSRF token
		const loginPage = await fetch(`${SITE_BASE}/login`);
		const html = await loginPage.text();

		// Try both common CSRF field names
		const csrfMatch = html.match(/name="_?token"\s+value="([^"]+)"/) ??
			html.match(/value="([^"]+)"\s+name="_?token"/);
		if (!csrfMatch) throw new Error('Could not extract CSRF token from login page');
		const csrfToken = csrfMatch[1];

		// Capture any session cookie from the login page (some apps require it)
		const loginPageCookie = loginPage.headers.get('set-cookie') ?? '';

		// Step 2: POST /v2/login
		const loginRes = await fetch(`${SITE_BASE}/v2/login`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				...(loginPageCookie ? { Cookie: loginPageCookie } : {})
			},
			body: new URLSearchParams({
				username: SITE_USER,
				password: SITE_PASSWORD,
				token: csrfToken
			}).toString(),
			redirect: 'manual'
		});

		const rawCookie = loginRes.headers.get('set-cookie');
		if (!rawCookie) throw new Error('No cookie returned from site login');

		cookieCache = {
			cookieHeader: rawCookie,
			expiresAt: Date.now() + 2 * 60 * 60 * 1000
		};
		writeCache(COOKIE_FILE, cookieCache);
		return cookieCache.cookieHeader;
	})().finally(() => { cookieInFlight = null; });

	return cookieInFlight;
}

export function clearCookieCache() {
	cookieCache = null;
}
