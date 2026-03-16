use crate::get_squeal_base_dir;

#[tauri::command]
pub fn get_base_dir() -> String {
    get_squeal_base_dir().to_string_lossy().to_string()
}

#[tauri::command]
pub fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}
