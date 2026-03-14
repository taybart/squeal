use crate::nvim::handler::NeovimHandler;
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
    SqlStatement(String),
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
    },
}

pub struct NeovimState {
    pub nvim: Neovim<Compat<WriteHalf<TcpStream>>>,
    pub nvim_process: Child,
    pub debug_logs: Arc<Mutex<Vec<String>>>,
    pub event_sender: mpsc::UnboundedSender<NvimEvent>,
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
                NvimEvent::SqlStatement(stmt) => {
                    let _ = app_handle_for_events.emit("sql-statement", stmt);
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
                            "visual_selection": visual_selection
                        }),
                    );
                }
            }
        }
    });

    // Start nvim with TCP server on the available port and capture stderr
    // Use --headless for no UI and -u to load local init.lua
    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current dir: {}", e))?;
    let config_dir = current_dir.join("../config");
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

    // Open the file if provided
    let path_to_open = file_path.unwrap_or_else(|| "test.sql".to_string());
    // Get project root - if we're in src-tauri, go up one level
    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current dir: {}", e))?;
    let project_root = if current_dir
        .file_name()
        .map(|n| n == "src-tauri")
        .unwrap_or(false)
    {
        current_dir.join("..")
    } else {
        current_dir
    };
    let full_path = project_root.join(&path_to_open);

    // Ensure the file exists (canonicalize requires the file to exist)
    if !full_path.exists() {
        std::fs::write(&full_path, "").map_err(|e| format!("Failed to create file: {}", e))?;
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
    *state_guard = Some(NeovimState {
        nvim,
        nvim_process,
        debug_logs,
        event_sender: event_sender.clone(),
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

                    // Join for change detection comparison
                    let content_joined = lines.join("\n");

                    // Check if anything changed
                    let content_changed = content_joined != last_content;
                    let mode_changed = mode != last_mode;
                    let cursor_changed = cursor != last_cursor;
                    let file_changed = file != last_file;

                    if content_changed || mode_changed || cursor_changed || file_changed {
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
                                "visual_selection": null // TODO: Add visual selection support
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
