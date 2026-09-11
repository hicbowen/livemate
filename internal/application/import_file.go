package application

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"io"
	"path"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/hicbowen/livemate/internal/domain"
)

const (
	maxImportArchiveBytes = 25 << 20
	maxImportEntryBytes   = 50 << 20
	maxImportRows         = 50000
)

type workbookXML struct {
	Sheets []workbookSheet `xml:"sheets>sheet"`
}

type workbookSheet struct {
	Name  string `xml:"name,attr"`
	RelID string `xml:"id,attr"`
}

type relationshipsXML struct {
	Relationships []workbookRelationship `xml:"Relationship"`
}

type workbookRelationship struct {
	ID     string `xml:"Id,attr"`
	Target string `xml:"Target,attr"`
}

type sharedStringsXML struct {
	Items []sharedStringItem `xml:"si"`
}

type sharedStringItem struct {
	Text []string          `xml:"t"`
	Runs []sharedStringRun `xml:"r"`
}

type sharedStringRun struct {
	Text string `xml:"t"`
}

type worksheetXML struct {
	SheetData worksheetData `xml:"sheetData"`
}

type worksheetData struct {
	Rows []worksheetRow `xml:"row"`
}

type worksheetRow struct {
	Cells []worksheetCell `xml:"c"`
}

type worksheetCell struct {
	Reference  string          `xml:"r,attr"`
	CellType   string          `xml:"t,attr"`
	Value      string          `xml:"v"`
	InlineText inlineStringXML `xml:"is"`
}

type inlineStringXML struct {
	Text []string          `xml:"t"`
	Runs []sharedStringRun `xml:"r"`
}

func parseImportFile(fileName, contentBase64 string) (domain.ImportTable, error) {
	if strings.ToLower(filepath.Ext(strings.TrimSpace(fileName))) != ".xlsx" {
		return domain.ImportTable{}, fmt.Errorf("暂时只由后端解析 .xlsx；CSV / TSV 请直接选择文本文件")
	}
	content, err := decodeImportBase64(contentBase64)
	if err != nil {
		return domain.ImportTable{}, fmt.Errorf("读取 Excel 文件失败：%w", err)
	}
	if len(content) == 0 {
		return domain.ImportTable{}, fmt.Errorf("Excel 文件为空")
	}
	if len(content) > maxImportArchiveBytes {
		return domain.ImportTable{}, fmt.Errorf("Excel 文件不能超过 25 MB")
	}
	archive, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		return domain.ImportTable{}, fmt.Errorf("Excel 文件不是有效的 .xlsx：%w", err)
	}
	readEntry := func(name string) ([]byte, error) {
		for _, entry := range archive.File {
			if entry.Name != name {
				continue
			}
			if entry.UncompressedSize64 > maxImportEntryBytes {
				return nil, fmt.Errorf("Excel 内部文件过大：%s", name)
			}
			reader, err := entry.Open()
			if err != nil {
				return nil, err
			}
			defer reader.Close()
			return io.ReadAll(io.LimitReader(reader, maxImportEntryBytes+1))
		}
		return nil, fmt.Errorf("Excel 缺少内部文件：%s", name)
	}

	workbookBytes, err := readEntry("xl/workbook.xml")
	if err != nil {
		return domain.ImportTable{}, err
	}
	var workbook workbookXML
	if err := xml.Unmarshal(workbookBytes, &workbook); err != nil {
		return domain.ImportTable{}, fmt.Errorf("读取 Excel 工作簿失败：%w", err)
	}
	if len(workbook.Sheets) == 0 {
		return domain.ImportTable{}, fmt.Errorf("Excel 没有可导入的工作表")
	}

	relationsBytes, err := readEntry("xl/_rels/workbook.xml.rels")
	if err != nil {
		return domain.ImportTable{}, err
	}
	var relations relationshipsXML
	if err := xml.Unmarshal(relationsBytes, &relations); err != nil {
		return domain.ImportTable{}, fmt.Errorf("读取 Excel 工作表关系失败：%w", err)
	}
	paths := make(map[string]string, len(relations.Relationships))
	for _, relation := range relations.Relationships {
		paths[relation.ID] = relation.Target
	}
	firstSheet := workbook.Sheets[0]
	target, ok := paths[firstSheet.RelID]
	if !ok || strings.TrimSpace(target) == "" {
		return domain.ImportTable{}, fmt.Errorf("无法定位 Excel 的第一张工作表")
	}
	sheetPath := strings.TrimPrefix(path.Clean(path.Join("xl", target)), "../")
	if strings.HasPrefix(target, "/") {
		sheetPath = strings.TrimPrefix(path.Clean(target), "/")
	}
	sheetBytes, err := readEntry(sheetPath)
	if err != nil {
		return domain.ImportTable{}, err
	}

	shared := []string{}
	if sharedBytes, sharedErr := readEntry("xl/sharedStrings.xml"); sharedErr == nil {
		var sharedXML sharedStringsXML
		if err := xml.Unmarshal(sharedBytes, &sharedXML); err != nil {
			return domain.ImportTable{}, fmt.Errorf("读取 Excel 共享字符串失败：%w", err)
		}
		shared = make([]string, len(sharedXML.Items))
		for index, item := range sharedXML.Items {
			shared[index] = item.text()
		}
	}

	var worksheet worksheetXML
	if err := xml.Unmarshal(sheetBytes, &worksheet); err != nil {
		return domain.ImportTable{}, fmt.Errorf("读取 Excel 工作表失败：%w", err)
	}
	if len(worksheet.SheetData.Rows) == 0 {
		return domain.ImportTable{}, fmt.Errorf("Excel 第一张工作表没有数据")
	}
	if len(worksheet.SheetData.Rows) > maxImportRows+1 {
		return domain.ImportTable{}, fmt.Errorf("Excel 数据不能超过 %d 行", maxImportRows)
	}

	rows := make([][]string, 0, len(worksheet.SheetData.Rows))
	maxColumns := 0
	for _, row := range worksheet.SheetData.Rows {
		values := make(map[int]string, len(row.Cells))
		for fallbackIndex, cell := range row.Cells {
			column := excelColumnIndex(cell.Reference)
			if column < 0 {
				column = fallbackIndex
			}
			values[column] = excelCellValue(cell, shared)
			if column+1 > maxColumns {
				maxColumns = column + 1
			}
		}
		rows = append(rows, makeExcelRow(values, maxColumns))
	}
	if maxColumns == 0 {
		return domain.ImportTable{}, fmt.Errorf("Excel 第一张工作表没有可识别的单元格")
	}
	for index := range rows {
		if len(rows[index]) < maxColumns {
			rows[index] = append(rows[index], make([]string, maxColumns-len(rows[index]))...)
		}
	}
	return domain.ImportTable{FileName: fileName, SheetName: firstSheet.Name, Headers: rows[0], Rows: rows[1:]}, nil
}

