import { SlashCommandBuilder } from 'discord.js';

export const commands = [
	new SlashCommandBuilder()
		.setName('link')
		.setDescription('Verify your Steam account for stats and donor slots.'),
	new SlashCommandBuilder()
		.setName('link-confirm')
		.setDescription('Review and confirm your verified Steam account.'),
	new SlashCommandBuilder()
		.setName('unlink')
		.setDescription('Remove your Steam link and bot-managed donor slot.'),
	new SlashCommandBuilder()
		.setName('status')
		.setDescription('Show the live Colosseum server status.'),
	new SlashCommandBuilder()
		.setName('stats')
		.setDescription('Show leaderboard career stats for a linked member.')
		.addUserOption((o) => o.setName('member').setDescription('Defaults to you.')),
	new SlashCommandBuilder()
		.setName('leaderboard')
		.setDescription('Show The Colosseum’s top ten players by all-time kills.'),
	new SlashCommandBuilder()
		.setName('reserved')
		.setDescription('Check your donor role and Steam link eligibility.')
].map((c) => c.toJSON());
