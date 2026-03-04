import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const handle: Handle = async ({ event, resolve }) => {
	const auth = event.request.headers.get('authorization');

	if (auth?.startsWith('Basic ')) {
		const decoded = atob(auth.slice(6));
		const colon = decoded.indexOf(':');
		if (colon !== -1) {
			const user = decoded.slice(0, colon);
			const password = decoded.slice(colon + 1);
			if (user === env.LOGIN_USER && password === env.LOGIN_PASSWORD) {
				return resolve(event);
			}
		}
	}

	return new Response('Unauthorized', {
		status: 401,
		headers: { 'WWW-Authenticate': 'Basic realm="D-Mon Hockey"' }
	});
};
