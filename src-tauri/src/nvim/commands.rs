use crate::nvim::state::SharedState;

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
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        // Use nvim_input for proper key processing including special keys
        nvim_state
            .nvim
            .input(&keys)
            .await
            .map_err(|e| format!("Failed to send keys: {}", e))?;

        Ok(())
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
            let _ = app_handle.emit("file-opened", filename);

            return Ok(path_str);
        } else {
            return Err("Neovim not initialized".to_string());
        }
    }

    Err("No file selected".to_string())
}

#[tauri::command]
pub async fn open_file(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedState>,
) -> Result<String, String> {
    let state_arc: SharedState = (*state).clone();
    open_file_internal(app_handle, state_arc).await
}
