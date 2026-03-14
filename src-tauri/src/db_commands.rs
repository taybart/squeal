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
    let manager = manager_guard
        .as_ref()
        .ok_or("Database not initialized")?;
    
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
    let manager = manager_guard
        .as_ref()
        .ok_or("Database not initialized")?;
    
    manager.list_connections().await
}

#[tauri::command]
pub async fn delete_connection(
    db_manager: tauri::State<'_, SharedDbManager>,
    id: i64,
) -> Result<(), String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard
        .as_ref()
        .ok_or("Database not initialized")?;
    
    manager.delete_connection(id).await
}

#[tauri::command]
pub async fn test_connection(
    db_type: String,
    connection_string: String,
) -> Result<(), String> {
    // Test without saving - just validate the connection works
    DatabaseManager::test_connection(&db_type, &connection_string).await
}

#[tauri::command]
pub async fn execute_sql(
    db_manager: tauri::State<'_, SharedDbManager>,
    connection_id: i64,
    sql: String,
) -> Result<serde_json::Value, String> {
    use sqlx::Row;
    
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard
        .as_ref()
        .ok_or("Database not initialized")?;
    
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
            let rows = match sqlx::query(&sql).fetch_all(&pool).await {
                Ok(rows) => rows,
                Err(e) => {
                    // If it's not a SELECT, try executing it
                    if sql.to_uppercase().starts_with("SELECT") {
                        return Err(format!("Query failed: {}", e));
                    }
                    
                    let result = sqlx::query(&sql)
                        .execute(&pool)
                        .await
                        .map_err(|e| format!("Execution failed: {}", e))?;
                    
                    pool.close().await;
                    
                    return Ok(serde_json::json!({
                        "rows_affected": result.rows_affected()
                    }));
                }
            };
            
            // Convert rows to JSON
            let mut results: Vec<serde_json::Map<String, serde_json::Value>> = Vec::new();
            
            for row in rows {
                let mut obj = serde_json::Map::new();
                
                for (i, column) in row.columns().iter().enumerate() {
                    let name = column.name();
                    
                    // Try to get value as different types (SQLite is dynamic)
                    let value: serde_json::Value = if let Ok(val) = row.try_get::<i64, _>(i) {
                        serde_json::json!(val)
                    } else if let Ok(val) = row.try_get::<f64, _>(i) {
                        serde_json::json!(val)
                    } else if let Ok(val) = row.try_get::<String, _>(i) {
                        serde_json::json!(val)
                    } else if let Ok(val) = row.try_get::<bool, _>(i) {
                        serde_json::json!(val)
                    } else if let Ok(val) = row.try_get::<Option<i64>, _>(i) {
                        if let Some(v) = val {
                            serde_json::json!(v)
                        } else {
                            serde_json::Value::Null
                        }
                    } else if let Ok(val) = row.try_get::<Option<String>, _>(i) {
                        if let Some(v) = val {
                            serde_json::json!(v)
                        } else {
                            serde_json::Value::Null
                        }
                    } else {
                        serde_json::Value::Null
                    };
                    
                    obj.insert(name.to_string(), value);
                }
                
                results.push(obj);
            }
            
            pool.close().await;
            
            Ok(serde_json::json!(results))
        }
        "postgres" => {
            let pool = sqlx::postgres::PgPoolOptions::new()
                .max_connections(1)
                .connect(&conn.connection_string)
                .await
                .map_err(|e| format!("Failed to connect: {}", e))?;
            
            // Try to execute as a query first
            let rows = match sqlx::query(&sql).fetch_all(&pool).await {
                Ok(rows) => rows,
                Err(e) => {
                    // If it's not a SELECT, try executing it
                    if sql.to_uppercase().starts_with("SELECT") {
                        return Err(format!("Query failed: {}", e));
                    }
                    
                    let result = sqlx::query(&sql)
                        .execute(&pool)
                        .await
                        .map_err(|e| format!("Execution failed: {}", e))?;
                    
                    pool.close().await;
                    
                    return Ok(serde_json::json!({
                        "rows_affected": result.rows_affected()
                    }));
                }
            };
            
            // Convert rows to JSON
            let mut results: Vec<serde_json::Map<String, serde_json::Value>> = Vec::new();
            
            for row in rows {
                let mut obj = serde_json::Map::new();
                
                for (i, column) in row.columns().iter().enumerate() {
                    let name = column.name();
                    
                    // Try to get value as different types
                    let value: serde_json::Value = if let Ok(val) = row.try_get::<i64, _>(i) {
                        serde_json::json!(val)
                    } else if let Ok(val) = row.try_get::<f64, _>(i) {
                        serde_json::json!(val)
                    } else if let Ok(val) = row.try_get::<String, _>(i) {
                        serde_json::json!(val)
                    } else if let Ok(val) = row.try_get::<bool, _>(i) {
                        serde_json::json!(val)
                    } else if let Ok(val) = row.try_get::<Option<i64>, _>(i) {
                        if let Some(v) = val {
                            serde_json::json!(v)
                        } else {
                            serde_json::Value::Null
                        }
                    } else if let Ok(val) = row.try_get::<Option<String>, _>(i) {
                        if let Some(v) = val {
                            serde_json::json!(v)
                        } else {
                            serde_json::Value::Null
                        }
                    } else {
                        serde_json::Value::Null
                    };
                    
                    obj.insert(name.to_string(), value);
                }
                
                results.push(obj);
            }
            
            pool.close().await;
            
            Ok(serde_json::json!(results))
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
    let manager = manager_guard
        .as_ref()
        .ok_or("Database not initialized")?;
    
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
            
            let rows = sqlx::query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                .fetch_all(&pool)
                .await
                .map_err(|e| format!("Failed to list tables: {}", e))?;
            
            let tables: Vec<String> = rows
                .into_iter()
                .map(|row| row.get::<String, _>("name"))
                .collect();
            
            pool.close().await;
            Ok(tables)
        }
        "postgres" => {
            let pool = sqlx::postgres::PgPoolOptions::new()
                .max_connections(1)
                .connect(&conn.connection_string)
                .await
                .map_err(|e| format!("Failed to connect: {}", e))?;
            
            let rows = sqlx::query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")
                .fetch_all(&pool)
                .await
                .map_err(|e| format!("Failed to list tables: {}", e))?;
            
            let tables: Vec<String> = rows
                .into_iter()
                .map(|row| row.get::<String, _>("table_name"))
                .collect();
            
            pool.close().await;
            Ok(tables)
        }
        _ => Err(format!("Unsupported database type: {}", conn.db_type)),
    }
}

