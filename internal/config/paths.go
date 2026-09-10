package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type Paths struct {
	DataDir    string
	Database   string
	ConfigFile string
	LogDir     string
	BackupDir  string
}

// DataDir is the single source of truth for the user's business data path.
func DataDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("获取用户配置目录失败：%w", err)
	}
	dir := filepath.Join(base, "livemate")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("创建数据目录失败：%w", err)
	}
	return dir, nil
}

func Resolve() (Paths, error) {
	dir, err := DataDir()
	if err != nil {
		return Paths{}, err
	}
	paths := Paths{
		DataDir:    dir,
		Database:   filepath.Join(dir, "livemate.db"),
		ConfigFile: filepath.Join(dir, "config.json"),
		LogDir:     filepath.Join(dir, "logs"),
		BackupDir:  filepath.Join(dir, "backups"),
	}
	for _, child := range []string{paths.LogDir, paths.BackupDir} {
		if err := os.MkdirAll(child, 0o755); err != nil {
			return Paths{}, fmt.Errorf("创建数据子目录失败：%w", err)
		}
	}
	if _, err := os.Stat(paths.ConfigFile); os.IsNotExist(err) {
		if err := os.WriteFile(paths.ConfigFile, []byte("{}\n"), 0o644); err != nil {
			return Paths{}, fmt.Errorf("创建配置文件失败：%w", err)
		}
	} else if err != nil {
		return Paths{}, fmt.Errorf("读取配置文件失败：%w", err)
	}
	return paths, nil
}

func ReadConfig(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return []byte("{}\n"), nil
	}
	if err != nil {
		return nil, err
	}
	return ReadConfigBytes(data)
}

func ReadConfigBytes(data []byte) ([]byte, error) {
	var value any
	if err := json.Unmarshal(data, &value); err != nil {
		return nil, fmt.Errorf("配置文件不是有效 JSON：%w", err)
	}
	return data, nil
}
