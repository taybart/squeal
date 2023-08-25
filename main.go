package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	_ "github.com/mattn/go-sqlite3"
)

type SchemaRow struct {
	CID          int    `json:"cid,omitempty" sql:"cid"`
	Name         string `json:"name,omitempty" sql:"name"`
	ColType      string `json:"col_type,omitempty" sql:"col_type"`
	NotNull      int    `json:"not_null,omitempty" sql:"notnull"`
	DefaultValue string `json:"default_value,omitempty" sql:"dflt_value"`
	PK           int    `json:"pk,omitempty" sql:"pk"`
}

func main() {
	if err := run(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}
func run() error {
	app, err := NewApp()
	if err != nil {
		return err
	}
	p := tea.NewProgram(app, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		return err
	}

	return nil
}
