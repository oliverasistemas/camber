package main

import (
	"archive/zip"
	"bufio"
	"encoding/xml"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"time"
	"unicode/utf8"
)

// A list endpoint called with format=xlsx answers with every row the filters match as an Excel
// workbook instead of a page of JSON: one sheet, a frozen bold header row of column names, then
// the rows in the requested order. The sheet is written straight to the response as the rows are
// read, so a large table costs no memory here.

const (
	// maxExportRows keeps an export inside one sheet (Excel's limit is 1,048,576 rows).
	maxExportRows = 1_000_000
	// maxCellChars is Excel's limit on the text in one cell.
	maxCellChars = 32767
	// Excel shows integers to 15 significant digits; longer ones are written as text.
	maxNumberDigits = 15
)

type cellKind int

const (
	cellText   cellKind = iota
	cellNumber          // written as a number if it parses as one
	cellDate            // YYYY-MM-DD, written as an Excel date
)

// Cell styles in xlsxStyles' cellXfs.
const (
	styleHeader = 1
	styleDate   = 2
)

const xlsxContentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`

const xlsxRootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`

const xlsxWorkbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`

const xlsxWorkbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`

// Three cell formats: default, bold (the header) and a yyyy-mm-dd date.
const xlsxStyles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\-mm\-dd"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

const xlsxSheetHead = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>`

var excelEpoch = time.Date(1899, 12, 30, 0, 0, 0, 0, time.UTC)

// xlsxWriter streams one sheet. Write errors are kept and returned by close.
type xlsxWriter struct {
	zip   *zip.Writer
	sheet *bufio.Writer
	err   error
}

// startXLSX begins the download of name_<today>.xlsx with its header row.
func startXLSX(w http.ResponseWriter, name string, header []string) *xlsxWriter {
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s_%s.xlsx"`, name, time.Now().Format("20060102")))
	x := &xlsxWriter{zip: zip.NewWriter(w)}
	for _, part := range [][2]string{
		{"[Content_Types].xml", xlsxContentTypes},
		{"_rels/.rels", xlsxRootRels},
		{"xl/workbook.xml", xlsxWorkbook},
		{"xl/_rels/workbook.xml.rels", xlsxWorkbookRels},
		{"xl/styles.xml", xlsxStyles},
	} {
		f, err := x.zip.Create(part[0])
		if err == nil {
			_, err = f.Write([]byte(part[1]))
		}
		x.keep(err)
	}
	f, err := x.zip.Create("xl/worksheets/sheet1.xml")
	x.keep(err)
	if err != nil {
		return x
	}
	x.sheet = bufio.NewWriter(f)
	x.sheet.WriteString(xlsxSheetHead)
	x.sheet.WriteString("<row>")
	for _, h := range header {
		x.text(h, styleHeader)
	}
	x.sheet.WriteString("</row>")
	return x
}

func (x *xlsxWriter) keep(err error) {
	if x.err == nil {
		x.err = err
	}
}

// row writes one row; kinds[i] says how to write values[i], and a nil value is an empty cell.
func (x *xlsxWriter) row(values []*string, kinds []cellKind) {
	if x.sheet == nil {
		return
	}
	x.sheet.WriteString("<row>")
	for i, v := range values {
		switch {
		case v == nil:
			x.sheet.WriteString("<c/>")
		case kinds[i] == cellNumber && isExcelNumber(*v):
			x.sheet.WriteString("<c><v>" + *v + "</v></c>")
		case kinds[i] == cellDate:
			if d, err := time.Parse(time.DateOnly, *v); err == nil && !d.Before(excelEpoch) {
				fmt.Fprintf(x.sheet, `<c s="%d"><v>%d</v></c>`, styleDate, int(d.Sub(excelEpoch).Hours()/24))
				break
			}
			x.text(*v, 0)
		default:
			x.text(*v, 0)
		}
	}
	x.sheet.WriteString("</row>")
}

func (x *xlsxWriter) text(s string, style int) {
	if utf8.RuneCountInString(s) > maxCellChars {
		s = string([]rune(s)[:maxCellChars])
	}
	fmt.Fprintf(x.sheet, `<c t="inlineStr" s="%d"><is><t xml:space="preserve">`, style)
	x.keep(xml.EscapeText(x.sheet, []byte(s)))
	x.sheet.WriteString("</t></is></c>")
}

func (x *xlsxWriter) close() error {
	if x.sheet != nil {
		x.sheet.WriteString("</sheetData></worksheet>")
		x.keep(x.sheet.Flush())
	}
	x.keep(x.zip.Close())
	return x.err
}

// isExcelNumber reports whether s can be written as a number cell without Excel changing it.
func isExcelNumber(s string) bool {
	f, err := strconv.ParseFloat(s, 64)
	if err != nil || math.IsNaN(f) || math.IsInf(f, 0) {
		return false
	}
	digits := 0
	for _, c := range s {
		if c >= '0' && c <= '9' {
			digits++
		} else if c != '.' && c != '-' {
			return false // exponents, signs and spaces: leave as text
		}
	}
	return digits <= maxNumberDigits
}
