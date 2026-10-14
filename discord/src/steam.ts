// Steam OpenID ownership proof. Never accept a user-entered SteamID as verified.
export const STEAM_URL = 'https://steamcommunity.com/openid/login';
const NS = 'http://specs.openid.net/auth/2.0';
export function loginUrl(origin: string, returnTo: string) {
	return (
		STEAM_URL +
		'?' +
		new URLSearchParams({
			'openid.ns': NS,
			'openid.mode': 'checkid_setup',
			'openid.realm': origin,
			'openid.return_to': returnTo,
			'openid.identity': NS + '/identifier_select',
			'openid.claimed_id': NS + '/identifier_select'
		})
	);
}
export async function verifySteam(
	params: URLSearchParams,
	expectedReturnTo: string,
	now = Date.now(),
	fetchFn: typeof fetch = fetch
) {
	const seen = new Set<string>();
	for (const [key] of params) {
		if (!key.startsWith('openid.')) continue;
		if (seen.has(key)) throw new Error('Repeated OpenID field.');
		seen.add(key);
	}
	const claimed = params.get('openid.claimed_id') || '';
	const match = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(claimed);
	const signed = (params.get('openid.signed') || '').split(',');
	const nonce = params.get('openid.response_nonce') || '';
	const at = Date.parse(nonce.slice(0, 20));
	if (
		params.get('openid.ns') !== NS ||
		params.get('openid.mode') !== 'id_res' ||
		params.get('openid.op_endpoint') !== STEAM_URL ||
		params.get('openid.return_to') !== expectedReturnTo ||
		!match ||
		params.get('openid.identity') !== claimed ||
		!['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle'].every(
			(k) => signed.includes(k)
		) ||
		!Number.isFinite(at) ||
		Math.abs(now - at) > 5 * 60_000
	)
		throw new Error('Invalid or expired Steam assertion.');
	const body = new URLSearchParams();
	for (const [key, value] of params) if (key.startsWith('openid.')) body.set(key, value);
	body.set('openid.mode', 'check_authentication');
	const res = await fetchFn(STEAM_URL, {
		method: 'POST',
		body,
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		redirect: 'error',
		signal: AbortSignal.timeout(10_000)
	});
	if (!res.ok || !/^is_valid:true\s*$/m.test(await res.text()))
		throw new Error('Steam rejected the assertion.');
	return match[1];
}
