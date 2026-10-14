# The Colosseum Discord companion

Clan Magnus Legio's companion to the WARCON fork at <https://github.com/FairZ33/warcon>.
It runs alongside the panel and uses its API; Discord never receives the RCON password.

## What is implemented

- **Enhanced status webhook:** one persistent green/yellow card with population and capacity,
  faction scores, map/mode, join code, community and optional public-page links. Edits every
  60 seconds by default. Stale or unreachable data displays unavailable, never zero players.
- **Steam linking:** `/link` sends a private, ten-minute link. Steam OpenID proves ownership;
  a browser cookie binds the response to that browser. `/link-confirm` (or a bot DM button)
  requires the same Discord user to confirm the verified SteamID before it is saved.
  One SteamID can belong to only one Discord member. `/unlink` removes the association.
- **Stats:** `/stats [member]` reads the linked account's WARCON career and Colosseum rank.
  `/leaderboard` shows the server's top ten all-time kills ranks. Responses are private.
  Career totals, rank and `/leaderboard` are specific to The Colosseum. The companion uses
  this fork's `?scope=server` career API option. Live, unfinished
  matches do not yet count in career totals. Ranking has WARCON's 60-minute playtime floor.
- **Donator slots:** Tier 1, Tier 2 and Tier 3 all qualify after Steam is linked. Events and a
  five-minute reconciliation add/remove the bot's grants in a dedicated reserved-slot group.
  Leaving the guild, losing the last qualifying role, unlinking or relinking removes the old
  grant. Manual entries and every other reserved list are preserved. A Discord API outage
  aborts the pass instead of interpreting failed member lookups as departures.
- **Seeding calls:** from 8 AM in `America/New_York`, a fresh count **below 20** starts a call.
  The same message updates through 20–35 players; **36 or more** completes it. It pauses
  overnight (midnight to 8 AM). A three-hour cooldown prevents repeated new calls if counts
  fluctuate. Optional seed-role mention occurs only on the initial post, never an edit or
  recovery of a deleted card. State/message IDs persist across restarts in SQLite.

Eastern time follows daylight saving (EDT in summer, EST in winter). For literal fixed EST,
set `SEED_TIMEZONE=Etc/GMT+5`. There is no additional afternoon cutoff configured.

## Set up WARCON

1. Start the panel using its [getting-started guide](../docs/getting-started.md). Copy the root
   `.env.example`, generate the required secrets, and keep `APP_NAME=The Colosseum`.
2. Rename your organisation **Clan Magnus Legio**, add **The Colosseum**, and test RCON reach.
3. Under the organisation's reserved-slot groups, create **Discord Donators**, select only
   The Colosseum, and switch the group on without an end date. Keep this group for the bot.
   Copy its ID, your organisation ID, and server ID into the companion configuration.
4. Mint an organisation API key with **View** (`server.view`) and **Org reserved slots**
   (`lists.reserve`). WARCON requires this key to cover **every server in the organisation**
   to access groups. Use a dedicated Colosseum organisation if you want strict single-server
   read access. The configured group is checked to target only The Colosseum before every sync.
5. In the built-in Discord webhook editor, the new **Colosseum** style gives a branded card
   with map art. You may use that instead of the companion's status card: leave
   `STATUS_WEBHOOK_URL` empty to avoid two status messages. The companion still handles
   seeding, linking and slots. Event-mirror webhooks can continue separately.

WARCON keeps the sync/audit history. Some game builds retain a removed reserved slot until
their next restart; the panel's group view shows **leaving** when this happens. A role removal
removes the group's grant, not grants the same player holds through another list.

## Set up Discord and the linking URL

1. Create an application/bot in the [Discord developer portal](https://discord.com/developers/applications).
   Enable **Server Members Intent**. Message Content Intent is not required.
2. Install it in the Clan Magnus Legio guild using scopes `bot` and `applications.commands`.
   Allow **View Channel**, **Send Messages**, **Embed Links**, and **Read Message History**
   in its seeding channel. If using `SEED_ROLE_ID`, make that role mentionable or explicitly
   grant the bot the needed mention permission in this channel.
3. Copy `discord/.env.example` to `discord/.env` and fill its blank token, IDs and API key.
   Use immutable donor role IDs when possible. Without IDs, startup resolves the three exact
   role names and refuses missing/duplicate names. This bot does not create or assign roles.
4. Create a channel webhook if using the companion's status card and set `STATUS_WEBHOOK_URL`.
   Create a seeding text channel and set `SEED_CHANNEL_ID`; `SEED_ROLE_ID` is optional.
5. Route a public HTTPS hostname to the linking service's port 3100. Set `LINK_ORIGIN` to
   the exact HTTPS origin. The example hostname is a placeholder; no DNS has been configured.
   For a reverse proxy on the Docker host, for example:

   ```caddyfile
   link.your-domain.example {
       reverse_proxy 127.0.0.1:3100
   }
   ```

   Add ordinary proxy rate limiting to the public linking endpoint. The bot accepts only
   one-time 256-bit tokens and never trusts the request's Host or forwarded headers for
   callback generation. No Steam API key or Discord OAuth client secret is needed for linking.

6. Register the commands explicitly (this replaces this application's guild commands, so use
   a dedicated bot application). The command never runs automatically at startup.

   ```sh
   cd discord
   bun install --frozen-lockfile
   bun run register
   ```

## Run it

From the repository root after WARCON is configured:

```sh
docker compose -f docker-compose.yml -f docker-compose.discord.yml up -d --build
# Register with the container environment instead of local Bun, if preferred:
docker compose -f docker-compose.yml -f docker-compose.discord.yml run --rm --no-deps discord bun src/register.ts
```

The companion's SQLite database uses `colosseum-discord-data`; back it up along with the WARCON
database. Run **one companion instance** for this guild/server/group. Its HTTP port is bound
only to localhost on the Docker host; put your HTTPS proxy in front of it. For local development,
run `bun run start` from `discord/` after configuring `.env` and your HTTPS tunnel/proxy.

No tokens, live server addresses, webhook destinations, donor role IDs or DNS changes are
included in this repository. Do not paste credentials into issues or commit `.env` files.

## Verification and failure behavior

```sh
cd discord
bun run check
bun test
```

Tests cover Steam assertion validation and duplicate-field attacks, one-time link ownership,
browser/callback binding, duplicate SteamIDs, durable relinks, donor role loss/departures,
preservation of manual slots, outage-safe reconciliation, and summer/winter schedule boundaries.
They use fake WARCON/Steam responses and a local HTTP server; no real Discord messages are sent.

If a call post times out ambiguously, the cooldown is saved first and the next attempt posts a
quiet card. This favors avoiding duplicate pings; exactly-once posting cannot be guaranteed
across a crash between Discord accepting a message and SQLite saving its ID. Deleted cards
are recreated without a role ping. Slot writes converge on periodic reconciliation, and
failed Discord lookups do not trigger slot removals. A pending Steam verification interrupted
by a restart can be restarted with `/link`. `/health` exposes only liveness.

Before using live donor grants, exercise `/link`, `/stats`, role addition/removal and `/unlink`
with a test account. Confirm the panel's audit trail and group state. Bot deployment and this
live acceptance check need your Discord application, configured WARCON instance and domain.

API references: [Discord gateway intents](https://docs.discord.com/developers/events/gateway#gateway-intents),
[Steam OpenID](https://steamcommunity.com/dev), [WARCON bot API](../README.md#bots-and-api-keys).
