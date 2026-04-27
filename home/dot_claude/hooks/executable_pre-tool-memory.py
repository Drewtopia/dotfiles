#!/usr/bin/env python
"""PreToolUse hook: inject project MEMORY.md on first tool call of this process context."""
import json
import os
import sys
import tempfile
from pathlib import Path


def main():
    # Flag path: prefer the path computed by the .sh wrapper (CLAUDE_MEMORY_FLAG env var)
    # so bash and Python always agree. Falls back to a portable tempdir if Python is
    # invoked directly (no wrapper) or on a platform where the env var isn't set.
    flag_env = os.environ.get('CLAUDE_MEMORY_FLAG')
    if flag_env:
        flag_path = Path(flag_env)
    else:
        # PPID = Claude Code process — stable within a session, new for each subagent
        flag_path = Path(tempfile.gettempdir()) / f"claude-memory-loaded-{os.getppid()}"

    # Already loaded for this process — exit silently (no output = no context injection)
    if flag_path.exists():
        sys.exit(0)

    # Mark as loaded for this process
    flag_path.touch()

    project_dir = os.environ.get('CLAUDE_PROJECT_DIR', os.getcwd())

    # Map project dir to .claude/projects key
    # /Users/you/Projects/foo -> -Users-you-Projects-foo
    # Replace / and . with -, keep the leading - (don't lstrip)
    mapped = project_dir.replace('/', '-').replace('.', '-')

    home = Path.home()
    memory_file = home / '.claude' / 'projects' / mapped / 'memory' / 'MEMORY.md'
    global_idx = home / '.claude' / 'memory' / 'memory.md'

    parts = []

    if memory_file.exists():
        lines = memory_file.read_text().splitlines()[:200]
        parts.append(f"=== Project Memory: {project_dir} ===\n" + '\n'.join(lines))
    else:
        parts.append(f"(no project MEMORY.md at {memory_file})")

    if global_idx.exists():
        parts.append("=== Global Memory Index ===\n" + global_idx.read_text())

    context = '\n\n'.join(parts)

    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": context
        }
    }

    print(json.dumps(output))
    sys.exit(0)


if __name__ == "__main__":
    main()
