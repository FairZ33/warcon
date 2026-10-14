param([string]$PostgresBin = '')
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (!$PostgresBin) { $PostgresBin = Join-Path $sourceRoot '../.tools/postgres18/pgsql/bin' }
$dataDir = Join-Path $sourceRoot '.local-dev/postgres-data'
if (!(Test-Path -LiteralPath (Join-Path $dataDir 'PG_VERSION'))) { throw 'No local development database was found.' }
& (Join-Path $PostgresBin 'pg_ctl.exe') stop -D $dataDir -m fast -w
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL stop failed; check its status before retrying.' }
