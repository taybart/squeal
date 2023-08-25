package main

import (
	"database/sql"
	"fmt"

	"github.com/charmbracelet/bubbles/table"
)

func ParseTable(db *sql.DB, tableName string) ([]string, []table.Row, error) {
	colNames := []string{}
	sch, err := db.Query(fmt.Sprintf("pragma table_info(%s)", tableName))
	if err != nil {
		return nil, nil, err
	}
	for sch.Next() {
		var schema SchemaRow
		sch.Scan(&schema.CID, &schema.Name, &schema.ColType, &schema.NotNull, &schema.DefaultValue, &schema.PK)
		colNames = append(colNames, schema.Name)
		// fmt.Println(name, schema)
	}

	rows, err := db.Query("select * from posts")
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	tableRows := []table.Row{}
	for rows.Next() {
		var id string
		var title string
		var body string
		var published string
		err = rows.Scan(&id, &title, &body, &published)
		if err != nil {
			return nil, nil, err
		}
		tableRows = append(tableRows, table.Row{fmt.Sprintf("%v", id), title, body, fmt.Sprintf("%v", published)})
	}
	return colNames, tableRows, nil
}
