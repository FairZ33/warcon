import type { Config } from './config';
import type { Link } from './store';
import type { Entry } from './warcon';

export const ownerPrefix = (guildId: string) => `CML Discord:${guildId}:`;
export function slotPlan(entries: Entry[], desired: Link[], guildId: string) {
	const prefix = ownerPrefix(guildId);
	const wanted = new Map(desired.map((l) => [l.steamId, prefix + l.discordId]));
	const current = new Map(
		entries.filter((e) => !e.removedAt && !e.expired).map((e) => [e.steamId, e])
	);
	const remove = [...current.values()].filter(
		(e) => e.reason.startsWith(prefix) && wanted.get(e.steamId) !== e.reason
	);
	const add = [...wanted]
		.filter(([id]) => !current.has(id) || remove.some((e) => e.steamId === id))
		.map(([steamId, reason]) => ({ steamId, reason }));
	const conflicts = [...wanted.keys()].filter(
		(id) => current.has(id) && !current.get(id)!.reason.startsWith(prefix)
	);
	return { add, remove, conflicts };
}

export async function eligibleLinks(
	links: Link[],
	roleIds: Set<string>,
	fetchRoles: (discordId: string) => Promise<Set<string> | null>
): Promise<Link[]> {
	const desired: Link[] = [];
	for (const link of links) {
		// null is an authoritative departure; an error aborts reconciliation, preventing a
		// Discord outage from removing donor privileges.
		const roles = await fetchRoles(link.discordId);
		if (roles && [...roleIds].some((r) => roles.has(r))) desired.push(link);
	}
	return desired;
}

export async function syncSlots(
	cfg: Config,
	links: Link[],
	roleIds: Set<string>,
	fetchRoles: (id: string) => Promise<Set<string> | null>,
	api: {
		validateGroup(): Promise<void>;
		entries(): Promise<Entry[]>;
		add(id: string, reason: string): Promise<void>;
		remove(id: string): Promise<void>;
	}
) {
	await api.validateGroup();
	const desired = await eligibleLinks(links, roleIds, fetchRoles);
	const plan = slotPlan(await api.entries(), desired, cfg.guildId);
	for (const e of plan.remove) await api.remove(e.steamId);
	for (const e of plan.add) await api.add(e.steamId, e.reason);
	return plan;
}
