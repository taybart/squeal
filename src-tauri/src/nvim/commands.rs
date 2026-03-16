use crate::nvim::state::SharedState;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatementBounds {
    pub text: String,
    pub start_row: i64,
    pub start_col: i64,
    pub end_row: i64,
    pub end_col: i64,
}

#[tauri::command]
pub async fn start_nvim(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedState>,
    file_path: Option<String>,
) -> Result<(), String> {
    super::state::start_nvim_instance((*state).clone(), file_path, app_handle).await
}

#[tauri::command]
pub async fn get_current_file(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        // Get current file name using expand('%:t')
        let filename = nvim_state
            .nvim
            .command_output("echo expand('%:t')")
            .await
            .map_err(|e| format!("Failed to get filename: {}", e))?;

        Ok(filename.trim_end().to_string())
    } else {
        Err("Neovim not initialized".to_string())
    }
}

#[tauri::command]
pub async fn send_keys(state: tauri::State<'_, SharedState>, keys: String) -> Result<(), String> {
    // eprintln!("[nvim] Sending keys: {:?}", keys);
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        // Use nvim_input with timeout to prevent hanging
        let result = tokio::time::timeout(
            tokio::time::Duration::from_secs(2),
            nvim_state.nvim.input(&keys),
        )
        .await;

        match result {
            Ok(Ok(_bytes_written)) => {
                // eprintln!("[nvim] Keys sent successfully");
                Ok(())
            }
            Ok(Err(e)) => {
                eprintln!("[nvim] Failed to send keys: {}", e);
                Err(format!("Failed to send keys: {}", e))
            }
            Err(_) => {
                eprintln!("[nvim] Timeout after 2 seconds");
                Err("Timeout: nvim did not respond to keys within 2 seconds".to_string())
            }
        }
    } else {
        Err("Neovim not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_buffer_content(
    state: tauri::State<'_, SharedState>,
) -> Result<Vec<String>, String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        let lines = nvim_state
            .nvim
            .get_current_buf()
            .await
            .map_err(|e| format!("Failed to get buffer: {}", e))?
            .get_lines(0, -1, false)
            .await
            .map_err(|e| format!("Failed to get lines: {}", e))?;
        Ok(lines)
    } else {
        Err("Neovim not initialized".to_string())
    }
}

#[tauri::command]
pub async fn set_buffer_content(
    state: tauri::State<'_, SharedState>,
    lines: Vec<String>,
) -> Result<(), String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        let buf = nvim_state
            .nvim
            .get_current_buf()
            .await
            .map_err(|e| format!("Failed to get buffer: {}", e))?;

        buf.set_lines(0, -1, false, lines)
            .await
            .map_err(|e| format!("Failed to set lines: {}", e))?;

        Ok(())
    } else {
        Err("Neovim not initialized".to_string())
    }
}

