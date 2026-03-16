use crate::nvim::handler::NeovimHandler;
use crate::get_config_dir;
use nvim_rs::{compat::tokio::Compat, create::tokio as create, Neovim};
use std::process::Stdio;
use std::sync::Arc;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader, WriteHalf};
use tokio::net::TcpListener;
use tokio::net::TcpStream;
use tokio::process::Child;
use tokio::sync::mpsc;
use tokio::sync::Mutex;

#[derive(Clone, Debug)]
pub enum NvimEvent {
    Redraw(Vec<rmpv::Value>),
    ModeChange(String),
    CursorMove(i64, i64),
    BufUpdate(Vec<String>),
    SqlStatement {
        text: String,
        start_row: i64,
        start_col: i64,
        end_row: i64,
        end_col: i64,
    },
    SqlExecute {
        statements: Vec<String>,
        mode: String,
    },
    StateUpdate {
        content: Vec<String>,
        mode: String,
        cursor: (i64, i64),
        cmdline: String,
        current_file: String,
        error: String,
        visual_selection: Option<((i64, i64), (i64, i64))>,
        statement_bounds: Option<crate::nvim::commands::StatementBounds>,
    },
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct BufferTab {
    pub id: i64,                      // Unique tab ID
    pub buffer_id: Option<i64>,       // Nvim buffer handle
    pub script_id: Option<i64>,       // Associated script (if saved)
    pub name: String,                 // Display name
    pub file_path: String,            // Full path to file
    pub connection_id: Option<i64>,   // Associated connection
    pub is_modified: bool,
    pub is_active: bool,
}

pub struct NeovimState {
    pub nvim: Neovim<Compat<WriteHalf<TcpStream>>>,
    pub nvim_process: Child,
    pub debug_logs: Arc<Mutex<Vec<String>>>,
    pub event_sender: mpsc::UnboundedSender<NvimEvent>,
    pub tabs: Vec<BufferTab>,           // Multiple buffer tabs
    pub next_tab_id: i64,             // Counter for unique tab IDs
}

// State type alias
pub type SharedState = Arc<Mutex<Option<NeovimState>>>;

pub async fn start_nvim_instance(
    state: SharedState,
    file_path: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // Check if nvim is already running and kill it if so
    {
        let mut state_guard = state.lock().await;
        if let Some(mut old_state) = state_guard.take() {
            // Kill the old nvim process
            let _ = old_state.nvim_process.kill().await;
        }
    }

    // Find an available port
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind to find available port: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get local address: {}", e))?
        .port();
    drop(listener);

    let listen_addr = format!("127.0.0.1:{}", port);

    // Create shared log storage
    let debug_logs = Arc::new(Mutex::new(Vec::<String>::new()));
    let logs_for_capture = debug_logs.clone();

    // Create event channel
    let (event_sender, mut event_receiver) = mpsc::unbounded_channel::<NvimEvent>();
    let event_sender_for_handler = event_sender.clone();

    // Spawn event forwarder to emit tauri events
    let app_handle_for_events = app_handle.clone();
    tokio::spawn(async move {
        while let Some(event) = event_receiver.recv().await {
            match event {
                NvimEvent::Redraw(_data) => {
                    // Redraw events - not currently used for UI
                }
                NvimEvent::ModeChange(mode) => {
                    let _ = app_handle_for_events.emit("nvim-mode-change", mode);
                }
                NvimEvent::CursorMove(row, col) => {
                    let _ =
                        app_handle_for_events.emit("nvim-cursor-move", format!("{}, {}", row, col));
                }
                NvimEvent::BufUpdate(lines) => {
                    let _ = app_handle_for_events.emit("nvim-buf-update", lines.join("\n"));
                }
                NvimEvent::SqlStatement { text, start_row, start_col, end_row, end_col } => {
                    let _ = app_handle_for_events.emit(
                        "sql-statement",
                        serde_json::json!({
                            "text": text,
                            "start_row": start_row,
                            "start_col": start_col,
                            "end_row": end_row,
                            "end_col": end_col
                        }),
                    );
                }
                NvimEvent::SqlExecute { statements, mode } => {
                    let _ = app_handle_for_events.emit(
                        "sql-execute",
                        serde_json::json!({
                            "statements": statements,
                            "mode": mode
                        }),
                    );
                }
                NvimEvent::StateUpdate {
                    content,
                    mode,
                    cursor,
                    cmdline,
                    current_file,
                    error,
                    visual_selection,
                    statement_bounds,
                } => {
                    let _ = app_handle_for_events.emit(
                        "nvim-state-update",
                        serde_json::json!({
                            "content": content,
                            "mode": mode,
                            "cursor": cursor,
                            "cmdline": cmdline,
                            "current_file": current_file,
                            "error": error,
                            "visual_selection": visual_selection,
                            "statement_bounds": statement_bounds
                        }),
                    );
                }
            }
        }
    });

    // Start nvim with TCP server on the available port and capture stderr
    // Use --headless for no UI and -u to load local init.lua
    let config_dir = get_config_dir();
    let init_lua_path = config_dir.join("init.lua");

    // Build runtimepath: include our config dir first, then default paths
    let rtp_cmd = format!("set runtimepath^={}", config_dir.display());

    let mut nvim_process = tokio::process::Command::new("nvim")
        .args([
            "--headless",
            "--listen",
            &listen_addr,
            "--cmd", // Set runtimepath BEFORE loading init.lua
            &rtp_cmd,
            "-u",
            &init_lua_path.to_string_lossy(),
        ])
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Neovim TCP server: {}", e))?;

    // Capture stderr for debugging
    if let Some(stderr) = nvim_process.stderr.take() {
        let logs = logs_for_capture;
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                let mut logs_guard = logs.lock().await;
                logs_guard.push(line);
                // Keep only last 1000 lines to prevent memory bloat
                if logs_guard.len() > 1000 {
                    logs_guard.remove(0);
                }
            }
        });
    }

    // Give nvim a moment to start
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    // Create handler for Neovim events with the event sender
    let handler = NeovimHandler::new(event_sender_for_handler);

    // Connect to the TCP server
    let (nvim, join_handle) = create::new_tcp(&listen_addr, handler).await.map_err(|e| {
        format!(
            "Failed to connect to Neovim TCP server at {}: {}",
            listen_addr, e
        )
    })?;

    // Spawn the join_handle to process nvim events in the background
    // This is critical - without it, nvim will block when its output buffer fills up
    tokio::spawn(async move { if let Err(_e) = join_handle.await {} });

    /*
    // Attach UI - this causes nvim to stop responding to commands
    // Commenting out until we can figure out the issue
    eprintln!("Attaching UI...");
    nvim.set_client_info("squeal", vec![], "remote", vec![], vec![])
        .await
        .map_err(|e| format!("Failed to set client info: {}", e))?;
    let mut ui_opts = UiAttachOptions::new();
    ui_opts.set_rgb(true);
    nvim.ui_attach(80, 24, &ui_opts)
        .await
        .map_err(|e| format!("Failed to attach UI: {}", e))?;
    eprintln!("UI attached successfully");

    // Give nvim time to fully initialize after UI attach
    tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
    */

    // Open the file if provided, otherwise create a default scratch file in _squeal/scripts
    let base_dir = crate::get_squeal_base_dir();
    let scripts_dir = base_dir.join("scripts");
    
    // Ensure scripts directory exists
    std::fs::create_dir_all(&scripts_dir)
        .map_err(|e| format!("Failed to create scripts directory: {}", e))?;
    
    let full_path = if let Some(path) = file_path {
        // If a specific path is provided, use it
        if std::path::Path::new(&path).is_absolute() {
            std::path::PathBuf::from(path)
        } else {
            scripts_dir.join(path)
        }
    } else {
        // Default to a scratch file in _squeal/scripts
        scripts_dir.join("scratch.sql")
    };
    
    // Ensure the parent directory exists
    if let Some(parent) = full_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

    // Ensure the file exists (canonicalize requires the file to exist)
    if !full_path.exists() {
        std::fs::write(&full_path, "-- New SQL script\n")
            .map_err(|e| format!("Failed to create file: {}", e))?;
    }

    // Canonicalize to resolve .. and get absolute path
    let full_path = full_path
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize path: {}", e))?;

    // Test if nvim is responsive first
    let test_result = tokio::time::timeout(
        tokio::time::Duration::from_secs(3),
        nvim.command_output("echo 'test'"),
    )
    .await;

    // Use edit! to force open and ignore swapfiles
    let result = tokio::time::timeout(
        tokio::time::Duration::from_secs(5),
        nvim.command(&format!("edit! {}", full_path.display())),
    )
    .await;

    match result {
        Ok(Ok(())) => {}
        Ok(Err(e)) => {
            return Err(format!("Failed to open file: {}", e));
        }
        Err(_) => {}
    }

    // Store the Neovim state with the nvim instance
    let mut state_guard = state.lock().await;
    
    // Create the initial tab for the opened file
    let initial_tab = BufferTab {
        id: 1,
        buffer_id: None, // Will be populated later
        script_id: None,
        name: full_path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unnamed".to_string()),
        file_path: full_path.to_string_lossy().to_string(),
        connection_id: None,
        is_modified: false,
        is_active: true,
    };
    
    *state_guard = Some(NeovimState {
        nvim,
        nvim_process,
        debug_logs,
        event_sender: event_sender.clone(),
        tabs: vec![initial_tab],
        next_tab_id: 2,
    });
    drop(state_guard);

    // Spawn backend polling task to push updates to frontend
    let state_for_polling: SharedState = state.clone();
    let app_handle_for_polling = app_handle.clone();
    tokio::spawn(async move {
        let mut last_content = String::new();
        let mut last_mode = String::new();
        let mut last_cursor: (i64, i64) = (0, 0);
        let mut last_file = String::new();
        let mut last_cmdline = String::new();
        let mut last_visual_selection: Option<((i64, i64), (i64, i64))> = None;

        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

            let state_guard = state_for_polling.lock().await;
            if let Some(nvim_state) = state_guard.as_ref() {
                let nvim = &nvim_state.nvim;

                // Get all state using nvim API directly for lines
                let lines_result: Result<Vec<String>, String> = async {
                    let buf = nvim
                        .get_current_buf()
                        .await
                        .map_err(|e| format!("Failed to get buffer: {}", e))?;
                    let line_count = buf
                        .line_count()
                        .await
                        .map_err(|e| format!("Failed to get line count: {}", e))?;

                    let mut lines = Vec::new();
                    for i in 0..line_count {
                        let line = buf
                            .get_lines(i, i + 1, false)
                            .await
                            .map_err(|e| format!("Failed to get line {}: {}", i, e))?;
                        if let Some(first) = line.first() {
                            lines.push(first.clone());
                        }
                    }
                    Ok(lines)
                }
                .await;
                let mode_result = nvim.command_output("echo mode()").await;
                let cursor_result = nvim.command_output("echo line('.') . ',' . col('.')").await;
                let file_result = nvim.command_output("echo expand('%:t')").await;
                let cmdline_result = nvim.command_output("echo getcmdline()").await;
                let error_result = nvim.command_output("echo v:errmsg").await;

                // Parse cursor position early to check if we need bounds
                let cursor_pos = if let Ok(ref cursor_str) = cursor_result {
                    let cursor_parts: Vec<&str> = cursor_str.trim().split(',').collect();
                    if cursor_parts.len() == 2 {
                        let row = cursor_parts[0].parse::<i64>().unwrap_or(1) - 1;
                        let col = cursor_parts[1].parse::<i64>().unwrap_or(0) - 1;
                        Some((row, col))
                    } else {
                        None
                    }
                } else {
                    None
                };

                // Check if cursor changed before dropping state_guard
                let cursor_changed = cursor_pos.map(|c| c != last_cursor).unwrap_or(false);
                let content_joined_for_check = if let Ok(ref lines) = lines_result {
                    lines.join("\n")
                } else {
                    String::new()
                };
                let content_changed = content_joined_for_check != last_content;
                
                // Fetch statement bounds before dropping state_guard (if cursor or content changed)
                let statement_bounds = if (cursor_changed || content_changed) && cursor_pos.is_some() {
                    let bounds_result = nvim.command_output(
                        "lua print(vim.json.encode(squeal_sql.get_stmt_info_under_cursor()))"
                    ).await;
                    
                    match bounds_result {
                        Ok(bounds_str) => {
                            let trimmed = bounds_str.trim();
                            if trimmed != "null" && trimmed != "nil" && !trimmed.is_empty() {
                                match serde_json::from_str::<crate::nvim::commands::StatementBounds>(trimmed) {
                                    Ok(bounds) => Some(bounds),
                                    Err(_) => None,
                                }
                            } else {
                                None
                            }
                        }
                        Err(_) => None,
                    }
                } else {
                    None
                };

                // Fetch visual selection if in visual mode (before dropping state_guard)
                let visual_selection_result = if let Ok(ref mode_str) = mode_result {
                    let mode = mode_str.trim();
                    if mode == "v" || mode == "V" || mode == "\x16" {
                        let start_result = nvim.command_output("echo getpos('v')[1] . ',' . getpos('v')[2]").await;
                        let end_result = nvim.command_output("echo line('.') . ',' . col('.')").await;
                        
                        if let (Ok(start_str), Ok(end_str)) = (start_result, end_result) {
                            let start_parts: Vec<&str> = start_str.trim().split(',').collect();
                            let end_parts: Vec<&str> = end_str.trim().split(',').collect();
                            
                            if start_parts.len() == 2 && end_parts.len() == 2 {
                                let start_row = start_parts[0].parse::<i64>().unwrap_or(1) - 1;
                                let start_col = start_parts[1].parse::<i64>().unwrap_or(0) - 1;
                                let end_row = end_parts[0].parse::<i64>().unwrap_or(1) - 1;
                                let end_col = end_parts[1].parse::<i64>().unwrap_or(0) - 1;
                                Ok(((start_row, start_col), (end_row, end_col)))
                            } else {
                                Err("Invalid visual selection format".to_string())
                            }
                        } else {
                            Err("Failed to get visual selection".to_string())
                        }
                    } else {
                        Err("Not in visual mode".to_string())
                    }
                } else {
                    Err("No mode result".to_string())
                };

                drop(state_guard);

                if let (
                    Ok(lines),
                    Ok(mode_str),
                    Ok(cursor_str),
                    Ok(file_str),
                    Ok(cmdline_str),
                    Ok(error_str),
                ) = (
                    lines_result,
                    mode_result,
                    cursor_result,
                    file_result,
                    cmdline_result,
                    error_result,
                ) {
                    let mode = mode_str.trim().to_string();
                    let file = file_str.trim().to_string();
                    let cmdline = cmdline_str.trim().to_string();
                    let error = if error_str.trim() == "v:errmsg" {
                        "".to_string()
                    } else {
                        error_str.trim().to_string()
                    };

                    // Parse cursor position
                    let cursor_parts: Vec<&str> = cursor_str.trim().split(',').collect();
                    let cursor = if cursor_parts.len() == 2 {
                        let row = cursor_parts[0].parse::<i64>().unwrap_or(1) - 1;
                        let col = cursor_parts[1].parse::<i64>().unwrap_or(0) - 1;
                        (row, col)
                    } else {
                        (0, 0)
                    };

                    // Get visual selection from pre-fetched result
                    let visual_selection = match visual_selection_result {
                        Ok(vs) => Some(vs),
                        Err(_) => None,
                    };

                    // Join for change detection comparison
                    let content_joined = lines.join("\n");

                    // Check if anything changed
                    let content_changed = content_joined != last_content;
                    let mode_changed = mode != last_mode;
                    let cursor_changed = cursor != last_cursor;
                    let file_changed = file != last_file;
                    let cmdline_changed = cmdline != last_cmdline;
                    let visual_changed = visual_selection != last_visual_selection;

                    if content_changed || mode_changed || cursor_changed || file_changed || cmdline_changed || visual_changed {
                        // Send StateUpdate event
                        let result = app_handle_for_polling.emit(
                            "nvim-state-update",
                            serde_json::json!({
                                "content": lines,
                                "mode": mode,
                                "cursor": cursor,
                                "cmdline": cmdline,
                                "current_file": file,
                                "error": error,
                                "visual_selection": visual_selection,
                                "statement_bounds": statement_bounds
                            }),
                        );

                        if let Err(e) = result {
                            eprintln!("Poller - failed to emit event: {:?}", e);
                        }

                        // Update last known values
                        if content_changed {
                            last_content = content_joined;
                        }
                        if mode_changed {
                            last_mode = mode;
                        }
                        if cursor_changed {
                            last_cursor = cursor;
                        }
                        if file_changed {
                            last_file = file;
                        }
                        if cmdline_changed {
                            last_cmdline = cmdline;
                        }
                        if visual_changed {
                            last_visual_selection = visual_selection;
                        }
                    }
                }
            } else {
                // Nvim not initialized, stop polling
                break;
            }
        }
    });

    Ok(())
}
