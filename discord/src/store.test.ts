import { expect, test } from 'bun:test';
import { Store, hash } from './store';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('linking requires the correct browser, Steam proof, Discord owner and an unexpired one-time token', () => {
	const db = new Store(':memory:');
	try {
		const token = db.begin('discord1', 1000);
		expect(() => db.confirm(token, 'discord1', 2000)).toThrow('unverified');
		expect(db.bind(token, hash('browser1'), 2000)).toBe(true);
		expect(db.bind(token, hash('browser2'), 2000)).toBe(false);
		expect(db.claim(token, hash('browser2'), 2000)).toBeNull();
		expect(db.claim(token, hash('browser1'), 2000)).not.toBeNull();
		expect(db.claim(token, hash('browser1'), 2000)).toBeNull();
		db.verified(token, '76561198000000001');
		expect(() => db.confirm(token, 'discord2', 2000)).toThrow();
		expect(db.confirm(token, 'discord1', 2000).steamId).toBe('76561198000000001');
		expect(() => db.confirm(token, 'discord1', 2000)).toThrow();
		const expired = db.begin('discord2', 1000);
		expect(db.pending(expired, 601001)).toBeNull();
	} finally {
		db.close();
	}
});

test('a Steam account cannot be assigned to two Discord members; relinking and unlinking persist', () => {
	const dir = mkdtempSync(join(tmpdir(), 'colosseum-test-'));
	const path = join(dir, 'store.sqlite');
	let db = new Store(path);
	const link = (member: string, steam: string) => {
		const token = db.begin(member);
		db.bind(token, hash(member));
		db.claim(token, hash(member));
		db.verified(token, steam);
		return db.confirm(token, member);
	};
	try {
		link('discord1', '76561198000000001');
		expect(() => link('discord2', '76561198000000001')).toThrow('already linked');
		link('discord1', '76561198000000002');
		db.set('seed', { active: true, messageId: 'm1', lastCallAt: 1234 });
		db.close();
		db = new Store(path);
		expect(db.link('discord1')?.steamId).toBe('76561198000000002');
		expect(db.get<unknown>('seed', null)).toEqual({
			active: true,
			messageId: 'm1',
			lastCallAt: 1234
		});
		db.unlink('discord1');
		expect(db.allLinks()).toHaveLength(0);
		expect(db.pendingFor('discord1')).toBeNull();
	} finally {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	}
});