#[tauri::command]
pub async fn execute_command(
    state: tauri::State<'_, SharedState>,
    command: String,
) -> Result<String, String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        let result = nvim_state
            .nvim
            .command_output(&command)
            .await
            .map_err(|e| format!("Failed to execute command: {}", e))?;
        Ok(result)
    } else {
        Err("Neovim not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_mode(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        let mode_info = nvim_state
            .nvim
            .get_mode()
            .await
            .map_err(|e| format!("Failed to get mode: {}", e))?;

        // mode_info is Vec<(Value, Value)>, find the "mode" key
        for (key, value) in mode_info {
            if let (rmpv::Value::String(k), rmpv::Value::String(v)) = (key, value) {
                if k.as_str() == Some("mode") {
                    return Ok(v.as_str().unwrap_or("unknown").to_string());
                }
            }
        }

        Ok("unknown".to_string())
    } else {
        Err("Neovim not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_cursor(state: tauri::State<'_, SharedState>) -> Result<(i64, i64), String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        let win = nvim_state
            .nvim
            .get_current_win()
            .await
            .map_err(|e| format!("Failed to get window: {}", e))?;

        let (row, col) = win
            .get_cursor()
            .await
            .map_err(|e| format!("Failed to get cursor: {}", e))?;

        // nvim uses 1-indexed row, 0-indexed col
        // Return as (row, col) where row is 0-indexed for display
        Ok((row - 1, col))
    } else {
        Err("Neovim not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_visual_selection(
    state: tauri::State<'_, SharedState>,
) -> Result<Option<((i64, i64), (i64, i64))>, String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        // Check if we're in visual mode
        let mode_info = nvim_state
            .nvim
            .get_mode()
            .await
            .map_err(|e| format!("Failed to get mode: {}", e))?;

        let mut is_visual = false;
        let mut current_mode = "";
        for (key, value) in &mode_info {
            if let (rmpv::Value::String(k), rmpv::Value::String(v)) = (key, value) {
                if k.as_str() == Some("mode") {
                    current_mode = v.as_str().unwrap_or("");
                    // v = charwise visual, V = linewise visual, ^V = blockwise visual
                    is_visual =
                        current_mode == "v" || current_mode == "V" || current_mode == "\x16";
                    break;
                }
            }
        }

        if !is_visual {
            return Ok(None);
        }

        // Get visual selection while in visual mode
        // Use getpos("v") for visual start and getpos(".") for cursor position
        let start_output = nvim_state
            .nvim
            .command_output("echo getpos(\"v\")[1] . ',' . getpos(\"v\")[2]")
            .await
            .map_err(|e| format!("Failed to get visual start: {}", e))?;
        let end_output = nvim_state
            .nvim
            .command_output("echo getpos(\".\")[1] . ',' . getpos(\".\")[2]")
            .await
            .map_err(|e| format!("Failed to get visual end: {}", e))?;

        // Parse the output
        let start_parts: Vec<&str> = start_output.trim_end().split(',').collect();
        let end_parts: Vec<&str> = end_output.trim_end().split(',').collect();

        if start_parts.len() == 2 && end_parts.len() == 2 {
            // getpos returns 1-indexed lines, 0-indexed columns
            let start_row = start_parts[0].parse::<i64>().unwrap_or(1) - 1;
            let start_col = start_parts[1].parse::<i64>().unwrap_or(0); // Already 0-indexed
            let end_row = end_parts[0].parse::<i64>().unwrap_or(1) - 1;
            let end_col = end_parts[1].parse::<i64>().unwrap_or(0); // Already 0-indexed

            // eprintln!("Visual selection parsed: (({}, {}), ({}, {}))", start_row, start_col, end_row, end_col);
            return Ok(Some(((start_row, start_col), (end_row, end_col))));
        }

        Ok(None)
    } else {
        Err("Neovim not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_cmdline(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        // Get command line using getcmdline() function
        let cmdline = nvim_state
            .nvim
            .command_output("echo getcmdline()")
            .await
            .map_err(|e| format!("Failed to get command line: {}", e))?;

        // Remove trailing newline that echo adds
        Ok(cmdline.trim_end().to_string())
    } else {
        Err("Neovim not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_debug_logs(state: tauri::State<'_, SharedState>) -> Result<Vec<String>, String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        let logs_guard = nvim_state.debug_logs.lock().await;
        Ok(logs_guard.clone())
    } else {
        Err("Neovim not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_last_error(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        // Get last error message from nvim
        let errmsg = nvim_state
            .nvim
            .command_output("echo v:errmsg")
            .await
            .map_err(|e| format!("Failed to get error: {}", e))?;

        Ok(errmsg.trim_end().to_string())
    } else {
        Err("Neovim not initialized".to_string())
    }
}

// Internal function to open file
pub async fn open_file_internal(
    app_handle: tauri::AppHandle,
    state: SharedState,
) -> Result<String, String> {
    use tauri::Emitter;
    use tauri_plugin_dialog::DialogExt;

    // Open file dialog
    let file_path = app_handle
        .dialog()
        .file()
        .add_filter("SQL files", &["sql"])
        .add_filter("All files", &["*"])
        .blocking_pick_file();

    if let Some(path) = file_path {
        let path_str = path
            .as_path()
            .map(|p| p.to_string_lossy().to_string())
            .ok_or("Invalid file path")?;

        // Load file into nvim
        let state_guard = state.lock().await;
        if let Some(nvim_state) = state_guard.as_ref() {
            nvim_state
                .nvim
                .command(&format!("edit {}", path_str))
                .await
                .map_err(|e| format!("Failed to open file in nvim: {}", e))?;

            // Emit event to notify frontend that file was opened
            let filename = std::path::Path::new(&path_str)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.clone());
            let _ = app_handle.emit("file-opened", serde_json::json!({
                "filename": filename,
                "path": path_str
            }));

            return Ok(path_str);
        } else {
            return Err("Neovim not initialized".to_string());
        }
    }

    Err("No file selected".to_string())
}

// Open a specific file path in nvim (no file picker)
#[tauri::command]
pub async fn open_file_path(
    state: tauri::State<'_, SharedState>,
    file_path: String,
) -> Result<(), String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        nvim_state
            .nvim
            .command(&format!("edit! {}", file_path))
            .await
            .map_err(|e| format!("Failed to open file: {}", e))?;
        Ok(())
    } else {
        Err("Neovim not initialized".to_string())
    }
}

#[tauri::command]
pub async fn open_file(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedState>,
) -> Result<String, String> {
    let state_arc: SharedState = (*state).clone();
    open_file_internal(app_handle, state_arc).await
}

// Execute the SQL capture function directly via Lua
#[tauri::command]
pub async fn capture_sql_statement(state: tauri::State<'_, SharedState>) -> Result<String, String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        // Simple lua command to get the statement
        let result = nvim_state
            .nvim
            .command_output("lua print(squeal_sql.get_stmt_under_cursor())")
            .await
            .map_err(|e| format!("Failed to execute Lua: {}", e))?;

        let trimmed = result.trim();
        if trimmed == "nil" || trimmed.is_empty() {
            return Err("No SQL statement found under cursor".to_string());
        }

        Ok(trimmed.to_string())
    } else {
        Err("Neovim not initialized".to_string())
    }
}

