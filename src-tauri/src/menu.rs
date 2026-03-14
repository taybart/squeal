use crate::nvim::commands::open_file_internal;
use crate::nvim::state::SharedState;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{App, Manager};

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

    // Create the menu
    let menu = Menu::with_items(app, &[&file_menu, &edit_menu])?;

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
        Err("Neovim not initialized".to_string())
    }
}
