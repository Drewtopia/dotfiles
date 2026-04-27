# Auto-backup pre-existing ~/.claude/memory/ before chezmoi's symlink_memory
# tries to land on Windows. Idempotent: no-op if already a symlink/junction
# or doesn't exist.

$target = Join-Path $HOME ".claude/memory"

if (Test-Path $target) {
    $item = Get-Item $target -Force
    # Only act if NOT a reparse point (symlink/junction)
    if ($item.Attributes -notmatch "ReparsePoint") {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $backup = "$target.bak.$timestamp"
        Write-Host "-> Backing up pre-existing $target to $backup"
        Write-Host "   (run reorganize-memory skill afterward to merge content into vault)"
        Move-Item -Path $target -Destination $backup
    }
}
