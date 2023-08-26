package main

import (
	"database/sql"

	"github.com/taybart/squeal/db"
	"github.com/taybart/squeal/models"

	tea "github.com/charmbracelet/bubbletea"
)

type state int

const (
	showSelection state = iota
	showTable
	quit
)

type App struct {
	state       state
	db          *sql.DB
	list        models.List
	table       models.Table
	tableLoaded bool
	query       string
}

func NewApp() (App, error) {

	db, err := sql.Open("sqlite3", "./app.db")
	if err != nil {
		return App{}, nil
	}

	tableNames, err := db.Query(`SELECT name FROM sqlite_master WHERE type="table"`)
	if err != nil {
		return App{}, err
	}
	defer tableNames.Close()

	tables := []string{}
	for tableNames.Next() {
		var name string
		err = tableNames.Scan(&name)
		if err != nil {
			return App{}, err
		}
		tables = append(tables, name)
	}

	return App{
		db:   db,
		list: models.NewList(tables),
	}, nil
}

// func (a App) Init() tea.Cmd { return tea.EnterAltScreen }
func (a App) Init() tea.Cmd { return nil }

// Main update function.
func (a App) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	// Make sure these keys always quit
	if msg, ok := msg.(tea.KeyMsg); ok {
		switch msg.String() {
		case "q", "esc", "ctrl+c":
			a.state = quit
			return a, tea.Quit
		}
	}

	switch a.state {
	case showSelection:
		cmd = a.list.Update(msg)
		if a.list.Choice != "" {
			a.state = showTable

			if !a.tableLoaded {
				a.loadTable()
			}
		}
		return a, cmd
	case showTable:
		cmd = a.table.Update(msg)
		return a, cmd
	}

	return a, nil
}

// The main view, which just calls the appropriate sub-view
func (a App) View() string {
	switch a.state {
	case showSelection:
		return a.list.View()
	case showTable:
		return a.table.View()
	case quit:
		return "\n  See you later!\n\n"
	}
	return "state unknown"
}

func (a *App) loadTable() {
	cols, rows, err := db.ParseTable(a.db, a.list.Choice)
	if err != nil {
		panic(err)
	}

	a.table = models.NewTable(a.list.Choice, cols, rows)
	a.tableLoaded = true
}
