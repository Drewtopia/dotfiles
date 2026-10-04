# Domain Language

Vocabulary for this dotfiles repo. Use these terms exactly in code, commits, comments, and conversation. New term arrivals get added here first.

## Plugin Management

- **marketplace** — A Claude Code plugin marketplace. Identified by a short name (e.g. `caveman`) that maps to a GitHub source repo (e.g. `JuliusBrussee/caveman`). Declared in `home/.chezmoidata/claude.toml` under `[marketplaces]`.
  - Marketplaces are **not** profile-gated. The marketplace-update script registers all of them on every machine because registration is cheap and side-effect-free. Profile gating happens at the plugin layer (which plugins from a marketplace get *enabled*), not at the marketplace layer.

- **plugin** — A unit installed from a marketplace, addressed as `<plugin-name>@<marketplace-name>`. Plugins are *enabled* (used by Claude Code) or *opted out of* (explicit `false`) via `enabledPlugins` in `home/dot_claude/settings.json.tmpl`.
  - In the source-of-truth schema (`claude.toml` `[plugins.<profile>]` tables), entries are explicit booleans. Set a plugin to `false` to preserve a "considered and rejected" record — the plugin will be installed by the marketplace but suppressed from Claude Code.
  - An auto-installed plugin from a registered marketplace that is **not** listed in `enabledPlugins` defaults to **disabled** (Claude Code behavior). Declaration in `enabledPlugins` is opt-in, not opt-out.

- **profile** — A machine-class label that controls whether a plugin applies. Current profile values: `always`, `personal`, `dev_computer`. Profile names map 1:1 to template booleans set by `home/.chezmoi.toml.tmpl` (except `always`, which is unconditional).
  - In `claude.toml`, plugins are grouped under `[plugins.<profile>]` sections. A plugin's section *is* its profile membership.
  - `[plugins.always]` is rendered into `enabledPlugins` regardless of machine class. `[plugins.personal]` is rendered only when `.personal` is true. `[plugins.dev_computer]` only when `.dev_computer` is true.
  - A plugin needed under **multiple profiles** is duplicated across sections. The trade-off is verbosity for the rare multi-profile case in exchange for tight one-line-per-plugin readability in the common case.

## Machine State

- **relocated** — A machine that relocates dev tooling out of `$HOME` into a whitelisted `tools_root`, because endpoint security blocks executing binaries from the user profile. Exposed as the `.relocated` template data flag, computed once in `.chezmoi.toml.tmpl` as `tools_root != homeDir`; true only on work Windows where a `dev_folder` was supplied, so it implies both `work` and `windows`. Every relocation script and template gates on `.relocated` rather than re-deriving the `tools_root != homeDir` comparison.

- **Relocate** — The shared relocation module (`.chezmoitemplates/windows-relocation`). Interface: `Relocate -Src -Dst -Kind {Junction|SymbolicLink}`. Migrates a directory's contents into a whitelisted target, then replaces the original path with a reparse point. Idempotent; aborts before linking if any data would be left behind. Two adapters (junction, symbolic link) sit behind the one interface.
