import type { Config } from './config';
import { emptySeed, seedTransition, statusEmbed, type SeedState, type Snapshot } from './core';
import type { Store } from './store';

interface Payload {
	content?: string;
	embeds: ReturnType<typeof statusEmbed>[];
	allowedMentions: { parse: never[]; roles?: string[] };
}
export interface SeedChannel {
	send(payload: Payload): Promise<{ id: string }>;
	edit(id: string, payload: Payload): Promise<unknown>;
}

export async function publishSeed(
	cfg: Config,
	store: Store,
	channel: SeedChannel,
	live: Snapshot | null,
	now: number
) {
	const before = store.get<SeedState>('seed', emptySeed());
	const { state, event } = seedTransition(before, live, cfg, now);
	if (!state.messageId && event !== 'start' && !state.active) {
		store.set('seed', state);
		return;
	}
	// Completed calls are historical, not continually refreshed with later populations.
	if (!state.active && event === 'none') return;
	const embed = statusEmbed(cfg, live, now, state);
	if (state.messageId) {
		try {
			await channel.edit(state.messageId, {
				content: state.active
					? 'The Colosseum needs reinforcements.'
					: state.endReason === 'pause'
						? 'Seeding call paused.'
						: 'Seeding target reached. Thank you, Legion.',
				embeds: [embed],
				allowedMentions: { parse: [] }
			});
		} catch (error) {
			if (Number((error as { code?: number }).code) !== 10008) throw error;
			state.messageId = state.active
				? (await channel.send({ embeds: [embed], allowedMentions: { parse: [] } })).id
				: '';
		}
	} else {
		// Save cooldown before sending so ambiguous timeouts cannot repeatedly ping the role.
		store.set('seed', state);
		state.messageId = (
			await channel.send({
				content:
					event === 'start' && cfg.seedRoleId
						? `<@&${cfg.seedRoleId}> The Colosseum needs reinforcements.`
						: 'The Colosseum needs reinforcements.',
				embeds: [embed],
				allowedMentions: {
					parse: [],
					roles: event === 'start' && cfg.seedRoleId ? [cfg.seedRoleId] : []
				}
			})
		).id;
	}
	store.set('seed', state);
}
