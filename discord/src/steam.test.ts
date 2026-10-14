import { expect, test } from 'bun:test';
import { loginUrl, STEAM_URL, verifySteam } from './steam';

const now = Date.parse('2026-10-14T12:00:00Z');
const callback = 'https://link.example.com/steam/callback?token=test';
const params = () =>
	new URLSearchParams({
		'openid.ns': 'http://specs.openid.net/auth/2.0',
		'openid.mode': 'id_res',
		'openid.op_endpoint': STEAM_URL,
		'openid.return_to': callback,
		'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561198000000001',
		'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000001',
		'openid.response_nonce': '2026-10-14T12:00:00Znonce',
		'openid.assoc_handle': 'handle',
		'openid.signed': 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle'
	});
test('Steam assertion must be signed by Steam for this exact callback', async () => {
	const fake = (async (url: string, init: RequestInit) => {
		expect(url).toBe(STEAM_URL);
		expect(new URLSearchParams(String(init.body)).get('openid.mode')).toBe('check_authentication');
		return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');
	}) as typeof fetch;
	expect(await verifySteam(params(), callback, now, fake)).toBe('76561198000000001');
	expect(
		new URL(loginUrl('https://link.example.com', callback)).searchParams.get('openid.return_to')
	).toBe(callback);
	await expect(verifySteam(params(), callback + 'wrong', now, fake)).rejects.toThrow();
	await expect(verifySteam(params(), callback, now + 301_000, fake)).rejects.toThrow();
	await expect(
		verifySteam(
			params(),
			callback,
			now,
			(async () => new Response('is_valid:false')) as unknown as typeof fetch
		)
	).rejects.toThrow();
});
test('rejects duplicated identity fields, spoofed Steam hosts and unsigned identities before network access', async () => {
	const fake = (async () => {
		throw new Error('Network must not be reached');
	}) as unknown as typeof fetch;
	for (const mutation of [
		(p: URLSearchParams) =>
			p.append('openid.claimed_id', 'https://steamcommunity.com/openid/id/76561198000000002'),
		(p: URLSearchParams) => p.set('openid.op_endpoint', 'https://evil.example.com'),
		(p: URLSearchParams) => p.set('openid.signed', 'return_to,response_nonce,assoc_handle'),
		(p: URLSearchParams) =>
			p.set('openid.identity', 'https://steamcommunity.com/openid/id/76561198000000002')
	]) {
		const p = params();
		mutation(p);
		await expect(verifySteam(p, callback, now, fake)).rejects.toThrow(/Invalid|Repeated/);
	}
});
