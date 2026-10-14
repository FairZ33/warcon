import { expect, test } from 'bun:test';
import { Store } from './store';
import { config } from './fixtures.test-helper';
import { linkServer } from './link-server';

test('browser flow requires same-origin POST and cookie; only the Discord owner can finish the link', async () => {
	const cfg = { ...config(), linkPort: 0, linkHost: '127.0.0.1' };
	const store = new Store(':memory:');
	const verified: string[] = [];
	const server = linkServer(
		cfg,
		store,
		async (id) => {
			verified.push(id);
		},
		async () => '76561198000000001'
	);
	const token = store.begin('member1');
	const origin = server.url.origin;
	try {
		const landing = await fetch(origin + '/link?token=' + token);
		expect(landing.status).toBe(200);
		expect(landing.headers.get('referrer-policy')).toBe('same-origin');
		expect(landing.headers.get('content-security-policy')).toContain(
			"form-action 'self' https://steamcommunity.com;"
		);
		for (const headers of [new Headers({ Origin: 'null' }), new Headers()]) {
			expect(
				(await fetch(origin + '/steam/start?token=' + token, { method: 'POST', headers })).status
			).toBe(403);
		}
		expect(
			(
				await fetch(origin + '/steam/start?token=' + token, {
					method: 'POST',
					headers: { Origin: 'https://evil.example.com' }
				})
			).status
		).toBe(403);
		const start = await fetch(origin + '/steam/start?token=' + token, {
			method: 'POST',
			headers: { Origin: cfg.linkOrigin },
			redirect: 'manual'
		});
		expect(start.status).toBe(303);
		expect(start.headers.get('location')).toStartWith('https://steamcommunity.com/openid/login?');
		const cookie = start.headers.get('set-cookie')!.split(';')[0];
		expect((await fetch(origin + '/steam/callback?token=' + token)).status).toBe(403);
		expect(
			(await fetch(origin + '/steam/callback?token=' + token, { headers: { Cookie: cookie } }))
				.status
		).toBe(200);
		expect(verified).toEqual(['member1']);
		expect(store.allLinks()).toHaveLength(0);
		expect(() => store.confirm(token, 'attacker')).toThrow();
		store.confirm(token, 'member1');
		expect(
			(await fetch(origin + '/steam/callback?token=' + token, { headers: { Cookie: cookie } }))
				.status
		).toBe(403);
	} finally {
		server.stop(true);
		store.close();
	}
});
