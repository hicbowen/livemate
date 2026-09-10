package sqlite

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"

	"github.com/hicbowen/livemate/internal/config"
	"github.com/hicbowen/livemate/internal/domain"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

type LogSink interface {
	Printf(format string, args ...any)
}

type Store struct {
	mu     sync.RWMutex
	db     *sql.DB
	paths  config.Paths
	logger LogSink
}

func Open(paths config.Paths, logger LogSink) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(paths.Database), 0o755); err != nil {
		return nil, fmt.Errorf("创建数据库目录失败：%w", err)
	}
	db, err := openConnection(paths.Database)
	if err != nil {
		if logger != nil {
			logger.Printf("数据库打开失败 path=%s error=%v", paths.Database, err)
		}
		return nil, fmt.Errorf("数据库无法打开：%w", err)
	}
	if err := migrateDatabase(db); err != nil {
		_ = db.Close()
		if logger != nil {
			logger.Printf("migration 失败 path=%s error=%v", paths.Database, err)
		}
		return nil, fmt.Errorf("数据库迁移失败：%w", err)
	}
	return &Store{db: db, paths: paths, logger: logger}, nil
}

// OpenAt is useful for isolated tests and command-line tooling. Production
// startup should use config.Resolve and Open so the database stays under the
// user's configuration directory.
func OpenAt(databasePath string, logger LogSink) (*Store, error) {
	dir := filepath.Dir(databasePath)
	paths := config.Paths{
		DataDir:    dir,
		Database:   databasePath,
		ConfigFile: filepath.Join(dir, "config.json"),
		LogDir:     filepath.Join(dir, "logs"),
		BackupDir:  filepath.Join(dir, "backups"),
	}
	for _, child := range []string{paths.LogDir, paths.BackupDir} {
		if err := os.MkdirAll(child, 0o755); err != nil {
			return nil, err
		}
	}
	return Open(paths, logger)
}

func openConnection(databasePath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", databasePath)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	for _, statement := range []string{
		"PRAGMA foreign_keys = ON",
		"PRAGMA busy_timeout = 5000",
		"PRAGMA journal_mode = WAL",
	} {
		if _, err := db.Exec(statement); err != nil {
			_ = db.Close()
			return nil, err
		}
	}
	return db, nil
}

func migrateDatabase(db *sql.DB) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
    )`); err != nil {
		return err
	}
	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		return err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		version, err := migrationVersion(entry.Name())
		if err != nil {
			return err
		}
		var appliedName string
		err = db.QueryRow(`SELECT name FROM schema_migrations WHERE version = ?`, version).Scan(&appliedName)
		switch {
		case err == nil:
			if appliedName != entry.Name() {
				return fmt.Errorf("migration %d 名称不一致：数据库为 %s，代码为 %s", version, appliedName, entry.Name())
			}
			continue
		case !errors.Is(err, sql.ErrNoRows):
			return err
		}
		contents, err := migrationFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return err
		}
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(string(contents)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("执行 %s 失败：%w", entry.Name(), err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)`, version, entry.Name(), now()); err != nil {
			_ = tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

func migrationVersion(name string) (int, error) {
	parts := strings.SplitN(name, "_", 2)
	if len(parts) != 2 {
		return 0, fmt.Errorf("migration 文件名无效：%s", name)
	}
	version, err := strconv.Atoi(parts[0])
	if err != nil || version <= 0 {
		return 0, fmt.Errorf("migration 版本无效：%s", name)
	}
	return version, nil
}

func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db == nil {
		return nil
	}
	err := s.db.Close()
	s.db = nil
	return err
}

func (s *Store) Paths() config.Paths {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.paths
}

func (s *Store) dbLocked() (*sql.DB, error) {
	if s.db == nil {
		return nil, errors.New("数据库连接已关闭")
	}
	return s.db, nil
}

func now() string {
	return time.Now().Format(time.RFC3339Nano)
}

func today() string {
	return time.Now().Format("2006-01-02")
}

func normalizeDate(value string) string {
	if value == "" {
		return today()
	}
	return value
}

func validateDate(value, field string) error {
	if value == "" {
		return fmt.Errorf("%s不能为空", field)
	}
	if _, err := time.Parse("2006-01-02", value); err != nil {
		return fmt.Errorf("%s格式无效，应为 YYYY-MM-DD", field)
	}
	return nil
}

func validateChoice(value, field string, choices []string) error {
	if value == "" {
		return fmt.Errorf("%s不能为空", field)
	}
	for _, choice := range choices {
		if value == choice {
			return nil
		}
	}
	return fmt.Errorf("%s取值无效：%s", field, value)
}

func intPtr(value int64) *int64 { return &value }
func intValue(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}
func int32Ptr(value int) *int { return &value }
func int32Value(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}
func stringValue(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}
func floatValue(value *float64) any {
	if value == nil {
		return nil
	}
	return *value
}

