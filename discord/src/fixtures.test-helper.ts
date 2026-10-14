import { readConfig } from './config';
import type { Snapshot } from './core';
export const config = () =>
	readConfig({
		DISCORD_TOKEN: 'test',
		DISCORD_APPLICATION_ID: '111111111111111111',
		DISCORD_GUILD_ID: '222222222222222222',
		WARCON_URL: 'http://localhost:3000',
		WARCON_API_KEY: 'test-key',
		WARCON_ORG_ID: 'org1',
		WARCON_SERVER_ID: 'server1',
		WARCON_SLOT_GROUP_ID: 'group1',
		LINK_ORIGIN: 'https://link.example.com'
	});
export const sample = (players: number, at: number): Snapshot => ({
	ok: true,
	observedAt: new Date(at).toISOString(),
	statusAt: new Date(at).toISOString(),
	gameServerId: 'CL-501228',
	reservedSlots: 5,
	status: {
		playerCount: players,
		maxPlayers: 100,
		map: 'Bakurani',
		experiences: ['KOTH'],
		lighting: 'DayClear',
		matchSeconds: 700,
		scores: [
			{ name: 'Valkyra', score: 24 },
			{ name: 'Lonestar', score: 31 }
		]
	}
});
