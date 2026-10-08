#!/usr/bin/env bash
# copy-picks.sh — Copy every photo listed in a gallery picks CSV from
# SOURCE_ROOT into DEST, preserving the folder tree, with verification
# designed to survive an external-SSD workflow (hot-unplug, flaky cables,
# half-written files).
#
# Usage:
#   ./copy-picks.sh <SOURCE_ROOT> <DEST> <CSV_PATH>
#
# Example:
#   ./copy-picks.sh /Volumes/Torugo-SSD/final-projects \
#     /Users/me/Desktop/picks \
#     /Users/me/Downloads/picks-2026-10-08.csv
#
# Reliability guarantees:
#   1. The CSV path is REQUIRED — the script never guesses one for you.
#   2. Pre-flight sanity check: the CSV header must match the exported
#      format, and the first photo listed must exist under SOURCE_ROOT.
#      This catches the common "wrong drive mounted" mistake up front,
#      before you let the script run for 20 minutes.
#   3. Each file is copied to a .part sibling first, then size-checked,
#      then byte-compared (`cmp`), then fsync-flushed, then atomically
#      renamed into place. The destination path only ever appears after
#      a verified-good copy exists on disk.
#   4. If anything fails mid-copy (I/O error, SSD disconnect, out of
#      space), the stale .part is removed before continuing so re-runs
#      stay clean.
#   5. Skips files that are already at the destination — re-running after
#      a disconnect resumes exactly where it left off.
#   6. Exits non-zero if ANY row failed, so CI / pipelines notice.

set -euo pipefail

usage() {
  cat >&2 <<EOF
Usage: $0 <SOURCE_ROOT> <DEST> <CSV_PATH>

  SOURCE_ROOT  Folder containing your gallery (where photos actually live).
  DEST         Folder to copy the picks into. Created if missing.
  CSV_PATH     Path to the picks CSV exported from the gallery UI.
EOF
}

if [ "$#" -ne 3 ]; then
  usage
  exit 1
fi

SOURCE_ROOT="$1"
DEST="$2"
CSV="$3"

die() { echo "error: $*" >&2; exit 1; }

[ -d "$SOURCE_ROOT" ] || die "SOURCE_ROOT does not exist or is not a directory: $SOURCE_ROOT"
[ -f "$CSV" ]        || die "CSV not found: $CSV"
[ -r "$CSV" ]        || die "CSV not readable: $CSV"

# Portable file size: wc -c works everywhere, stat flags differ by OS.
size_of() { wc -c < "$1" | tr -d ' '; }

# Portable CSV-first-field extractor. CSV paths may be quoted per RFC 4180
# (the gallery only quotes them when they contain `,"\n\r`, which photo
# paths effectively never do — but we unwrap the surrounding quotes anyway
# so a stray edge case doesn't silently misroute files).
first_field() {
  local line="$1"
  local rel="${line%%,*}"
  if [[ "$rel" == '"'*'"' ]]; then
    rel="${rel#\"}"
    rel="${rel%\"}"
    rel="${rel//\"\"/\"}"
  fi
  printf '%s' "$rel"
}

# 1. Header check — refuse anything that doesn't look like our export.
header="$(head -n 1 "$CSV")"
if [ "$header" != "path,name,starred_at" ]; then
  die "Unexpected CSV header. Expected 'path,name,starred_at' but got: $header"
fi

# 2. "Right drive mounted?" check — the first data row must resolve to a
#    real file under SOURCE_ROOT. If not, we abort BEFORE touching DEST.
first_line="$(tail -n +2 "$CSV" | head -n 1 || true)"
if [ -z "$first_line" ]; then
  echo "CSV has no data rows. Nothing to do."
  exit 0
fi
first_rel="$(first_field "$first_line")"
if [ -n "$first_rel" ] && [ ! -f "$SOURCE_ROOT/$first_rel" ]; then
  die "First CSV entry does not exist under SOURCE_ROOT:
   expected: $SOURCE_ROOT/$first_rel
Is the right drive mounted and is SOURCE_ROOT the correct path?"
fi

mkdir -p "$DEST"

# 3. DEST writability smoke test — fail now, not after row 437.
test_file="$DEST/.gallery-copy-picks-write-test-$$"
if ! : > "$test_file" 2>/dev/null; then
  die "DEST is not writable: $DEST"
fi
rm -f "$test_file"

copied=0
skipped=0
missing=0
failed=0

process_row() {
  local line="$1"
  [ -z "$line" ] && return 0

  local rel src dst part src_size part_size
  rel="$(first_field "$line")"
  [ -z "$rel" ] && return 0

  src="$SOURCE_ROOT/$rel"
  dst="$DEST/$rel"
  part="$dst.part"

  if [ ! -f "$src" ]; then
    printf '  MISSING  %s\n' "$rel" >&2
    missing=$((missing + 1))
    return 0
  fi
  if [ -e "$dst" ]; then
    printf '  SKIP     %s (exists at destination)\n' "$rel"
    skipped=$((skipped + 1))
    return 0
  fi

  mkdir -p "$(dirname "$dst")"

  # Clear any stale .part leftover from a previous crashed run.
  [ -e "$part" ] && rm -f "$part"

  # 4. cp into the .part file first — the final name only appears after
  #    the verify step passes.
  if ! cp -p "$src" "$part" 2>/dev/null; then
    printf '  FAIL     %s (cp)\n' "$rel" >&2
    rm -f "$part"
    failed=$((failed + 1))
    return 0
  fi

  src_size="$(size_of "$src")"
  part_size="$(size_of "$part")"
  if [ "$src_size" != "$part_size" ]; then
    printf '  FAIL     %s (size %s != %s)\n' "$rel" "$src_size" "$part_size" >&2
    rm -f "$part"
    failed=$((failed + 1))
    return 0
  fi

  # 5. Byte-for-byte compare. On a healthy copy this is boring; on a
  #    half-written file after an SSD disconnect this catches it.
  if ! cmp -s "$src" "$part"; then
    printf '  FAIL     %s (byte compare)\n' "$rel" >&2
    rm -f "$part"
    failed=$((failed + 1))
    return 0
  fi

  # 6. Flush pending writes to disk BEFORE promoting the .part to its
  #    final name. If the user yanks the cable right after this returns,
  #    they still have a valid file on the destination.
  sync

  mv "$part" "$dst"
  printf '  COPY     %s\n' "$rel"
  copied=$((copied + 1))
}

while IFS= read -r line || [ -n "$line" ]; do
  process_row "$line"
done < <(tail -n +2 "$CSV")

echo
echo "Done. copied=$copied skipped=$skipped missing=$missing failed=$failed"

if [ "$failed" -gt 0 ]; then
  exit 2
fi
