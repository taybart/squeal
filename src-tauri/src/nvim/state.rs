use crate::nvim::handler::NeovimHandler;
use nvim_rs::{compat::tokio::Compat, create::tokio as create, Neovim, UiAttachOptions};
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
            let payload = match event {
                NvimEvent::Redraw(data) => format!("{:?}", data),
                NvimEvent::ModeChange(mode) => mode,
                NvimEvent::CursorMove(row, col) => format!("{}, {}", row, col),
                NvimEvent::BufUpdate(lines) => lines.join("\n"),
            };
            let _ = app_handle_for_events.emit("nvim-event", payload);
        }
    });

    // Start nvim with TCP server on the available port and capture stderr
    // Use --headless for no UI and -u to load local init.lua
    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current dir: {}", e))?;
    let init_lua_path = current_dir.join("../init.lua");
    let mut nvim_process = tokio::process::Command::new("nvim")
        .args([
            "--headless",
            "--listen",
            &listen_addr,
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
    tokio::spawn(async move {
        if let Err(e) = join_handle.await {
        }
    });

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
        Ok(Ok(())) => {
        }
        Ok(Err(e)) => {
            return Err(format!("Failed to open file: {}", e));
        }
        Err(_) => {
        }
    }

    // Store the Neovim state with the nvim instance
    let mut state_guard = state.lock().await;
    *state_guard = Some(NeovimState {
        nvim,
        nvim_process,
        debug_logs,
        event_sender,
    });
    drop(state_guard);

    Ok(())
}
