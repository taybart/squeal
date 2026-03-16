use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

mod database;
mod db_commands;
mod menu;
mod nvim;
mod commands;

pub use database::{DatabaseManager, SharedDbManager};
pub use nvim::{NeovimState, SharedState};

/// Get the squeal base directory (_squeal folder in project root)
/// This is where all configuration, scripts, and database files are stored
pub fn get_squeal_base_dir() -> PathBuf {
    let current_dir = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    
    // If we're in src-tauri, go up one level to project root
    let project_root = if current_dir
        .file_name()
        .map(|n| n == "src-tauri")
        .unwrap_or(false)
    {
        current_dir.join("..")
    } else {
        current_dir
    };
    
    project_root.join("_squeal")
}

/// Get the squeal base directory as a string (for frontend)
// #[tauri::command]
// pub fn get_base_dir() -> String {
//     get_squeal_base_dir().to_string_lossy().to_string()
// }

/// Get the config directory within the squeal base directory
pub fn get_config_dir() -> PathBuf {
    get_squeal_base_dir().join("config")
}

// Internal implementation to open or focus the settings window
pub async fn open_settings_window_impl(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(settings_window) = app.get_webview_window("settings") {
        // Window already exists, show and focus it
        settings_window
            .show()
            .map_err(|e| format!("Failed to show settings window: {}", e))?;
        settings_window
            .set_focus()
            .map_err(|e| format!("Failed to focus settings window: {}", e))?;
        Ok(())
    } else {
        // Need to create the window
        let window_builder = tauri::WebviewWindowBuilder::new(
            &app,
            "settings",
            tauri::WebviewUrl::App("settings.html".into()),
        )
        .title("Settings")
        .inner_size(500.0, 600.0)
        .resizable(true)
        .visible(true);
        
        window_builder
            .build()
            .map_err(|e| format!("Failed to create settings window: {}", e))?;
        
        Ok(())
    }
}

// Command wrapper for the settings window
#[tauri::command]
async fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    open_settings_window_impl(app).await
}

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
            let _app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Get squeal base directory (_squeal folder)
                let base_dir = get_squeal_base_dir();
                
                // Ensure the base directory exists
                if let Err(e) = std::fs::create_dir_all(&base_dir) {
                    eprintln!("Failed to create base directory {:?}: {}", base_dir, e);
                    return;
                }
                
                // Create scripts directory if it doesn't exist
                let scripts_dir = base_dir.join("scripts");
                if let Err(e) = std::fs::create_dir_all(&scripts_dir) {
                    eprintln!("Failed to create scripts directory {:?}: {}", scripts_dir, e);
                }
                
                // Create archived_connections directory if it doesn't exist
                let archived_dir = base_dir.join("archived_connections");
                if let Err(e) = std::fs::create_dir_all(&archived_dir) {
                    eprintln!("Failed to create archived_connections directory {:?}: {}", archived_dir, e);
                }

                let db_path = base_dir.join("squeal.db");
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
            open_settings_window,
            commands::get_base_dir,
            commands::file_exists,
            commands::write_file,
            nvim::commands::start_nvim,
            nvim::commands::send_keys,
            nvim::commands::get_buffer_content,
            nvim::commands::set_buffer_content,
            nvim::commands::execute_command,
            nvim::commands::get_mode,
            nvim::commands::get_cursor,
            nvim::commands::get_visual_selection,
            nvim::commands::get_cmdline,
            nvim::commands::open_file,
            nvim::commands::get_current_file,
            nvim::commands::get_debug_logs,
            nvim::commands::get_last_error,
            nvim::commands::capture_sql_statement,
            nvim::commands::get_all_sql_statements,
            nvim::commands::get_statement_bounds,
            nvim::commands::open_scratch_buffer,
            nvim::commands::get_scratch_buffer_content,
            nvim::commands::get_scratch_buffer_id,
            nvim::commands::create_new_tab,
            nvim::commands::switch_tab,
            nvim::commands::close_tab,
            nvim::commands::get_tabs,
            nvim::commands::update_tab_connection,
            nvim::commands::open_file_path,
            nvim::commands::insert_text_at_cursor,
            db_commands::add_connection,
            db_commands::list_connections,
            db_commands::delete_connection,
            db_commands::test_connection,
            db_commands::execute_sql,
            db_commands::list_tables,
            db_commands::get_table_schema,
            db_commands::update_row,
            db_commands::create_script,
            db_commands::list_scripts,
            db_commands::get_script,
            db_commands::update_script_connection,
            db_commands::delete_script,
            db_commands::get_app_state,
            db_commands::save_app_state,
            db_commands::set_theme,
            db_commands::save_custom_theme,
            db_commands::clear_custom_theme,
            db_commands::sync_scripts_with_db,
            db_commands::create_script_file,
            db_commands::read_script_file,
            db_commands::delete_script_file,
            db_commands::write_script_file
        ])
        .on_window_event(move |window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Only kill Neovim when the main window is destroyed, not the settings window
                if window.label() == "main" {
                    let state = state_for_cleanup.clone();
                    tauri::async_runtime::spawn(async move {
                        let mut state_guard = state.lock().await;
                        if let Some(mut nvim_state) = state_guard.take() {
                            let _ = nvim_state.nvim_process.kill().await;
                        }
                    });
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
