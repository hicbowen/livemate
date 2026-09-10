package platform

import (
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"

	"github.com/hicbowen/livemate/internal/config"
)

type Logger struct {
	mu   sync.Mutex
	file *os.File
	log  *log.Logger
}

func NewLogger(paths config.Paths) (*Logger, error) {
	if err := os.MkdirAll(paths.LogDir, 0o755); err != nil {
		return nil, err
	}
	path := filepath.Join(paths.LogDir, "livemate.log")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	return &Logger{file: file, log: log.New(io.MultiWriter(file), "", log.LstdFlags|log.LUTC)}, nil
}

func (l *Logger) Printf(format string, args ...any) {
	if l == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.log.Printf(format, args...)
}

func (l *Logger) Close() error {
	if l == nil || l.file == nil {
		return nil
	}
	return l.file.Close()
}
