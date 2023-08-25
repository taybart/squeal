package main

// An example demonstrating an application with multiple views.
//
// Note that this example was produced before the Bubbles progress component
// was available (github.com/charmbracelet/bubbles/progress) and thus, we're
// implementing a progress bar from scratch here.

import (
	"database/sql"
	"fmt"
	"io"
	"strings"

	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/table"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

const listHeight = 14

var (
	titleStyle        = lipgloss.NewStyle().MarginLeft(2)
	itemStyle         = lipgloss.NewStyle().PaddingLeft(4)
	selectedItemStyle = lipgloss.NewStyle().PaddingLeft(2).Foreground(lipgloss.Color("170"))
	paginationStyle   = list.DefaultStyles().PaginationStyle.PaddingLeft(4)
	helpStyle         = list.DefaultStyles().HelpStyle.PaddingLeft(4).PaddingBottom(1)
	quitTextStyle     = lipgloss.NewStyle().Margin(1, 0, 2, 4)
)

type item string

func (i item) FilterValue() string { return "" }

type itemDelegate struct{}

func (d itemDelegate) Height() int                             { return 1 }
func (d itemDelegate) Spacing() int                            { return 0 }
func (d itemDelegate) Update(_ tea.Msg, _ *list.Model) tea.Cmd { return nil }
func (d itemDelegate) Render(w io.Writer, m list.Model, index int, listItem list.Item) {
	i, ok := listItem.(item)
	if !ok {
		return
	}

	str := fmt.Sprintf("%d. %s", index+1, i)

	fn := itemStyle.Render
	if index == m.Index() {
		fn = func(s ...string) string {
			return selectedItemStyle.Render("> " + strings.Join(s, " "))
		}
	}

	fmt.Fprint(w, fn(str))
}

type App struct {
	Quitting    bool
	list        list.Model
	db          *sql.DB
	TableName   string
	table       table.Model
	tableLoaded bool
	Query       string
}

func NewApp() (App, error) {

	db, err := sql.Open("sqlite3", "./app.db")
	if err != nil {
		return App{}, nil
	}
	defer db.Close()

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

	const defaultWidth = 20
	items := []list.Item{}
	for _, name := range tables {
		items = append(items, item(name))
	}
	l := list.New(items, itemDelegate{}, defaultWidth, listHeight)
	l.Title = "What do you want for dinner?"
	l.SetShowStatusBar(false)
	l.SetFilteringEnabled(false)
	l.Styles.Title = titleStyle
	l.Styles.PaginationStyle = paginationStyle
	l.Styles.HelpStyle = helpStyle
	return App{
		db:   db,
		list: l,
	}, nil
}
func (a App) Init() tea.Cmd { return nil }

// Main update function.
func (a App) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	// Make sure these keys always quit
	if msg, ok := msg.(tea.KeyMsg); ok {
		switch msg.String() {
		case "q", "esc", "ctrl+c":
			a.Quitting = true
			return a, tea.Quit
		}
	}

	if a.TableName == "" {

		switch msg := msg.(type) {
		case tea.WindowSizeMsg:
			a.list.SetWidth(msg.Width)
			return a, nil

		case tea.KeyMsg:
			switch keypress := msg.String(); keypress {
			case "enter":
				if i, ok := a.list.SelectedItem().(item); ok {
					a.TableName = string(i)
				}
				return a, nil
			}
		}

		var cmd tea.Cmd
		a.list, cmd = a.list.Update(msg)
		return a, cmd
	}
	return a.updateTable(msg)
}

// The main view, which just calls the appropriate sub-view
func (a App) View() string {
	if a.Quitting {
		return "\n  See you later!\n\n"
	}
	if a.TableName == "" {
		return a.list.View()
	}
	if !a.tableLoaded {
		a.loadTable()
	}
	return a.table.View()

}

func (a *App) loadTable() error {
	cols, rows, err := ParseTable(a.db, a.TableName)
	if err != nil {
		return err
	}
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

	a.table = t
	a.tableLoaded = true
	return nil
}

// Sub-update functions

// Update loop for the second view after a choice has been made
func (a *App) updateTable(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "esc":
			if a.table.Focused() {
				a.table.Blur()
			} else {
				a.table.Focus()
			}
		case "enter":
			return a, tea.Batch(
				tea.Printf("Let's go to %s!", a.table.SelectedRow()[1]),
			)
		}
	}
	return a, cmd
}

// Sub-views

// The first view, where you're choosing a task
func (a App) chooseTableView() string {
	return a.list.View()
}

// The second view, after a task has been chosen
func (a App) tableView() string {
	return a.table.View()
}
