param(
    [ValidateRange(1024, 65535)][int]$Port = 3000,
    [ValidateRange(1024, 65535)][int]$DatabasePort = 54329,
    [string]$BunPath = '',
    [string]$PostgresBin = '',
    [switch]$DatabaseOnly
)

$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (!$BunPath) { $BunPath = Join-Path $sourceRoot '../.tools/bun-windows-x64/bun.exe' }
if (!$PostgresBin) { $PostgresBin = Join-Path $sourceRoot '../.tools/postgres18/pgsql/bin' }
if (!(Test-Path -LiteralPath $BunPath)) { throw 'Bun was not found. Set -BunPath to bun.exe.' }
if (!(Test-Path -LiteralPath (Join-Path $PostgresBin 'initdb.exe'))) {
    throw 'Portable PostgreSQL was not found. Set -PostgresBin to its bin directory.'
}
$localDir = Join-Path $sourceRoot '.local-dev'
$dataDir = Join-Path $localDir 'postgres-data'
$pwFile = Join-Path $localDir 'database-password'
$envFile = Join-Path $sourceRoot '.env'
New-Item -ItemType Directory -Force -Path $localDir | Out-Null
function New-Secret {
    $bytes = [byte[]]::new(32)
    $randomSource = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $randomSource.GetBytes($bytes) } finally { $randomSource.Dispose() }
    return [Convert]::ToBase64String($bytes)
}
if (!(Test-Path -LiteralPath $pwFile)) {
    [IO.File]::WriteAllText($pwFile, (New-Secret), [Text.UTF8Encoding]::new($false))
}
$databasePassword = [IO.File]::ReadAllText($pwFile).Trim()
if (!(Test-Path -LiteralPath $envFile)) {
    [IO.File]::WriteAllLines($envFile, @(
        '# The Colosseum local development — private; never commit this file'
        "BETTER_AUTH_SECRET=$(New-Secret)"
        "ENCRYPTION_KEY=$(New-Secret)"
        "RELAY_SECRET=$(New-Secret)"
        "PGHOST=127.0.0.1"
        "PGPORT=$DatabasePort"
        'PGUSER=warcon'
        "PGPASSWORD=$databasePassword"
        'PGDATABASE=warcon'
        "ORIGIN=http://127.0.0.1:$Port"
        "PORT=$Port"
        'HOST=127.0.0.1'
        'APP_NAME=The Colosseum'
        'WARCON_ROLE=all'
        'ALLOW_DEMO_SERVER=true'
        'ALLOW_ORG_SIGNUP=false'
    ), [Text.UTF8Encoding]::new($false))
} elseif (![IO.File]::ReadAllText($envFile).StartsWith('# The Colosseum local development')) {
    throw 'An existing .env is present. This helper preserves it; use the regular WARCON startup with that configuration.'
}
$settings = [IO.File]::ReadAllText($envFile)
if ($settings -notmatch "(?m)^PGPORT=$DatabasePort\r?$" -or $settings -notmatch "(?m)^ORIGIN=http://127\.0\.0\.1:$Port\r?$") {
    throw 'The existing .env uses different local ports. Match -Port and -DatabasePort to its ORIGIN and PGPORT, or edit .env yourself.'
}
if ((Test-Path -LiteralPath (Join-Path $dataDir 'PG_VERSION')) -and !(Test-Path -LiteralPath (Join-Path $dataDir 'global/pg_control'))) {
    throw 'An earlier database initialization was interrupted. Preserve its data directory under another name before initializing again.'
}
if (!(Test-Path -LiteralPath (Join-Path $dataDir 'PG_VERSION'))) {
    & (Join-Path $PostgresBin 'initdb.exe') -D $dataDir -U warcon --encoding=UTF8 --locale=C --auth=scram-sha-256 --pwfile=$pwFile
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initialization failed.' }
}
& (Join-Path $PostgresBin 'pg_ctl.exe') status -D $dataDir *> $null
if ($LASTEXITCODE -ne 0) {
    & (Join-Path $PostgresBin 'pg_ctl.exe') start -D $dataDir -l (Join-Path $localDir 'postgres.log') -o "-h 127.0.0.1 -p $DatabasePort" -w
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL did not start. Check .local-dev/postgres.log.' }
}
$previousPassword = $env:PGPASSWORD
try {
    $env:PGPASSWORD = $databasePassword
    $exists = & (Join-Path $PostgresBin 'psql.exe') -h 127.0.0.1 -p $DatabasePort -U warcon -d postgres -w -tAc "SELECT 1 FROM pg_database WHERE datname='warcon'"
    if ($LASTEXITCODE -ne 0) { throw 'Could not connect to the local database.' }
    if (($exists -join '').Trim() -ne '1') {
        & (Join-Path $PostgresBin 'createdb.exe') -h 127.0.0.1 -p $DatabasePort -U warcon -w warcon
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the development database.' }
    }
} finally { $env:PGPASSWORD = $previousPassword }
Write-Host "Local PostgreSQL ready on 127.0.0.1:$DatabasePort."
if ($DatabaseOnly) { return }
if (!(Test-Path -LiteralPath (Join-Path $sourceRoot 'build/index.js'))) {
    throw 'Run bun install and bun run build first. The local database is ready.'
}
Write-Host "Open http://127.0.0.1:$Port and complete the first-run owner setup. Ctrl+C stops the panel."
Push-Location $sourceRoot
try { & $BunPath './build/index.js' } finally { Pop-Location }
