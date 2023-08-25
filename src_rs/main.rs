use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::prelude::*;
use std::{error::Error, io};

mod db;
mod table;

struct App<'a> {
    active_table: table::Table<'a>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let db_pool = db::init().await.expect("setup db");
    let posts = sqlx::query("select * from posts")
        .fetch_all(&db_pool)
        .await
        .expect("query to work");
    for post in posts {
        println!("{:?}", post.columns);
    }
    Ok(())
}

// #[tokio::main]
// async fn main() -> Result<(), Box<dyn Error>> {
//     let db_pool = db::init().await.expect("setup db");
//     // setup terminal
//     enable_raw_mode()?;
//     let mut stdout = io::stdout();
//     execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
//     let backend = CrosstermBackend::new(stdout);
//     let mut terminal = Terminal::new(backend)?;

//     // create app and run it
//     let app = App {
//         active_table: table::Table::new(),
//     };
//     let res = run_app(&mut terminal, app);

//     // restore terminal
//     disable_raw_mode()?;
//     execute!(
//         terminal.backend_mut(),
//         LeaveAlternateScreen,
//         DisableMouseCapture
//     )?;
//     terminal.show_cursor()?;

//     if let Err(err) = res {
//         println!("{err:?}");
//     }

//     Ok(())
// }

fn run_app<B: Backend>(terminal: &mut Terminal<B>, mut app: App) -> io::Result<()> {
    loop {
        terminal.draw(|f| ui(f, &mut app))?;

        if let Event::Key(key) = event::read()? {
            if key.kind == KeyEventKind::Press {
                match key.code {
                    KeyCode::Char('q') => return Ok(()),
                    KeyCode::Char('j') => app.active_table.next(),
                    KeyCode::Char('k') => app.active_table.previous(),
                    _ => {}
                }
            }
        }
    }
}

fn ui<B: Backend>(f: &mut Frame<B>, app: &mut App) {
    app.active_table.render(f);
}
