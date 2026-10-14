import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

export interface Link {
	discordId: string;
	steamId: string;
}
export interface Pending {
	token: string;
	discordId: string;
	steamId: string | null;
	browserHash: string | null;
	expiresAt: number;
	verifying: number;
}
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export class Store {
	private db: Database;
	constructor(path: string) {
		if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path, { create: true });
		this.db.exec(`PRAGMA journal_mode=WAL;
		CREATE TABLE IF NOT EXISTS links (discordId TEXT PRIMARY KEY, steamId TEXT UNIQUE NOT NULL);
		CREATE TABLE IF NOT EXISTS pending (token TEXT PRIMARY KEY, discordId TEXT UNIQUE NOT NULL,
		steamId TEXT, browserHash TEXT, expiresAt INTEGER NOT NULL, verifying INTEGER NOT NULL DEFAULT 0);
		CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
	}
	allLinks(): Link[] {
		return this.db.query('SELECT * FROM links').all() as Link[];
	}
	link(discordId: string): Link | null {
		return this.db.query('SELECT * FROM links WHERE discordId=?').get(discordId) as Link | null;
	}
	unlink(discordId: string) {
		this.db.transaction(() => {
			this.db.query('DELETE FROM links WHERE discordId=?').run(discordId);
			this.db.query('DELETE FROM pending WHERE discordId=?').run(discordId);
		})();
	}
	begin(discordId: string, now = Date.now()): string {
		const token = randomBytes(32).toString('base64url');
		this.db.transaction(() => {
			this.db.query('DELETE FROM pending WHERE expiresAt<? OR discordId=?').run(now, discordId);
			this.db
				.query('INSERT INTO pending(token,discordId,expiresAt) VALUES (?,?,?)')
				.run(token, discordId, now + 10 * 60_000);
		})();
		return token;
	}
	pending(token: string, now = Date.now()): Pending | null {
		return this.db
			.query('SELECT * FROM pending WHERE token=? AND expiresAt>?')
			.get(token, now) as Pending | null;
	}
	pendingFor(discordId: string, now = Date.now()): Pending | null {
		return this.db
			.query('SELECT * FROM pending WHERE discordId=? AND expiresAt>?')
			.get(discordId, now) as Pending | null;
	}
	bind(token: string, browserHash: string, now = Date.now()): boolean {
		return !!this.db
			.query(
				'UPDATE pending SET browserHash=? WHERE token=? AND expiresAt>? AND browserHash IS NULL'
			)
			.run(browserHash, token, now).changes;
	}
	claim(token: string, browserHash: string, now = Date.now()): Pending | null {
		return this.db.transaction(() => {
			const p = this.pending(token, now);
			if (!p || p.browserHash !== browserHash || p.steamId || p.verifying) return null;
			this.db.query('UPDATE pending SET verifying=1 WHERE token=?').run(token);
			return p;
		})();
	}
	verified(token: string, steamId: string) {
		this.db
			.query('UPDATE pending SET steamId=?, verifying=0 WHERE token=? AND verifying=1')
			.run(steamId, token);
	}
	cancel(token: string) {
		this.db.query('DELETE FROM pending WHERE token=?').run(token);
	}
	confirm(token: string, discordId: string, now = Date.now()): Link {
		return this.db.transaction(() => {
			const p = this.pending(token, now);
			if (!p || p.discordId !== discordId || !p.steamId)
				throw new Error('Link expired or unverified. Use /link again.');
			const other = this.db.query('SELECT discordId FROM links WHERE steamId=?').get(p.steamId) as {
				discordId: string;
			} | null;
			if (other && other.discordId !== discordId)
				throw new Error('This Steam account is already linked to another Discord member.');
			this.db
				.query(
					'INSERT INTO links VALUES (?,?) ON CONFLICT(discordId) DO UPDATE SET steamId=excluded.steamId'
				)
				.run(discordId, p.steamId);
			this.cancel(token);
			return { discordId, steamId: p.steamId };
		})();
	}
	get<T>(key: string, fallback: T): T {
		const row = this.db.query('SELECT value FROM metadata WHERE key=?').get(key) as {
			value: string;
		} | null;
		return row ? (JSON.parse(row.value) as T) : fallback;
	}
	set(key: string, value: unknown) {
		this.db
			.query(
				'INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
			)
			.run(key, JSON.stringify(value));
	}
	close() {
		this.db.close();
	}
}
