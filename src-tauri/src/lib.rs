use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

mod menu;
mod nvim;

pub use nvim::{NeovimState, SharedState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize the shared state
    let state: SharedState = Arc::new(Mutex::new(None));
    let state_for_cleanup = state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            menu::add(app)?;
            #[cfg(debug_assertions)] // only include this code on debug builds
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
                window.close_devtools();
            }
            Ok(())
        })
        .manage(state)
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
            nvim::get_last_error
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
