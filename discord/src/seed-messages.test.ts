import { expect, test } from 'bun:test';
import { config, sample } from './fixtures.test-helper';
import { Store } from './store';
import { publishSeed, type SeedChannel } from './seed-messages';

test('one role ping, persistent message edits, completion at 36 and no updates or calls during cooldown', async () => {
	const cfg = { ...config(), seedRoleId: 'role1' };
	const store = new Store(':memory:');
	const sends: Parameters<SeedChannel['send']>[0][] = [];
	const edits: Parameters<SeedChannel['edit']>[] = [];
	const channel: SeedChannel = {
		send: async (p) => {
			sends.push(p);
			return { id: 'm1' };
		},
		edit: async (...args) => {
			edits.push(args);
		}
	};
	const now = Date.parse('2026-10-14T12:00:00Z');
	try {
		await publishSeed(cfg, store, channel, sample(8, now), now);
		await publishSeed(cfg, store, channel, sample(25, now + 60_000), now + 60_000);
		await publishSeed(cfg, store, channel, sample(36, now + 120_000), now + 120_000);
		await publishSeed(cfg, store, channel, sample(10, now + 180_000), now + 180_000);
		expect(sends).toHaveLength(1);
		expect(sends[0].allowedMentions.roles).toEqual(['role1']);
		expect(edits).toHaveLength(2);
		expect(edits.every(([id, p]) => id === 'm1' && !p.allowedMentions.roles?.length)).toBe(true);
		expect(edits[1][1].content).toContain('target reached');
		expect(
			edits[0][1].embeds[0].fields.find((f) => f.name === 'SEEDING PROGRESS')?.value
		).toContain('25 / 36');
	} finally {
		store.close();
	}
});

test('an ambiguous post failure or a deleted active card is retried without another role ping', async () => {
	const cfg = { ...config(), seedRoleId: 'role1' };
	const store = new Store(':memory:');
	const sends: Parameters<SeedChannel['send']>[0][] = [];
	const now = Date.parse('2026-10-14T12:00:00Z');
	const channel: SeedChannel = {
		send: async (p) => {
			sends.push(p);
			if (sends.length === 1) throw new Error('timeout');
			return { id: 'm' + sends.length };
		},
		edit: async () => {
			throw { code: 10008 };
		}
	};
	try {
		await expect(publishSeed(cfg, store, channel, sample(8, now), now)).rejects.toThrow('timeout');
		await publishSeed(cfg, store, channel, sample(8, now + 60_000), now + 60_000);
		await publishSeed(cfg, store, channel, sample(8, now + 120_000), now + 120_000);
		expect(sends).toHaveLength(3);
		expect(sends[0].allowedMentions.roles).toEqual(['role1']);
		expect(sends.slice(1).every((p) => !p.allowedMentions.roles?.length)).toBe(true);
	} finally {
		store.close();
	}
});
