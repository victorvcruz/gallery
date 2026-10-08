# copy-picks.ps1 — Copy every photo listed in a gallery picks CSV from
# SourceRoot into Dest, preserving the folder tree, with verification
# designed to survive an external-SSD workflow (hot-unplug, flaky cables,
# half-written files).
#
# Usage:
#   .\copy-picks.ps1 -SourceRoot <path> -Dest <path> -Csv <path>
#
# Example:
#   .\copy-picks.ps1 -SourceRoot "E:\gallery" -Dest "D:\picks" `
#     -Csv "$HOME\Downloads\picks-2026-10-08.csv"
#
# Reliability guarantees:
#   1. -Csv is REQUIRED — the script never guesses one for you.
#   2. Pre-flight sanity check: the CSV header must match the exported
#      format, and the first photo listed must exist under SourceRoot.
#      This catches the common "wrong drive mounted" mistake up front.
#   3. Each file is copied to a .part sibling first, size-checked,
#      SHA256-compared, then renamed into place. The destination path
#      only ever appears after a verified-good copy exists on disk.
#   4. Stale .part leftovers from a crashed run are removed before each
#      retry.
#   5. Skips files already at the destination — re-runs resume cleanly.
#   6. Exits with code 2 if ANY row failed.

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$SourceRoot,

    [Parameter(Mandatory = $true, Position = 1)]
    [string]$Dest,

    [Parameter(Mandatory = $true, Position = 2)]
    [string]$Csv
)

$ErrorActionPreference = 'Stop'

function Die([string]$msg) {
    Write-Error $msg
    exit 1
}

function Get-Rel([object]$row) {
    # Guard against CSVs that don't have the expected header.
    if (-not $row.PSObject.Properties['path']) { return '' }
    return [string]$row.path
}

function Get-Sha256([string]$path) {
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash
}

if (-not (Test-Path -LiteralPath $SourceRoot -PathType Container)) {
    Die "SourceRoot does not exist or is not a directory: $SourceRoot"
}
if (-not (Test-Path -LiteralPath $Csv -PathType Leaf)) {
    Die "CSV not found: $Csv"
}

# 1. Header check — refuse anything that doesn't look like our export.
$header = (Get-Content -LiteralPath $Csv -TotalCount 1)
if ($header -ne 'path,name,starred_at') {
    Die "Unexpected CSV header. Expected 'path,name,starred_at' but got: $header"
}

# PowerShell's Import-Csv handles RFC 4180 quoting correctly.
$rows = Import-Csv -LiteralPath $Csv
if (-not $rows -or $rows.Count -eq 0) {
    Write-Host "CSV has no data rows. Nothing to do."
    exit 0
}

# 2. "Right drive mounted?" check — the first row must resolve to a real
#    file under SourceRoot before we start touching Dest.
$firstRel = Get-Rel $rows[0]
if ($firstRel) {
    $firstRelWin = $firstRel -replace '/', '\'
    $firstFull = Join-Path $SourceRoot $firstRelWin
    if (-not (Test-Path -LiteralPath $firstFull -PathType Leaf)) {
        Die @"
First CSV entry does not exist under SourceRoot:
   expected: $firstFull
Is the right drive mounted and is -SourceRoot the correct path?
"@
    }
}

New-Item -ItemType Directory -Force -Path $Dest | Out-Null

# 3. Dest writability smoke test — fail now, not after row 437.
$testFile = Join-Path $Dest ".gallery-copy-picks-write-test-$PID"
try {
    [IO.File]::WriteAllText($testFile, 'test')
    Remove-Item -LiteralPath $testFile -Force
} catch {
    Die "Dest is not writable: $Dest ($_)"
}

$copied  = 0
$skipped = 0
$missing = 0
$failed  = 0

foreach ($row in $rows) {
    $rel = Get-Rel $row
    if (-not $rel) { continue }

    $relWin = $rel -replace '/', '\'
    $src  = Join-Path $SourceRoot $relWin
    $dst  = Join-Path $Dest       $relWin
    $part = "$dst.part"

    if (-not (Test-Path -LiteralPath $src -PathType Leaf)) {
        Write-Host "  MISSING  $rel"
        $missing++
        continue
    }
    if (Test-Path -LiteralPath $dst) {
        Write-Host "  SKIP     $rel (exists at destination)"
        $skipped++
        continue
    }

    $parent = Split-Path -Parent $dst
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }

    # Clean up any stale .part from a previous crashed run.
    if (Test-Path -LiteralPath $part) {
        Remove-Item -LiteralPath $part -Force
    }

    # 4. Copy into the .part first — the final name only appears after
    #    verification.
    try {
        Copy-Item -LiteralPath $src -Destination $part -ErrorAction Stop
    } catch {
        Write-Host "  FAIL     $rel (copy: $_)"
        if (Test-Path -LiteralPath $part) { Remove-Item -LiteralPath $part -Force }
        $failed++
        continue
    }

    $srcLen  = (Get-Item -LiteralPath $src).Length
    $partLen = (Get-Item -LiteralPath $part).Length
    if ($srcLen -ne $partLen) {
        Write-Host "  FAIL     $rel (size $srcLen != $partLen)"
        Remove-Item -LiteralPath $part -Force
        $failed++
        continue
    }

    # 5. SHA256 compare. On a healthy copy this is boring; on a half-
    #    written file after an SSD disconnect this catches it.
    try {
        $srcHash  = Get-Sha256 $src
        $partHash = Get-Sha256 $part
    } catch {
        Write-Host "  FAIL     $rel (hash: $_)"
        Remove-Item -LiteralPath $part -Force
        $failed++
        continue
    }
    if ($srcHash -ne $partHash) {
        Write-Host "  FAIL     $rel (hash mismatch)"
        Remove-Item -LiteralPath $part -Force
        $failed++
        continue
    }

    Move-Item -LiteralPath $part -Destination $dst
    Write-Host "  COPY     $rel"
    $copied++
}

Write-Host ""
Write-Host "Done. copied=$copied skipped=$skipped missing=$missing failed=$failed"

if ($failed -gt 0) { exit 2 }
