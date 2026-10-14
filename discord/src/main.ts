import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Client,
	Events,
	GatewayIntentBits,
	MessageFlags,
	WebhookClient,
	ChannelType,
	type ButtonInteraction,
	type Guild,
	type ChatInputCommandInteraction,
	type TextChannel
} from 'discord.js';
import { readConfig } from './config';
import { statusEmbed, escape, clip } from './core';
import { Store, hash } from './store';
import { Warcon } from './warcon';
import { syncSlots } from './slots';
import { linkServer } from './link-server';
import { publishSeed } from './seed-messages';

const cfg = readConfig();
const store = new Store(cfg.database);
// A database belongs to one guild/server/group deployment. Refuse accidental reuse elsewhere.
const identity = [cfg.guildId, cfg.orgId, cfg.serverId, cfg.groupId];
const prior = store.get<string[] | null>('identity', null);
if (prior && JSON.stringify(prior) !== JSON.stringify(identity))
	throw new Error('Bot database belongs to another guild/server/group. Use a separate database.');
store.set('identity', identity);
const api = new Warcon(cfg);
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const webhook = cfg.statusWebhookUrl ? new WebhookClient({ url: cfg.statusWebhookUrl }) : null;
let guild: Guild;
let seedChannel: TextChannel | null = null;
let donorRoles = new Set<string>();
let slotQueue: Promise<unknown> = Promise.resolve();
let stopping = false;
let ready = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastSync = 0;
let lastStatusKey = '';
let lastStatusAt = 0;

const button = (token: string) =>
	new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId('steam-confirm:' + token)
			.setLabel('Confirm my Steam account')
			.setStyle(ButtonStyle.Success)
	);
const unknownMember = (error: unknown) =>
	[10007, 10013].includes(Number((error as { code?: number })?.code));
async function fetchRoles(id: string) {
	try {
		return new Set((await guild.members.fetch({ user: id, force: true })).roles.cache.keys());
	} catch (error) {
		if (unknownMember(error)) return null;
		throw error;
	}
}
function reconcile() {
	// Every mutation and read is serialized so unlink/relink and role changes converge.
	const next = slotQueue
		.catch(() => {})
		.then(async () => {
			const plan = await syncSlots(cfg, store.allLinks(), donorRoles, fetchRoles, api);
			if (plan.conflicts.length)
				console.warn(
					`[colosseum] ${plan.conflicts.length} donor slots conflict with manual entries in the bot group; preserved.`
				);
		});
	slotQueue = next;
	return next;
}
const scheduleSync = () => {
	void reconcile().catch(() =>
		console.warn('[colosseum] Donor-slot sync failed; periodic reconciliation will retry.')
	);
};

// Confirmation works both in a DM and the original guild, but only for the token's owner.
async function confirm(interaction: ButtonInteraction, token: string) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	if (!(await fetchRoles(interaction.user.id)))
		throw new Error('Join the community Discord before linking Steam.');
	const linked = store.confirm(token, interaction.user.id);
	await interaction.editReply(
		`Steam account ${linked.steamId} linked. Your eligible Donator slot will sync shortly.`
	);
	scheduleSync();
}
client.on(Events.InteractionCreate, async (interaction) => {
	try {
		if (!ready) return;
		if (interaction.isButton() && interaction.customId.startsWith('steam-confirm:')) {
			if (interaction.guildId && interaction.guildId !== cfg.guildId) return;
			await confirm(interaction, interaction.customId.slice('steam-confirm:'.length));
			return;
		}
		if (!interaction.isChatInputCommand() || interaction.guildId !== cfg.guildId) return;
		await command(interaction);
	} catch (error) {
		console.warn('[colosseum] Discord command failed.');
		if (!interaction.isRepliable()) return;
		const msg =
			error instanceof Error &&
			/^(Link expired|This Steam account|Join the community)/.test(error.message)
				? error.message
				: 'The request could not be completed. Try again shortly or contact a community admin.';
		try {
			if (interaction.deferred || interaction.replied)
				await interaction.editReply({ content: msg, components: [], embeds: [] });
			else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
		} catch {
			/* Discord may have expired the interaction. */
		}
	}
});

