#!/usr/bin/env bash
# Build data/roads.pmtiles (all OSM highway=* lines of Sri Lanka) with Planetiler.
# POSIX twin of pipeline/build-roads.ps1 (Linux, macOS, Git Bash on Windows).
#
# Usage: pipeline/build-roads.sh [DATA_DIR] [--refresh]
#   DATA_DIR  default ./data (relative paths resolve against the repo root)
#   --refresh re-download the Geofabrik extract
#   JAVA_HEAP env var, default 4g
set -euo pipefail

PLANETILER_VERSION=0.10.2
PLANETILER_SHA256=f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d
PMTILES_VERSION=1.31.2
PBF_URL=https://download.geofabrik.de/asia/sri-lanka-latest.osm.pbf
PBF_NAME=sri-lanka-latest.osm.pbf
OUT_NAME=roads.pmtiles

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$SCRIPT_DIR/bin"
SCHEMA="$SCRIPT_DIR/roads.yml"

DATA_DIR=data
REFRESH=0
for a in "$@"; do
  case "$a" in
    --refresh) REFRESH=1 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) DATA_DIR="$a" ;;
  esac
done
case "$DATA_DIR" in /*|[A-Za-z]:*) ;; *) DATA_DIR="$REPO_ROOT/$DATA_DIR" ;; esac
mkdir -p "$BIN_DIR" "$DATA_DIR"
DATA_DIR="$(cd "$DATA_DIR" && pwd)"
PBF="$DATA_DIR/$PBF_NAME"
OUT="$DATA_DIR/$OUT_NAME"
LOG="$DATA_DIR/build-roads.log"
JAR="$BIN_DIR/planetiler.jar"

log()  { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG"; }
fail() { log "ERROR: $*"; exit 1; }
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
md5()    { if command -v md5sum >/dev/null; then md5sum "$1" | cut -d' ' -f1; else md5 -q "$1"; fi; }
download() { log "download $1"; curl -sSfL --retry 3 -o "$2" "$1" || fail "download failed: $1"; }

# Native-path helper: under MSYS/Cygwin, Java needs C:\... paths (Planetiler reads "C:/..." as a URI scheme).
native() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

log "=== build-roads start (data dir: $DATA_DIR) ==="

# 0. prerequisites
command -v java >/dev/null || fail "java not found on PATH (Java 21+ required)"
JV="$(java -version 2>&1 | head -1)"; log "java: $JV"
JMAJOR="$(printf '%s' "$JV" | sed -E 's/.*"([0-9]+).*/\1/')"
[ "$JMAJOR" -ge 21 ] || fail "Java 21+ required, found $JMAJOR"

# 1. tools
if [ ! -f "$JAR" ] || [ "$(sha256 "$JAR")" != "$PLANETILER_SHA256" ]; then
  download "https://github.com/onthegomap/planetiler/releases/download/v$PLANETILER_VERSION/planetiler.jar" "$JAR"
fi
[ "$(sha256 "$JAR")" = "$PLANETILER_SHA256" ] || fail "planetiler.jar SHA-256 mismatch"
log "planetiler $PLANETILER_VERSION OK"

case "$(uname -s)-$(uname -m)" in
  MINGW*|MSYS*|CYGWIN*) PMT="$BIN_DIR/pmtiles.exe"; PMT_ASSET="go-pmtiles_${PMTILES_VERSION}_Windows_x86_64.zip" ;;
  Linux-x86_64)  PMT="$BIN_DIR/pmtiles"; PMT_ASSET="go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz" ;;
  Linux-aarch64) PMT="$BIN_DIR/pmtiles"; PMT_ASSET="go-pmtiles_${PMTILES_VERSION}_Linux_arm64.tar.gz" ;;
  Darwin-arm64)  PMT="$BIN_DIR/pmtiles"; PMT_ASSET="go-pmtiles-${PMTILES_VERSION}_Darwin_arm64.zip" ;;
  Darwin-x86_64) PMT="$BIN_DIR/pmtiles"; PMT_ASSET="go-pmtiles-${PMTILES_VERSION}_Darwin_x86_64.zip" ;;
  *) fail "unsupported platform $(uname -s)-$(uname -m) for the pmtiles CLI" ;;
esac
if [ ! -x "$PMT" ]; then
  ARCHIVE="$BIN_DIR/$PMT_ASSET"
  download "https://github.com/protomaps/go-pmtiles/releases/download/v$PMTILES_VERSION/$PMT_ASSET" "$ARCHIVE"
  case "$ARCHIVE" in
    *.zip) unzip -o -q "$ARCHIVE" -d "$BIN_DIR" ;;
    *) tar -xzf "$ARCHIVE" -C "$BIN_DIR" ;;
  esac
  rm -f "$ARCHIVE"; chmod +x "$PMT"
fi
log "pmtiles CLI OK: $("$PMT" version)"

# 2. source extract (checksum stored at download time, see build-roads.ps1)
MD5_FILE="$PBF.md5"
if [ "$REFRESH" = 1 ] || [ ! -f "$PBF" ] || [ ! -f "$MD5_FILE" ]; then
  download "$PBF_URL.md5" "$MD5_FILE"
  download "$PBF_URL" "$PBF.part"
  mv -f "$PBF.part" "$PBF"
fi
EXPECTED="$(cut -d' ' -f1 < "$MD5_FILE" | tr 'A-F' 'a-f')"
ACTUAL="$(md5 "$PBF")"
[ "$EXPECTED" = "$ACTUAL" ] || fail "PBF MD5 $ACTUAL does not match $MD5_FILE ($EXPECTED); delete the PBF or use --refresh"
log "PBF OK: $PBF ($(wc -c < "$PBF" | tr -d ' ') bytes, md5 $ACTUAL)"

# 3. planetiler
START=$(date +%s)
PT_ARGS=("-Xmx${JAVA_HEAP:-4g}" -jar "$(native "$JAR")" generate-custom
  "--schema=$(native "$SCHEMA")" "--osm_path=$(native "$PBF")" "--output=$(native "$OUT")"
  "--tmpdir=$(native "$DATA_DIR/tmp")" --force)
log "run: java ${PT_ARGS[*]}"
java "${PT_ARGS[@]}" >>"$LOG" 2>&1 || fail "planetiler failed, see $LOG"
[ -f "$OUT" ] || fail "planetiler did not write $OUT"
log "planetiler done in $(( $(date +%s) - START )) s; $OUT = $(wc -c < "$OUT" | tr -d ' ') bytes"

# 4. archive checks
"$PMT" show "$(native "$OUT")" 2>&1 | tee -a "$LOG"
"$PMT" verify "$(native "$OUT")" 2>&1 | tee -a "$LOG" || fail "pmtiles verify failed"
log "=== build-roads OK. Next: python3 -I pipeline/validate.py --data-dir \"$DATA_DIR\" ==="
