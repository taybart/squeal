use async_trait::async_trait;
use nvim_rs::{compat::tokio::Compat, Handler, Neovim};
use rmpv::Value;
use tokio::io::WriteHalf;
use tokio::net::TcpStream;
use tokio::sync::mpsc;

use crate::nvim::state::NvimEvent;

#[derive(Clone, Debug)]
pub struct NeovimHandler {
    event_sender: mpsc::UnboundedSender<NvimEvent>,
}

impl NeovimHandler {
    pub fn new(event_sender: mpsc::UnboundedSender<NvimEvent>) -> Self {
        Self { event_sender }
    }
}

#[async_trait]
impl Handler for NeovimHandler {
    type Writer = Compat<WriteHalf<TcpStream>>;

    async fn handle_notify(&self, name: String, args: Vec<Value>, _nvim: Neovim<Self::Writer>) {
        match name.as_str() {
            "redraw" => {
                // Forward redraw events - these contain all UI updates
                let _ = self.event_sender.send(NvimEvent::Redraw(args.clone()));
                
                // Parse specific events from redraw batch
                for batch in args {
                    if let Value::Array(events) = batch {
                        for event in events {
                            if let Value::Array(event_data) = event {
                                if let Some(Value::String(event_name)) = event_data.first() {
                                    let event_str = event_name.as_str().unwrap_or("");
                                    match event_str {
                                        "mode_change" => {
                                            if let Some(Value::Array(mode_info)) = event_data.get(1) {
                                                if let Some(Value::String(mode)) = mode_info.first() {
                                                    let _ = self.event_sender.send(
                                                        NvimEvent::ModeChange(mode.to_string())
                                                    );
                                                }
                                            }
                                        }
                                        "cursor_goto" => {
                                            if let Some(Value::Array(pos)) = event_data.get(1) {
                                                if pos.len() >= 2 {
                                                    if let (Value::Integer(row), Value::Integer(col)) = (&pos[0], &pos[1]) {
                                                        let _ = self.event_sender.send(
                                                            NvimEvent::CursorMove(row.as_i64().unwrap_or(0), col.as_i64().unwrap_or(0))
                                                        );
                                                    }
                                                }
                                            }
                                        }
                                        "grid_line" => {
                                            // Skip grid_line for now - it's very verbose
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }
                    }
                }
            }
            "sql_statement" => {
                // SQL statement notification from ftplugin
                if let Some(Value::Map(data)) = args.first() {
                    let mut text = String::new();
                    let mut start_row: i64 = 0;
                    let mut start_col: i64 = 0;
                    let mut end_row: i64 = 0;
                    let mut end_col: i64 = 0;
                    
                    for (key, value) in data {
                        if let Value::String(k) = key {
                            match k.as_str() {
                                Some("text") => {
                                    if let Value::String(v) = value {
                                        text = v.to_string();
                                    }
                                }
                                Some("start_row") => {
                                    if let Value::Integer(v) = value {
                                        start_row = v.as_i64().unwrap_or(0);
                                    }
                                }
                                Some("start_col") => {
                                    if let Value::Integer(v) = value {
                                        start_col = v.as_i64().unwrap_or(0);
                                    }
                                }
                                Some("end_row") => {
                                    if let Value::Integer(v) = value {
                                        end_row = v.as_i64().unwrap_or(0);
                                    }
                                }
                                Some("end_col") => {
                                    if let Value::Integer(v) = value {
                                        end_col = v.as_i64().unwrap_or(0);
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    
                    let _ = self.event_sender.send(NvimEvent::SqlStatement {
                        text,
                        start_row,
                        start_col,
                        end_row,
                        end_col,
                    });
                }
            }
            "sql_execute" => {
                // SQL execution notification from ftplugin
                if let Some(Value::Map(data)) = args.first() {
                    let mut statements = Vec::new();
                    let mut mode = "single".to_string();
                    
                    for (key, value) in data {
                        if let Value::String(k) = key {
                            match k.as_str() {
                                Some("statements") => {
                                    if let Value::Array(stmts) = value {
                                        for stmt in stmts {
                                            if let Value::String(s) = stmt {
                                                statements.push(s.to_string());
                                            }
                                        }
                                    }
                                }
                                Some("statement") => {
                                    if let Value::String(s) = value {
                                        statements.push(s.to_string());
                                    }
                                }
                                Some("mode") => {
                                    if let Value::String(m) = value {
                                        mode = m.to_string();
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    
                    let _ = self.event_sender.send(NvimEvent::SqlExecute { statements, mode });
                }
            }
            _ => {
                // Other notifications can be logged if needed
            }
        }
    }

    async fn handle_request(
        &self,
        _name: String,
        _args: Vec<Value>,
        _nvim: Neovim<Self::Writer>,
    ) -> Result<Value, Value> {
        Ok(Value::Nil)
    }
}
