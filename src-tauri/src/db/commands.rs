use crate::database::{DatabaseManager, NewDbConnection, SharedDbManager};
use sqlx::{Column, Row};

#[tauri::command]
pub async fn add_connection(
    db_manager: tauri::State<'_, SharedDbManager>,
    name: String,
    db_type: String,
    connection_string: String,
) -> Result<crate::database::DbConnection, String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    let connection = NewDbConnection {
        name,
        db_type,
        connection_string,
    };

    manager.add_connection(connection).await
}

#[tauri::command]
pub async fn list_connections(
    db_manager: tauri::State<'_, SharedDbManager>,
) -> Result<Vec<crate::database::DbConnection>, String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    manager.list_connections().await
}

#[tauri::command]
pub async fn delete_connection(
    db_manager: tauri::State<'_, SharedDbManager>,
    id: i64,
) -> Result<(), String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    manager.delete_connection(id).await
}

#[tauri::command]
pub async fn test_connection(db_type: String, connection_string: String) -> Result<(), String> {
    // Test without saving - just validate the connection works
    DatabaseManager::test_connection(&db_type, &connection_string).await
}

#[tauri::command]
pub async fn execute_sql(
    db_manager: tauri::State<'_, SharedDbManager>,
    connection_id: i64,
    sql: String,
) -> Result<serde_json::Value, String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    let conn = manager
        .get_connection(connection_id)
        .await?
        .ok_or("Connection not found")?;

    match conn.db_type.as_str() {
        "sqlite" => {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect(&conn.connection_string)
                .await
                .map_err(|e| format!("Failed to connect: {}", e))?;

            // Try to execute as a query first
            let query_result: Result<Vec<sqlx::sqlite::SqliteRow>, _> =
                sqlx::query(&sql).fetch_all(&pool).await;

            match query_result {
                Ok(rows) => {
                    // It's a SELECT query - return results
                    let columns: Vec<String> = rows
                        .get(0)
                        .map(|row| {
                            row.columns()
                                .iter()
                                .map(|col| col.name().to_string())
                                .collect()
                        })
                        .unwrap_or_default();

                    let data: Vec<Vec<serde_json::Value>> = rows
                        .into_iter()
                        .map(|row| {
                            columns
                                .iter()
                                .enumerate()
                                .map(|(idx, _)| {
                                    // Try different types
                                    if let Ok(val) = row.try_get::<String, _>(idx) {
                                        serde_json::Value::String(val)
                                    } else if let Ok(val) = row.try_get::<i64, _>(idx) {
                                        serde_json::Value::Number(val.into())
                                    } else if let Ok(val) = row.try_get::<f64, _>(idx) {
                                        serde_json::Number::from_f64(val)
                                            .map(serde_json::Value::Number)
                                            .unwrap_or(serde_json::Value::Null)
                                    } else if let Ok(val) = row.try_get::<bool, _>(idx) {
                                        serde_json::Value::Bool(val)
                                    } else {
                                        serde_json::Value::Null
                                    }
                                })
                                .collect()
                        })
                        .collect();

                    pool.close().await;
                    Ok(serde_json::json!({
                        "columns": columns,
                        "data": data,
                        "rows_affected": null,
                        "is_query": true
                    }))
                }
                Err(_) => {
                    // Try as an execute statement
                    let result = sqlx::query(&sql)
                        .execute(&pool)
                        .await
                        .map_err(|e| format!("Query failed: {}", e))?;

                    let rows_affected = result.rows_affected();
                    pool.close().await;

                    Ok(serde_json::json!({
                        "columns": null,
                        "data": null,
                        "rows_affected": rows_affected,
                        "is_query": false
                    }))
                }
            }
        }
        "postgres" => {
            let pool = sqlx::postgres::PgPoolOptions::new()
                .max_connections(1)
                .connect(&conn.connection_string)
                .await
                .map_err(|e| format!("Failed to connect: {}", e))?;

            // Try to execute as a query first
            let query_result: Result<Vec<sqlx::postgres::PgRow>, _> =
                sqlx::query(&sql).fetch_all(&pool).await;

            match query_result {
                Ok(rows) => {
                    // It's a SELECT query - return results
                    let columns: Vec<String> = rows
                        .get(0)
                        .map(|row| {
                            row.columns()
                                .iter()
                                .map(|col| col.name().to_string())
                                .collect()
                        })
                        .unwrap_or_default();

                    let data: Vec<Vec<serde_json::Value>> = rows
                        .into_iter()
                        .map(|row| {
                            columns
                                .iter()
                                .enumerate()
                                .map(|(idx, _)| {
                                    // Try different types
                                    if let Ok(val) = row.try_get::<String, _>(idx) {
                                        serde_json::Value::String(val)
                                    } else if let Ok(val) = row.try_get::<i64, _>(idx) {
                                        serde_json::Value::Number(val.into())
                                    } else if let Ok(val) = row.try_get::<f64, _>(idx) {
                                        serde_json::Number::from_f64(val)
                                            .map(serde_json::Value::Number)
                                            .unwrap_or(serde_json::Value::Null)
                                    } else if let Ok(val) = row.try_get::<bool, _>(idx) {
                                        serde_json::Value::Bool(val)
                                    } else {
                                        serde_json::Value::Null
                                    }
                                })
                                .collect()
                        })
                        .collect();

                    pool.close().await;
                    Ok(serde_json::json!({
                        "columns": columns,
                        "data": data,
                        "rows_affected": null,
                        "is_query": true
                    }))
                }
                Err(_) => {
                    // Try as an execute statement
                    let result = sqlx::query(&sql)
                        .execute(&pool)
                        .await
                        .map_err(|e| format!("Query failed: {}", e))?;

                    let rows_affected = result.rows_affected();
                    pool.close().await;

                    Ok(serde_json::json!({
                        "columns": null,
                        "data": null,
                        "rows_affected": rows_affected,
                        "is_query": false
                    }))
                }
            }
        }
        _ => Err(format!("Unsupported database type: {}", conn.db_type)),
    }
}

