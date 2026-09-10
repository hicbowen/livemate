package sqlite

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/hicbowen/livemate/internal/domain"
)

func (s *Store) GetAnchorDetail(anchorID int64) (domain.AnchorDetail, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	db, err := s.dbLocked()
	if err != nil {
		return domain.AnchorDetail{}, err
	}
	anchor, err := s.getAnchorLocked(anchorID)
	if err != nil {
		return domain.AnchorDetail{}, err
	}
	sessions, err := listSessionsDB(db, anchorID)
	if err != nil {
		return domain.AnchorDetail{}, err
	}
	reviews, err := listReviewsDB(db, anchorID)
	if err != nil {
		return domain.AnchorDetail{}, err
	}
	issues, err := listIssuesDB(db, anchorID, "")
	if err != nil {
		return domain.AnchorDetail{}, err
	}
	plans, err := listPlansDB(db, anchorID, "")
	if err != nil {
		return domain.AnchorDetail{}, err
	}
	goals, err := listGoalsDB(db, anchorID)
	if err != nil {
		return domain.AnchorDetail{}, err
	}
	events, err := listEventsDB(db, anchorID)
	if err != nil {
		return domain.AnchorDetail{}, err
	}
	trend, err := anchorTrendDB(db, anchorID, 30)
	if err != nil {
		return domain.AnchorDetail{}, err
	}
	return domain.AnchorDetail{Anchor: anchor, Sessions: sessions, Reviews: reviews, Issues: issues, Plans: plans, Goals: goals, Events: events, Trend: trend}, nil
}

func (s *Store) GetAnchorTrend(anchorID int64, days int) ([]domain.TrendPoint, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	db, err := s.dbLocked()
	if err != nil {
		return nil, err
	}
	return anchorTrendDB(db, anchorID, days)
}

func (s *Store) GetDashboard(staleDays int) (domain.Dashboard, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	db, err := s.dbLocked()
	if err != nil {
		return domain.Dashboard{}, err
	}
	if staleDays <= 0 || staleDays > 365 {
		staleDays = 3
	}
	currentDate := today()
	var dashboard domain.Dashboard
	dashboard.Today = currentDate
	dashboard.GeneratedAt = now()
	dashboard.StaleDays = staleDays
	if err := db.QueryRow(`SELECT COUNT(*) FROM anchors WHERE deleted_at IS NULL`).Scan(&dashboard.AnchorCount); err != nil {
		return domain.Dashboard{}, err
	}
	if err := db.QueryRow(`SELECT COUNT(DISTINCT s.anchor_id) FROM live_sessions s JOIN anchors a ON a.id = s.anchor_id WHERE a.deleted_at IS NULL AND s.session_date = ?`, currentDate).Scan(&dashboard.TodayLiveAnchorCount); err != nil {
		return domain.Dashboard{}, err
	}
	dashboard.TodayNotLiveAnchorCount = dashboard.AnchorCount - dashboard.TodayLiveAnchorCount
	var duration, revenue, followers sql.NullInt64
	if err := db.QueryRow(`SELECT SUM(s.duration_minutes), SUM(s.revenue_cents), SUM(s.followers_gained) FROM live_sessions s JOIN anchors a ON a.id = s.anchor_id WHERE a.deleted_at IS NULL AND s.session_date = ?`, currentDate).Scan(&duration, &revenue, &followers); err != nil {
		return domain.Dashboard{}, err
	}
	if duration.Valid {
		dashboard.TodayDurationMinutes = int(duration.Int64)
	}
	if revenue.Valid {
		dashboard.TodayRevenueCents = revenue.Int64
	}
	if followers.Valid {
		dashboard.TodayFollowersGained = followers.Int64
	}
	dashboard.FocusAnchors, err = focusAnchorsDB(db)
	if err != nil {
		return domain.Dashboard{}, err
	}
	dashboard.PendingIssues, err = pendingIssuesDB(db)
	if err != nil {
		return domain.Dashboard{}, err
	}
	dashboard.ActivePlans, err = planSummariesDB(db, false, staleDays)
	if err != nil {
		return domain.Dashboard{}, err
	}
	dashboard.StalePlans, err = planSummariesDB(db, true, staleDays)
	if err != nil {
		return domain.Dashboard{}, err
	}
	dashboard.ExpiringGoals, err = expiringGoalsDB(db)
	if err != nil {
		return domain.Dashboard{}, err
	}
	return dashboard, nil
}

