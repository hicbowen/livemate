package sqlite

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/hicbowen/livemate/internal/domain"
)

func (s *Store) CreateGoal(input domain.StageGoalInput) (domain.StageGoal, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	input.StartDate = normalizeDate(input.StartDate)
	if input.AnchorID <= 0 || strings.TrimSpace(input.Title) == "" {
		return domain.StageGoal{}, fmt.Errorf("阶段目标必须填写主播和标题")
	}
	if err := validateDate(input.StartDate, "目标开始日期"); err != nil {
		return domain.StageGoal{}, err
	}
	if err := validateDate(input.EndDate, "目标结束日期"); err != nil {
		return domain.StageGoal{}, err
	}
	if input.EndDate < input.StartDate {
		return domain.StageGoal{}, fmt.Errorf("目标结束日期不能早于开始日期")
	}
	status := defaultString(input.Status, domain.GoalStatuses[0])
	if err := validateChoice(status, "目标状态", domain.GoalStatuses); err != nil {
		return domain.StageGoal{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.StageGoal{}, err
	}
	if err := anchorExists(db, input.AnchorID, true); err != nil {
		return domain.StageGoal{}, err
	}
	tx, err := db.Begin()
	if err != nil {
		return domain.StageGoal{}, err
	}
	createdAt := now()
	result, err := tx.Exec(`INSERT INTO stage_goals(anchor_id, title, start_date, end_date, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, input.AnchorID, strings.TrimSpace(input.Title), input.StartDate, input.EndDate, input.Description, status, createdAt, createdAt)
	if err != nil {
		_ = tx.Rollback()
		return domain.StageGoal{}, fmt.Errorf("保存阶段目标失败：%w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		_ = tx.Rollback()
		return domain.StageGoal{}, err
	}
	if err := insertGoalMetrics(tx, id, input.Metrics, createdAt); err != nil {
		_ = tx.Rollback()
		return domain.StageGoal{}, fmt.Errorf("保存阶段目标指标失败：%w", err)
	}
	if err := tx.Commit(); err != nil {
		return domain.StageGoal{}, err
	}
	return s.getGoalLocked(id)
}

func (s *Store) UpdateGoal(id int64, input domain.StageGoalInput) (domain.StageGoal, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	input.StartDate = normalizeDate(input.StartDate)
	if id <= 0 || input.AnchorID <= 0 || strings.TrimSpace(input.Title) == "" {
		return domain.StageGoal{}, fmt.Errorf("阶段目标参数无效")
	}
	if err := validateDate(input.StartDate, "目标开始日期"); err != nil {
		return domain.StageGoal{}, err
	}
	if err := validateDate(input.EndDate, "目标结束日期"); err != nil {
		return domain.StageGoal{}, err
	}
	if input.EndDate < input.StartDate {
		return domain.StageGoal{}, fmt.Errorf("目标结束日期不能早于开始日期")
	}
	status := defaultString(input.Status, domain.GoalStatuses[0])
	if err := validateChoice(status, "目标状态", domain.GoalStatuses); err != nil {
		return domain.StageGoal{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.StageGoal{}, err
	}
	if err := anchorExists(db, input.AnchorID, true); err != nil {
		return domain.StageGoal{}, err
	}
	tx, err := db.Begin()
	if err != nil {
		return domain.StageGoal{}, err
	}
	result, err := tx.Exec(`UPDATE stage_goals SET title = ?, start_date = ?, end_date = ?, description = ?, status = ?, updated_at = ? WHERE id = ? AND anchor_id = ?`, strings.TrimSpace(input.Title), input.StartDate, input.EndDate, input.Description, status, now(), id, input.AnchorID)
	if err != nil {
		_ = tx.Rollback()
		return domain.StageGoal{}, fmt.Errorf("保存阶段目标失败：%w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		_ = tx.Rollback()
		return domain.StageGoal{}, fmt.Errorf("阶段目标不存在")
	}
	if _, err := tx.Exec(`DELETE FROM goal_metrics WHERE goal_id = ?`, id); err != nil {
		_ = tx.Rollback()
		return domain.StageGoal{}, err
	}
	if err := insertGoalMetrics(tx, id, input.Metrics, now()); err != nil {
		_ = tx.Rollback()
		return domain.StageGoal{}, fmt.Errorf("保存阶段目标指标失败：%w", err)
	}
	if err := tx.Commit(); err != nil {
		return domain.StageGoal{}, err
	}
	return s.getGoalLocked(id)
}

func (s *Store) ChangeGoalStatus(id int64, status string) (domain.StageGoal, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := validateChoice(status, "目标状态", domain.GoalStatuses); err != nil {
		return domain.StageGoal{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.StageGoal{}, err
	}
	result, err := db.Exec(`UPDATE stage_goals SET status = ?, updated_at = ? WHERE id = ?`, status, now(), id)
	if err != nil {
		return domain.StageGoal{}, fmt.Errorf("更新目标状态失败：%w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return domain.StageGoal{}, fmt.Errorf("阶段目标不存在")
	}
	return s.getGoalLocked(id)
}

func (s *Store) GetGoal(id int64) (domain.StageGoal, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getGoalLocked(id)
}

func (s *Store) getGoalLocked(id int64) (domain.StageGoal, error) {
	db, err := s.dbLocked()
	if err != nil {
		return domain.StageGoal{}, err
	}
	var goal domain.StageGoal
	if err := db.QueryRow(`SELECT id, anchor_id, title, start_date, end_date, description, status, created_at, updated_at FROM stage_goals WHERE id = ?`, id).Scan(&goal.ID, &goal.AnchorID, &goal.Title, &goal.StartDate, &goal.EndDate, &goal.Description, &goal.Status, &goal.CreatedAt, &goal.UpdatedAt); err != nil {
		if err == sql.ErrNoRows {
			return domain.StageGoal{}, fmt.Errorf("阶段目标不存在")
		}
		return domain.StageGoal{}, err
	}
	goal.Metrics, err = loadGoalMetrics(db, id)
	return goal, err
}

func (s *Store) ListGoals(anchorID int64) ([]domain.StageGoal, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	db, err := s.dbLocked()
	if err != nil {
		return nil, err
	}
	query := `SELECT id, anchor_id, title, start_date, end_date, description, status, created_at, updated_at FROM stage_goals`
	args := []any{}
	if anchorID > 0 {
		query += ` WHERE anchor_id = ?`
		args = append(args, anchorID)
	}
	query += ` ORDER BY CASE status WHEN '进行中' THEN 0 ELSE 1 END, start_date DESC, id DESC LIMIT 200`
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.StageGoal, 0)
	for rows.Next() {
		var item domain.StageGoal
		if err := rows.Scan(&item.ID, &item.AnchorID, &item.Title, &item.StartDate, &item.EndDate, &item.Description, &item.Status, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	for index := range items {
		items[index].Metrics, err = loadGoalMetrics(db, items[index].ID)
		if err != nil {
			return nil, err
		}
	}
	return items, nil
}

func (s *Store) CreateEvent(input domain.AnchorEventInput) (domain.AnchorEvent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	input.EventDate = normalizeDate(input.EventDate)
	if input.AnchorID <= 0 || strings.TrimSpace(input.Title) == "" {
		return domain.AnchorEvent{}, fmt.Errorf("关键事件必须填写主播和标题")
	}
	if err := validateDate(input.EventDate, "事件日期"); err != nil {
		return domain.AnchorEvent{}, err
	}
	eventType := defaultString(input.EventType, "其他")
	if err := validateChoice(eventType, "事件类型", domain.EventTypes); err != nil {
		return domain.AnchorEvent{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.AnchorEvent{}, err
	}
	if err := anchorExists(db, input.AnchorID, true); err != nil {
		return domain.AnchorEvent{}, err
	}
	if input.LiveSessionID != nil {
		if err := sessionBelongsToAnchor(db, *input.LiveSessionID, input.AnchorID); err != nil {
			return domain.AnchorEvent{}, err
		}
	}
	createdAt := now()
	result, err := db.Exec(`INSERT INTO anchor_events(anchor_id, event_date, event_type, title, content, live_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, input.AnchorID, input.EventDate, eventType, strings.TrimSpace(input.Title), input.Content, intValue(input.LiveSessionID), createdAt, createdAt)
	if err != nil {
		return domain.AnchorEvent{}, fmt.Errorf("保存关键事件失败：%w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.AnchorEvent{}, err
	}
	return s.getEventLocked(id)
}

func (s *Store) UpdateEvent(id int64, input domain.AnchorEventInput) (domain.AnchorEvent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	input.EventDate = normalizeDate(input.EventDate)
	if id <= 0 || input.AnchorID <= 0 || strings.TrimSpace(input.Title) == "" {
		return domain.AnchorEvent{}, fmt.Errorf("关键事件参数无效")
	}
	if err := validateDate(input.EventDate, "事件日期"); err != nil {
		return domain.AnchorEvent{}, err
	}
	eventType := defaultString(input.EventType, "其他")
	if err := validateChoice(eventType, "事件类型", domain.EventTypes); err != nil {
		return domain.AnchorEvent{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.AnchorEvent{}, err
	}
	if err := anchorExists(db, input.AnchorID, true); err != nil {
		return domain.AnchorEvent{}, err
	}
	if input.LiveSessionID != nil {
		if err := sessionBelongsToAnchor(db, *input.LiveSessionID, input.AnchorID); err != nil {
			return domain.AnchorEvent{}, err
		}
	}
	result, err := db.Exec(`UPDATE anchor_events SET event_date = ?, event_type = ?, title = ?, content = ?, live_session_id = ?, updated_at = ? WHERE id = ? AND anchor_id = ?`, input.EventDate, eventType, strings.TrimSpace(input.Title), input.Content, intValue(input.LiveSessionID), now(), id, input.AnchorID)
	if err != nil {
		return domain.AnchorEvent{}, fmt.Errorf("保存关键事件失败：%w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return domain.AnchorEvent{}, fmt.Errorf("关键事件不存在")
	}
	return s.getEventLocked(id)
}

func (s *Store) DeleteEvent(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	db, err := s.dbLocked()
	if err != nil {
		return err
	}
	result, err := db.Exec(`DELETE FROM anchor_events WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("删除关键事件失败：%w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return fmt.Errorf("关键事件不存在")
	}
	return nil
}

func (s *Store) GetEvent(id int64) (domain.AnchorEvent, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getEventLocked(id)
}

func (s *Store) getEventLocked(id int64) (domain.AnchorEvent, error) {
	db, err := s.dbLocked()
	if err != nil {
		return domain.AnchorEvent{}, err
	}
	return scanEvent(db.QueryRow(`SELECT id, anchor_id, event_date, event_type, title, content, live_session_id, created_at, updated_at FROM anchor_events WHERE id = ?`, id))
}

func (s *Store) ListEvents(anchorID int64) ([]domain.AnchorEvent, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	db, err := s.dbLocked()
	if err != nil {
		return nil, err
	}
	query := `SELECT id, anchor_id, event_date, event_type, title, content, live_session_id, created_at, updated_at FROM anchor_events`
	args := []any{}
	if anchorID > 0 {
		query += ` WHERE anchor_id = ?`
		args = append(args, anchorID)
	}
	query += ` ORDER BY event_date DESC, id DESC LIMIT 500`
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.AnchorEvent, 0)
	for rows.Next() {
		item, err := scanEvent(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func insertGoalMetrics(tx *sql.Tx, goalID int64, inputs []domain.GoalMetricInput, createdAt string) error {
	for _, input := range inputs {
		if strings.TrimSpace(input.MetricName) == "" {
			continue
		}
		if _, err := tx.Exec(`INSERT INTO goal_metrics(goal_id, metric_name, baseline_value, target_value, metric_unit, created_at) VALUES (?, ?, ?, ?, ?, ?)`, goalID, strings.TrimSpace(input.MetricName), floatValue(input.BaselineValue), floatValue(input.TargetValue), input.MetricUnit, createdAt); err != nil {
			return err
		}
	}
	return nil
}

func loadGoalMetrics(db *sql.DB, goalID int64) ([]domain.GoalMetric, error) {
	rows, err := db.Query(`SELECT id, goal_id, metric_name, baseline_value, target_value, metric_unit, created_at FROM goal_metrics WHERE goal_id = ? ORDER BY id`, goalID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.GoalMetric, 0)
	for rows.Next() {
		var item domain.GoalMetric
		var baseline, target sql.NullFloat64
		if err := rows.Scan(&item.ID, &item.GoalID, &item.MetricName, &baseline, &target, &item.MetricUnit, &item.CreatedAt); err != nil {
			return nil, err
		}
		item.BaselineValue = nullFloat64Ptr(baseline)
		item.TargetValue = nullFloat64Ptr(target)
		items = append(items, item)
	}
	return items, rows.Err()
}

func scanEvent(scanner rowScanner) (domain.AnchorEvent, error) {
	var item domain.AnchorEvent
	var sessionID sql.NullInt64
	if err := scanner.Scan(&item.ID, &item.AnchorID, &item.EventDate, &item.EventType, &item.Title, &item.Content, &sessionID, &item.CreatedAt, &item.UpdatedAt); err != nil {
		return domain.AnchorEvent{}, err
	}
	item.LiveSessionID = nullInt64Ptr(sessionID)
	return item, nil
}
