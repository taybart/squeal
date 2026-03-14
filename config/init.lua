-- System configuration for Squeal
-- This file loads after the user's init.lua

-- Source user's init.lua first (if it exists)
-- This allows users to customize their leader key and other settings
local user_config = vim.fn.getcwd() .. '/init.lua'
if vim.fn.filereadable(user_config) == 1 then vim.cmd('source ' .. user_config) end

-- Default leader if not set by user
if not vim.g.mapleader then vim.g.mapleader = ' ' end

-- Basic settings
vim.opt.expandtab = true
vim.opt.tabstop = 2
vim.opt.shiftwidth = 2
vim.opt.softtabstop = 2
vim.opt.number = true
vim.opt.swapfile = false
vim.opt.backup = false
vim.opt.timeoutlen = 1000
vim.opt.ttimeoutlen = 0

-- Helper function for setting keymaps
local function mode_group(mode, maps, opts)
	opts = opts or {}
	for _, v in ipairs(maps) do
		if v[3] then vim.tbl_deep_extend('force', opts, v[3]) end
		vim.keymap.set(mode, v[1], v[2], opts)
	end
end

-- Easy escape from insert (works regardless of leader)
mode_group('i', {
	{ 'jk', '<Esc>' },
	{ 'jK', '<Esc>' },
	{ 'JK', '<Esc>' },
})

-- Command mode shortcuts
mode_group('c', {
	{ 'W', 'w' },
})

-- Normal mode mappings using leader
mode_group('n', {
	{ '<leader>l', ':bn<cr>' },
	{ '<leader>h', ':bp<cr>' },
	{ '<leader>d', ':bp <BAR> bd #<cr>' },
}, { noremap = true })

-- Quick line operations
mode_group('n', {
	{ 'zj', 'o<Esc>k' },
	{ 'zk', 'O<Esc>j' },
}, { silent = true })

-- Navigation improvements
mode_group('n', {
	{ 'j', 'gj' },
	{ 'k', 'gk' },
	{ 'H', '^' },
	{ 'L', '$' },
	{ '<c-d>', '15gj' },
	{ '<c-u>', '15gk' },
})

-- Visual mode mappings
mode_group('v', {
	{ '<c-d>', '15gj' },
	{ '<c-u>', '15gk' },
	{ '<Tab>', '>gv' },
	{ '<S-Tab>', '<gv' },
})

-- Configure treesitter to look for parsers in our config directory
-- Note: runtimepath is already set by --cmd in state.rs
-- Add our lua directory to the path
vim.opt.runtimepath:append(vim.fn.expand('<sfile>:p:h') .. '/lua')

-- Load the squeal_sql module
local ok, squeal_sql = pcall(require, 'squeal_sql')
if ok then
  -- Make it globally accessible for easy access
  _G.squeal_sql = squeal_sql
  io.stderr:write("squeal_sql module loaded successfully\n")
else
  io.stderr:write("Failed to load squeal_sql: " .. tostring(squeal_sql) .. "\n")
end

vim.treesitter.language.add('sql', {
  path = vim.fn.expand('<sfile>:p:h') .. '/tree-sitter-sql.so',
})
