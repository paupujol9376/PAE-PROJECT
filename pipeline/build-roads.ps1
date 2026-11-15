<#
.SYNOPSIS
  Build data/roads.pmtiles (all OSM highway=* lines of Sri Lanka) with Planetiler.

.DESCRIPTION
  Idempotent: tools and the Geofabrik extract are downloaded only when missing (or with -Refresh),
  checksums are verified, the output archive is rebuilt every run. Source files are never modified.
  Steps: 1) fetch pinned Planetiler jar + pmtiles CLI into pipeline/bin, 2) fetch the PBF into the
  data dir and check its MD5 against Geofabrik, 3) run Planetiler with pipeline/roads.yml,
  4) run `pmtiles show` and `pmtiles verify`. Everything is logged to <DataDir>/build-roads.log.

.PARAMETER DataDir
  Where the .osm.pbf and roads.pmtiles live. Relative paths are resolved against the repo root.
  Default: ./data

.PARAMETER Refresh
  Re-download the PBF even if it already exists (to pick up a newer Geofabrik extract).

.PARAMETER JavaHeap
  Max Java heap passed as -Xmx. Default 4g (Sri Lanka needs well under 1 GB).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File pipeline/build-roads.ps1
  powershell -ExecutionPolicy Bypass -File pipeline/build-roads.ps1 -DataDir D:\gis\pae-data
#>
param(
    [string]$DataDir = "data",
    [switch]$Refresh,
    [string]$JavaHeap = "4g"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ---- config (pinned versions) -------------------------------------------------------------
$PlanetilerVersion = "0.10.2"
$PlanetilerSha256  = "f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d"
$PmtilesVersion    = "1.31.2"
$PmtilesZipSha256  = "a658baa4d7e55020aef6ca17bd9ff9faa1582671266b36f58c52db0ac8e785a1"  # Windows_x86_64
$PbfUrl            = "https://download.geofabrik.de/asia/sri-lanka-latest.osm.pbf"
$PbfName           = "sri-lanka-latest.osm.pbf"
$OutName           = "roads.pmtiles"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BinDir   = Join-Path $PSScriptRoot "bin"
$Schema   = Join-Path $PSScriptRoot "roads.yml"
if (-not [System.IO.Path]::IsPathRooted($DataDir)) { $DataDir = Join-Path $RepoRoot $DataDir }
$DataDir  = [System.IO.Path]::GetFullPath($DataDir)
$Pbf      = Join-Path $DataDir $PbfName
$Out      = Join-Path $DataDir $OutName
$Log      = Join-Path $DataDir "build-roads.log"
$Jar      = Join-Path $BinDir "planetiler.jar"
$Pmtiles  = Join-Path $BinDir "pmtiles.exe"

New-Item -ItemType Directory -Force $BinDir, $DataDir | Out-Null

function Log([string]$msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Write-Host $line
    Add-Content -Path $Log -Value $line -Encoding utf8
}
function Fail([string]$msg) { Log "ERROR: $msg"; exit 1 }
function Sha256([string]$p) { (Get-FileHash $p -Algorithm SHA256).Hash.ToLower() }
function Download([string]$url, [string]$dest) {
    Log "download $url"
    & curl.exe -sSfL --retry 3 -o $dest $url
    if ($LASTEXITCODE -ne 0) { Fail "download failed: $url" }
}

Log "=== build-roads start (data dir: $DataDir) ==="

# ---- 0. prerequisites ---------------------------------------------------------------------
if (-not (Get-Command java -ErrorAction SilentlyContinue)) { Fail "java not found on PATH (Java 21+ required)" }
$javaVer = (& cmd /c "java -version 2>&1") | Select-Object -First 1
Log "java: $javaVer"
if ($javaVer -notmatch '"(\d+)') { Fail "cannot parse java version" }
if ([int]$Matches[1] -lt 21) { Fail "Java 21+ required, found $($Matches[1])" }

# ---- 1. tools -----------------------------------------------------------------------------
if (-not (Test-Path $Jar) -or (Sha256 $Jar) -ne $PlanetilerSha256) {
    Download "https://github.com/onthegomap/planetiler/releases/download/v$PlanetilerVersion/planetiler.jar" $Jar
}
if ((Sha256 $Jar) -ne $PlanetilerSha256) { Fail "planetiler.jar SHA-256 mismatch" }
Log "planetiler $PlanetilerVersion OK ($Jar)"

if (-not (Test-Path $Pmtiles)) {
    $zip = Join-Path $BinDir "pmtiles.zip"
    Download "https://github.com/protomaps/go-pmtiles/releases/download/v$PmtilesVersion/go-pmtiles_${PmtilesVersion}_Windows_x86_64.zip" $zip
    if ((Sha256 $zip) -ne $PmtilesZipSha256) { Fail "pmtiles zip SHA-256 mismatch" }
    Expand-Archive -Path $zip -DestinationPath $BinDir -Force
    Remove-Item $zip
}
Log ("pmtiles CLI OK: " + (& $Pmtiles version))

# ---- 2. source extract --------------------------------------------------------------------
$md5File = "$Pbf.md5"
if ($Refresh -or -not (Test-Path $Pbf) -or -not (Test-Path $md5File)) {
    # Fetch the checksum first, then the file, so both describe the same Geofabrik snapshot.
    Download "$PbfUrl.md5" $md5File
    $tmp = "$Pbf.part"
    Download $PbfUrl $tmp
    Move-Item -Force $tmp $Pbf
}
# Verify against the checksum stored at download time (Geofabrik republishes daily, so the
# remote .md5 may legitimately be newer than a previously downloaded extract).
$expected = ((Get-Content $md5File -Raw).Trim() -split '\s+')[0].ToLower()
$actual = (Get-FileHash $Pbf -Algorithm MD5).Hash.ToLower()
if ($expected -ne $actual) {
    Fail "PBF MD5 $actual does not match $md5File ($expected); delete the PBF or re-run with -Refresh"
}
Log ("PBF OK: {0} ({1:N0} bytes, md5 {2})" -f $Pbf, (Get-Item $Pbf).Length, $actual)

# ---- 3. planetiler ------------------------------------------------------------------------
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$ptArgs = @("-Xmx$JavaHeap", "-jar", $Jar, "generate-custom",
    "--schema=$Schema", "--osm_path=$Pbf", "--output=$Out",
    "--tmpdir=$(Join-Path $DataDir 'tmp')", "--force")
Log ("run: java " + ($ptArgs -join " "))
$ErrorActionPreference = "Continue"   # java logs to stderr; do not turn that into exceptions
& java @ptArgs 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $Log -Append | Select-String -Pattern "ERR|WAR|FINISHED|archive\t|Max tile|z5 " | ForEach-Object { Write-Host $_ }
$ptExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($ptExit -ne 0) { Fail "planetiler exited with $ptExit" }
$sw.Stop()
if (-not (Test-Path $Out)) { Fail "planetiler did not write $Out" }
Log ("planetiler done in {0:N1} s; {1} = {2:N0} bytes" -f $sw.Elapsed.TotalSeconds, $Out, (Get-Item $Out).Length)

# ---- 4. archive checks --------------------------------------------------------------------
$ErrorActionPreference = "Continue"
& $Pmtiles show $Out 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $Log -Append
& $Pmtiles verify $Out 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $Log -Append
$verifyExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($verifyExit -ne 0) { Fail "pmtiles verify failed" }
Log "=== build-roads OK. Next: python -I pipeline/validate.py --data-dir `"$DataDir`" ==="
