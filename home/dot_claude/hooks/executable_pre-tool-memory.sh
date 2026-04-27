#!/bin/bash
# Shell wrapper for pre-tool-memory.py — fast-path flag check (~5ms vs ~80ms Python startup).
# Computes a portable tempdir (TMPDIR on macOS, TEMP on Windows-Git-Bash, /tmp on Linux)
# and passes the resolved flag path to Python via env var so both files agree.
FLAG="${TMPDIR:-${TEMP:-/tmp}}/claude-memory-loaded-$(ps -o ppid= -p $$ | tr -d ' ')"
[ -f "$FLAG" ] && exit 0
[ -f ~/.claude/hooks/pre-tool-memory.py ] || exit 0
export CLAUDE_MEMORY_FLAG="$FLAG"
exec python ~/.claude/hooks/pre-tool-memory.py
