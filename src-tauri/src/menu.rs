use crate::nvim::commands::open_file_internal;
use crate::nvim::state::SharedState;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{App, Emitter, Manager};

pub fn add(app: &mut App) -> Result<(), Box<dyn std::error::Error + 'static>> {
    // Create menu

    // File menu
    let open_file_item =
        MenuItem::with_id(app, "open_file", "Open File...", true, Some("CmdOrCtrl+O"))?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = PredefinedMenuItem::quit(app, None)?;
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[&open_file_item, &separator, &quit_item],
    )?;

    // Edit menu
    let undo_item = MenuItem::with_id(app, "undo", "Undo", true, Some("CmdOrCtrl+Z"))?;
    let redo_item = MenuItem::with_id(app, "redo", "Redo", true, Some("CmdOrCtrl+Shift+Z"))?;
    let edit_separator = PredefinedMenuItem::separator(app)?;
    let cut_item = MenuItem::with_id(app, "cut", "Cut", true, Some("CmdOrCtrl+X"))?;
    let copy_item = MenuItem::with_id(app, "copy", "Copy", true, Some("CmdOrCtrl+C"))?;
    let paste_item = MenuItem::with_id(app, "paste", "Paste", true, Some("CmdOrCtrl+V"))?;
    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &undo_item,
            &redo_item,
            &edit_separator,
            &cut_item,
            &copy_item,
            &paste_item,
        ],
    )?;

    // View menu
    let toggle_sql_item = MenuItem::with_id(app, "toggle_sql", "Toggle SQL Results", true, Some("CmdOrCtrl+1"))?;
    let toggle_explorer_item = MenuItem::with_id(app, "toggle_explorer", "Toggle Explorer", true, Some("CmdOrCtrl+2"))?;
    let toggle_scripts_item = MenuItem::with_id(app, "toggle_scripts", "Toggle Scripts", true, Some("CmdOrCtrl+3"))?;
    let toggle_debug_item = MenuItem::with_id(app, "toggle_debug", "Toggle Debug", true, Some("CmdOrCtrl+4"))?;
    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &toggle_sql_item,
            &toggle_explorer_item,
            &toggle_scripts_item,
            &toggle_debug_item,
        ],
    )?;

    // SQL menu
    let run_line_item = MenuItem::with_id(app, "run_line", "Run Line", true, Some("CmdOrCtrl+E"))?;
    let execute_file_item = MenuItem::with_id(app, "execute_file", "Execute File", true, Some("CmdOrCtrl+Shift+E"))?;
    let sql_menu = Submenu::with_items(
        app,
        "SQL",
        true,
        &[
            &run_line_item,
            &execute_file_item,
        ],
    )?;

    // Settings menu
    let settings_item = MenuItem::with_id(app, "settings", "Settings...", true, Some("CmdOrCtrl+,"))?;
    let settings_separator = PredefinedMenuItem::separator(app)?;
    let connections_item = MenuItem::with_id(app, "connections", "Connections", true, None::<&str>)?;
    let settings_menu = Submenu::with_items(
        app,
        "Settings",
        true,
        &[&settings_item, &settings_separator, &connections_item],
    )?;

    // Create the menu
    let menu = Menu::with_items(app, &[&file_menu, &edit_menu, &view_menu, &sql_menu, &settings_menu])?;

    // Set menu event handler
    app.on_menu_event(move |app_handle, event| {
        let event_id = event.id().as_ref();
        match event_id {
            "open_file" => {
                let app_handle = app_handle.clone();
                let app_handle_clone = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let state: tauri::State<'_, SharedState> = app_handle.state::<SharedState>();
                    let state_arc: SharedState = (*state).clone();
                    let _ = open_file_internal(app_handle_clone, state_arc).await;
                });
            }
            "undo" => {
                let app_handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let state: tauri::State<'_, SharedState> = app_handle.state::<SharedState>();
                    let state_arc: SharedState = (*state).clone();
                    let _ = send_keys_to_nvim(state_arc, "u").await;
                });
            }
            "redo" => {
                let app_handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let state: tauri::State<'_, SharedState> = app_handle.state::<SharedState>();
                    let state_arc: SharedState = (*state).clone();
                    let _ = send_keys_to_nvim(state_arc, "<C-r>").await;
                });
            }
            "cut" => {
                // Handled by frontend
            }
            "copy" => {
                // Handled by frontend
            }
            "paste" => {
                // Handled by frontend
            }
            "toggle_sql" => {
                let _ = app_handle.emit("menu-toggle-sql", ());
            }
            "toggle_explorer" => {
                let _ = app_handle.emit("menu-toggle-explorer", ());
            }
            "toggle_scripts" => {
                let _ = app_handle.emit("menu-toggle-scripts", ());
            }
            "toggle_debug" => {
                let _ = app_handle.emit("menu-toggle-debug", ());
            }
            "run_line" => {
                let _ = app_handle.emit("menu-run-line", ());
            }
            "execute_file" => {
                let _ = app_handle.emit("menu-execute-file", ());
            }
            "settings" => {
                let app_handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = crate::open_settings_window_impl(app_handle).await {
                        eprintln!("Failed to open settings window: {}", e);
                    }
                });
            }
            "connections" => {
                let app_handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = crate::open_settings_window_impl(app_handle.clone()).await {
                        eprintln!("Failed to open settings window: {}", e);
                        return;
                    }
                    // Emit event to focus on connections section
                    let _ = app_handle.emit("focus-connections", ());
                });
            }
            _ => {}
        }
    });

    // Set as app menu on macOS, window menu on Linux/Windows
    #[cfg(target_os = "macos")]
    {
        menu.set_as_app_menu()?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        if let Some(window) = app.get_webview_window("main") {
            window.set_menu(menu)?;
        }
    }
    Ok(())
}

// Helper function for menu handlers
async fn send_keys_to_nvim(state: SharedState, keys: &str) -> Result<(), String> {
    let state_guard = state.lock().await;
    if let Some(nvim_state) = state_guard.as_ref() {
        nvim_state
            .nvim
            .input(keys)
            .await
            .map_err(|e| format!("Failed to send keys: {}", e))?;
        Ok(())
    } else {
        // Silently ignore when Neovim is not initialized (e.g., during startup or window switching)
        Ok(())
    }
}