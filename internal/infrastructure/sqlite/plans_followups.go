package sqlite

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/hicbowen/livemate/internal/domain"
)

const planSelect = `SELECT p.id, p.anchor_id, p.issue_id, p.title, p.objective, p.actions, p.metric_name, p.baseline_value, p.target_value, p.metric_unit,
    p.start_date, p.expected_end_date, p.priority, p.status, p.result_summary, p.created_at, p.updated_at, p.completed_at,
    (SELECT f.followup_date FROM plan_followups f WHERE f.plan_id = p.id ORDER BY f.followup_date DESC, f.id DESC LIMIT 1) AS last_followup_date,
    (SELECT f.metric_value FROM plan_followups f WHERE f.plan_id = p.id AND f.metric_value IS NOT NULL ORDER BY f.followup_date DESC, f.id DESC LIMIT 1) AS current_metric_value,
    (SELECT COUNT(*) FROM plan_followups f WHERE f.plan_id = p.id)
    FROM improvement_plans p`

func (s *Store) CreatePlan(input domain.ImprovementPlanInput) (domain.ImprovementPlan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	input.StartDate = normalizeDate(input.StartDate)
	if strings.TrimSpace(input.Title) == "" {
		return domain.ImprovementPlan{}, fmt.Errorf("方案标题不能为空")
	}
	if input.AnchorID <= 0 || input.IssueID <= 0 {
		return domain.ImprovementPlan{}, fmt.Errorf("方案必须关联主播和问题")
	}
	if err := validateDate(input.StartDate, "开始日期"); err != nil {
		return domain.ImprovementPlan{}, err
	}
	if input.ExpectedEndDate != nil && *input.ExpectedEndDate != "" {
		if err := validateDate(*input.ExpectedEndDate, "预计结束日期"); err != nil {
			return domain.ImprovementPlan{}, err
		}
	}
	priority := defaultString(input.Priority, domain.Priorities[0])
	status := defaultString(input.Status, domain.PlanStatuses[0])
	if err := validateChoice(priority, "方案优先级", domain.Priorities); err != nil {
		return domain.ImprovementPlan{}, err
	}
	if err := validateChoice(status, "方案状态", domain.PlanStatuses); err != nil {
		return domain.ImprovementPlan{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.ImprovementPlan{}, err
	}
	if err := issueBelongsToAnchor(db, input.IssueID, input.AnchorID); err != nil {
		return domain.ImprovementPlan{}, err
	}
	createdAt := now()
	result, err := db.Exec(`INSERT INTO improvement_plans(anchor_id, issue_id, title, objective, actions, metric_name, baseline_value, target_value, metric_unit, start_date, expected_end_date, priority, status, result_summary, created_at, updated_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		input.AnchorID, input.IssueID, strings.TrimSpace(input.Title), input.Objective, input.Actions, input.MetricName, floatValue(input.BaselineValue), floatValue(input.TargetValue), input.MetricUnit, input.StartDate, stringValue(input.ExpectedEndDate), priority, status, input.ResultSummary, createdAt, createdAt, nil)
	if err != nil {
		return domain.ImprovementPlan{}, fmt.Errorf("保存改进方案失败：%w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.ImprovementPlan{}, err
	}
	return s.getPlanLocked(id)
}

func (s *Store) UpdatePlan(id int64, input domain.ImprovementPlanInput) (domain.ImprovementPlan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	input.StartDate = normalizeDate(input.StartDate)
	if id <= 0 || input.AnchorID <= 0 || input.IssueID <= 0 || strings.TrimSpace(input.Title) == "" {
		return domain.ImprovementPlan{}, fmt.Errorf("方案参数无效")
	}
	if err := validateDate(input.StartDate, "开始日期"); err != nil {
		return domain.ImprovementPlan{}, err
	}
	if input.ExpectedEndDate != nil && *input.ExpectedEndDate != "" {
		if err := validateDate(*input.ExpectedEndDate, "预计结束日期"); err != nil {
			return domain.ImprovementPlan{}, err
		}
	}
	priority := defaultString(input.Priority, domain.Priorities[0])
	status := defaultString(input.Status, domain.PlanStatuses[0])
	if err := validateChoice(priority, "方案优先级", domain.Priorities); err != nil {
		return domain.ImprovementPlan{}, err
	}
	if err := validateChoice(status, "方案状态", domain.PlanStatuses); err != nil {
		return domain.ImprovementPlan{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.ImprovementPlan{}, err
	}
	if err := issueBelongsToAnchor(db, input.IssueID, input.AnchorID); err != nil {
		return domain.ImprovementPlan{}, err
	}
	completedAt := any(nil)
	if status == "已验证有效" || status == "无效" || status == "已终止" {
		completedAt = now()
	}
	result, err := db.Exec(`UPDATE improvement_plans SET issue_id = ?, title = ?, objective = ?, actions = ?, metric_name = ?, baseline_value = ?, target_value = ?, metric_unit = ?, start_date = ?, expected_end_date = ?, priority = ?, status = ?, result_summary = ?, updated_at = ?, completed_at = ? WHERE id = ? AND anchor_id = ?`,
		input.IssueID, strings.TrimSpace(input.Title), input.Objective, input.Actions, input.MetricName, floatValue(input.BaselineValue), floatValue(input.TargetValue), input.MetricUnit, input.StartDate, stringValue(input.ExpectedEndDate), priority, status, input.ResultSummary, now(), completedAt, id, input.AnchorID)
	if err != nil {
		return domain.ImprovementPlan{}, fmt.Errorf("保存改进方案失败：%w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return domain.ImprovementPlan{}, fmt.Errorf("改进方案不存在")
	}
	return s.getPlanLocked(id)
}

func (s *Store) ChangePlanStatus(id int64, status string) (domain.ImprovementPlan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := validateChoice(status, "方案状态", domain.PlanStatuses); err != nil {
		return domain.ImprovementPlan{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.ImprovementPlan{}, err
	}
	completedAt := any(nil)
	if status == "已验证有效" || status == "无效" || status == "已终止" {
		completedAt = now()
	}
	result, err := db.Exec(`UPDATE improvement_plans SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?`, status, now(), completedAt, id)
	if err != nil {
		return domain.ImprovementPlan{}, fmt.Errorf("更新方案状态失败：%w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return domain.ImprovementPlan{}, fmt.Errorf("改进方案不存在")
	}
	return s.getPlanLocked(id)
}

func (s *Store) DeletePlan(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	db, err := s.dbLocked()
	if err != nil {
		return err
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM plan_followups WHERE plan_id = ?`, id).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return fmt.Errorf("方案已有跟进记录，不能物理删除，请将方案标记为已终止")
	}
	result, err := db.Exec(`DELETE FROM improvement_plans WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("删除改进方案失败：%w", err)
	}
	count64, _ := result.RowsAffected()
	if count64 == 0 {
		return fmt.Errorf("改进方案不存在")
	}
	return nil
}

func (s *Store) GetPlan(id int64) (domain.ImprovementPlan, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getPlanLocked(id)
}

func (s *Store) getPlanLocked(id int64) (domain.ImprovementPlan, error) {
	db, err := s.dbLocked()
	if err != nil {
		return domain.ImprovementPlan{}, err
	}
	return scanPlan(db.QueryRow(planSelect+` WHERE p.id = ?`, id))
}

func (s *Store) ListPlans(anchorID int64, status string) ([]domain.ImprovementPlan, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	db, err := s.dbLocked()
	if err != nil {
		return nil, err
	}
	query := planSelect + ` WHERE (? = 0 OR p.anchor_id = ?) AND (? = '' OR p.status = ?) ORDER BY p.start_date DESC, p.id DESC LIMIT 500`
	rows, err := db.Query(query, anchorID, anchorID, status, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.ImprovementPlan, 0)
	for rows.Next() {
		item, err := scanPlan(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) AddFollowup(input domain.PlanFollowupInput) (domain.PlanFollowup, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	input.FollowupDate = normalizeDate(input.FollowupDate)
	if input.PlanID <= 0 || input.AnchorID <= 0 {
		return domain.PlanFollowup{}, fmt.Errorf("跟进必须关联方案和主播")
	}
	if err := validateDate(input.FollowupDate, "跟进日期"); err != nil {
		return domain.PlanFollowup{}, err
	}
	executionStatus := defaultString(input.ExecutionStatus, domain.ExecutionStatuses[0])
	effect := defaultString(input.Effect, domain.Effects[0])
	nextAction := defaultString(input.NextAction, domain.NextActions[0])
	if err := validateChoice(executionStatus, "执行情况", domain.ExecutionStatuses); err != nil {
		return domain.PlanFollowup{}, err
	}
	if err := validateChoice(effect, "效果判断", domain.Effects); err != nil {
		return domain.PlanFollowup{}, err
	}
	if err := validateChoice(nextAction, "下一步动作", domain.NextActions); err != nil {
		return domain.PlanFollowup{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.PlanFollowup{}, err
	}
	baseline, err := planBaseline(db, input.PlanID, input.AnchorID)
	if err != nil {
		return domain.PlanFollowup{}, err
	}
	if input.LiveSessionID != nil {
		if err := sessionBelongsToAnchor(db, *input.LiveSessionID, input.AnchorID); err != nil {
			return domain.PlanFollowup{}, err
		}
	}
	change := metricChange(baseline, input.MetricValue)
	createdAt := now()
	result, err := db.Exec(`INSERT INTO plan_followups(plan_id, anchor_id, live_session_id, followup_date, execution_status, execution_note, metric_value, metric_change, effect, effect_note, next_action, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, input.PlanID, input.AnchorID, intValue(input.LiveSessionID), input.FollowupDate, executionStatus, input.ExecutionNote, floatValue(input.MetricValue), floatValue(change), effect, input.EffectNote, nextAction, createdAt, createdAt)
	if err != nil {
		return domain.PlanFollowup{}, fmt.Errorf("保存方案跟进失败：%w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.PlanFollowup{}, err
	}
	return s.getFollowupLocked(id)
}

func (s *Store) UpdateFollowup(id int64, input domain.PlanFollowupInput) (domain.PlanFollowup, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	input.FollowupDate = normalizeDate(input.FollowupDate)
	if id <= 0 || input.PlanID <= 0 || input.AnchorID <= 0 {
		return domain.PlanFollowup{}, fmt.Errorf("跟进参数无效")
	}
	if err := validateDate(input.FollowupDate, "跟进日期"); err != nil {
		return domain.PlanFollowup{}, err
	}
	executionStatus := defaultString(input.ExecutionStatus, domain.ExecutionStatuses[0])
	effect := defaultString(input.Effect, domain.Effects[0])
	nextAction := defaultString(input.NextAction, domain.NextActions[0])
	if err := validateChoice(executionStatus, "执行情况", domain.ExecutionStatuses); err != nil {
		return domain.PlanFollowup{}, err
	}
	if err := validateChoice(effect, "效果判断", domain.Effects); err != nil {
		return domain.PlanFollowup{}, err
	}
	if err := validateChoice(nextAction, "下一步动作", domain.NextActions); err != nil {
		return domain.PlanFollowup{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.PlanFollowup{}, err
	}
	baseline, err := planBaseline(db, input.PlanID, input.AnchorID)
	if err != nil {
		return domain.PlanFollowup{}, err
	}
	if input.LiveSessionID != nil {
		if err := sessionBelongsToAnchor(db, *input.LiveSessionID, input.AnchorID); err != nil {
			return domain.PlanFollowup{}, err
		}
	}
	change := metricChange(baseline, input.MetricValue)
	result, err := db.Exec(`UPDATE plan_followups SET plan_id = ?, anchor_id = ?, live_session_id = ?, followup_date = ?, execution_status = ?, execution_note = ?, metric_value = ?, metric_change = ?, effect = ?, effect_note = ?, next_action = ?, updated_at = ? WHERE id = ?`,
		input.PlanID, input.AnchorID, intValue(input.LiveSessionID), input.FollowupDate, executionStatus, input.ExecutionNote, floatValue(input.MetricValue), floatValue(change), effect, input.EffectNote, nextAction, now(), id)
	if err != nil {
		return domain.PlanFollowup{}, fmt.Errorf("保存方案跟进失败：%w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return domain.PlanFollowup{}, fmt.Errorf("方案跟进不存在")
	}
	return s.getFollowupLocked(id)
}

func (s *Store) DeleteFollowup(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	db, err := s.dbLocked()
	if err != nil {
		return err
	}
	result, err := db.Exec(`DELETE FROM plan_followups WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("删除方案跟进失败：%w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return fmt.Errorf("方案跟进不存在")
	}
	return nil
}

func (s *Store) GetFollowup(id int64) (domain.PlanFollowup, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getFollowupLocked(id)
}

func (s *Store) getFollowupLocked(id int64) (domain.PlanFollowup, error) {
	db, err := s.dbLocked()
	if err != nil {
		return domain.PlanFollowup{}, err
	}
	return scanFollowup(db.QueryRow(`SELECT id, plan_id, anchor_id, live_session_id, followup_date, execution_status, execution_note, metric_value, metric_change, effect, effect_note, next_action, created_at, updated_at FROM plan_followups WHERE id = ?`, id))
}

func (s *Store) ListFollowups(planID int64) ([]domain.PlanFollowup, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	db, err := s.dbLocked()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(`SELECT id, plan_id, anchor_id, live_session_id, followup_date, execution_status, execution_note, metric_value, metric_change, effect, effect_note, next_action, created_at, updated_at FROM plan_followups WHERE plan_id = ? ORDER BY followup_date ASC, id ASC`, planID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.PlanFollowup, 0)
	for rows.Next() {
		item, err := scanFollowup(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func scanPlan(scanner rowScanner) (domain.ImprovementPlan, error) {
	var item domain.ImprovementPlan
	var baseline, target, current sql.NullFloat64
	var expectedEnd, completed, lastFollowup sql.NullString
	var followupCount int
	if err := scanner.Scan(&item.ID, &item.AnchorID, &item.IssueID, &item.Title, &item.Objective, &item.Actions, &item.MetricName, &baseline, &target, &item.MetricUnit,
		&item.StartDate, &expectedEnd, &item.Priority, &item.Status, &item.ResultSummary, &item.CreatedAt, &item.UpdatedAt, &completed,
		&lastFollowup, &current, &followupCount); err != nil {
		return domain.ImprovementPlan{}, err
	}
	item.BaselineValue = nullFloat64Ptr(baseline)
	item.TargetValue = nullFloat64Ptr(target)
	item.ExpectedEndDate = nullStringPtr(expectedEnd)
	item.CompletedAt = nullStringPtr(completed)
	item.LastFollowupDate = nullStringPtr(lastFollowup)
	item.CurrentMetricValue = nullFloat64Ptr(current)
	item.FollowupCount = followupCount
	return item, nil
}

func scanFollowup(scanner rowScanner) (domain.PlanFollowup, error) {
	var item domain.PlanFollowup
	var sessionID sql.NullInt64
	var metricValue, metricChange sql.NullFloat64
	if err := scanner.Scan(&item.ID, &item.PlanID, &item.AnchorID, &sessionID, &item.FollowupDate, &item.ExecutionStatus, &item.ExecutionNote, &metricValue, &metricChange, &item.Effect, &item.EffectNote, &item.NextAction, &item.CreatedAt, &item.UpdatedAt); err != nil {
		return domain.PlanFollowup{}, err
	}
	item.LiveSessionID = nullInt64Ptr(sessionID)
	item.MetricValue = nullFloat64Ptr(metricValue)
	item.MetricChange = nullFloat64Ptr(metricChange)
	return item, nil
}

func issueBelongsToAnchor(db *sql.DB, issueID, anchorID int64) error {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM anchor_issues WHERE id = ? AND anchor_id = ?`, issueID, anchorID).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("问题不存在或不属于当前主播")
	}
	return nil
}

func planBaseline(db *sql.DB, planID, anchorID int64) (*float64, error) {
	var baseline sql.NullFloat64
	var count int
	if err := db.QueryRow(`SELECT baseline_value, COUNT(*) OVER () FROM improvement_plans WHERE id = ? AND anchor_id = ?`, planID, anchorID).Scan(&baseline, &count); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("方案不存在或不属于当前主播")
		}
		return nil, err
	}
	if count == 0 {
		return nil, fmt.Errorf("方案不存在或不属于当前主播")
	}
	return nullFloat64Ptr(baseline), nil
}

func metricChange(baseline, value *float64) *float64 {
	if baseline == nil || value == nil {
		return nil
	}
	change := *value - *baseline
	return &change
}

func nullFloat64Ptr(value sql.NullFloat64) *float64 {
	if !value.Valid {
		return nil
	}
	return &value.Float64
}
