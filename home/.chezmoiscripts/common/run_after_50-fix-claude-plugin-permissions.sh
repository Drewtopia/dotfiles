#!/bin/bash
# Fix execute permissions on marketplace plugin hooks
find "${HOME}/.claude/plugins/marketplaces" -name "*.sh" ! -perm -u+x -exec chmod +x {} + 2>/dev/null || true
