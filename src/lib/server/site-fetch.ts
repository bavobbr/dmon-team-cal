import { getSiteCookie, clearCookieCache } from './auth';

export const SITE_BASE = 'https://app.twizzit.com';

// ─── URL-level response cache (10 min TTL) ────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1000;
const fetchCache = new Map<string, { body: string; expiresAt: number }>();

function makeCacheKey(method: string, url: string, options: RequestInit): string {
	const body = typeof options.body === 'string' ? options.body : '';
	return `${method}:${url}:${body}`;
}

// ─── Generic authenticated site fetch with cookie retry ───────────────────────

async function doSiteFetch(
	url: string,
	options: RequestInit,
	cookie: string,
	isRetry: boolean
): Promise<string> {
	const method = (options.method ?? 'GET').toUpperCase();
	const t0 = Date.now();
	const res = await fetch(url, {
		...options,
		headers: {
			...(options.headers as Record<string, string> | undefined),
			Cookie: cookie
		},
		redirect: 'manual'
	});
	console.log(`[twizzit] ${method} ${url} → ${res.status} (${Date.now() - t0}ms)${isRetry ? ' [retry]' : ''}`);

	if ((res.status === 302 || res.status === 403) && !isRetry) {
		clearCookieCache();
		const freshCookie = await getSiteCookie();
		return doSiteFetch(url, options, freshCookie, true);
	}

	if (res.status === 302 || res.status === 403) {
		throw new Error(`Fetch ${url} failed after cookie refresh: ${res.status}`);
	}

	if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
	return res.text();
}

export async function siteFetch(url: string, options: RequestInit = {}): Promise<string> {
	const method = (options.method ?? 'GET').toUpperCase();
	const key = makeCacheKey(method, url, options);
	const cached = fetchCache.get(key);
	if (cached && cached.expiresAt > Date.now()) {
		console.log(`[twizzit] ${method} ${url} → (cached)`);
		return cached.body;
	}

	const cookie = await getSiteCookie();
	const body = await doSiteFetch(url, options, cookie, false);
	fetchCache.set(key, { body, expiresAt: Date.now() + CACHE_TTL_MS });
	return body;
}

export function decodeHtml(str: string): string {
	return str
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>');
}