// Execute all SQL statements in the file
#[tauri::command]
pub async fn get_all_sql_statements(
    state: tauri::State<'_, SharedState>,
) -> Result<Vec<String>, String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        // Use vim.inspect to serialize the table to a string we can parse
        let result = nvim_state
            .nvim
            .command_output("lua print(vim.inspect(squeal_sql.get_all_statements()))")
            .await
            .map_err(|e| format!("Failed to execute Lua: {}", e))?;

        // Parse the vim.inspect output which looks like: { "stmt1", "stmt2" }
        let trimmed = result.trim();
        if trimmed == "{}" || trimmed == "nil" {
            return Ok(vec![]);
        }

        // Simple parsing - remove { } and split by ",
        let content = trimmed.trim_start_matches('{').trim_end_matches('}');
        let statements: Vec<String> = content
            .split("\", \"")
            .map(|s| s.trim().trim_matches('"').to_string())
            .filter(|s| !s.is_empty())
            .collect();

        Ok(statements)
    } else {
        Err("Neovim not initialized".to_string())
    }
}

// Get statement bounds under cursor for highlighting
#[tauri::command]
pub async fn get_statement_bounds(
    state: tauri::State<'_, SharedState>,
) -> Result<Option<StatementBounds>, String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        // Use vim.json.encode to get structured data
        let result = nvim_state
            .nvim
            .command_output("lua print(vim.json.encode(squeal_sql.get_stmt_info_under_cursor()))")
            .await
            .map_err(|e| format!("Failed to execute Lua: {}", e))?;

        let trimmed = result.trim();
        if trimmed == "null" || trimmed == "nil" || trimmed.is_empty() {
            return Ok(None);
        }

        // Parse the JSON response
        match serde_json::from_str::<StatementBounds>(trimmed) {
            Ok(bounds) => Ok(Some(bounds)),
            Err(e) => Err(format!("Failed to parse statement bounds: {}", e)),
        }
    } else {
        Err("Neovim not initialized".to_string())
    }
}

