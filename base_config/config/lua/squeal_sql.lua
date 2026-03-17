-- Squeal SQL utilities module
-- This module provides functions for extracting SQL statements

local M = {}

-- Get the statement node under the cursor using treesitter
function M.get_stmt_ts_node()
  local buf = vim.api.nvim_get_current_buf()
  local row, col = unpack(vim.api.nvim_win_get_cursor(0))
  row = row - 1 -- 0-based for treesitter

  local ok, parser = pcall(vim.treesitter.get_parser, buf, 'sql')
  if not ok or not parser then return nil end

  local root = parser:parse()[1]:root()
  local node = root:named_descendant_for_range(row, col, row, col)

  while node do
    if node:type() == 'statement' then return node end
    node = node:parent()
  end

  return nil
end

-- Get statement info (text and boundaries) under cursor
function M.get_stmt_info_under_cursor()
  local node = M.get_stmt_ts_node()
  if not node then return nil end

  local stmt = vim.treesitter.get_node_text(node, 0)
  local start_row, start_col, end_row, end_col = node:range()

  return {
    text = stmt:gsub('\n', ' '):gsub('%s+', ' ') .. ';',
    start_row = start_row, -- 0-based
    start_col = start_col, -- 0-based
    end_row = end_row,   -- 0-based, exclusive
    end_col = end_col,   -- 0-based, exclusive
  }
end

-- Get text of the statement under cursor (deprecated, use get_stmt_info_under_cursor)
function M.get_stmt_under_cursor()
  local info = M.get_stmt_info_under_cursor()
  if not info then return nil end
  return info.text
end

-- Get all statements in the file
function M.get_all_statements()
  local buf = vim.api.nvim_get_current_buf()
  local ok, parser = pcall(vim.treesitter.get_parser, buf, 'sql')
  if not ok or not parser then return {} end

  local root = parser:parse()[1]:root()
  local statements = {}

  for child in root:iter_children() do
    if child:type() == 'statement' then
      local stmt = vim.treesitter.get_node_text(child, buf)
      table.insert(statements, stmt:gsub('\n', ' '):gsub('%s+', ' ') .. ';')
    end
  end

  return statements
end

-- Execute statement under cursor
function M.execute_statement()
  local info = M.get_stmt_info_under_cursor()
  if not info then
    vim.notify('No SQL statement found under cursor', vim.log.levels.WARN)
    return nil
  end

  -- Send to RPC client with statement and boundaries
  vim.rpcnotify(1, 'sql_statement', info)
  return info.text
end

-- Execute all statements in file
function M.execute_file()
  local statements = M.get_all_statements()

  if #statements == 0 then
    vim.notify('No SQL statements found in file', vim.log.levels.WARN)
    return nil
  end

  -- Send to RPC client
  vim.rpcnotify(1, 'sql_execute', {
    statements = statements,
    mode = 'file',
  })
  return statements
end

return M
