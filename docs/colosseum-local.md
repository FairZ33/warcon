# The Colosseum on Windows

The development panel uses Bun and a portable PostgreSQL 18 database, bound to loopback only.
The optional TimescaleDB extension is not installed locally. The VPS Compose stack includes it.

In this workspace the runtimes are under `../.tools/` and the source is in `source/`.
The helper accepts `-BunPath` and `-PostgresBin` if your runtimes are elsewhere. Download
portable PostgreSQL from [EDB](https://www.enterprisedb.com/download-postgresql-binaries) and
Bun from its [official releases](https://github.com/oven-sh/bun/releases) on another computer.

From the source directory in PowerShell:

```powershell
./scripts/start-local.ps1
```

Open <http://127.0.0.1:3000> and create your owner account using the first-run form. Then rename
the Default organisation **Clan Magnus Legio**. Add a demo server named **The Colosseum**,
host `demo`, port `1`, password `demo` to explore the panel without touching the real server.
The demo resets its live state when the panel restarts; analytics/history remain in the database.

The script creates `.env` with random secrets once, keeps it on subsequent starts, and refuses
to replace an unrelated existing `.env`. Its database data, password and logs are in ignored
`.local-dev/`. Default database port: `54329`. Both the database and panel listen on `127.0.0.1`.
Keep the generated secrets and data together when backing up. Neither belongs in Git.

Ctrl+C in the panel terminal stops the panel. To stop the separate PostgreSQL process too:

```powershell
./scripts/stop-local-db.ps1
```

Run the bot from `discord/` using the [companion guide](../discord/README.md). Its HTTPS linking
origin must reach this PC through your chosen development tunnel or reverse proxy. Steam account
linking cannot use a plain-HTTP localhost callback; the panel itself can stay on localhost.
Discord credentials and the real server's RCON details are entered locally, not in this guide.

For the later VPS move, use `docker-compose.yml` plus `docker-compose.discord.yml`, HTTPS origins,
the bot's SQLite backup, a WARCON database dump, and the same encryption key. The local helper's
loopback addresses and paths are development settings, not VPS settings.
