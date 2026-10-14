import { expect, test } from 'bun:test';
import { Warcon, WarconError } from './warcon';
import { config } from './fixtures.test-helper';

test('bot calls the configured server API with bearer auth, no redirects and server-scoped stats', async () => {
	const cfg = config();
	const seen: string[] = [];
	const fake = (async (url: string, init: RequestInit) => {
		seen.push(url);
		expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-key');
		expect(init.redirect).toBe('error');
		return Response.json({ career: { kills: 5 } });
	}) as typeof fetch;
	const api = new Warcon(cfg, fake);
	expect((await api.career('76561198000000001')).kills).toBe(5);
	expect(seen).toEqual([
		'http://localhost:3000/api/servers/server1/players/76561198000000001/career?scope=server'
	]);
	const failed = new Warcon(
		cfg,
		(async () => new Response('private internal error', { status: 403 })) as unknown as typeof fetch
	);
	await expect(failed.snapshot()).rejects.toBeInstanceOf(WarconError);
});

test('donor group must be on and confined to the configured server', async () => {
	const cfg = config();
	for (const group of [
		{ id: 'group1', on: false, everyServer: false, servers: [{ id: 'server1' }] },
		{ id: 'group1', on: true, everyServer: true, servers: [{ id: 'server1' }] },
		{ id: 'group1', on: true, everyServer: false, servers: [{ id: 'wrong' }] }
	]) {
		const api = new Warcon(cfg, (async () =>
			Response.json({ groups: [group] })) as unknown as typeof fetch);
		await expect(api.validateGroup()).rejects.toThrow('only');
	}
	const api = new Warcon(cfg, (async () =>
		Response.json({
			groups: [{ id: 'group1', on: true, everyServer: false, servers: [{ id: 'server1' }] }]
		})) as unknown as typeof fetch);
	await api.validateGroup();
});
