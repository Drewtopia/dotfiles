-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua
-- Add any additional autocmds here

local function augroup(name)
  return vim.api.nvim_create_augroup("custom_" .. name, { clear = true })
end

vim.api.nvim_create_autocmd({ "BufNewFile", "BufRead", "BufWinEnter", "BufEnter" }, {
  group = vim.api.nvim_create_augroup("FileJsonc", {}),
  pattern = { "*.json" },
  callback = function()
    vim.opt.filetype = "jsonc"
  end,
})