async function command(i: ChatInputCommandInteraction) {
	if (i.commandName === 'link') {
		const token = store.begin(i.user.id);
		await i.reply({
			content: `Linking makes your leaderboard stats available through /stats and syncs donor slots from your roles.\n[Verify your Steam account](${cfg.linkOrigin}/link?token=${token})\nThis private link expires in 10 minutes. After Steam sign-in, use /link-confirm.`,
			flags: MessageFlags.Ephemeral,
			allowedMentions: { parse: [] }
		});
		return;
	}
	if (i.commandName === 'link-confirm') {
		const p = store.pendingFor(i.user.id);
		await i.reply(
			p?.steamId
				? {
						content: `Steam verified **${p.steamId}**. Confirm only if this is your Steam account.`,
						components: [button(p.token)],
						flags: MessageFlags.Ephemeral
					}
				: { content: 'Use /link and complete Steam sign-in first.', flags: MessageFlags.Ephemeral }
		);
		return;
	}
	if (i.commandName === 'unlink') {
		store.unlink(i.user.id);
		await i.reply({
			content:
				'Steam link removed. The bot will remove its donor-slot grant on the next sync; slots granted through other lists are preserved.',
			flags: MessageFlags.Ephemeral
		});
		scheduleSync();
		return;
	}
	await i.deferReply({ flags: MessageFlags.Ephemeral });
	if (i.commandName === 'status') {
		await i.editReply({
			embeds: [statusEmbed(cfg, await api.snapshot(), Date.now())],
			allowedMentions: { parse: [] }
		});
	} else if (i.commandName === 'reserved') {
		const link = store.link(i.user.id);
		const roles = await fetchRoles(i.user.id);
		const eligible = !!roles && [...donorRoles].some((r) => roles.has(r));
		await i.editReply(
			`Steam: ${link ? 'linked' : 'not linked — use /link'}.\nDonator role: ${eligible ? 'eligible' : 'no qualifying role'}.\n${link && eligible ? 'Your donor slot is eligible and periodically synchronized with WARCON.' : 'Link Steam and hold Donator Tier 1, 2 or 3 to qualify.'}`
		);
	} else if (i.commandName === 'stats') {
		const member = i.options.getUser('member') || i.user;
		const link = store.link(member.id);
		if (!link) {
			await i.editReply('This member has not linked Steam. Use /link to get started.');
			return;
		}
		const career = await api.career(link.steamId);
		await i.editReply({
			embeds: [
				{
					title: clip(`${member.username} · The Colosseum`, 256),
					color: 0x3d9c45,
					description:
						'All-time completed matches on The Colosseum. Rank is the server’s all-time kills leaderboard.',
					fields: [
						{
							name: 'Colosseum rank',
							value: career.rank.server
								? `#${career.rank.server}`
								: `Unranked (minimum ${career.rank.floorMinutes} minutes)`,
							inline: true
						},
						{ name: 'Kills / Deaths', value: `${career.kills} / ${career.deaths}`, inline: true },
						{
							name: 'K/D',
							value: career.deaths ? (career.kills / career.deaths).toFixed(2) : '—',
							inline: true
						},
						{ name: 'Matches / Wins', value: `${career.matches} / ${career.wins}`, inline: true },
						{
							name: 'Match playtime',
							value: `${(career.minutes / 60).toFixed(1)} hours`,
							inline: true
						},
						{ name: 'Best kill streak', value: String(career.killStreak), inline: true }
					],
					footer: { text: 'Clan Magnus Legio • Recorded by WARCON' }
				}
			],
			allowedMentions: { parse: [] }
		});
	} else if (i.commandName === 'leaderboard') {
		const board = await api.request<{
			rows: { rank: number; name: string; kills: number; deaths: number }[];
		}>(
			`/api/servers/${encodeURIComponent(cfg.serverId)}/leaderboard?scope=server&range=all&sort=kills&minMinutes=60`
		);
		await i.editReply({
			embeds: [
				{
					title: 'The Colosseum · All-time leaderboard',
					color: 0xf4d447,
					description:
						board.rows
							.slice(0, 10)
							.map(
								(p) => `**#${p.rank} ${clip(escape(p.name), 100)}** · ${p.kills} K / ${p.deaths} D`
							)
							.join('\n') || 'No ranked players yet.',
					footer: { text: 'Clan Magnus Legio • Minimum 60 minutes played' }
				}
			],
			allowedMentions: { parse: [] }
		});
	}
}

