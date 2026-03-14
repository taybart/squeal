use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

mod database;
mod db_commands;
mod menu;
mod nvim;

pub use database::{DatabaseManager, SharedDbManager};
pub use nvim::{NeovimState, SharedState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize the shared state
    let state: SharedState = Arc::new(Mutex::new(None));
    let state_for_cleanup = state.clone();

    // Initialize the database manager
    let db_manager: SharedDbManager = Arc::new(Mutex::new(None));
    let db_manager_for_init = db_manager.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            menu::add(app)?;

            // Initialize database
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Get project root directory
                let current_dir =
                    std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

                // If we're in src-tauri, go up one level
                let project_root = if current_dir
                    .file_name()
                    .map(|n| n == "src-tauri")
                    .unwrap_or(false)
                {
                    current_dir.join("..")
                } else {
                    current_dir
                };

                let db_path = project_root.join("squeal.db");
                eprintln!("Initializing database at: {:?}", db_path);

                match DatabaseManager::new(&db_path).await {
                    Ok(manager) => {
                        let mut guard = db_manager_for_init.lock().await;
                        *guard = Some(manager);
                        eprintln!("Database initialized successfully");
                    }
                    Err(e) => {
                        eprintln!("Failed to initialize database at {:?}: {}", db_path, e);
                    }
                }
            });

            #[cfg(debug_assertions)] // only include this code on debug builds
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
                window.close_devtools();
            }
            Ok(())
        })
        .manage(state)
        .manage(db_manager)
        .invoke_handler(tauri::generate_handler![
            nvim::start_nvim,
            nvim::send_keys,
            nvim::get_buffer_content,
            nvim::set_buffer_content,
            nvim::execute_command,
            nvim::get_mode,
            nvim::get_cursor,
            nvim::get_visual_selection,
            nvim::get_cmdline,
            nvim::open_file,
            nvim::get_current_file,
            nvim::get_debug_logs,
            nvim::get_last_error,
            nvim::capture_sql_statement,
            nvim::get_all_sql_statements,
            db_commands::add_connection,
            db_commands::list_connections,
            db_commands::delete_connection,
            db_commands::test_connection,
            db_commands::execute_sql,
            db_commands::list_tables,
            db_commands::get_table_schema
        ])
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = state_for_cleanup.clone();
                tauri::async_runtime::spawn(async move {
                    let mut state_guard = state.lock().await;
                    if let Some(mut nvim_state) = state_guard.take() {
                        let _ = nvim_state.nvim_process.kill().await;
                    }
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
