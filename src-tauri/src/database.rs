use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, Pool, Row, Sqlite};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbConnection {
    pub id: i64,
    pub name: String,
    pub db_type: String, // "sqlite", "postgres"
    pub connection_string: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct NewDbConnection {
    pub name: String,
    pub db_type: String,
    pub connection_string: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub default_value: Option<String>,
    pub is_primary_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Script {
    pub id: i64,
    pub name: String,
    pub connection_id: Option<i64>,
    pub folder_path: String,
    pub is_production: bool,
    pub cursor_position: String, // JSON: {"row":0,"col":0}
    pub last_modified: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct NewScript {
    pub name: String,
    pub connection_id: Option<i64>,
    pub folder_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub id: i64,
    pub active_connection_id: Option<i64>,
    pub open_tabs_json: Option<String>,
    pub active_tab_index: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenTab {
    pub script_id: Option<i64>,
    pub name: String,
    pub is_modified: bool,
    pub cursor_position: (i64, i64),
}

pub struct DatabaseManager {
    pool: Pool<Sqlite>,
}

impl DatabaseManager {
    pub async fn new(db_path: &PathBuf) -> Result<Self, sqlx::Error> {
        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Use absolute path for sqlite connection string
        let absolute_path = std::fs::canonicalize(db_path).unwrap_or(db_path.clone());
        let connection_string = format!("sqlite:{}", absolute_path.display());

        eprintln!("Connecting to database with string: {}", connection_string);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&connection_string)
            .await?;

        // Initialize the database schema
        Self::init_schema(&pool).await?;

        Ok(Self { pool })
    }

    async fn init_schema(pool: &Pool<Sqlite>) -> Result<(), sqlx::Error> {
        // Connections table (existing)
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS connections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                db_type TEXT NOT NULL CHECK(db_type IN ('sqlite', 'postgres')),
                connection_string TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(pool)
        .await?;

        // Scripts table - stores metadata for SQL scripts
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS scripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                connection_id INTEGER,
                folder_path TEXT NOT NULL,
                is_production BOOLEAN DEFAULT 0,
                last_content TEXT,
                cursor_position TEXT DEFAULT '{"row":0,"col":0}',
                last_modified DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (connection_id) REFERENCES connections(id)
            )
            "#,
        )
        .execute(pool)
        .await?;

        // App state table - persists open tabs and settings
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS app_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                active_connection_id INTEGER,
                open_tabs_json TEXT,
                active_tab_index INTEGER DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (active_connection_id) REFERENCES connections(id)
            )
            "#,
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn add_connection(
        &self,
        connection: NewDbConnection,
    ) -> Result<DbConnection, String> {
        let result = sqlx::query(
            r#"
            INSERT INTO connections (name, db_type, connection_string)
            VALUES (?, ?, ?)
            RETURNING id, name, db_type, connection_string, created_at
            "#,
        )
        .bind(&connection.name)
        .bind(&connection.db_type)
        .bind(&connection.connection_string)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| format!("Failed to add connection: {}", e))?;

        Ok(DbConnection {
            id: result.get("id"),
            name: result.get("name"),
            db_type: result.get("db_type"),
            connection_string: result.get("connection_string"),
            created_at: result.get("created_at"),
        })
    }

    pub async fn list_connections(&self) -> Result<Vec<DbConnection>, String> {
        let rows = sqlx::query(
            "SELECT id, name, db_type, connection_string, created_at FROM connections ORDER BY created_at DESC"
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list connections: {}", e))?;

        let connections: Vec<DbConnection> = rows
            .into_iter()
            .map(|row| DbConnection {
                id: row.get("id"),
                name: row.get("name"),
                db_type: row.get("db_type"),
                connection_string: row.get("connection_string"),
                created_at: row.get("created_at"),
            })
            .collect();

        Ok(connections)
    }

    pub async fn get_connection(&self, id: i64) -> Result<Option<DbConnection>, String> {
        let row = sqlx::query(
            "SELECT id, name, db_type, connection_string, created_at FROM connections WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get connection: {}", e))?;

        Ok(row.map(|r| DbConnection {
            id: r.get("id"),
            name: r.get("name"),
            db_type: r.get("db_type"),
            connection_string: r.get("connection_string"),
            created_at: r.get("created_at"),
        }))
    }

    pub async fn delete_connection(&self, id: i64) -> Result<(), String> {
        sqlx::query("DELETE FROM connections WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to delete connection: {}", e))?;

        Ok(())
    }

    pub async fn test_connection(db_type: &str, connection_string: &str) -> Result<(), String> {
        match db_type {
            "sqlite" => {
                let pool = SqlitePoolOptions::new()
                    .max_connections(1)
                    .connect(connection_string)
                    .await
                    .map_err(|e| format!("Failed to connect to SQLite: {}", e))?;

                // Test with a simple query
                sqlx::query("SELECT 1")
                    .fetch_one(&pool)
                    .await
                    .map_err(|e| format!("Failed to test SQLite connection: {}", e))?;

                pool.close().await;
                Ok(())
            }
            "postgres" => {
                use sqlx::postgres::PgPoolOptions;

                let pool = PgPoolOptions::new()
                    .max_connections(1)
                    .connect(connection_string)
                    .await
                    .map_err(|e| format!("Failed to connect to PostgreSQL: {}", e))?;

                // Test with a simple query
                sqlx::query("SELECT 1")
                    .fetch_one(&pool)
                    .await
                    .map_err(|e| format!("Failed to test PostgreSQL connection: {}", e))?;

                pool.close().await;
                Ok(())
            }
            _ => Err(format!("Unsupported database type: {}", db_type)),
        }
    }

    // Script management methods
    pub async fn create_script(&self, script: NewScript) -> Result<Script, String> {
        let result = sqlx::query(
            r#"
            INSERT INTO scripts (name, connection_id, folder_path, last_modified)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            RETURNING id, name, connection_id, folder_path, is_production, cursor_position, last_modified, created_at
            "#,
        )
        .bind(&script.name)
        .bind(script.connection_id)
        .bind(&script.folder_path)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| format!("Failed to create script: {}", e))?;

        Ok(Script {
            id: result.get("id"),
            name: result.get("name"),
            connection_id: result.get("connection_id"),
            folder_path: result.get("folder_path"),
            is_production: result.get("is_production"),
            cursor_position: result.get("cursor_position"),
            last_modified: result.get("last_modified"),
            created_at: result.get("created_at"),
        })
    }

    pub async fn list_scripts(&self, connection_id: Option<i64>) -> Result<Vec<Script>, String> {
        let query = match connection_id {
            Some(id) => {
                sqlx::query(
                    r#"
                    SELECT id, name, connection_id, folder_path, is_production, 
                           cursor_position, last_modified, created_at 
                    FROM scripts 
                    WHERE connection_id = ? 
                    ORDER BY created_at DESC
                    "#,
                )
                .bind(id)
            }
            None => {
                sqlx::query(
                    r#"
                    SELECT id, name, connection_id, folder_path, is_production, 
                           cursor_position, last_modified, created_at 
                    FROM scripts 
                    ORDER BY created_at DESC
                    "#,
                )
            }
        };

        let rows = query
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to list scripts: {}", e))?;

        let scripts: Vec<Script> = rows
            .into_iter()
            .map(|row| Script {
                id: row.get("id"),
                name: row.get("name"),
                connection_id: row.get("connection_id"),
                folder_path: row.get("folder_path"),
                is_production: row.get("is_production"),
                cursor_position: row.get("cursor_position"),
                last_modified: row.get("last_modified"),
                created_at: row.get("created_at"),
            })
            .collect();

        Ok(scripts)
    }

    pub async fn get_script(&self, id: i64) -> Result<Option<Script>, String> {
        let row = sqlx::query(
            r#"
            SELECT id, name, connection_id, folder_path, is_production, 
                   cursor_position, last_modified, created_at 
            FROM scripts WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get script: {}", e))?;

        Ok(row.map(|r| Script {
            id: r.get("id"),
            name: r.get("name"),
            connection_id: r.get("connection_id"),
            folder_path: r.get("folder_path"),
            is_production: r.get("is_production"),
            cursor_position: r.get("cursor_position"),
            last_modified: r.get("last_modified"),
            created_at: r.get("created_at"),
        }))
    }

    pub async fn update_script_connection(&self, script_id: i64, connection_id: Option<i64>) -> Result<(), String> {
        sqlx::query(
            "UPDATE scripts SET connection_id = ?, last_modified = CURRENT_TIMESTAMP WHERE id = ?"
        )
        .bind(connection_id)
        .bind(script_id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to update script connection: {}", e))?;

        Ok(())
    }

    pub async fn update_script_cursor(&self, script_id: i64, cursor_json: &str) -> Result<(), String> {
        sqlx::query(
            "UPDATE scripts SET cursor_position = ?, last_modified = CURRENT_TIMESTAMP WHERE id = ?"
        )
        .bind(cursor_json)
        .bind(script_id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to update script cursor: {}", e))?;

        Ok(())
    }

    pub async fn delete_script(&self, id: i64) -> Result<(), String> {
        sqlx::query("DELETE FROM scripts WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to delete script: {}", e))?;

        Ok(())
    }

    // App state management methods
    pub async fn get_app_state(&self) -> Result<AppState, String> {
        let row = sqlx::query(
            r#"
            SELECT id, active_connection_id, open_tabs_json, active_tab_index 
            FROM app_state WHERE id = 1
            "#,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get app state: {}", e))?;

        match row {
            Some(r) => Ok(AppState {
                id: r.get("id"),
                active_connection_id: r.get("active_connection_id"),
                open_tabs_json: r.get("open_tabs_json"),
                active_tab_index: r.get("active_tab_index"),
            }),
            None => {
                // Initialize with defaults
                sqlx::query(
                    "INSERT INTO app_state (id, active_connection_id, active_tab_index) VALUES (1, NULL, 0)"
                )
                .execute(&self.pool)
                .await
                .map_err(|e| format!("Failed to initialize app state: {}", e))?;

                Ok(AppState {
                    id: 1,
                    active_connection_id: None,
                    open_tabs_json: None,
                    active_tab_index: 0,
                })
            }
        }
    }

    pub async fn save_app_state(
        &self,
        active_connection_id: Option<i64>,
        open_tabs_json: &str,
        active_tab_index: i64,
    ) -> Result<(), String> {
        sqlx::query(
            r#"
            INSERT INTO app_state (id, active_connection_id, open_tabs_json, active_tab_index, last_updated)
            VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                active_connection_id = excluded.active_connection_id,
                open_tabs_json = excluded.open_tabs_json,
                active_tab_index = excluded.active_tab_index,
                last_updated = excluded.last_updated
            "#,
        )
        .bind(active_connection_id)
        .bind(open_tabs_json)
        .bind(active_tab_index)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to save app state: {}", e))?;

        Ok(())
    }
}

pub type SharedDbManager = std::sync::Arc<tokio::sync::Mutex<Option<DatabaseManager>>>;