// Open a scratch buffer for editing cell content
#[tauri::command]
pub async fn open_scratch_buffer(
    state: tauri::State<'_, SharedState>,
    content: String,
    buffer_id: String,
) -> Result<(), String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        let nvim = &nvim_state.nvim;

        // Create a new scratch buffer with a unique name
        let buf_name = format!("squeal://cell-edit/{}", buffer_id);

        // Create new buffer
        nvim.command(&format!("enew"))
            .await
            .map_err(|e| format!("Failed to create new buffer: {}", e))?;

        // Set buffer name
        nvim.command(&format!("file {}", buf_name))
            .await
            .map_err(|e| format!("Failed to set buffer name: {}", e))?;

        // Set content
        let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
        let buf = nvim
            .get_current_buf()
            .await
            .map_err(|e| format!("Failed to get buffer: {}", e))?;

        buf.set_lines(0, -1, false, lines)
            .await
            .map_err(|e| format!("Failed to set buffer content: {}", e))?;

        // Set buffer as scratch (no file, can be closed without saving warning)
        nvim.command("setlocal buftype=acwrite")
            .await
            .map_err(|e| format!("Failed to set buftype: {}", e))?;
        nvim.command("setlocal bufhidden=wipe")
            .await
            .map_err(|e| format!("Failed to set bufhidden: {}", e))?;
        nvim.command("setlocal noswapfile")
            .await
            .map_err(|e| format!("Failed to set noswapfile: {}", e))?;

        // Set a buffer variable so we can identify it
        nvim.command(&format!("let b:squeal_edit_id = '{}'", buffer_id))
            .await
            .map_err(|e| format!("Failed to set buffer variable: {}", e))?;

        Ok(())
    } else {
        Err("Neovim not initialized".to_string())
    }
}

// Get content from the scratch buffer and close it
#[tauri::command]
pub async fn get_scratch_buffer_content(
    state: tauri::State<'_, SharedState>,
) -> Result<String, String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        let nvim = &nvim_state.nvim;

        // Check if current buffer is a squeal edit buffer
        let buf_name = nvim
            .command_output("echo expand('%:p')")
            .await
            .map_err(|e| format!("Failed to get buffer name: {}", e))?;

        if !buf_name.contains("squeal://cell-edit/") {
            return Err("Not in a squeal edit buffer".to_string());
        }

        // Get content
        let buf = nvim
            .get_current_buf()
            .await
            .map_err(|e| format!("Failed to get buffer: {}", e))?;

        let lines = buf
            .get_lines(0, -1, false)
            .await
            .map_err(|e| format!("Failed to get lines: {}", e))?;

        let content = lines.join("\n");

        // Close the buffer
        nvim.command("bwipeout!")
            .await
            .map_err(|e| format!("Failed to close buffer: {}", e))?;

        Ok(content)
    } else {
        Err("Neovim not initialized".to_string())
    }
}

// Check if currently in a scratch buffer and get its ID
#[tauri::command]
pub async fn get_scratch_buffer_id(
    state: tauri::State<'_, SharedState>,
) -> Result<Option<String>, String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        let nvim = &nvim_state.nvim;

        // Check if current buffer is a squeal edit buffer
        let buf_name = nvim
            .command_output("echo expand('%:p')")
            .await
            .map_err(|e| format!("Failed to get buffer name: {}", e))?;

        if !buf_name.contains("squeal://cell-edit/") {
            return Ok(None);
        }

        // Get the buffer ID from the variable
        let id_result = nvim
            .command_output("echo get(b:, 'squeal_edit_id', '')")
            .await
            .map_err(|e| format!("Failed to get buffer ID: {}", e))?;

        let id = id_result.trim().to_string();
        if id.is_empty() {
            return Ok(None);
        }

        Ok(Some(id))
    } else {
        Err("Neovim not initialized".to_string())
    }
}

// Tab management commands
use crate::nvim::state::BufferTab;

#[tauri::command]
pub async fn create_new_tab(
    state: tauri::State<'_, SharedState>,
    name: String,
    file_path: String,
) -> Result<BufferTab, String> {
    let mut state_guard = state.lock().await;
    if let Some(ref mut nvim_state) = state_guard.as_mut() {
        let tab_id = nvim_state.next_tab_id;
        nvim_state.next_tab_id += 1;

        let tab = BufferTab {
            id: tab_id,
            buffer_id: None,
            script_id: None,
            name,
            file_path,
            connection_id: None,
            is_modified: false,
            is_active: false, // Not active yet - will be switched to
        };

        nvim_state.tabs.push(tab.clone());

        Ok(tab)
    } else {
        Err("Neovim not initialized".to_string())
    }
}

#[tauri::command]
pub async fn switch_tab(
    state: tauri::State<'_, SharedState>,
    tab_id: i64,
) -> Result<String, String> {
    let mut state_guard = state.lock().await;
    if let Some(ref mut nvim_state) = state_guard.as_mut() {
        // Find the tab
        let file_path = if let Some(tab) = nvim_state.tabs.iter().find(|t| t.id == tab_id) {
            tab.file_path.clone()
        } else {
            return Err("Tab not found".to_string());
        };

        // Update active states
        for t in &mut nvim_state.tabs {
            t.is_active = t.id == tab_id;
        }

        Ok(file_path)
    } else {
        Err("Neovim not initialized".to_string())
    }
}

