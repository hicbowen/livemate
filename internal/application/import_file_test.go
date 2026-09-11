package application

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"testing"
)

func TestParseImportFileReadsFirstXLSXSheet(t *testing.T) {
	var buffer bytes.Buffer
	archive := zip.NewWriter(&buffer)
	entries := map[string]string{
		"xl/workbook.xml":            `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="数据" sheetId="1" r:id="rId1"/></sheets></workbook>`,
		"xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
		"xl/sharedStrings.xml":       `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>主播</t></si><si><t>小鱼</t></si></sst>`,
		"xl/worksheets/sheet1.xml":   `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>日期</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>45500</v></c><c r="C2"><v>1200</v></c></row></sheetData></worksheet>`,
	}
	for name, content := range entries {
		writer, err := archive.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := writer.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	table, err := parseImportFile("平台数据.xlsx", base64.StdEncoding.EncodeToString(buffer.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	if table.SheetName != "数据" || len(table.Headers) != 3 || table.Headers[0] != "主播" || table.Headers[1] != "日期" || len(table.Rows) != 1 || table.Rows[0][0] != "小鱼" || table.Rows[0][2] != "1200" {
		t.Fatalf("parsed xlsx table = %#v", table)
	}
}