func decodeImportBase64(value string) ([]byte, error) {
	decoded, err := base64.StdEncoding.DecodeString(value)
	if err == nil {
		return decoded, nil
	}
	decoded, rawErr := base64.RawStdEncoding.DecodeString(value)
	if rawErr != nil {
		return nil, err
	}
	return decoded, nil
}

func (item sharedStringItem) text() string {
	if len(item.Runs) > 0 {
		parts := make([]string, 0, len(item.Runs))
		for _, run := range item.Runs {
			parts = append(parts, run.Text)
		}
		return strings.Join(parts, "")
	}
	return strings.Join(item.Text, "")
}

func (item inlineStringXML) text() string {
	if len(item.Runs) > 0 {
		parts := make([]string, 0, len(item.Runs))
		for _, run := range item.Runs {
			parts = append(parts, run.Text)
		}
		return strings.Join(parts, "")
	}
	return strings.Join(item.Text, "")
}

func excelCellValue(cell worksheetCell, shared []string) string {
	if cell.CellType == "inlineStr" {
		return cell.InlineText.text()
	}
	if cell.CellType == "s" {
		index, err := strconv.Atoi(strings.TrimSpace(cell.Value))
		if err == nil && index >= 0 && index < len(shared) {
			return shared[index]
		}
	}
	if cell.CellType == "b" {
		if strings.TrimSpace(cell.Value) == "1" {
			return "TRUE"
		}
		return "FALSE"
	}
	return strings.TrimSpace(cell.Value)
}

func excelColumnIndex(reference string) int {
	column := 0
	seen := false
	for _, character := range strings.ToUpper(reference) {
		if character < 'A' || character > 'Z' {
			break
		}
		seen = true
		column = column*26 + int(character-'A'+1)
	}
	if !seen {
		return -1
	}
	return column - 1
}

func makeExcelRow(values map[int]string, columnCount int) []string {
	row := make([]string, columnCount)
	for index, value := range values {
		if index >= 0 && index < len(row) {
			row[index] = value
		}
	}
	return row
}
