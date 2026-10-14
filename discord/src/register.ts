import { REST, Routes } from 'discord.js';
import { commands } from './commands';

const token = process.env.DISCORD_TOKEN;
const app = process.env.DISCORD_APPLICATION_ID;
const guild = process.env.DISCORD_GUILD_ID;
if (!token || !app || !guild)
	throw new Error('Set DISCORD_TOKEN, DISCORD_APPLICATION_ID and DISCORD_GUILD_ID.');
// Explicit command: registration is never an automatic startup side effect.
await new REST({ version: '10' })
	.setToken(token)
	.put(Routes.applicationGuildCommands(app, guild), { body: commands });
console.log('Registered Colosseum commands in the configured guild.');