#[tauri::command]
pub async fn list_tables(
    db_manager: tauri::State<'_, SharedDbManager>,
    connection_id: i64,
) -> Result<Vec<String>, String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    let conn = manager
        .get_connection(connection_id)
        .await?
        .ok_or("Connection not found")?;

    match conn.db_type.as_str() {
        "sqlite" => {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect(&conn.connection_string)
                .await
                .map_err(|e| format!("Failed to connect: {}", e))?;

            let rows: Vec<(String,)> = sqlx::query_as(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
            .fetch_all(&pool)
            .await
            .map_err(|e| format!("Failed to list tables: {}", e))?;

            let tables: Vec<String> = rows.into_iter().map(|r| r.0).collect();
            pool.close().await;
            Ok(tables)
        }
        "postgres" => {
            let pool = sqlx::postgres::PgPoolOptions::new()
                .max_connections(1)
                .connect(&conn.connection_string)
                .await
                .map_err(|e| format!("Failed to connect: {}", e))?;

            let rows: Vec<(String,)> = sqlx::query_as(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
            )
            .fetch_all(&pool)
            .await
            .map_err(|e| format!("Failed to list tables: {}", e))?;

            let tables: Vec<String> = rows.into_iter().map(|r| r.0).collect();
            pool.close().await;
            Ok(tables)
        }
        _ => Err(format!("Unsupported database type: {}", conn.db_type)),
    }
}