func (s *Store) ExportBackup(appVersion string) (domain.BackupExport, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	db, err := s.dbLocked()
	if err != nil {
		return domain.BackupExport{}, err
	}
	if _, err := db.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		return domain.BackupExport{}, fmt.Errorf("备份失败：无法同步数据库：%w", err)
	}
	dbBytes, err := os.ReadFile(s.paths.Database)
	if err != nil {
		return domain.BackupExport{}, fmt.Errorf("备份失败：读取数据库失败：%w", err)
	}
	configBytes, err := config.ReadConfig(s.paths.ConfigFile)
	if err != nil {
		return domain.BackupExport{}, fmt.Errorf("备份失败：读取配置失败：%w", err)
	}
	manifest := domain.BackupManifest{App: domain.ProjectName, Version: fallbackVersion(appVersion), ExportedAt: now()}
	archive, err := buildArchive(dbBytes, configBytes, manifest)
	if err != nil {
		return domain.BackupExport{}, fmt.Errorf("备份失败：生成压缩包失败：%w", err)
	}
	if err := os.MkdirAll(s.paths.BackupDir, 0o755); err != nil {
		return domain.BackupExport{}, fmt.Errorf("备份失败：创建备份目录失败：%w", err)
	}
	fileName := "livemate-backup-" + time.Now().Format("20060102-150405") + ".zip"
	path := filepath.Join(s.paths.BackupDir, fileName)
	if err := os.WriteFile(path, archive, 0o600); err != nil {
		return domain.BackupExport{}, fmt.Errorf("备份失败：写入压缩包失败：%w", err)
	}
	return domain.BackupExport{FileName: fileName, Path: path, ArchiveBase64: base64.StdEncoding.EncodeToString(archive), ExportedAt: manifest.ExportedAt}, nil
}

func (s *Store) ImportBackup(archiveBase64, appVersion string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	archive, err := base64.StdEncoding.DecodeString(archiveBase64)
	if err != nil {
		return fmt.Errorf("导入失败：备份内容不是有效 Base64：%w", err)
	}
	dbBytes, configBytes, manifest, err := readArchive(archive)
	if err != nil {
		return fmt.Errorf("导入失败：%w", err)
	}
	if manifest.App != domain.ProjectName {
		return fmt.Errorf("导入失败：备份来自不兼容的应用 %q", manifest.App)
	}
	if manifest.Version == "" {
		return errors.New("导入失败：备份缺少版本信息")
	}
	if _, err := config.ReadConfigBytes(configBytes); err != nil {
		return fmt.Errorf("导入失败：配置文件无效：%w", err)
	}

	tempDB, err := os.CreateTemp(filepath.Dir(s.paths.Database), ".livemate-import-*.db")
	if err != nil {
		return fmt.Errorf("导入失败：创建临时数据库失败：%w", err)
	}
	tempPath := tempDB.Name()
	cleanupTemp := true
	defer func() {
		if cleanupTemp {
			_ = os.Remove(tempPath)
		}
	}()
	if _, err := tempDB.Write(dbBytes); err != nil {
		_ = tempDB.Close()
		return fmt.Errorf("导入失败：写入临时数据库失败：%w", err)
	}
	if err := tempDB.Close(); err != nil {
		return fmt.Errorf("导入失败：关闭临时数据库失败：%w", err)
	}
	candidate, err := openConnection(tempPath)
	if err != nil {
		return fmt.Errorf("导入失败：数据库无法打开：%w", err)
	}
	if err := migrateDatabase(candidate); err != nil {
		_ = candidate.Close()
		return fmt.Errorf("导入失败：数据库版本不兼容：%w", err)
	}
	if err := integrityCheck(candidate); err != nil {
		_ = candidate.Close()
		return fmt.Errorf("导入失败：数据库校验失败：%w", err)
	}
	if err := candidate.Close(); err != nil {
		return fmt.Errorf("导入失败：关闭校验数据库失败：%w", err)
	}

	if s.db == nil {
		return errors.New("导入失败：数据库连接已关闭")
	}
	if _, err := s.db.Exec("PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		return fmt.Errorf("导入失败：无法同步当前数据库：%w", err)
	}
	currentDB, err := os.ReadFile(s.paths.Database)
	if err != nil {
		return fmt.Errorf("导入失败：读取当前数据库失败：%w", err)
	}
	currentConfig, err := config.ReadConfig(s.paths.ConfigFile)
	if err != nil {
		return fmt.Errorf("导入失败：读取当前配置失败：%w", err)
	}
	backupManifest := domain.BackupManifest{App: domain.ProjectName, Version: fallbackVersion(appVersion), ExportedAt: now()}
	currentArchive, err := buildArchive(currentDB, currentConfig, backupManifest)
	if err != nil {
		return fmt.Errorf("导入失败：创建导入前备份失败：%w", err)
	}
	if err := os.MkdirAll(s.paths.BackupDir, 0o755); err != nil {
		return fmt.Errorf("导入失败：创建备份目录失败：%w", err)
	}
	preImportName := "livemate-pre-import-" + time.Now().Format("20060102-150405") + ".zip"
	if err := os.WriteFile(filepath.Join(s.paths.BackupDir, preImportName), currentArchive, 0o600); err != nil {
		return fmt.Errorf("导入失败：保存当前数据备份失败：%w", err)
	}

	if err := s.db.Close(); err != nil {
		return fmt.Errorf("导入失败：关闭当前数据库失败：%w", err)
	}
	s.db = nil
	oldPath := s.paths.Database + ".before-import-" + strconv.FormatInt(time.Now().UnixNano(), 10)
	if err := os.Rename(s.paths.Database, oldPath); err != nil {
		_ = s.reopenLocked()
		return fmt.Errorf("导入失败：暂存当前数据库失败：%w", err)
	}
	if err := os.Rename(tempPath, s.paths.Database); err != nil {
		_ = os.Rename(oldPath, s.paths.Database)
		_ = s.reopenLocked()
		return fmt.Errorf("导入失败：替换数据库失败：%w", err)
	}
	cleanupTemp = false
	if err := os.WriteFile(s.paths.ConfigFile, configBytes, 0o644); err != nil {
		_ = os.Remove(s.paths.Database)
		_ = os.Rename(oldPath, s.paths.Database)
		_ = s.reopenLocked()
		return fmt.Errorf("导入失败：替换配置失败：%w", err)
	}
	if err := s.reopenLocked(); err != nil {
		_ = os.Remove(s.paths.Database)
		_ = os.Rename(oldPath, s.paths.Database)
		_ = os.WriteFile(s.paths.ConfigFile, currentConfig, 0o644)
		_ = s.reopenLocked()
		return fmt.Errorf("导入失败：打开替换后的数据库失败：%w", err)
	}
	_ = os.Remove(oldPath)
	return nil
}

