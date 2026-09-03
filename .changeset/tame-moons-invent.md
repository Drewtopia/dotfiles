---
"drewtopia-dotfiles": patch
---

Split mattpocock/skills by agent: `npx skills` everywhere except Claude Code.

- `.chezmoidata/skills.yaml` entries take an optional `agents:` list, rendered as `skills add --agent`. Omitting it keeps the previous behaviour (install to every detected agent).
- mattpocock/skills is now two entries: the whole repo (`"*"`) for Codex, Cursor and GitHub Copilot, which previously got none of the stable engineering/ and productivity/ skills; and the nine misc/ and in-progress/ skills for Claude Code, which takes the rest from the `mattpocock-skills@mattpocock` plugin. The `"*"` also retires the hand-maintained name list that went stale on every upstream rename.
- `.chezmoiremove.tmpl` no longer deletes the `~/.agents/skills` payload for plugin-covered skills — that store is what the non-Claude agents read. It still sweeps the `~/.claude/skills` symlinks so they can't shadow the plugin's namespaced versions.
