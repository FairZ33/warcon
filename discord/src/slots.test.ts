import { expect, test } from 'bun:test';
import { eligibleLinks, slotPlan, syncSlots, ownerPrefix } from './slots';
import { config } from './fixtures.test-helper';

test('every donor tier qualifies, role loss and authoritative departure remove eligibility', async () => {
	const links = ['one', 'two', 'three', 'lost', 'left'].map((id) => ({
		discordId: id,
		steamId: id
	}));
	const roles = new Map([
		['one', new Set(['t1'])],
		['two', new Set(['t2'])],
		['three', new Set(['t3'])],
		['lost', new Set<string>()]
	]);
	expect(
		(
			await eligibleLinks(links, new Set(['t1', 't2', 't3']), async (id) => roles.get(id) ?? null)
		).map((l) => l.discordId)
	).toEqual(['one', 'two', 'three']);
});

test('slot reconciliation preserves manually granted slots and removes only the bot’s own stale grants', () => {
	const prefix = ownerPrefix('guild1');
	const entries = [
		{ steamId: 'keep', reason: prefix + 'member1', expired: false, removedAt: null },
		{ steamId: 'remove', reason: prefix + 'member2', expired: false, removedAt: null },
		{ steamId: 'manual', reason: 'Clan staff', expired: false, removedAt: null },
		{
			steamId: 'other-guild',
			reason: ownerPrefix('guild2') + 'member3',
			expired: false,
			removedAt: null
		}
	];
	const desired = [
		{ discordId: 'member1', steamId: 'keep' },
		{ discordId: 'member4', steamId: 'new' },
		{ discordId: 'member5', steamId: 'manual' }
	];
	const plan = slotPlan(entries, desired, 'guild1');
	expect(plan.remove.map((e) => e.steamId)).toEqual(['remove']);
	expect(plan.add.map((e) => e.steamId)).toEqual(['new']);
	expect(plan.conflicts).toEqual(['manual']);
});

test('a Discord lookup failure cannot revoke slots; API writes are idempotent on a second pass', async () => {
	const cfg = config();
	let entries: { steamId: string; reason: string; expired: boolean; removedAt: null }[] = [];
	const calls: string[] = [];
	const api = {
		validateGroup: async () => {},
		entries: async () => entries,
		add: async (id: string, reason: string) => {
			calls.push('add');
			entries.push({ steamId: id, reason, expired: false, removedAt: null });
		},
		remove: async (id: string) => {
			calls.push('remove');
			entries = entries.filter((e) => e.steamId !== id);
		}
	};
	const links = [{ discordId: 'member1', steamId: 'steam1' }];
	await syncSlots(cfg, links, new Set(['tier1']), async () => new Set(['tier1']), api);
	await syncSlots(cfg, links, new Set(['tier1']), async () => new Set(['tier1']), api);
	expect(calls).toEqual(['add']);
	await expect(
		syncSlots(
			cfg,
			links,
			new Set(['tier1']),
			async () => {
				throw new Error('Discord offline');
			},
			api
		)
	).rejects.toThrow();
	expect(calls).toEqual(['add']);
	await syncSlots(cfg, links, new Set(['tier1']), async () => null, api);
	expect(calls).toEqual(['add', 'remove']);
});
