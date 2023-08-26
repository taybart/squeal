package db

type SchemaRow struct {
	CID          int    `json:"cid,omitempty" sql:"cid"`
	Name         string `json:"name,omitempty" sql:"name"`
	ColType      string `json:"col_type,omitempty" sql:"col_type"`
	NotNull      int    `json:"not_null,omitempty" sql:"notnull"`
	DefaultValue string `json:"default_value,omitempty" sql:"dflt_value"`
	PK           int    `json:"pk,omitempty" sql:"pk"`
}
