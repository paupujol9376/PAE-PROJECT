<#
.SYNOPSIS
  Build data/base.pmtiles (inland water, rivers, places of Sri Lanka) with Planetiler.

.DESCRIPTION
  Run pipeline/build-roads.ps1 first: it downloads and checksums Planetiler, the pmtiles CLI
  and the Geofabrik extract. This script reuses them, runs pipeline/base.yml and verifies the
  archive. Logs to <DataDir>/build-base.log.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File pipeline/build-base.ps1
#>
param([string]$DataDir = "data", [string]$JavaHeap = "4g")

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not [System.IO.Path]::IsPathRooted($DataDir)) { $DataDir = Join-Path $RepoRoot $DataDir }
$DataDir = [System.IO.Path]::GetFullPath($DataDir)
$Jar     = Join-Path $PSScriptRoot "bin\planetiler.jar"
$Pmtiles = Join-Path $PSScriptRoot "bin\pmtiles.exe"
$Pbf     = Join-Path $DataDir "sri-lanka-latest.osm.pbf"
$Out     = Join-Path $DataDir "base.pmtiles"
$Log     = Join-Path $DataDir "build-base.log"

foreach ($p in @($Jar, $Pmtiles, $Pbf)) {
    if (-not (Test-Path $p)) { Write-Host "ERROR: $p missing. Run pipeline/build-roads.ps1 first."; exit 1 }
}

$ErrorActionPreference = "Continue"
& java "-Xmx$JavaHeap" -jar $Jar generate-custom "--schema=$(Join-Path $PSScriptRoot 'base.yml')" `
    "--osm_path=$Pbf" "--output=$Out" "--tmpdir=$(Join-Path $DataDir 'tmp')" --force 2>&1 |
    ForEach-Object { "$_" } | Set-Content -Path $Log -Encoding utf8
$code = $LASTEXITCODE
if ($code -ne 0 -or -not (Test-Path $Out)) { Write-Host "ERROR: planetiler failed ($code), see $Log"; exit 1 }
& $Pmtiles verify $Out 2>&1 | ForEach-Object { "$_" } | Add-Content -Path $Log -Encoding utf8
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: pmtiles verify failed"; exit 1 }
Write-Host ("base.pmtiles OK: {0:N0} bytes" -f (Get-Item $Out).Length)