#[tauri::command]
pub async fn close_tab(
    state: tauri::State<'_, SharedState>,
    tab_id: i64,
) -> Result<Option<(i64, String)>, String> {
    let mut state_guard = state.lock().await;
    if let Some(ref mut nvim_state) = state_guard.as_mut() {
        // Find and remove the tab
        let tab_index = nvim_state
            .tabs
            .iter()
            .position(|t| t.id == tab_id)
            .ok_or("Tab not found")?;

        let was_active = nvim_state.tabs[tab_index].is_active;
        nvim_state.tabs.remove(tab_index);

        // If we closed the active tab, activate another one
        if was_active && !nvim_state.tabs.is_empty() {
            nvim_state.tabs[0].is_active = true;
            let new_path = nvim_state.tabs[0].file_path.clone();
            let new_id = nvim_state.tabs[0].id;
            Ok(Some((new_id, new_path)))
        } else {
            Ok(None)
        }
    } else {
        Err("Neovim not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_tabs(state: tauri::State<'_, SharedState>) -> Result<Vec<BufferTab>, String> {
    let state_guard = state.lock().await;
    if let Some(ref nvim_state) = state_guard.as_ref() {
        Ok(nvim_state.tabs.clone())
    } else {
        Err("Neovim not initialized".to_string())
    }
}

#[tauri::command]
pub async fn update_tab_connection(
    state: tauri::State<'_, SharedState>,
    tab_id: i64,
    connection_id: Option<i64>,
) -> Result<(), String> {
    let mut state_guard = state.lock().await;
    if let Some(ref mut nvim_state) = state_guard.as_mut() {
        if let Some(tab) = nvim_state.tabs.iter_mut().find(|t| t.id == tab_id) {
            tab.connection_id = connection_id;
            Ok(())
        } else {
            Err("Tab not found".to_string())
        }
    } else {
        Err("Neovim not initialized".to_string())
    }
}

// Insert text at the current cursor position in the active buffer
#[tauri::command]
pub async fn insert_text_at_cursor(
    state: tauri::State<'_, SharedState>,
    text: String,
) -> Result<(), String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        let nvim = &nvim_state.nvim;
        
        // Get cursor position
        let win = nvim.get_current_win().await
            .map_err(|e| format!("Failed to get window: {}", e))?;
        let (row, col) = win.get_cursor().await
            .map_err(|e| format!("Failed to get cursor: {}", e))?;
        
        // Get current buffer
        let buf = nvim.get_current_buf().await
            .map_err(|e| format!("Failed to get buffer: {}", e))?;
        
        // Get current line
        let lines = buf.get_lines(row as i64 - 1, row as i64, false).await
            .map_err(|e| format!("Failed to get lines: {}", e))?;
        
        if lines.is_empty() {
            return Err("Buffer is empty".to_string());
        }
        
        let current_line = &lines[0];
        let col_idx = col as usize;
        
        // Split the line at cursor position
        let before = &current_line[..col_idx.min(current_line.len())];
        let after = if col_idx < current_line.len() {
            &current_line[col_idx..]
        } else {
            ""
        };
        
        // Handle multi-line insert
        let new_text = format!("{}{}{}", before, text, after);
        let new_lines: Vec<String> = new_text.lines().map(|s| s.to_string()).collect();
        
        // Replace the line(s)
        buf.set_lines(row as i64 - 1, row as i64, false, new_lines.clone()).await
            .map_err(|e| format!("Failed to set lines: {}", e))?;
        
        // Move cursor to end of inserted text
        let last_line_idx = new_lines.len() - 1;
        let last_line = &new_lines[last_line_idx];
        let new_row = row + last_line_idx as i64;
        let new_col = if last_line_idx == 0 {
            // Single line insert - cursor at end of inserted text
            col + text.len() as i64
        } else {
            // Multi-line insert - cursor at end of last line
            last_line.len() as i64 - after.len() as i64
        };
        
        win.set_cursor((new_row, new_col.max(0))).await
            .map_err(|e| format!("Failed to set cursor: {}", e))?;
        
        Ok(())
    } else {
        Err("Neovim not initialized".to_string())
    }
}
