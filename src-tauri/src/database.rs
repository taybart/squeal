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
}

pub type SharedDbManager = std::sync::Arc<tokio::sync::Mutex<Option<DatabaseManager>>>;
