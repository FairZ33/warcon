export interface Config {
	token: string;
	applicationId: string;
	guildId: string;
	seedChannelId: string;
	seedRoleId: string;
	statusWebhookUrl: string;
	warconUrl: string;
	apiKey: string;
	orgId: string;
	serverId: string;
	groupId: string;
	roleIds: string[];
	roleNames: string[];
	linkOrigin: string;
	linkPort: number;
	linkHost: string;
	database: string;
	community: string;
	communityUrl: string;
	serverName: string;
	statusUrl: string;
	leaderboardUrl: string;
	timezone: string;
	startHour: number;
	startBelow: number;
	stopAt: number;
	cooldownMs: number;
	pollMs: number;
	roleSyncMs: number;
	staleMs: number;
}

export function readConfig(env: Record<string, string | undefined> = process.env): Config {
	const required = (key: string) => {
		const value = env[key]?.trim();
		if (!value) throw new Error(`Set ${key} in the bot environment.`);
		return value;
	};
	const id = (key: string, optional = false) => {
		const value = optional ? env[key]?.trim() || '' : required(key);
		if (value && !/^\d{17,20}$/.test(value)) throw new Error(`${key} must be a Discord ID.`);
		return value;
	};
	const integer = (key: string, fallback: number, min: number, max: number) => {
		const value = Number(env[key] || fallback);
		if (!Number.isInteger(value) || value < min || value > max)
			throw new Error(`${key} must be between ${min} and ${max}.`);
		return value;
	};
	const url = (value: string, key: string, local = false) => {
		const u = new URL(value);
		if (u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== ''))
			throw new Error(`${key} must be an origin without credentials, path or query.`);
		if (u.protocol !== 'https:' && !(local && u.protocol === 'http:'))
			throw new Error(`${key} must use HTTPS.`);
		return u.origin;
	};
	const publicLink = (key: string) => {
		const value = env[key]?.trim() || '';
		if (!value) return '';
		const u = new URL(value);
		if (u.protocol !== 'https:' || u.username || u.password)
			throw new Error(`${key} must be an HTTPS URL without credentials.`);
		return u.href;
	};
	const split = (value: string) =>
		value
			.split(',')
			.map((v) => v.trim())
			.filter(Boolean);
	const roleIds = split(env.DONATOR_ROLE_IDS || '');
	if (roleIds.some((v) => !/^\d{17,20}$/.test(v)))
		throw new Error('DONATOR_ROLE_IDS must contain Discord IDs.');
	const webhook = env.STATUS_WEBHOOK_URL?.trim() || '';
	if (
		webhook &&
		!/^https:\/\/discord\.com\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9_-]{30,200}$/.test(webhook)
	)
		throw new Error('STATUS_WEBHOOK_URL must be a Discord webhook URL.');
	const timezone = env.SEED_TIMEZONE || 'America/New_York';
	new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
	const startBelow = integer('SEED_START_BELOW', 20, 1, 1000);
	const stopAt = integer('SEED_STOP_AT', 36, 2, 1000);
	if (stopAt <= startBelow) throw new Error('SEED_STOP_AT must exceed SEED_START_BELOW.');
	return {
		token: required('DISCORD_TOKEN'),
		applicationId: id('DISCORD_APPLICATION_ID'),
		guildId: id('DISCORD_GUILD_ID'),
		seedChannelId: id('SEED_CHANNEL_ID', true),
		seedRoleId: id('SEED_ROLE_ID', true),
		statusWebhookUrl: webhook,
		warconUrl: url(required('WARCON_URL'), 'WARCON_URL', true),
		apiKey: required('WARCON_API_KEY'),
		orgId: required('WARCON_ORG_ID'),
		serverId: required('WARCON_SERVER_ID'),
		groupId: required('WARCON_SLOT_GROUP_ID'),
		roleIds,
		roleNames: split(env.DONATOR_ROLE_NAMES || 'Donator Tier 1,Donator Tier 2,Donator Tier 3'),
		linkOrigin: url(required('LINK_ORIGIN'), 'LINK_ORIGIN'),
		linkPort: integer('LINK_PORT', 3100, 1, 65535),
		linkHost: env.LINK_HOST || '127.0.0.1',
		database: env.BOT_DATABASE || 'data/colosseum.sqlite',
		community: env.COMMUNITY_NAME || 'Clan Magnus Legio',
		communityUrl: url(env.COMMUNITY_URL || 'https://magnuslegio.com', 'COMMUNITY_URL'),
		serverName: env.SERVER_NAME || 'The Colosseum',
		statusUrl: publicLink('PUBLIC_STATUS_URL'),
		leaderboardUrl: publicLink('PUBLIC_LEADERBOARD_URL'),
		timezone,
		startHour: integer('SEED_START_HOUR', 8, 0, 23),
		startBelow,
		stopAt,
		cooldownMs: integer('SEED_COOLDOWN_MINUTES', 180, 1, 1440) * 60_000,
		pollMs: integer('POLL_SECONDS', 60, 30, 300) * 1000,
		roleSyncMs: integer('ROLE_SYNC_SECONDS', 300, 60, 3600) * 1000,
		staleMs: integer('STALE_SECONDS', 120, 30, 600) * 1000
	};
}
