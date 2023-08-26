package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	_ "github.com/mattn/go-sqlite3"
)

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
	// p := tea.NewProgram(app, tea.WithAltScreen())
	p := tea.NewProgram(app)
	if _, err := p.Run(); err != nil {
		return err
	}

	return nil
}
