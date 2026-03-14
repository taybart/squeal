-- SQL filetype plugin for Squeal
-- Provides treesitter-based statement extraction and execution

-- Debug output to stderr (appears in debug panel)
io.stderr:write("SQL ftplugin loaded! Leader: " .. vim.inspect(vim.g.mapleader) .. "\n")

-- Get the statement node under the cursor using treesitter
local function get_stmt_ts_node()
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

-- Get text of the statement under cursor
local function get_stmt_under_cursor()
  local node = get_stmt_ts_node()
  if not node then return nil end
  local stmt = vim.treesitter.get_node_text(node, 0)
  return stmt:gsub('\n', ' '):gsub('%s+', ' ') .. ';'
end

-- Get all statements in the file
local function get_all_statements()
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

-- Get buffer content (all lines)
local function get_buffer_content()
  local lines = vim.api.nvim_buf_get_lines(0, 0, -1, false)
  return table.concat(lines, '\n')
end

-- RPC notification helper
-- Sends notification to the RPC client (your Tauri app)
local function notify_client(event, data)
  -- Get the client ID from the channel (should be 1 for the main UI)
  local client_id = 1
  vim.rpcnotify(client_id, event, data)
end

-- Highlight the statement under cursor
local function highlight()
  local buf = vim.api.nvim_get_current_buf()
  local ns = vim.api.nvim_create_namespace('sql_statement_hl')

  vim.api.nvim_buf_clear_namespace(buf, ns, 0, -1)

  local node = get_stmt_ts_node()
  if not node then return end

  local srow, scol = node:start()
  local erow, ecol = node:end_()

  vim.api.nvim_buf_set_extmark(buf, ns, srow, scol, {
    end_row = erow,
    end_col = ecol,
    hl_group = 'CursorLine',
    priority = 100,
  })
end

-- Auto-highlight on cursor movement
vim.api.nvim_create_autocmd('CursorMoved', {
  group = vim.api.nvim_create_augroup('SqlHighlight', { clear = true }),
  callback = highlight,
})

-- Get current statement and send to app (mapped to <leader>s)
vim.keymap.set('n', '<leader>s', function()
  io.stderr:write("Leader+S pressed!\n")
  local stmt = get_stmt_under_cursor()
  if not stmt then 
    io.stderr:write("No SQL statement found under cursor\n")
    return 
  end
  io.stderr:write("Found statement: " .. stmt:sub(1, 50) .. "...\n")
  notify_client('sql_statement', { statement = stmt })
end, { noremap = true, buffer = true, desc = 'Send SQL statement to app' })

io.stderr:write("Mapped <leader>s for SQL buffer\n")

-- Execute current statement (placeholder - sends to app for now)
vim.keymap.set('n', '<leader>x', function()
  local stmt = get_stmt_under_cursor()
  if not stmt then 
    vim.notify('No SQL statement found under cursor', vim.log.levels.WARN)
    return 
  end
  notify_client('sql_execute', { 
    statement = stmt,
    mode = 'single'
  })
end, { noremap = true, buffer = true, desc = 'Execute SQL statement' })

-- Execute entire file (mapped to <leader>e)
vim.keymap.set('n', '<leader>e', function()
  local content = get_buffer_content()
  local statements = get_all_statements()
  
  if #statements == 0 then
    vim.notify('No SQL statements found in file', vim.log.levels.WARN)
    return
  end
  
  notify_client('sql_execute', {
    statements = statements,
    content = content,
    mode = 'file'
  })
end, { noremap = true, buffer = true, desc = 'Execute all SQL statements in file' })

-- Also map in visual mode for executing selection
vim.keymap.set('v', '<leader>e', function()
  -- Get visual selection
  local start_pos = vim.fn.getpos("'<")
  local end_pos = vim.fn.getpos("'>")
  local lines = vim.api.nvim_buf_get_lines(0, start_pos[2] - 1, end_pos[2], false)
  
  if #lines == 0 then
    vim.notify('No text selected', vim.log.levels.WARN)
    return
  end
  
  local selection = table.concat(lines, '\n')
  notify_client('sql_execute', {
    content = selection,
    mode = 'selection'
  })
end, { noremap = true, buffer = true, desc = 'Execute selected SQL' })
