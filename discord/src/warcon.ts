import type { Config } from './config';
import type { Snapshot } from './core';

export class WarconError extends Error {
	constructor(public status: number) {
		super(`WARCON request failed (${status}).`);
	}
}
export interface Entry {
	steamId: string;
	reason: string;
	expired: boolean;
	removedAt: string | null;
}
export interface Group {
	id: string;
	name: string;
	on: boolean;
	everyServer: boolean;
	servers: { id: string }[];
}
export interface Career {
	rank: { server: number | null; org: number | null; floorMinutes: number };
	kills: number;
	deaths: number;
	minutes: number;
	matches: number;
	wins: number;
	headshots: number;
	killStreak: number;
}
export class Warcon {
	constructor(
		private cfg: Config,
		private fetchFn: typeof fetch = fetch
	) {}
	async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
		const res = await this.fetchFn(this.cfg.warconUrl + path, {
			method,
			headers: {
				Authorization: `Bearer ${this.cfg.apiKey}`,
				...(body ? { 'Content-Type': 'application/json' } : {})
			},
			body: body ? JSON.stringify(body) : undefined,
			redirect: 'error',
			signal: AbortSignal.timeout(15_000)
		});
		if (!res.ok) throw new WarconError(res.status);
		return (await res.json()) as T;
	}
	get groupPath() {
		return `/api/orgs/${encodeURIComponent(this.cfg.orgId)}/slot-groups/${encodeURIComponent(this.cfg.groupId)}`;
	}
	async snapshot(): Promise<Snapshot | null> {
		const body = await this.request<{ live: Snapshot | null }>(
			`/api/servers/${encodeURIComponent(this.cfg.serverId)}/summary`
		);
		return body.live;
	}
	async career(steamId: string): Promise<Career> {
		return (
			await this.request<{ career: Career }>(
				`/api/servers/${encodeURIComponent(this.cfg.serverId)}/players/${steamId}/career?scope=server`
			)
		).career;
	}
	async validateGroup() {
		const body = await this.request<{ groups: Group[] }>(
			`/api/orgs/${encodeURIComponent(this.cfg.orgId)}/slot-groups`
		);
		const group = body.groups.find((g) => g.id === this.cfg.groupId);
		if (
			!group ||
			!group.on ||
			group.everyServer ||
			group.servers.length !== 1 ||
			group.servers[0].id !== this.cfg.serverId
		)
			throw new Error('Reserved-slot group must be switched on and target The Colosseum only.');
	}
	async entries(): Promise<Entry[]> {
		return (await this.request<{ entries: Entry[] }>(this.groupPath + '/entries')).entries;
	}
	async add(steamId: string, reason: string) {
		await this.request(this.groupPath + '/entries', 'POST', { steamId, reason });
	}
	async remove(steamId: string) {
		await this.request(this.groupPath + '/entries/' + steamId, 'DELETE');
	}
}