#[tauri::command]
pub async fn get_table_schema(
    db_manager: tauri::State<'_, SharedDbManager>,
    connection_id: i64,
    table_name: String,
) -> Result<Vec<crate::database::ColumnInfo>, String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    let conn = manager
        .get_connection(connection_id)
        .await?
        .ok_or("Connection not found")?;

    match conn.db_type.as_str() {
        "sqlite" => {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect(&conn.connection_string)
                .await
                .map_err(|e| format!("Failed to connect: {}", e))?;

            // Get table info using PRAGMA - quote column names that might be keywords
            let rows = sqlx::query(
                r#"SELECT "name", "type", "notnull", "dflt_value", "pk" FROM pragma_table_info(?)"#,
            )
            .bind(&table_name)
            .fetch_all(&pool)
            .await
            .map_err(|e| format!("Failed to get table schema: {}", e))?;

            let columns: Vec<crate::database::ColumnInfo> = rows
                .into_iter()
                .map(|row| crate::database::ColumnInfo {
                    name: row.get::<String, _>("name"),
                    data_type: row.get::<String, _>("type"),
                    nullable: !row.get::<bool, _>("notnull"),
                    default_value: row.get::<Option<String>, _>("dflt_value"),
                    is_primary_key: row.get::<i64, _>("pk") != 0,
                })
                .collect();

            pool.close().await;
            Ok(columns)
        }
        "postgres" => {
            let pool = sqlx::postgres::PgPoolOptions::new()
                .max_connections(1)
                .connect(&conn.connection_string)
                .await
                .map_err(|e| format!("Failed to connect: {}", e))?;

            let rows = sqlx::query(
                r#"
                SELECT 
                    column_name,
                    data_type,
                    is_nullable = 'YES' as nullable,
                    column_default as default_value,
                    EXISTS (
                        SELECT 1 FROM information_schema.table_constraints tc
                        JOIN information_schema.constraint_column_usage ccu 
                            ON tc.constraint_name = ccu.constraint_name
                        WHERE tc.table_name = $1 
                            AND tc.constraint_type = 'PRIMARY KEY'
                            AND ccu.column_name = columns.column_name
                    ) as is_primary_key
                FROM information_schema.columns
                WHERE table_name = $1
                ORDER BY ordinal_position
                "#,
            )
            .bind(&table_name)
            .fetch_all(&pool)
            .await
            .map_err(|e| format!("Failed to get table schema: {}", e))?;

            let columns: Vec<crate::database::ColumnInfo> = rows
                .into_iter()
                .map(|row| crate::database::ColumnInfo {
                    name: row.get::<String, _>("column_name"),
                    data_type: row.get::<String, _>("data_type"),
                    nullable: row.get::<bool, _>("nullable"),
                    default_value: row.try_get::<String, _>("default_value").ok(),
                    is_primary_key: row.get::<bool, _>("is_primary_key"),
                })
                .collect();

            pool.close().await;
            Ok(columns)
        }
        _ => Err(format!("Unsupported database type: {}", conn.db_type)),
    }
}

