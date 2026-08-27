@echo off
rem Windows wrapper so `claude-triage` runs in PowerShell/cmd. Git Bash uses the shebang directly.
python "%~dp0claude-triage" %*
