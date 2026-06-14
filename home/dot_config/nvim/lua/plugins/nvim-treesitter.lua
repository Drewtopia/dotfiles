return {
  "nvim-treesitter/nvim-treesitter",
  -- LazyVim sets opts_extend = { "ensure_installed" }, so this list is
  -- appended to the defaults (json/jsonc already included upstream).
  opts = { ensure_installed = { "json", "json5", "jsonc" } },
}
