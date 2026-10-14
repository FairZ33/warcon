import type { Config } from './config';

export interface Snapshot {
	ok: boolean;
	observedAt: string | null;
	statusAt?: string | null;
	gameServerId?: string;
	reservedSlots?: number | null;
	status: {
		playerCount: number;
		maxPlayers: number;
		map: string;
		experiences: string[];
		lighting: string;
		matchSeconds: number | null;
		scores: { name: string; score: number }[];
	} | null;
}

export interface SeedState {
	active: boolean;
	startedAt: number;
	lastCallAt: number;
	messageId: string;
	endReason?: 'complete' | 'pause';
}

export const emptySeed = (): SeedState => ({
	active: false,
	startedAt: 0,
	lastCallAt: 0,
	messageId: ''
});
export const escape = (s: string) => s.replace(/([\\`*_~|<>[\]])/g, '\\$1');
export const clip = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max - 1) + '…');
export const label = (s: string) =>
	clip(escape(s.replace(/^(Id\.)?(Map|Experience|Lighting)\./, '').replace(/_/g, ' ')), 150);
export const timestamp = (at: number) => `<t:${Math.floor(at / 1000)}:R>`;

export function fresh(live: Snapshot | null, now: number, staleMs: number): boolean {
	if (!live?.ok || !live.status || !live.observedAt) return false;
	const times = [live.observedAt, live.statusAt || live.observedAt].map(Date.parse);
	return (
		times.every((t) => Number.isFinite(t) && now - t <= staleMs && t <= now + 30_000) &&
		Number.isInteger(live.status.playerCount) &&
		live.status.playerCount >= 0
	);
}

export function seedTransition(
	state: SeedState,
	live: Snapshot | null,
	cfg: Config,
	now: number
): { state: SeedState; event: 'none' | 'start' | 'complete' | 'pause' } {
	const hour = Number(
		new Intl.DateTimeFormat('en-US', {
			timeZone: cfg.timezone,
			hour: '2-digit',
			hourCycle: 'h23'
		}).format(new Date(now))
	);
	// Unknown population cannot trigger a new call or declare a successful seed.
	if (!fresh(live, now, cfg.staleMs)) return { state, event: 'none' as const };
	const players = live!.status!.playerCount;
	if (state.active && players >= cfg.stopAt)
		return {
			state: { ...state, active: false, endReason: 'complete' as const },
			event: 'complete' as const
		};
	if (state.active && hour < cfg.startHour)
		return {
			state: { ...state, active: false, endReason: 'pause' as const },
			event: 'pause' as const
		};
	if (
		!state.active &&
		hour >= cfg.startHour &&
		players < cfg.startBelow &&
		(!state.lastCallAt || now - state.lastCallAt >= cfg.cooldownMs)
	)
		return {
			state: { active: true, startedAt: now, lastCallAt: now, messageId: '' },
			event: 'start' as const
		};
	return { state, event: 'none' as const };
}

export function progress(players: number, goal: number, length = 12): string {
	const filled = Math.max(0, Math.min(length, Math.round((players / Math.max(1, goal)) * length)));
	return '🟩'.repeat(filled) + '⬛'.repeat(length - filled);
}

export function statusEmbed(cfg: Config, live: Snapshot | null, now: number, seed?: SeedState) {
	const online = fresh(live, now, cfg.staleMs);
	const s = online ? live!.status! : null;
	const fields = s
		? [
				{
					name: 'PLAYERS ONLINE',
					value: `**${s.playerCount} / ${s.maxPlayers}**${live?.reservedSlots ? ` · ${live.reservedSlots} reserved` : ''}\n${progress(s.playerCount, s.maxPlayers)}`,
					inline: false
				},
				{ name: 'MAP', value: label(s.map) || 'Unknown', inline: true },
				{
					name: 'MODE / LIGHTING',
					value: clip(
						[...s.experiences.map(label), label(s.lighting)].filter(Boolean).join(' · ') ||
							'Unknown',
						1024
					),
					inline: true
				},
				{
					name: 'FACTION SCORES',
					value: clip(
						s.scores.map((f) => `**${escape(f.name)}** — ${f.score}`).join('\n') ||
							'Match starting',
						1024
					),
					inline: false
				}
			]
		: [
				{
					name: 'SERVER CONNECTION',
					value: 'Live population is unavailable. Waiting for a fresh observation.',
					inline: false
				}
			];
	if (live?.gameServerId && online)
		fields.push({
			name: 'JOIN THE COLOSSEUM',
			value: '```\n' + live.gameServerId.replace(/[^A-Za-z0-9-]/g, '').slice(0, 80) + '\n```',
			inline: false
		});
	if (seed) {
		fields.push({
			name: 'SEEDING PROGRESS',
			value: s
				? `**${s.playerCount} / ${cfg.stopAt} players** · ${Math.max(0, cfg.stopAt - s.playerCount)} more to reach the target\n${progress(s.playerCount, cfg.stopAt)}`
				: 'Population unavailable; the previous count is not treated as live.',
			inline: false
		});
	}
	fields.push({
		name: 'COMMUNITY',
		value:
			`[${escape(cfg.community)}](${cfg.communityUrl})` +
			(cfg.statusUrl ? ` · [Live status](${cfg.statusUrl})` : '') +
			(cfg.leaderboardUrl ? ` · [Leaderboard](${cfg.leaderboardUrl})` : ''),
		inline: false
	});
	const last = live?.observedAt ? Date.parse(live.observedAt) : NaN;
	fields.push({
		name: 'LAST OBSERVATION',
		value: Number.isFinite(last) ? timestamp(last) : 'Waiting for data',
		inline: false
	});
	return {
		author: { name: clip(cfg.community, 256), url: cfg.communityUrl },
		title: clip(
			seed
				? `${cfg.serverName} · ${seed.active ? 'Answer the call' : seed.endReason === 'pause' ? 'Seeding paused' : 'Seeding finished'}`
				: cfg.serverName,
			256
		),
		description: seed
			? seed.active
				? '**The arena needs you.** Join the server and help build the battle.'
				: seed.endReason === 'pause'
					? `The seeding call is paused until ${cfg.startHour}:00 (${cfg.timezone}).`
					: '**The call has ended.** Thanks to everyone who joined.'
			: online
				? '🟢 **LIVE** · Owned and operated by Clan Magnus Legio'
				: '⚪ **STATUS UNAVAILABLE**',
		color: !online ? 0x777777 : seed?.active ? 0xf4d447 : 0x3d9c45,
		fields,
		footer: { text: 'THE COLOSSEUM • MAGNUS LEGIO' },
		timestamp: new Date(now).toISOString()
	};
}
