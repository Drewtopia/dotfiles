local wezterm = require("wezterm")
local config = wezterm.config_builder()

-- Windows only: launch pwsh 7 instead of the default cmd.exe. On macOS/Linux
-- default_prog is left unset so WezTerm spawns the login shell (zsh).
if wezterm.target_triple:find("windows") then
	config.default_prog = { "C:\\Program Files\\PowerShell\\7\\pwsh.exe", "-NoLogo" }
end

-- Same nerd font under two family names: scoop installs it as "JetBrainsMono NF",
-- brew/nerd-fonts as "JetBrainsMono Nerd Font". List both so one config works
-- on every box.
config.font = wezterm.font_with_fallback({
	"JetBrainsMono NF",
	"JetBrainsMono Nerd Font",
	"MesloLGS NF",
	"Cascadia Code",
})
config.font_size = 11.0

config.color_scheme = "Tokyo Night"

config.hide_tab_bar_if_only_one_tab = true
config.use_fancy_tab_bar = false
config.tab_bar_at_bottom = true
config.show_new_tab_button_in_tab_bar = false

config.window_padding = { left = 6, right = 6, top = 4, bottom = 4 }

return config
