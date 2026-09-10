package platform

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
)

// OpenDirectory delegates to the operating system's default file browser.
// Paths are passed as an argument, never interpolated into a shell command.
func OpenDirectory(path string) error {
	if path == "" {
		return fmt.Errorf("目录路径为空")
	}
	if info, err := os.Stat(path); err != nil || !info.IsDir() {
		if err != nil {
			return fmt.Errorf("目录不存在：%w", err)
		}
		return fmt.Errorf("路径不是目录：%s", path)
	}
	var command string
	var args []string
	switch runtime.GOOS {
	case "windows":
		command, args = "explorer.exe", []string{path}
	case "darwin":
		command, args = "open", []string{path}
	default:
		command, args = "xdg-open", []string{path}
	}
	if err := exec.Command(command, args...).Start(); err != nil {
		return fmt.Errorf("打开目录失败：%w", err)
	}
	return nil
}