func (s *Store) Search(query string) ([]domain.SearchResult, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	db, err := s.dbLocked()
	if err != nil {
		return nil, err
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return []domain.SearchResult{}, nil
	}
	pattern := "%" + query + "%"
	results := make([]domain.SearchResult, 0, 30)
	appendRows := func(rows *sql.Rows, kind string, hasAnchor bool) error {
		defer rows.Close()
		for rows.Next() {
			var item domain.SearchResult
			if hasAnchor {
				if err := rows.Scan(&item.ID, &item.AnchorID, &item.AnchorNickname, &item.Title, &item.Subtitle); err != nil {
					return err
				}
			} else {
				if err := rows.Scan(&item.ID, &item.Title, &item.Subtitle); err != nil {
					return err
				}
			}
			item.Kind = kind
			results = append(results, item)
			if len(results) >= 50 {
				break
			}
		}
		return rows.Err()
	}
	rows, err := db.Query(`SELECT id, nickname, platform || ' · ' || category FROM anchors WHERE deleted_at IS NULL AND (nickname LIKE ? OR name LIKE ? OR platform_uid LIKE ? OR account_name LIKE ?) ORDER BY updated_at DESC LIMIT 20`, pattern, pattern, pattern, pattern)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var item domain.SearchResult
		if err := rows.Scan(&item.ID, &item.Title, &item.Subtitle); err != nil {
			_ = rows.Close()
			return nil, err
		}
		item.Kind = "anchor"
		item.AnchorID = item.ID
		item.AnchorNickname = item.Title
		results = append(results, item)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, err
	}
	_ = rows.Close()
	if len(results) < 50 {
		rows, err = db.Query(`SELECT i.id, i.anchor_id, a.nickname, i.title, i.category || ' · ' || i.status FROM anchor_issues i JOIN anchors a ON a.id = i.anchor_id WHERE a.deleted_at IS NULL AND i.title LIKE ? ORDER BY i.updated_at DESC LIMIT 20`, pattern)
		if err != nil {
			return nil, err
		}
		if err := appendRows(rows, "issue", true); err != nil {
			return nil, err
		}
	}
	if len(results) < 50 {
		rows, err = db.Query(`SELECT p.id, p.anchor_id, a.nickname, p.title, p.status FROM improvement_plans p JOIN anchors a ON a.id = p.anchor_id WHERE a.deleted_at IS NULL AND p.title LIKE ? ORDER BY p.updated_at DESC LIMIT 20`, pattern)
		if err != nil {
			return nil, err
		}
		if err := appendRows(rows, "plan", true); err != nil {
			return nil, err
		}
	}
	return results, nil
}

