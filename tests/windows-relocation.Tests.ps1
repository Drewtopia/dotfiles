#requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0.0' }
# Tests for the windows-relocation template partial. The partial is pure
# PowerShell (no chezmoi template syntax) so it dot-sources directly.
# Run: pwsh -NoProfile -Command "Invoke-Pester -Path ./tests"

# The partial is extensionless (chezmoi .chezmoitemplates convention), and
# PowerShell's dot-source operator only loads .ps1 files - so load it as a
# scriptblock to define its functions in this scope.
BeforeAll {
    $partial = Join-Path $PSScriptRoot '..' 'home' '.chezmoitemplates' 'windows-relocation'
    . ([scriptblock]::Create((Get-Content -Raw -LiteralPath $partial)))
}

Describe 'Get-NormalizedPath' -Skip:(-not $IsWindows) {
    BeforeAll { $always = { param($p) $true } }

    It 'prepends canonical entries first, in order' {
        $r = Get-NormalizedPath -Prepend 'C:\a', 'C:\b' -Entries 'C:\c' -Exists $always
        $r | Should -Be @('C:\a', 'C:\b', 'C:\c')
    }

    It 'collapses case-insensitive duplicates, keeping the first occurrence' {
        $r = Get-NormalizedPath -Entries 'C:\Foo', 'c:\foo', 'C:\FOO' -Exists $always
        $r | Should -Be @('C:\Foo')
    }

    It 'normalizes forward slashes and trailing separators' {
        $r = Get-NormalizedPath -Entries 'C:/x/y/', 'C:\z\.' -Exists $always
        $r | Should -Be @('C:\x\y', 'C:\z')
    }

    It 'keeps only the canonical mise shims dir' {
        $canon = 'C:\root\.mise\shims'
        $r = Get-NormalizedPath -Entries 'C:\old\.mise\shims', $canon, 'D:\mise\shims', 'C:\keep' `
            -CanonicalMiseShims $canon -Exists $always
        $r | Should -Be @($canon, 'C:\keep')
    }

    It 'prunes entries that do not exist on disk' {
        $exists = { param($p) $p -eq 'C:\real' }
        $r = Get-NormalizedPath -Entries 'C:\real', 'C:\ghost' -Exists $exists
        $r | Should -Be @('C:\real')
    }

    It 'always includes prepend entries even when absent on disk' {
        $none = { param($p) $false }
        $r = Get-NormalizedPath -Prepend 'C:\shims' -Entries 'C:\x' -Exists $none
        $r | Should -Be @('C:\shims')
    }

    It 'is a fixed point: normalizing its own output changes nothing' {
        $once = Get-NormalizedPath -Prepend 'C:\a' -Entries 'C:/b/', 'C:\a' -Exists $always
        $twice = Get-NormalizedPath -Entries $once -Exists $always
        $twice | Should -Be $once
    }
}

Describe 'Relocate' -Skip:(-not $IsWindows) {
    BeforeEach {
        $root = Join-Path ([IO.Path]::GetTempPath()) ('reloc-' + [guid]::NewGuid().ToString('n'))
        New-Item -ItemType Directory -Path $root -Force | Out-Null
        $src = Join-Path $root 'src'
        $dst = Join-Path $root 'dst'
    }

    AfterEach {
        # Remove any reparse points without following them, then the tree.
        Get-ChildItem -LiteralPath $root -Force -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint } |
            ForEach-Object { cmd /c rmdir "`"$($_.FullName)`"" 2>$null }
        Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
    }

    It 'migrates contents to the target and leaves a reparse point at the source' {
        New-Item -ItemType Directory -Path $src -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $src 'file.txt') -Value 'hello'

        Relocate -Src $src -Dst $dst -Kind Junction

        $attrs = (Get-Item -LiteralPath $src -Force).Attributes
        ($attrs -band [IO.FileAttributes]::ReparsePoint) | Should -Not -Be 0
        Get-Content -LiteralPath (Join-Path $dst 'file.txt') | Should -Be 'hello'
    }

    It 'is idempotent: a second call is a no-op' {
        New-Item -ItemType Directory -Path $src -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $src 'file.txt') -Value 'hello'

        Relocate -Src $src -Dst $dst -Kind Junction
        { Relocate -Src $src -Dst $dst -Kind Junction } | Should -Not -Throw

        Get-Content -LiteralPath (Join-Path $dst 'file.txt') | Should -Be 'hello'
    }

    It 'aborts without data loss when a colliding child cannot migrate' {
        New-Item -ItemType Directory -Path $src -Force | Out-Null
        New-Item -ItemType Directory -Path $dst -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $src 'dup.txt') -Value 'from-src'
        Set-Content -LiteralPath (Join-Path $dst 'dup.txt') -Value 'from-dst'

        { Relocate -Src $src -Dst $dst -Kind Junction } | Should -Throw

        # Both copies preserved; source is not a reparse point.
        Get-Content -LiteralPath (Join-Path $src 'dup.txt') | Should -Be 'from-src'
        Get-Content -LiteralPath (Join-Path $dst 'dup.txt') | Should -Be 'from-dst'
        $attrs = (Get-Item -LiteralPath $src -Force).Attributes
        ($attrs -band [IO.FileAttributes]::ReparsePoint) | Should -Be 0
    }

    It 'honors the SymbolicLink kind' {
        New-Item -ItemType Directory -Path $src -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $src 'file.txt') -Value 'hello'

        try {
            Relocate -Src $src -Dst $dst -Kind SymbolicLink
        } catch {
            if ($_.Exception.Message -match 'privilege|symbolic|denied') {
                Set-ItResult -Skipped -Because 'symbolic link creation needs Developer Mode or admin'
                return
            }
            throw
        }

        (Get-Item -LiteralPath $src -Force).LinkType | Should -Be 'SymbolicLink'
        Get-Content -LiteralPath (Join-Path $dst 'file.txt') | Should -Be 'hello'
    }
}
