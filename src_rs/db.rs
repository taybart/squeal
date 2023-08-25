use sqlx::sqlite::SqlitePool;
use std::{
    env,
    io::{Error, ErrorKind},
};

fn error(msg: String) -> Error {
    Error::new(ErrorKind::Other, msg)
}
pub async fn init() -> Result<SqlitePool, Error> {
    let db_path = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    SqlitePool::connect(&db_path)
        .await
        .map_err(|e| error(format!("db conn {e}")))
}