#[tauri::command]
pub async fn update_row(
    db_manager: tauri::State<'_, SharedDbManager>,
    connection_id: i64,
    table_name: String,
    column_name: String,
    new_value: Option<serde_json::Value>,
    primary_key_column: String,
    primary_key_value: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    let conn = manager
        .get_connection(connection_id)
        .await?
        .ok_or("Connection not found")?;

    match conn.db_type.as_str() {
        "sqlite" => {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect(&conn.connection_string)
                .await
                .map_err(|e| format!("Failed to connect: {}", e))?;

            // Build UPDATE statement
            let sql = format!(
                "UPDATE {} SET {} = ? WHERE {} = ?",
                table_name, column_name, primary_key_column
            );

            // Bind values - handle different types
            let mut query = sqlx::query(&sql);

            // Bind new value
            if let Some(ref val) = new_value {
                if val.is_null() {
                    query = query.bind(None::<Option<String>>);
                } else if let Some(s) = val.as_str() {
                    query = query.bind(s);
                } else if let Some(n) = val.as_i64() {
                    query = query.bind(n);
                } else if let Some(n) = val.as_f64() {
                    query = query.bind(n);
                } else if let Some(b) = val.as_bool() {
                    query = query.bind(b);
                } else {
                    query = query.bind(val.to_string());
                }
            } else {
                query = query.bind(None::<Option<String>>);
            }

            // Bind primary key value
            if primary_key_value.is_null() {
                query = query.bind(None::<Option<String>>);
            } else if let Some(s) = primary_key_value.as_str() {
                query = query.bind(s);
            } else if let Some(n) = primary_key_value.as_i64() {
                query = query.bind(n);
            } else if let Some(n) = primary_key_value.as_f64() {
                query = query.bind(n);
            } else {
                query = query.bind(primary_key_value.to_string());
            }

            let result = query
                .execute(&pool)
                .await
                .map_err(|e| format!("Update failed: {}", e))?;
            let rows_affected = result.rows_affected();

            pool.close().await;
            Ok(serde_json::json!({ "rows_affected": rows_affected }))
        }
        "postgres" => {
            let pool = sqlx::postgres::PgPoolOptions::new()
                .max_connections(1)
                .connect(&conn.connection_string)
                .await
                .map_err(|e| format!("Failed to connect: {}", e))?;

            // Build UPDATE statement
            let sql = format!(
                "UPDATE {} SET {} = $1 WHERE {} = $2",
                table_name, column_name, primary_key_column
            );

            // Bind values - handle different types
            let mut query = sqlx::query(&sql);

            // Bind new value
            if let Some(ref val) = new_value {
                if val.is_null() {
                    query = query.bind(None::<Option<String>>);
                } else if let Some(s) = val.as_str() {
                    query = query.bind(s);
                } else if let Some(n) = val.as_i64() {
                    query = query.bind(n);
                } else if let Some(n) = val.as_f64() {
                    query = query.bind(n);
                } else if let Some(b) = val.as_bool() {
                    query = query.bind(b);
                } else {
                    query = query.bind(val.to_string());
                }
            } else {
                query = query.bind(None::<Option<String>>);
            }

            // Bind primary key value
            if primary_key_value.is_null() {
                query = query.bind(None::<Option<String>>);
            } else if let Some(s) = primary_key_value.as_str() {
                query = query.bind(s);
            } else if let Some(n) = primary_key_value.as_i64() {
                query = query.bind(n);
            } else if let Some(n) = primary_key_value.as_f64() {
                query = query.bind(n);
            } else {
                query = query.bind(primary_key_value.to_string());
            }

            let result = query
                .execute(&pool)
                .await
                .map_err(|e| format!("Update failed: {}", e))?;
            let rows_affected = result.rows_affected();

            pool.close().await;
            Ok(serde_json::json!({ "rows_affected": rows_affected }))
        }
        _ => Err(format!("Unsupported database type: {}", conn.db_type)),
    }
}

// Script management commands
#[tauri::command]
pub async fn create_script(
    db_manager: tauri::State<'_, SharedDbManager>,
    name: String,
    connection_id: Option<i64>,
    folder_path: String,
) -> Result<crate::database::Script, String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    let script = crate::database::NewScript {
        name,
        connection_id,
        folder_path,
    };

    manager.create_script(script).await
}

#[tauri::command]
pub async fn list_scripts(
    db_manager: tauri::State<'_, SharedDbManager>,
    connection_id: Option<i64>,
) -> Result<Vec<crate::database::Script>, String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    manager.list_scripts(connection_id).await
}

#[tauri::command]
pub async fn get_script(
    db_manager: tauri::State<'_, SharedDbManager>,
    id: i64,
) -> Result<Option<crate::database::Script>, String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    manager.get_script(id).await
}

#[tauri::command]
pub async fn update_script_connection(
    db_manager: tauri::State<'_, SharedDbManager>,
    script_id: i64,
    connection_id: Option<i64>,
) -> Result<(), String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    manager
        .update_script_connection(script_id, connection_id)
        .await
}

#[tauri::command]
pub async fn delete_script(
    db_manager: tauri::State<'_, SharedDbManager>,
    id: i64,
) -> Result<(), String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    manager.delete_script(id).await
}

#[tauri::command]
pub async fn get_app_state(
    db_manager: tauri::State<'_, SharedDbManager>,
) -> Result<crate::database::AppState, String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    manager.get_app_state().await
}