client.on(Events.GuildMemberUpdate, (_, member) => {
	if (member.guild.id === cfg.guildId && store.link(member.id)) scheduleSync();
});
client.on(Events.GuildMemberRemove, (member) => {
	if (member.guild.id === cfg.guildId && store.link(member.id)) scheduleSync();
});
client.on(Events.Error, () => console.warn('[colosseum] Discord connection error.'));

const server = linkServer(cfg, store, async (id, token, steamId) => {
	await (
		await client.users.fetch(id)
	).send({
		content: `Steam account **${steamId}** verified for The Colosseum. Confirm only if this is yours.`,
		components: [button(token)],
		allowedMentions: { parse: [] }
	});
});

async function updateStatus(live: Awaited<ReturnType<Warcon['snapshot']>>, now: number) {
	if (!webhook) return;
	const embed = statusEmbed(cfg, live, now);
	const key = JSON.stringify({ ...embed, timestamp: undefined });
	if (key === lastStatusKey && now - lastStatusAt < 300_000) return;
	const meta = 'status:' + hash(cfg.statusWebhookUrl);
	let messageId = store.get(meta, '');
	if (messageId) {
		try {
			await webhook.editMessage(messageId, {
				content: '',
				embeds: [embed],
				allowedMentions: { parse: [] }
			});
		} catch (error) {
			if (Number((error as { code?: number }).code) !== 10008) throw error;
			messageId = '';
		}
	}
	if (!messageId) {
		messageId = (
			await webhook.send({
				username: 'The Colosseum',
				embeds: [embed],
				allowedMentions: { parse: [] }
			})
		).id;
		store.set(meta, messageId);
	}
	lastStatusKey = key;
	lastStatusAt = now;
}

async function updateSeed(live: Awaited<ReturnType<Warcon['snapshot']>>, now: number) {
	if (!seedChannel) return;
	const channel = seedChannel;
	await publishSeed(
		cfg,
		store,
		{
			send: (payload) => channel.send(payload),
			edit: (id, payload) => channel.messages.edit(id, payload)
		},
		live,
		now
	);
}

async function tick() {
	if (stopping) return;
	const now = Date.now();
	let live = null;
	try {
		live = await api.snapshot();
	} catch {
		console.warn('[colosseum] Live observation unavailable.');
	}
	try {
		await updateStatus(live, now);
	} catch {
		console.warn('[colosseum] Status webhook update failed; will retry.');
	}
	try {
		await updateSeed(live, now);
	} catch {
		console.warn('[colosseum] Seeding message update failed; will retry.');
	}
	if (now - lastSync >= cfg.roleSyncMs) {
		lastSync = now;
		try {
			await reconcile();
		} catch {
			console.warn('[colosseum] Donor-slot sync failed; will retry.');
		}
	}
	if (!stopping) timer = setTimeout(tick, cfg.pollMs);
}

client.once(Events.ClientReady, async () => {
	try {
		guild = await client.guilds.fetch(cfg.guildId);
		const roles = await guild.roles.fetch();
		const ids = cfg.roleIds.length
			? cfg.roleIds
			: cfg.roleNames.map((name) => {
					const matches = roles.filter((r) => r.name === name);
					if (matches.size !== 1)
						throw new Error(
							`Donator role ${name} is missing or ambiguous. Configure DONATOR_ROLE_IDS.`
						);
					return matches.first()!.id;
				});
		if (!ids.length || ids.some((id) => !roles.has(id)))
			throw new Error('Configure valid donor roles in this guild.');
		donorRoles = new Set(ids);
		if (cfg.seedRoleId && !roles.has(cfg.seedRoleId))
			throw new Error('SEED_ROLE_ID is not in this guild.');
		if (cfg.seedChannelId) {
			const channel = await guild.channels.fetch(cfg.seedChannelId);
			if (!channel || channel.type !== ChannelType.GuildText)
				throw new Error('SEED_CHANNEL_ID must be a text channel in this guild.');
			seedChannel = channel;
		}
		await api.validateGroup();
		ready = true;
		console.log('[colosseum] Bot ready; Steam linking and background synchronization enabled.');
		void tick();
	} catch (error) {
		console.error(error instanceof Error ? error.message : 'Bot configuration failed.');
		await shutdown();
		process.exitCode = 1;
	}
});

async function shutdown() {
	stopping = true;
	if (timer) clearTimeout(timer);
	server.stop(true);
	client.destroy();
	webhook?.destroy();
	// SQLite commits each state change synchronously. Bun closes the connection on exit.
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
await client.login(cfg.token);
