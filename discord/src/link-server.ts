import { randomBytes } from 'node:crypto';
import type { Config } from './config';
import { Store, hash } from './store';
import { loginUrl, verifySteam } from './steam';

const headers = {
	'Content-Type': 'text/html; charset=utf-8',
	'Cache-Control': 'no-store',
	'Referrer-Policy': 'no-referrer',
	'Content-Security-Policy':
		"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
	'X-Content-Type-Options': 'nosniff'
};
const html = (body: string) =>
	`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>The Colosseum · Steam linking</title><style>body{background:#080c09;color:white;font:18px system-ui;max-width:640px;margin:10vh auto;padding:24px}h1{color:#f4d447}a,button{background:#3d9c45;color:white;padding:14px;border:0;border-radius:4px;font:inherit}p{line-height:1.6}</style><h1>THE COLOSSEUM</h1><p>Clan Magnus Legio · Steam account linking</p>${body}</html>`;
export function linkServer(
	cfg: Config,
	store: Store,
	onVerified: (discordId: string, token: string, steamId: string) => Promise<void>,
	verify = verifySteam
) {
	return Bun.serve({
		hostname: cfg.linkHost,
		port: cfg.linkPort,
		async fetch(req) {
			const u = new URL(req.url);
			if (u.pathname === '/health') return Response.json({ ok: true });
			if (!['/link', '/steam/start', '/steam/callback'].includes(u.pathname))
				return new Response('Not found', { status: 404 });
			const response = (body: string, status = 200, extra: Record<string, string> = {}) =>
				new Response(html(body), { status, headers: { ...headers, ...extra } });
			// Unique request fields, including the one-time link token.
			const keys = [...u.searchParams.keys()];
			if (new Set(keys).size !== keys.length || u.search.length > 8192)
				return response('<p>Invalid request.</p>', 400);
			const token = u.searchParams.get('token') || '';
			if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !store.pending(token))
				return response('<p>This link expired. Return to Discord and use /link again.</p>', 403);
			if (req.method === 'GET' && u.pathname === '/link') {
				// A POST prevents a Discord link preview from consuming the browser binding.
				return response(
					`<p>Sign into Steam to prove account ownership. Then confirm the link from your own Discord account using /link-confirm. This page does not grant a reserved slot by itself.</p><form method="post" action="/steam/start?token=${token}"><button>Continue to Steam</button></form>`
				);
			}
			if (req.method === 'POST' && u.pathname === '/steam/start') {
				if (req.headers.get('origin') !== cfg.linkOrigin)
					return response('<p>Open the link from Discord again.</p>', 403);
				const browser = randomBytes(32).toString('base64url');
				if (!store.bind(token, hash(browser)))
					return response('<p>This link is already in use. Run /link again.</p>', 409);
				return new Response(null, {
					status: 303,
					headers: {
						...headers,
						Location: loginUrl(cfg.linkOrigin, `${cfg.linkOrigin}/steam/callback?token=${token}`),
						'Set-Cookie': `cml_link=${browser}; Path=/steam; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
					}
				});
			}
			if (req.method !== 'GET' || u.pathname !== '/steam/callback')
				return response('<p>Method not allowed.</p>', 405);
			const browser = /(?:^|;\s*)cml_link=([A-Za-z0-9_-]{43})(?:;|$)/.exec(
				req.headers.get('cookie') || ''
			)?.[1];
			if (!browser || !store.claim(token, hash(browser)))
				return response('<p>Browser verification failed. Use /link again.</p>', 403);
			try {
				const steamId = await verify(
					u.searchParams,
					`${cfg.linkOrigin}/steam/callback?token=${token}`
				);
				store.verified(token, steamId);
				// A failed DM does not discard the proof: /link-confirm can still finish it.
				try {
					await onVerified(store.pending(token)!.discordId, token, steamId);
				} catch {
					console.warn('[colosseum] Link confirmation DM could not be delivered.');
				}
				return response(
					`<p>Steam account <strong>${steamId}</strong> verified.</p><p>Return to Discord and use <strong>/link-confirm</strong>, or press the confirmation button sent by the bot. Verify that the SteamID is yours before confirming.</p>`,
					200,
					{ 'Set-Cookie': 'cml_link=; Path=/steam; HttpOnly; Secure; SameSite=Lax; Max-Age=0' }
				);
			} catch {
				store.cancel(token);
				return response(
					'<p>Steam verification failed. Return to Discord and use /link again.</p>',
					403
				);
			}
		}
	});
}
