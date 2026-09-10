package wails

import appservice "github.com/hicbowen/livemate/internal/application"

// NewService is the narrow bridge construction point used by main.go. The
// application service itself contains no Wails or frontend concerns, so this
// package remains the only place where the desktop binding is assembled.
func NewService(service *appservice.Service) *appservice.Service {
	return service
}
