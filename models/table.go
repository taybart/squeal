package models

import (
	"github.com/charmbracelet/bubbles/table"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type Table struct {
	Name  string
	table table.Model
}

func NewTable(name string, cols []string, rows []table.Row) Table {
	columns := []table.Column{}
	for _, col := range cols {
		columns = append(columns, table.Column{Title: col, Width: 20})
	}
	t := table.New(
		table.WithColumns(columns),
		table.WithRows(rows),
		table.WithFocused(true),
		table.WithHeight(7),
		table.WithWidth(500),
	)

	s := table.DefaultStyles()
	s.Header = s.Header.
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(lipgloss.Color("240")).
		BorderBottom(true).
		Bold(false)
	s.Selected = s.Selected.
		Foreground(lipgloss.Color("229")).
		Background(lipgloss.Color("57")).
		Bold(false)
	t.SetStyles(s)

	return Table{Name: name, table: t}
}

func (m *Table) Update(msg tea.Msg) tea.Cmd {
	var cmd tea.Cmd
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "esc":
			if m.table.Focused() {
				m.table.Blur()
			} else {
				m.table.Focus()
			}
		case "enter":
			return tea.Batch(
				tea.Printf("Let's go to %s!", m.table.SelectedRow()),
			)
		}
	}
	m.table, cmd = m.table.Update(msg)
	return cmd
}

func (m Table) View() string {
	style := lipgloss.NewStyle().
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(lipgloss.Color("240"))
	return style.Render(m.table.View()) + "\n"
}
