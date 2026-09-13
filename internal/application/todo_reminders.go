package application

import (
	"context"
	"fmt"
	"time"

	wailsapp "github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

const todoReminderIDPrefix = "livemate.todo.start."

// ServiceStartup restores future Todo reminders after the Wails notification
// service has initialized its platform-specific implementation.
func (s *Service) ServiceStartup(context.Context, wailsapp.ServiceOptions) error {
	if err := s.reconcileTodoStartReminders(); err != nil {
		// Reminder recovery should never prevent the main application from
		// opening when the platform notification service is unavailable.
		fmt.Printf("恢复待办提醒失败：%v\n", err)
	}
	return nil
}

// ServiceShutdown removes reminders owned by this app before the notification
// service is shut down. The stored task flag remains the source of truth.
func (s *Service) ServiceShutdown() error {
	if s.notifier == nil {
		return nil
	}
	s.reminderMu.Lock()
	defer s.reminderMu.Unlock()
	for reminderID := range s.scheduledTodoReminders {
		_ = s.notifier.RemovePendingNotification(reminderID)
	}
	s.scheduledTodoReminders = make(map[string]struct{})
	return nil
}

func (s *Service) reconcileTodoStartReminders() error {
	if s.notifier == nil {
		return nil
	}

	s.reminderMu.Lock()
	defer s.reminderMu.Unlock()

	stored, err := s.store.GetTodoReminderTasks()
	if err != nil {
		return err
	}
	now := time.Now()
	next := make(map[string]struct{}, len(stored))
	var firstErr error

	for _, item := range stored {
		reminderID := todoReminderID(item.Date, item.Task.ID)
		if item.Task.Completed || len(item.Task.TimeRange) == 0 {
			if item.Task.StartReminderEnabled && len(item.Task.TimeRange) == 0 {
				if err := s.store.SetTodoStartReminder(item.Date, item.Task.ID, false); err != nil && firstErr == nil {
					firstErr = err
				}
			}
			continue
		}

		start, parseErr := todoReminderTime(item.Date, item.Task.TimeRange[0], now)
		if parseErr != nil {
			// A passed or malformed reminder should not be replayed forever on
			// every application restart.
			if err := s.store.SetTodoStartReminder(item.Date, item.Task.ID, false); err != nil && firstErr == nil {
				firstErr = err
			}
			continue
		}

		// Removing the deterministic ID first also prevents duplicate native
		// notifications when macOS persisted a scheduled notification across
		// an application restart.
		_ = s.notifier.RemovePendingNotification(reminderID)
		err := s.notifier.SendNotification(notifications.NotificationOptions{
			ID:                reminderID,
			Title:             "待办开始提醒",
			Body:              item.Task.Text,
			InterruptionLevel: notifications.InterruptionLevelActive,
			Schedule:          &notifications.NotificationSchedule{At: start.Unix()},
		})
		if err != nil {
			if firstErr == nil {
				firstErr = fmt.Errorf("安排待办提醒失败：%w", err)
			}
			continue
		}
		next[reminderID] = struct{}{}
	}

	for reminderID := range s.scheduledTodoReminders {
		if _, keep := next[reminderID]; !keep {
			_ = s.notifier.RemovePendingNotification(reminderID)
		}
	}
	s.scheduledTodoReminders = next
	return firstErr
}

func todoReminderID(date, taskID string) string {
	return todoReminderIDPrefix + date + "." + taskID
}

func todoReminderTime(date, start string, now time.Time) (time.Time, error) {
	target, err := time.ParseInLocation("2006-01-02 15:04", date+" "+start, time.Local)
	if err != nil || target.Format("2006-01-02") != date || target.Format("15:04") != start {
		return time.Time{}, fmt.Errorf("提醒时间格式不正确")
	}
	if !target.After(now) {
		return time.Time{}, fmt.Errorf("开始时间已过期")
	}
	return target, nil
}