#[tauri::command]
pub async fn save_app_state(
    db_manager: tauri::State<'_, SharedDbManager>,
    active_connection_id: Option<i64>,
    open_tabs_json: String,
    active_tab_index: i64,
    show_debug_panel: bool,
    show_scripts_panel: bool,
    show_explorer_panel: bool,
    theme: Option<String>,
) -> Result<(), String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    manager
        .save_app_state(
            active_connection_id,
            &open_tabs_json,
            active_tab_index,
            show_debug_panel,
            show_scripts_panel,
            show_explorer_panel,
            theme,
        )
        .await
}

#[tauri::command]
pub async fn set_theme(
    db_manager: tauri::State<'_, SharedDbManager>,
    theme: Option<String>,
) -> Result<(), String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    manager.set_theme(theme).await
}

#[tauri::command]
pub async fn save_custom_theme(
    db_manager: tauri::State<'_, SharedDbManager>,
    theme_css: Option<String>,
    theme_json: Option<String>,
) -> Result<(), String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    manager.save_custom_theme(theme_css, theme_json).await
}

#[tauri::command]
pub async fn clear_custom_theme(
    db_manager: tauri::State<'_, SharedDbManager>,
) -> Result<(), String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    manager.clear_custom_theme().await
}

// Script file I/O commands
use crate::get_squeal_base_dir;

