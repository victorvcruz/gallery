#!/usr/bin/env bash
# move-picks.sh — Move every photo listed in a gallery picks CSV from
# SOURCE_ROOT into DEST, preserving the folder tree, with verification
# designed to survive an external-SSD workflow (hot-unplug, flaky cables,
# half-written files).
#
# ⚠️ This DELETES the source after the destination is verified. The
#    deletion only happens AFTER a byte-for-byte compare and an fsync,
#    so there's no window where both copies are gone — but if you want
#    to keep originals, use the copy-picks variant.
#
# Usage:
#   ./move-picks.sh <SOURCE_ROOT> <DEST> <CSV_PATH>
#
# Example:
#   ./move-picks.sh /Volumes/Torugo-SSD/final-projects \
#     /Users/me/Desktop/picks \
#     /Users/me/Downloads/picks-2026-10-08.csv
#
# Reliability guarantees:
#   1. The CSV path is REQUIRED — the script never guesses one for you.
#   2. Pre-flight sanity check: the CSV header must match the exported
#      format, and the first photo listed must exist under SOURCE_ROOT.
#   3. Each file is copied to a .part sibling first, size-checked,
#      byte-compared (`cmp`), fsync-flushed, and atomically renamed into
#      place. Only AFTER all of that succeeds is the source unlinked.
#   4. If anything fails mid-move, the stale .part is removed and the
#      source stays put. Re-runs stay clean and idempotent.
#   5. Skips files that are already at the destination (source stays put
#      in that case too — nothing is silently discarded).
#   6. Exits non-zero if ANY row failed, so CI / pipelines notice.

set -euo pipefail

usage() {
  cat >&2 <<EOF
Usage: $0 <SOURCE_ROOT> <DEST> <CSV_PATH>

  SOURCE_ROOT  Folder containing your gallery (where photos actually live).
  DEST         Folder to move the picks into. Created if missing.
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

size_of() { wc -c < "$1" | tr -d ' '; }

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

header="$(head -n 1 "$CSV")"
if [ "$header" != "path,name,starred_at" ]; then
  die "Unexpected CSV header. Expected 'path,name,starred_at' but got: $header"
fi

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

test_file="$DEST/.gallery-move-picks-write-test-$$"
if ! : > "$test_file" 2>/dev/null; then
  die "DEST is not writable: $DEST"
fi
rm -f "$test_file"

moved=0
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
    printf '  SKIP     %s (exists at destination; source left in place)\n' "$rel"
    skipped=$((skipped + 1))
    return 0
  fi

  mkdir -p "$(dirname "$dst")"

  [ -e "$part" ] && rm -f "$part"

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

  if ! cmp -s "$src" "$part"; then
    printf '  FAIL     %s (byte compare)\n' "$rel" >&2
    rm -f "$part"
    failed=$((failed + 1))
    return 0
  fi

  # Flush pending writes BEFORE renaming into place AND before unlinking
  # the source. If the user yanks a cable in the next millisecond, we
  # still have a complete file on the destination.
  sync

  mv "$part" "$dst"

  # Only now, with a verified-good copy on disk and flushed, do we touch
  # the source. If this rm fails, the file lives on both sides — far
  # better than a half-moved state.
  if ! rm -f "$src"; then
    printf '  WARN     %s (copied + verified, but source rm failed)\n' "$rel" >&2
  fi

  printf '  MOVE     %s\n' "$rel"
  moved=$((moved + 1))
}

while IFS= read -r line || [ -n "$line" ]; do
  process_row "$line"
done < <(tail -n +2 "$CSV")

echo
echo "Done. moved=$moved skipped=$skipped missing=$missing failed=$failed"

if [ "$failed" -gt 0 ]; then
  exit 2
fi
