package sqlite

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/hicbowen/livemate/internal/domain"
)

// TodoReminderTask carries the date alongside a task when the reminder
// service rebuilds future desktop notifications after startup.
type TodoReminderTask struct {
	Date string
	Task domain.TodoTask
}

// GetTodoTasks returns the ordered task snapshot for one calendar date.
func (s *Store) GetTodoTasks(date string) ([]domain.TodoTask, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := validateTodoDate(date); err != nil {
		return nil, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return nil, err
	}

	rows, err := db.Query(`
		SELECT id, text, completed, time_range_json, start_reminder_enabled
		FROM todo_tasks
		WHERE task_date = ?
		ORDER BY sort_order, id`, date)
	if err != nil {
		return nil, fmt.Errorf("读取待办失败：%w", err)
	}
	defer rows.Close()

	tasks := make([]domain.TodoTask, 0)
	for rows.Next() {
		var task domain.TodoTask
		var completed, reminderEnabled int
		var timeRangeJSON sql.NullString
		if err := rows.Scan(&task.ID, &task.Text, &completed, &timeRangeJSON, &reminderEnabled); err != nil {
			return nil, fmt.Errorf("读取待办失败：%w", err)
		}
		task.Completed = completed != 0
		task.StartReminderEnabled = reminderEnabled != 0
		if timeRangeJSON.Valid && strings.TrimSpace(timeRangeJSON.String) != "" {
			if err := json.Unmarshal([]byte(timeRangeJSON.String), &task.TimeRange); err != nil {
				return nil, fmt.Errorf("读取待办时间失败：%w", err)
			}
		}
		if task.TimeRange == nil {
			task.TimeRange = []string{}
		}
		tasks = append(tasks, task)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("读取待办失败：%w", err)
	}
	return tasks, nil
}

// ReplaceTodoTasks atomically replaces the ordered snapshot for one date.
// The page uses snapshot writes so every UI operation has one SQLite commit.
func (s *Store) ReplaceTodoTasks(date string, tasks []domain.TodoTask) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := validateTodoDate(date); err != nil {
		return err
	}
	db, err := s.dbLocked()
	if err != nil {
		return err
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("保存待办失败：%w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM todo_tasks WHERE task_date = ?`, date); err != nil {
		return fmt.Errorf("保存待办失败：%w", err)
	}
	stmt, err := tx.Prepare(`
		INSERT INTO todo_tasks(
			id, task_date, text, completed, time_range_json,
			start_reminder_enabled, sort_order, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("保存待办失败：%w", err)
	}
	defer stmt.Close()

	updatedAt := now()
	seen := make(map[string]struct{}, len(tasks))
	for index, task := range tasks {
		id := strings.TrimSpace(task.ID)
		text := strings.TrimSpace(task.Text)
		if id == "" {
			return errorsTodo("任务 ID 不能为空")
		}
		if text == "" {
			return errorsTodo("待办内容不能为空")
		}
		if _, exists := seen[id]; exists {
			return errorsTodo("待办 ID 不能重复")
		}
		seen[id] = struct{}{}
		if err := validateTodoTimeRange(task.TimeRange); err != nil {
			return err
		}
		timeRangeJSON, err := json.Marshal(normalizeTodoTimeRange(task.TimeRange))
		if err != nil {
			return fmt.Errorf("保存待办失败：%w", err)
		}
		completed := 0
		if task.Completed {
			completed = 1
		}
		reminderEnabled := 0
		if task.StartReminderEnabled {
			reminderEnabled = 1
		}
		if _, err := stmt.Exec(id, date, text, completed, string(timeRangeJSON), reminderEnabled, index, updatedAt); err != nil {
			return fmt.Errorf("保存待办失败：%w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("保存待办失败：%w", err)
	}
	return nil
}

// GetTodoReminderTasks returns enabled tasks across all dates. It is kept
// separate from GetTodoTasks because reminder recovery must not assume the
// currently visible page date.
func (s *Store) GetTodoReminderTasks() ([]TodoReminderTask, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	db, err := s.dbLocked()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(`
		SELECT task_date, id, text, completed, time_range_json, start_reminder_enabled
		FROM todo_tasks
		WHERE start_reminder_enabled = 1
		ORDER BY task_date, sort_order, id`)
	if err != nil {
		return nil, fmt.Errorf("读取待办提醒失败：%w", err)
	}
	defer rows.Close()

	reminders := make([]TodoReminderTask, 0)
	for rows.Next() {
		var date string
		var task domain.TodoTask
		var completed, reminderEnabled int
		var timeRangeJSON sql.NullString
		if err := rows.Scan(&date, &task.ID, &task.Text, &completed, &timeRangeJSON, &reminderEnabled); err != nil {
			return nil, fmt.Errorf("读取待办提醒失败：%w", err)
		}
		task.Completed = completed != 0
		task.StartReminderEnabled = reminderEnabled != 0
		if timeRangeJSON.Valid && strings.TrimSpace(timeRangeJSON.String) != "" {
			if err := json.Unmarshal([]byte(timeRangeJSON.String), &task.TimeRange); err != nil {
				return nil, fmt.Errorf("读取待办时间失败：%w", err)
			}
		}
		if task.TimeRange == nil {
			task.TimeRange = []string{}
		}
		reminders = append(reminders, TodoReminderTask{Date: date, Task: task})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("读取待办提醒失败：%w", err)
	}
	return reminders, nil
}

// SetTodoStartReminder changes only the reminder flag for an existing task.
func (s *Store) SetTodoStartReminder(date, taskID string, enabled bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := validateTodoDate(date); err != nil {
		return err
	}
	taskID = strings.TrimSpace(taskID)
	if taskID == "" {
		return errorsTodo("任务 ID 不能为空")
	}
	db, err := s.dbLocked()
	if err != nil {
		return err
	}
	flag := 0
	if enabled {
		flag = 1
	}
	result, err := db.Exec(`
		UPDATE todo_tasks
		SET start_reminder_enabled = ?, updated_at = ?
		WHERE task_date = ? AND id = ?`, flag, now(), date, taskID)
	if err != nil {
		return fmt.Errorf("更新待办提醒失败：%w", err)
	}
	count, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("更新待办提醒失败：%w", err)
	}
	if count == 0 {
		return errorsTodo("待办不存在")
	}
	return nil
}

func validateTodoDate(value string) error {
	if value == "" {
		return errorsTodo("待办日期不能为空")
	}
	if _, err := time.Parse("2006-01-02", value); err != nil {
		return errorsTodo("待办日期格式无效，应为 YYYY-MM-DD")
	}
	return nil
}

func validateTodoTimeRange(values []string) error {
	if len(values) == 0 {
		return nil
	}
	if len(values) != 2 {
		return errorsTodo("待办时间需要同时包含开始和结束时间")
	}
	for _, value := range values {
		if _, err := time.Parse("15:04", value); err != nil {
			return errorsTodo("待办时间格式无效，应为 HH:mm")
		}
	}
	start, _ := time.Parse("15:04", values[0])
	end, _ := time.Parse("15:04", values[1])
	if !end.After(start) {
		return errorsTodo("待办结束时间必须晚于开始时间")
	}
	return nil
}

func normalizeTodoTimeRange(values []string) []string {
	if len(values) != 2 {
		return []string{}
	}
	return []string{values[0], values[1]}
}

type todoError string

func (e todoError) Error() string { return string(e) }

func errorsTodo(message string) error { return todoError(message) }
