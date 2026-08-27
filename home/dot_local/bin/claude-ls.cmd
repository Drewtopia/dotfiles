@echo off
rem Windows wrapper so `claude-ls` runs in PowerShell/cmd. Git Bash uses the shebang directly.
python "%~dp0claude-ls" %*