#[tauri::command]
pub async fn create_script_file(
    db_manager: tauri::State<'_, SharedDbManager>,
    name: String,
    connection_id: Option<i64>,
    folder_path: String,
    initial_content: Option<String>,
) -> Result<crate::database::Script, String> {
    let base_dir = get_squeal_base_dir();
    let scripts_dir = base_dir.join("scripts");

    // Build full file path: scripts/{folder_path}/{name}.sql
    let folder_dir = scripts_dir.join(&folder_path);
    std::fs::create_dir_all(&folder_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let file_path = folder_dir.join(format!("{}.sql", name));
    let relative_path = file_path
        .strip_prefix(&scripts_dir)
        .map_err(|_| "Failed to get relative path")?
        .to_string_lossy()
        .to_string();

    // Create the file with initial content (or empty)
    let content = initial_content.unwrap_or_default();
    std::fs::write(&file_path, &content)
        .map_err(|e| format!("Failed to create script file: {}", e))?;

    // Create database entry
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    let script = manager
        .create_script(crate::database::NewScript {
            name: name.clone(),
            connection_id,
            folder_path: relative_path,
        })
        .await?;

    Ok(script)
}

#[tauri::command]
pub async fn read_script_file(
    db_manager: tauri::State<'_, SharedDbManager>,
    script_id: i64,
) -> Result<String, String> {
    let base_dir = get_squeal_base_dir();
    let scripts_dir = base_dir.join("scripts");

    // Get script metadata
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    let script = manager
        .get_script(script_id)
        .await?
        .ok_or("Script not found")?;

    // Build full file path
    let file_path = scripts_dir.join(&script.folder_path);

    // Read file content
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read script file: {}", e))?;

    Ok(content)
}

#[tauri::command]
pub async fn delete_script_file(
    db_manager: tauri::State<'_, SharedDbManager>,
    script_id: i64,
) -> Result<(), String> {
    let base_dir = get_squeal_base_dir();
    let scripts_dir = base_dir.join("scripts");

    // Get script metadata
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    let script = manager
        .get_script(script_id)
        .await?
        .ok_or("Script not found")?;

    // Build full file path and delete
    let file_path = scripts_dir.join(&script.folder_path);
    if file_path.exists() {
        std::fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete script file: {}", e))?;
    }

    // Delete database entry
    manager.delete_script(script_id).await?;

    Ok(())
}

#[tauri::command]
pub async fn write_script_file(
    db_manager: tauri::State<'_, SharedDbManager>,
    script_id: i64,
    content: String,
) -> Result<(), String> {
    let base_dir = get_squeal_base_dir();
    let scripts_dir = base_dir.join("scripts");

    // Get script metadata
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    let script = manager
        .get_script(script_id)
        .await?
        .ok_or("Script not found")?;

    // Build full file path and write
    let file_path = scripts_dir.join(&script.folder_path);
    std::fs::write(&file_path, &content)
        .map_err(|e| format!("Failed to write script file: {}", e))?;

    Ok(())
}

// Sync filesystem scripts with database
#[tauri::command]
pub async fn sync_scripts_with_db(
    db_manager: tauri::State<'_, SharedDbManager>,
) -> Result<Vec<crate::database::Script>, String> {
    use crate::get_squeal_base_dir;
    use std::fs;

    eprintln!("Starting script sync...");

    let base_dir = get_squeal_base_dir();
    let scripts_dir = base_dir.join("scripts");

    eprintln!("Scripts directory: {:?}", scripts_dir);

    let manager_guard = db_manager.lock().await;
    let manager = manager_guard.as_ref().ok_or("Database not initialized")?;

    // Get all existing scripts from DB to avoid duplicates
    let existing_scripts = manager.list_scripts(None).await?;
    eprintln!("Existing scripts in DB: {}", existing_scripts.len());

    let existing_paths: std::collections::HashSet<String> = existing_scripts
        .iter()
        .map(|s| s.folder_path.clone())
        .collect();

    // Walk the scripts directory
    let mut new_scripts = Vec::new();

    fn visit_dirs(
        dir: &std::path::Path,
        scripts_dir: &std::path::Path,
        existing_paths: &std::collections::HashSet<String>,
        new_scripts: &mut Vec<(String, String)>, // (relative_path, folder_name)
    ) -> std::io::Result<()> {
        if dir.is_dir() {
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    visit_dirs(&path, scripts_dir, existing_paths, new_scripts)?;
                } else if path.extension().map(|e| e == "sql").unwrap_or(false) {
                    eprintln!("Found SQL file: {:?}", path);
                    if let Ok(relative) = path.strip_prefix(scripts_dir) {
                        let relative_str = relative.to_string_lossy().to_string();
                        eprintln!("  Relative path: {}", relative_str);
                        if !existing_paths.contains(&relative_str) {
                            // Get folder name (parent directory or "root")
                            let folder_name = relative
                                .parent()
                                .and_then(|p| p.file_name())
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_else(|| "Unassigned".to_string());
                            eprintln!("  Folder name: {}", folder_name);
                            new_scripts.push((relative_str, folder_name));
                        } else {
                            eprintln!("  Already in DB, skipping");
                        }
                    }
                }
            }
        }
        Ok(())
    }

    if let Err(e) = visit_dirs(
        &scripts_dir,
        &scripts_dir,
        &existing_paths,
        &mut new_scripts,
    ) {
        eprintln!("Error scanning scripts directory: {}", e);
    }

    eprintln!("Found {} new scripts to add", new_scripts.len());

    // Get connections to match folder names
    let connections = manager.list_connections().await?;
    let conn_map: std::collections::HashMap<String, i64> =
        connections.iter().map(|c| (c.name.clone(), c.id)).collect();

    eprintln!("Connections: {:?}", conn_map);

    // Add missing scripts to database
    let mut added_scripts = Vec::new();
    for (relative_path, folder_name) in new_scripts {
        // Try to find matching connection by folder name
        let connection_id = conn_map.get(&folder_name).copied();

        eprintln!(
            "Adding script: {} -> connection_id: {:?}",
            relative_path, connection_id
        );

        // Extract script name from filename
        let script_name = std::path::Path::new(&relative_path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "unnamed".to_string());

        match manager
            .create_script(crate::database::NewScript {
                name: script_name,
                connection_id,
                folder_path: relative_path,
            })
            .await
        {
            Ok(script) => {
                eprintln!("  Successfully added script id={}", script.id);
                added_scripts.push(script);
            }
            Err(e) => eprintln!("Failed to create script entry: {}", e),
        }
    }

    // Return all scripts (existing + new)
    let all_scripts = manager.list_scripts(None).await?;
    eprintln!("Total scripts after sync: {}", all_scripts.len());
    Ok(all_scripts)
}