#[derive(Debug, serde::Serialize)]
pub struct ColumnInfo {
    name: String,
    data_type: String,
    nullable: bool,
    default_value: Option<String>,
    is_primary_key: bool,
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
    let manager = manager_guard
        .as_ref()
        .ok_or("Database not initialized")?;
    
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
                table_name,
                column_name,
                primary_key_column
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
            
            // Execute the update
            let result = query
                .execute(&pool)
                .await
                .map_err(|e| format!("Update failed: {}", e))?;
            
            pool.close().await;
            
            Ok(serde_json::json!({
                "rows_affected": result.rows_affected()
            }))
        }
        "postgres" => {
            let pool = sqlx::postgres::PgPoolOptions::new()
                .max_connections(1)
                .connect(&conn.connection_string)
                .await
                .map_err(|e| format!("Failed to connect: {}", e))?;
            
            // Build UPDATE statement using PostgreSQL parameter syntax
            let sql = format!(
                "UPDATE {} SET {} = $1 WHERE {} = $2",
                table_name,
                column_name,
                primary_key_column
            );
            
            // Bind values
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
            
            // Execute the update
            let result = query
                .execute(&pool)
                .await
                .map_err(|e| format!("Update failed: {}", e))?;
            
            pool.close().await;
            
            Ok(serde_json::json!({
                "rows_affected": result.rows_affected()
            }))
        }
        _ => Err(format!("Unsupported database type: {}", conn.db_type)),
    }
}

#[tauri::command]
pub async fn get_table_schema(
    db_manager: tauri::State<'_, SharedDbManager>,
    connection_id: i64,
    table_name: String,
) -> Result<Vec<ColumnInfo>, String> {
    let manager_guard = db_manager.lock().await;
    let manager = manager_guard
        .as_ref()
        .ok_or("Database not initialized")?;
    
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
            
            // Get table info using PRAGMA
            let pragma_sql = format!("PRAGMA table_info({})", table_name);
            let rows = sqlx::query(&pragma_sql)
                .fetch_all(&pool)
                .await
                .map_err(|e| format!("Failed to get table schema: {}", e))?;
            
            let columns: Vec<ColumnInfo> = rows
                .into_iter()
                .map(|row| ColumnInfo {
                    name: row.get::<String, _>("name"),
                    data_type: row.get::<String, _>("type"),
                    nullable: row.get::<i32, _>("notnull") == 0,
                    default_value: row.try_get::<String, _>("dflt_value").ok(),
                    is_primary_key: row.get::<i32, _>("pk") == 1,
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
                    c.column_name,
                    c.data_type,
                    c.is_nullable = 'YES' as nullable,
                    c.column_default as default_value,
                    COALESCE(pk.is_primary_key, false) as is_primary_key
                FROM information_schema.columns c
                LEFT JOIN (
                    SELECT 
                        kcu.column_name,
                        true as is_primary_key
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu 
                        ON tc.constraint_name = kcu.constraint_name
                    WHERE tc.constraint_type = 'PRIMARY KEY'
                        AND tc.table_name = $1
                ) pk ON c.column_name = pk.column_name
                WHERE c.table_name = $1
                ORDER BY c.ordinal_position
                "#
            )
            .bind(&table_name)
            .fetch_all(&pool)
            .await
            .map_err(|e| format!("Failed to get table schema: {}", e))?;
            
            let columns: Vec<ColumnInfo> = rows
                .into_iter()
                .map(|row| ColumnInfo {
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
