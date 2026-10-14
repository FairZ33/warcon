import { describe, expect, test } from 'bun:test';
import { emptySeed, fresh, seedTransition, statusEmbed, progress } from './core';
import { config, sample } from './fixtures.test-helper';

describe('seeding calls', () => {
	const cfg = config();
	const transition = (state: ReturnType<typeof emptySeed>, players: number, iso: string) => {
		const now = Date.parse(iso);
		return seedTransition(state, sample(players, now), cfg, now);
	};
	test('starts at 8 AM Eastern in both summer and winter, strictly below 20', () => {
		for (const [before, after] of [
			['2026-10-14T11:59:00Z', '2026-10-14T12:00:00Z'],
			['2026-12-14T12:59:00Z', '2026-12-14T13:00:00Z']
		]) {
			expect(transition(emptySeed(), 19, before).event).toBe('none');
			expect(transition(emptySeed(), 19, after).event).toBe('start');
			expect(transition(emptySeed(), 20, after).event).toBe('none');
		}
	});
	test('keeps the same session through 20–35 and completes at 36', () => {
		let state = transition(emptySeed(), 8, '2026-10-14T12:00:00Z').state;
		state.messageId = 'message1';
		for (const count of [20, 35, 19, 0]) {
			const step = transition(state, count, '2026-10-14T13:00:00Z');
			expect(step.event).toBe('none');
			expect(step.state.messageId).toBe('message1');
		}
		const done = transition(state, 36, '2026-10-14T13:00:00Z');
		expect(done.event).toBe('complete');
		expect(done.state.active).toBe(false);
		expect(done.state.messageId).toBe('message1');
	});
	test('cooldown prevents threshold flapping from pinging repeatedly', () => {
		const state = transition(emptySeed(), 8, '2026-10-14T12:00:00Z').state;
		const done = transition(state, 36, '2026-10-14T12:30:00Z').state;
		expect(transition(done, 10, '2026-10-14T13:00:00Z').event).toBe('none');
		expect(transition(done, 10, '2026-10-14T15:00:00Z').event).toBe('start');
	});
	test('pauses overnight and does not confuse offline or stale with an empty server', () => {
		const state = transition(emptySeed(), 8, '2026-10-14T12:00:00Z').state;
		expect(transition(state, 8, '2026-10-15T05:00:00Z').event).toBe('pause');
		const now = Date.parse('2026-10-14T12:00:00Z');
		expect(seedTransition(emptySeed(), null, cfg, now).event).toBe('none');
		expect(seedTransition(emptySeed(), sample(0, now - 121_000), cfg, now).event).toBe('none');
		expect(seedTransition(state, { ...sample(36, now), ok: false }, cfg, now).state.active).toBe(
			true
		);
		const oldStatus = { ...sample(0, now), statusAt: new Date(now - 121_000).toISOString() };
		expect(fresh(oldStatus, now, cfg.staleMs)).toBe(false);
	});
});

test('branded status and seed cards show accurate counts without exposing errors or SteamIDs', () => {
	const cfg = config();
	const now = Date.now();
	const live = sample(15, now);
	const card = statusEmbed(cfg, live, now, { ...emptySeed(), active: true });
	expect(card.fields.find((f) => f.name === 'SEEDING PROGRESS')?.value).toContain('15 / 36');
	expect(card.fields.find((f) => f.name === 'PLAYERS ONLINE')?.value).toContain('15 / 100');
	expect(card.author.name).toBe('Clan Magnus Legio');
	expect(
		statusEmbed(cfg, sample(15, now - 200_000), now).fields.some((f) => f.name === 'PLAYERS ONLINE')
	).toBe(false);
	expect(progress(300, 100)).toBe('🟩'.repeat(12));
});

test('configuration rejects unsafe callback URLs, invalid role IDs and inverted thresholds', () => {
	const env = {
		DISCORD_TOKEN: 'test',
		DISCORD_APPLICATION_ID: '111111111111111111',
		DISCORD_GUILD_ID: '222222222222222222',
		WARCON_URL: 'http://localhost:3000',
		WARCON_API_KEY: 'key',
		WARCON_ORG_ID: 'org',
		WARCON_SERVER_ID: 'server',
		WARCON_SLOT_GROUP_ID: 'group',
		LINK_ORIGIN: 'https://link.example.com'
	};
	const { readConfig } = require('./config');
	expect(() => readConfig({ ...env, LINK_ORIGIN: 'http://link.example.com' })).toThrow('HTTPS');
	expect(() => readConfig({ ...env, DONATOR_ROLE_IDS: 'role-name' })).toThrow('Discord IDs');
	expect(() => readConfig({ ...env, SEED_START_BELOW: '40', SEED_STOP_AT: '36' })).toThrow(
		'exceed'
	);
});