func (s *Store) reopenLocked() error {
	db, err := openConnection(s.paths.Database)
	if err != nil {
		return err
	}
	if err := migrateDatabase(db); err != nil {
		_ = db.Close()
		return err
	}
	s.db = db
	return nil
}

func integrityCheck(db *sql.DB) error {
	var result string
	if err := db.QueryRow("PRAGMA integrity_check").Scan(&result); err != nil {
		return err
	}
	if strings.ToLower(result) != "ok" {
		return errors.New(result)
	}
	var migrations int
	if err := db.QueryRow("SELECT COUNT(*) FROM schema_migrations").Scan(&migrations); err != nil {
		return fmt.Errorf("缺少 migration 记录：%w", err)
	}
	if migrations == 0 {
		return errors.New("数据库没有 migration 记录")
	}
	return nil
}

func buildArchive(dbBytes, configBytes []byte, manifest domain.BackupManifest) ([]byte, error) {
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for name, contents := range map[string][]byte{
		"livemate.db": dbBytes,
		"config.json": configBytes,
	} {
		entry, err := writer.Create(name)
		if err != nil {
			return nil, err
		}
		if _, err := entry.Write(contents); err != nil {
			return nil, err
		}
	}
	manifestBytes, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return nil, err
	}
	entry, err := writer.Create("manifest.json")
	if err != nil {
		return nil, err
	}
	if _, err := entry.Write(append(manifestBytes, '\n')); err != nil {
		return nil, err
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func readArchive(archive []byte) ([]byte, []byte, domain.BackupManifest, error) {
	reader, err := zip.NewReader(bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		return nil, nil, domain.BackupManifest{}, errors.New("压缩包损坏")
	}
	var dbBytes, configBytes, manifestBytes []byte
	for _, entry := range reader.File {
		if entry.Name != "livemate.db" && entry.Name != "config.json" && entry.Name != "manifest.json" {
			continue
		}
		if entry.UncompressedSize64 > 200<<20 {
			return nil, nil, domain.BackupManifest{}, errors.New("备份文件过大")
		}
		file, err := entry.Open()
		if err != nil {
			return nil, nil, domain.BackupManifest{}, err
		}
		contents, readErr := io.ReadAll(io.LimitReader(file, 200<<20))
		_ = file.Close()
		if readErr != nil {
			return nil, nil, domain.BackupManifest{}, readErr
		}
		switch entry.Name {
		case "livemate.db":
			dbBytes = contents
		case "config.json":
			configBytes = contents
		case "manifest.json":
			manifestBytes = contents
		}
	}
	if len(dbBytes) == 0 || len(configBytes) == 0 || len(manifestBytes) == 0 {
		return nil, nil, domain.BackupManifest{}, errors.New("备份缺少 livemate.db、config.json 或 manifest.json")
	}
	var manifest domain.BackupManifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		return nil, nil, domain.BackupManifest{}, errors.New("manifest.json 无效")
	}
	return dbBytes, configBytes, manifest, nil
}

func fallbackVersion(value string) string {
	if value == "" {
		return domain.AppVersion
	}
	return value
}