func listSessionsDB(db *sql.DB, anchorID int64) ([]domain.LiveSession, error) {
	rows, err := db.Query(`SELECT `+liveSessionColumns+` FROM live_sessions WHERE anchor_id = ? ORDER BY session_date DESC, id DESC LIMIT 500`, anchorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.LiveSession, 0)
	for rows.Next() {
		item, err := scanLiveSession(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func listReviewsDB(db *sql.DB, anchorID int64) ([]domain.OperationReview, error) {
	rows, err := db.Query(`SELECT id, anchor_id, live_session_id, review_date, summary, strengths, observations, conclusion, created_at, updated_at FROM operation_reviews WHERE anchor_id = ? ORDER BY review_date DESC, id DESC LIMIT 500`, anchorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.OperationReview, 0)
	for rows.Next() {
		item, err := scanReview(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func listIssuesDB(db *sql.DB, anchorID int64, status string) ([]domain.AnchorIssue, error) {
	query := `SELECT i.id, i.anchor_id, i.review_id, i.title, i.category, i.description, i.evidence, i.cause_hypothesis, i.priority, i.status, i.discovered_at, i.resolved_at, i.created_at, i.updated_at,
        (SELECT COUNT(*) FROM improvement_plans p WHERE p.issue_id = i.id) FROM anchor_issues i WHERE i.anchor_id = ? AND (? = '' OR i.status = ?) ORDER BY i.discovered_at DESC, i.id DESC LIMIT 500`
	rows, err := db.Query(query, anchorID, status, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.AnchorIssue, 0)
	for rows.Next() {
		item, err := scanIssue(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func listPlansDB(db *sql.DB, anchorID int64, status string) ([]domain.ImprovementPlan, error) {
	rows, err := db.Query(planSelect+` WHERE p.anchor_id = ? AND (? = '' OR p.status = ?) ORDER BY p.start_date DESC, p.id DESC LIMIT 500`, anchorID, status, status)
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

func listGoalsDB(db *sql.DB, anchorID int64) ([]domain.StageGoal, error) {
	rows, err := db.Query(`SELECT id, anchor_id, title, start_date, end_date, description, status, created_at, updated_at FROM stage_goals WHERE anchor_id = ? ORDER BY CASE status WHEN '进行中' THEN 0 ELSE 1 END, start_date DESC, id DESC LIMIT 200`, anchorID)
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

func listEventsDB(db *sql.DB, anchorID int64) ([]domain.AnchorEvent, error) {
	rows, err := db.Query(`SELECT id, anchor_id, event_date, event_type, title, content, live_session_id, created_at, updated_at FROM anchor_events WHERE anchor_id = ? ORDER BY event_date DESC, id DESC LIMIT 500`, anchorID)
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

func anchorTrendDB(db *sql.DB, anchorID int64, days int) ([]domain.TrendPoint, error) {
	if days <= 0 || days > 365 {
		days = 30
	}
	startDate := dateDaysAgo(days - 1)
	rows, err := db.Query(`SELECT s.session_date, SUM(s.duration_minutes), CAST(AVG(s.avg_online) AS INTEGER), CAST(AVG(s.avg_stay_seconds) AS INTEGER), SUM(s.followers_gained), SUM(s.revenue_cents),
        (SELECT COUNT(*) FROM anchor_events e WHERE e.anchor_id = s.anchor_id AND e.event_date = s.session_date)
        FROM live_sessions s WHERE s.anchor_id = ? AND s.session_date >= ? GROUP BY s.session_date ORDER BY s.session_date`, anchorID, startDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.TrendPoint, 0)
	for rows.Next() {
		var item domain.TrendPoint
		var duration, avgOnline, avgStay, followers, revenue sql.NullInt64
		if err := rows.Scan(&item.Date, &duration, &avgOnline, &avgStay, &followers, &revenue, &item.EventCount); err != nil {
			return nil, err
		}
		item.DurationMinutes = nullIntPtr(duration)
		item.AvgOnline = nullInt64Ptr(avgOnline)
		item.AvgStaySeconds = nullInt64Ptr(avgStay)
		item.FollowersGained = nullInt64Ptr(followers)
		item.RevenueCents = nullInt64Ptr(revenue)
		items = append(items, item)
	}
	return items, rows.Err()
}

func focusAnchorsDB(db *sql.DB) ([]domain.FocusAnchor, error) {
	rows, err := db.Query(`SELECT a.id, a.nickname, a.stage, a.attention_level,
        COALESCE((SELECT i.title FROM anchor_issues i WHERE i.anchor_id = a.id AND i.priority IN ('重点', '紧急') AND i.status NOT IN ('已解决', '已关闭') ORDER BY CASE i.priority WHEN '紧急' THEN 2 ELSE 1 END DESC, i.discovered_at ASC LIMIT 1), '关注等级需要留意') AS reason,
        (SELECT s.session_date FROM live_sessions s WHERE s.anchor_id = a.id ORDER BY s.session_date DESC, s.id DESC LIMIT 1),
        COALESCE((SELECT s.notes FROM live_sessions s WHERE s.anchor_id = a.id ORDER BY s.session_date DESC, s.id DESC LIMIT 1), '')
        FROM anchors a WHERE a.deleted_at IS NULL AND a.attention_level IN ('重点关注', '紧急') ORDER BY CASE a.attention_level WHEN '紧急' THEN 2 ELSE 1 END DESC, a.updated_at DESC LIMIT 20`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.FocusAnchor, 0)
	for rows.Next() {
		var item domain.FocusAnchor
		var lastSession sql.NullString
		if err := rows.Scan(&item.AnchorID, &item.Nickname, &item.Stage, &item.AttentionLevel, &item.AttentionReason, &lastSession, &item.RecentChangeNote); err != nil {
			return nil, err
		}
		item.LastSessionDate = nullStringPtr(lastSession)
		items = append(items, item)
	}
	return items, rows.Err()
}

func pendingIssuesDB(db *sql.DB) ([]domain.IssueSummary, error) {
	rows, err := db.Query(`SELECT i.id, i.anchor_id, a.nickname, i.title, i.category, i.priority, i.status, i.discovered_at FROM anchor_issues i JOIN anchors a ON a.id = i.anchor_id WHERE a.deleted_at IS NULL AND i.priority IN ('重点', '紧急') AND i.status NOT IN ('已解决', '已关闭') ORDER BY CASE i.priority WHEN '紧急' THEN 2 ELSE 1 END DESC, i.discovered_at ASC LIMIT 20`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.IssueSummary, 0)
	for rows.Next() {
		var item domain.IssueSummary
		if err := rows.Scan(&item.ID, &item.AnchorID, &item.AnchorNickname, &item.Title, &item.Category, &item.Priority, &item.Status, &item.DiscoveredAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func planSummariesDB(db *sql.DB, stale bool, staleDays int) ([]domain.PlanSummary, error) {
	todayDate := today()
	staleDate := dateDaysAgo(staleDays)
	where := `p.status IN ('执行中', '观察中')`
	if stale {
		where += ` AND COALESCE((SELECT MAX(f.followup_date) FROM plan_followups f WHERE f.plan_id = p.id), p.start_date) <= ?`
	}
	query := `SELECT p.id, p.anchor_id, a.nickname, p.title, p.status, p.start_date,
        (SELECT MAX(f.followup_date) FROM plan_followups f WHERE f.plan_id = p.id),
        (SELECT f.metric_value FROM plan_followups f WHERE f.plan_id = p.id AND f.metric_value IS NOT NULL ORDER BY f.followup_date DESC, f.id DESC LIMIT 1),
        p.metric_unit, CAST(julianday(?) - julianday(p.start_date) AS INTEGER) AS days_active,
        CAST(julianday(?) - julianday(COALESCE((SELECT MAX(f.followup_date) FROM plan_followups f WHERE f.plan_id = p.id), p.start_date)) AS INTEGER) AS days_since_followup
        FROM improvement_plans p JOIN anchors a ON a.id = p.anchor_id WHERE a.deleted_at IS NULL AND ` + where + ` ORDER BY days_since_followup DESC, p.start_date ASC LIMIT 20`
	args := []any{todayDate, todayDate}
	if stale {
		args = append(args, staleDate)
	}
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.PlanSummary, 0)
	for rows.Next() {
		var item domain.PlanSummary
		var lastDate sql.NullString
		var currentMetric sql.NullFloat64
		if err := rows.Scan(&item.ID, &item.AnchorID, &item.AnchorNickname, &item.Title, &item.Status, &item.StartDate, &lastDate, &currentMetric, &item.MetricUnit, &item.DaysActive, &item.DaysSinceFollowup); err != nil {
			return nil, err
		}
		item.LastFollowupDate = nullStringPtr(lastDate)
		item.CurrentMetricValue = nullFloat64Ptr(currentMetric)
		if item.DaysActive < 0 {
			item.DaysActive = 0
		}
		if item.DaysSinceFollowup < 0 {
			item.DaysSinceFollowup = 0
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func expiringGoalsDB(db *sql.DB) ([]domain.ExpiringGoal, error) {
	endDate := dateDaysFromToday(3)
	rows, err := db.Query(`SELECT g.id, g.anchor_id, a.nickname, g.title, g.end_date, CAST(julianday(g.end_date) - julianday(?) AS INTEGER) FROM stage_goals g JOIN anchors a ON a.id = g.anchor_id WHERE a.deleted_at IS NULL AND g.status = '进行中' AND g.end_date >= ? AND g.end_date <= ? ORDER BY g.end_date ASC LIMIT 20`, today(), today(), endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.ExpiringGoal, 0)
	for rows.Next() {
		var item domain.ExpiringGoal
		if err := rows.Scan(&item.ID, &item.AnchorID, &item.AnchorNickname, &item.Title, &item.EndDate, &item.DaysRemaining); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func dateDaysAgo(days int) string {
	return time.Now().AddDate(0, 0, -days).Format("2006-01-02")
}

func dateDaysFromToday(days int) string {
	return time.Now().AddDate(0, 0, days).Format("2006-01-02")
}

func (s *Store) AppInfo() domain.AppInfo {
	paths := s.Paths()
	return domain.AppInfo{Name: domain.ProductName, Project: domain.ProjectName, AppID: domain.AppID, Version: domain.AppVersion, Description: domain.ProductDescription, DataDir: paths.DataDir, DatabasePath: paths.Database, LogDir: paths.LogDir, BackupDir: paths.BackupDir}
}

func ensureAnchorID(id int64) error {
	if id <= 0 {
		return fmt.Errorf("主播 ID 无效")
	}
	return nil
}
