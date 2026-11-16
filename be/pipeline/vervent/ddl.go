// Package vervent loads Vervent P50 daily extracts into the vervent_* tables.
//
// The column mapping comes from the DDL in sql/0*_vervent_*.sql, embedded in the binary: each
// column's COMMENT starts with the source header in brackets and, for dates, ends with
// "Source format <fmt>". Adding or renaming a column means editing only the DDL.
package vervent

import (
	"embed"
	"fmt"
	"regexp"
	"strings"
)

//go:embed sql/*.sql
var sqlFS embed.FS

// Column is one loaded table column; metadata columns (source_file, file_date, loaded_at) are
// not included.
type Column struct {
	Name    string // table column
	Type    string // SQL type as written in the DDL, without NOT NULL
	Header  string // source file header
	DateFmt string // to_date format, only for date columns
}

// Report describes one extract type and the table it loads into.
type Report struct {
	Name    string // file name part: ContractSummary, AssetSummary, TransactionHistory
	Table   string
	DDLFile string
	Key     string
	Upsert  bool // false: append-only (ON CONFLICT DO NOTHING)
	Columns []Column
}

// Reports in load order within a day: contracts, assets, transactions.
var Reports = []*Report{
	{Name: "ContractSummary", Table: "vervent_contracts", DDLFile: "01_vervent_contracts.sql", Key: "lease_no", Upsert: true},
	{Name: "AssetSummary", Table: "vervent_assets", DDLFile: "02_vervent_assets.sql", Key: "asset_no", Upsert: true},
	{Name: "TransactionHistory", Table: "vervent_transactions", DDLFile: "03_vervent_transactions.sql", Key: "transaction_key", Upsert: false},
}

var (
	metaColumns = map[string]bool{"source_file": true, "file_date": true, "loaded_at": true}
	dateFormats = map[string]string{"MM/DD/YYYY": "MM/DD/YYYY", "YYYYMMDD": "YYYYMMDD", "YYMMDD": "YYMMDD"}

	columnLineRE = regexp.MustCompile(`^\s+("?\w+"?)\s+(.+?),?$`)
	headerRE     = regexp.MustCompile(`^\[([^\]]+)\]`)
	dateFmtRE    = regexp.MustCompile(`Source format (\S+?)\.?$`)
)

func init() {
	for _, r := range Reports {
		cols, err := parseDDL(r.Table, r.DDLFile)
		if err != nil {
			panic(fmt.Sprintf("vervent DDL %s: %v", r.DDLFile, err))
		}
		r.Columns = cols
	}
}

// parseDDL returns the table's columns in table order, metadata excluded.
func parseDDL(table, ddlFile string) ([]Column, error) {
	b, err := sqlFS.ReadFile("sql/" + ddlFile)
	if err != nil {
		return nil, err
	}
	sql := string(b)
	q := regexp.QuoteMeta(table)
	m := regexp.MustCompile(`(?s)CREATE TABLE IF NOT EXISTS ` + q + ` \((.*?)\n\);`).FindStringSubmatch(sql)
	if m == nil {
		return nil, fmt.Errorf("no CREATE TABLE IF NOT EXISTS %s", table)
	}
	body := m[1]
	comments := map[string]string{}
	for _, c := range regexp.MustCompile(`COMMENT ON COLUMN `+q+`\."?(\w+)"? IS '((?:[^']|'')*)';`).FindAllStringSubmatch(sql, -1) {
		comments[c[1]] = c[2]
	}

	var cols []Column
	for _, line := range strings.Split(body, "\n") {
		lm := columnLineRE.FindStringSubmatch(line)
		if lm == nil || lm[1] == "CONSTRAINT" {
			continue
		}
		name, typ := strings.Trim(lm[1], `"`), strings.ReplaceAll(lm[2], " NOT NULL", "")
		if metaColumns[name] {
			continue
		}
		comment, ok := comments[name]
		if !ok {
			return nil, fmt.Errorf("column %s has no COMMENT", name)
		}
		hm := headerRE.FindStringSubmatch(comment)
		if hm == nil {
			return nil, fmt.Errorf("COMMENT on %s does not start with [header]", name)
		}
		col := Column{Name: name, Type: typ, Header: hm[1]}
		if typ == "date" {
			fm := dateFmtRE.FindStringSubmatch(comment)
			if fm == nil {
				return nil, fmt.Errorf("COMMENT on date column %s has no 'Source format <fmt>'", name)
			}
			if col.DateFmt, ok = dateFormats[fm[1]]; !ok {
				return nil, fmt.Errorf("column %s: unknown date format %q", name, fm[1])
			}
		}
		cols = append(cols, col)
	}
	return cols, nil
}

func quoteIdent(col string) string {
	if col == "trim" || col == "off" {
		return `"` + col + `"`
	}
	return col
}

func castExpr(expr string, c Column) string {
	v := "NULLIF(btrim(" + expr + "), '')"
	switch c.Type {
	case "text":
		return v
	case "date":
		return "to_date(" + v + ", '" + c.DateFmt + "')"
	case "boolean":
		return "CASE " + v + " WHEN '1' THEN true WHEN 'True' THEN true " +
			"WHEN '0' THEN false WHEN 'False' THEN false END"
	}
	return v + "::" + c.Type
}
