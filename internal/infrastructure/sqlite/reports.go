package sqlite

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/hicbowen/livemate/internal/domain"
)

func (s *Store) GetOperationsReport(query domain.ReportQuery) (domain.OperationsReport, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	normalized, err := normalizeReportQuery(query, "operations_period")
	if err != nil {
		return domain.OperationsReport{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.OperationsReport{}, err
	}
	analyticsQuery := reportAnalyticsQuery(normalized)
	analytics, err := s.getAnalyticsLocked(db, analyticsQuery)
	if err != nil {
		return domain.OperationsReport{}, err
	}
	issues, err := reportIssueSummaryDB(db, normalized.StartDate, normalized.EndDate, nil)
	if err != nil {
		return domain.OperationsReport{}, err
	}
	plans, err := reportPlanSummaryDB(db, normalized.StartDate, normalized.EndDate, nil)
	if err != nil {
		return domain.OperationsReport{}, err
	}
	goals, err := reportGoalSummaryDB(db, normalized.StartDate, normalized.EndDate, nil)
	if err != nil {
		return domain.OperationsReport{}, err
	}
	return domain.OperationsReport{
		StartDate: normalized.StartDate, EndDate: normalized.EndDate,
		Analytics: analytics, IssueSummary: issues, PlanSummary: plans, GoalSummary: goals,
	}, nil
}

func (s *Store) GetAnchorPeriodReport(query domain.ReportQuery) (domain.AnchorPeriodReport, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	normalized, err := normalizeReportQuery(query, "anchor_period")
	if err != nil {
		return domain.AnchorPeriodReport{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.AnchorPeriodReport{}, err
	}
	anchor, err := s.getAnchorLocked(*normalized.AnchorID)
	if err != nil {
		return domain.AnchorPeriodReport{}, err
	}
	analyticsQuery := reportAnalyticsQuery(normalized)
	analytics, err := s.getAnalyticsLocked(db, analyticsQuery)
	if err != nil {
		return domain.AnchorPeriodReport{}, err
	}
	issues, err := reportIssueSummaryDB(db, normalized.StartDate, normalized.EndDate, normalized.AnchorID)
	if err != nil {
		return domain.AnchorPeriodReport{}, err
	}
	plans, err := reportPlanSummaryDB(db, normalized.StartDate, normalized.EndDate, normalized.AnchorID)
	if err != nil {
		return domain.AnchorPeriodReport{}, err
	}
	goals, err := reportGoalSummaryDB(db, normalized.StartDate, normalized.EndDate, normalized.AnchorID)
	if err != nil {
		return domain.AnchorPeriodReport{}, err
	}
	period, err := anchorPeriodRecordsDB(db, *normalized.AnchorID, normalized.StartDate, normalized.EndDate)
	if err != nil {
		return domain.AnchorPeriodReport{}, err
	}
	return domain.AnchorPeriodReport{
		StartDate: normalized.StartDate, EndDate: normalized.EndDate,
		Anchor: anchor, Analytics: analytics,
		IssueSummary: issues, PlanSummary: plans, GoalSummary: goals,
		PendingIssues: period.PendingIssues, NewIssues: period.NewIssues, ResolvedIssues: period.ResolvedIssues,
		ActivePlans: period.ActivePlans, CompletedPlans: period.CompletedPlans,
		Followups: period.Followups, Goals: period.Goals, Events: period.Events,
	}, nil
}

func normalizeReportQuery(query domain.ReportQuery, expectedType string) (domain.ReportQuery, error) {
	if strings.TrimSpace(query.Type) == "" {
		query.Type = expectedType
	}
	if query.Type != expectedType {
		return domain.ReportQuery{}, fmt.Errorf("报告类型无效：%s", query.Type)
	}
	analyticsQuery, err := normalizeAnalyticsQuery(domain.AnalyticsQuery{StartDate: query.StartDate, EndDate: query.EndDate})
	if err != nil {
		return domain.ReportQuery{}, err
	}
	query.StartDate = analyticsQuery.StartDate
	query.EndDate = analyticsQuery.EndDate
	if expectedType == "anchor_period" {
		if query.AnchorID == nil || *query.AnchorID <= 0 {
			return domain.ReportQuery{}, fmt.Errorf("主播阶段报告必须选择主播")
		}
	}
	return query, nil
}

func reportAnalyticsQuery(query domain.ReportQuery) domain.AnalyticsQuery {
	result := domain.AnalyticsQuery{StartDate: query.StartDate, EndDate: query.EndDate}
	if query.AnchorID != nil {
		result.AnchorIDs = []int64{*query.AnchorID}
	}
	return result
}

func reportAnchorCondition(alias string, anchorID *int64) (string, []any) {
	if anchorID == nil {
		return "", nil
	}
	return " AND " + alias + ".anchor_id = ?", []any{*anchorID}
}

func reportIssueSummaryDB(db *sql.DB, startDate, endDate string, anchorID *int64) (domain.ReportIssueSummary, error) {
	condition, conditionArgs := reportAnchorCondition("i", anchorID)
	args := []any{startDate, endDate, startDate, endDate, endDate}
	args = append(args, conditionArgs...)
	var result domain.ReportIssueSummary
	err := db.QueryRow(`SELECT
        COALESCE(SUM(CASE WHEN i.discovered_at >= ? AND i.discovered_at <= ? THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.status NOT IN ('已解决', '已关闭') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.priority = '重点' AND i.status NOT IN ('已解决', '已关闭') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.priority = '紧急' AND i.status NOT IN ('已解决', '已关闭') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN i.status IN ('已解决', '已关闭') AND substr(COALESCE(i.resolved_at, ''), 1, 10) >= ? AND substr(COALESCE(i.resolved_at, ''), 1, 10) <= ? THEN 1 ELSE 0 END), 0)
        FROM anchor_issues i JOIN anchors a ON a.id = i.anchor_id
        WHERE i.discovered_at <= ?`+condition, args...).Scan(
		&result.NewCount, &result.PendingCount, &result.ImportantCount, &result.UrgentCount, &result.ResolvedCount,
	)
	if err != nil {
		return domain.ReportIssueSummary{}, err
	}
	return result, nil
}

func reportPlanSummaryDB(db *sql.DB, startDate, endDate string, anchorID *int64) (domain.ReportPlanSummary, error) {
	condition, conditionArgs := reportAnchorCondition("p", anchorID)
	args := []any{startDate, endDate, startDate, endDate, endDate}
	args = append(args, conditionArgs...)
	var result domain.ReportPlanSummary
	err := db.QueryRow(`SELECT
        COALESCE(SUM(CASE WHEN p.start_date >= ? AND p.start_date <= ? THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN p.status IN ('执行中', '观察中') THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN p.status IN ('执行中', '观察中') AND NOT EXISTS (
            SELECT 1 FROM plan_followups f WHERE f.plan_id = p.id AND f.followup_date >= ? AND f.followup_date <= ?
        ) THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN p.status = '已验证有效' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN p.status = '无效' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN p.status = '已终止' THEN 1 ELSE 0 END), 0)
        FROM improvement_plans p JOIN anchor_issues i ON i.id = p.issue_id
        JOIN anchors a ON a.id = p.anchor_id
        WHERE p.start_date <= ?`+condition, args...).Scan(
		&result.NewCount, &result.InProgressCount, &result.PendingFollowup,
		&result.ValidatedCount, &result.InvalidCount, &result.TerminatedCount,
	)
	if err != nil {
		return domain.ReportPlanSummary{}, err
	}
	return result, nil
}

func reportGoalSummaryDB(db *sql.DB, startDate, endDate string, anchorID *int64) (domain.ReportGoalSummary, error) {
	condition, conditionArgs := reportAnchorCondition("g", anchorID)
	args := []any{endDate, startDate, startDate, endDate, startDate, endDate, endDate, endDate}
	args = append(args, conditionArgs...)
	var result domain.ReportGoalSummary
	err := db.QueryRow(`SELECT
        COALESCE(SUM(CASE WHEN g.status = '进行中' AND g.start_date <= ? AND g.end_date >= ? THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN g.status = '已完成' AND substr(g.updated_at, 1, 10) >= ? AND substr(g.updated_at, 1, 10) <= ? THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN g.status = '进行中' AND g.end_date >= ? AND g.end_date <= ? THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN g.status = '进行中' AND g.end_date < ? THEN 1 ELSE 0 END), 0)
        FROM stage_goals g JOIN anchors a ON a.id = g.anchor_id
        WHERE g.start_date <= ?`+condition, args...).Scan(
		&result.InProgressCount, &result.CompletedCount, &result.DueSoonCount, &result.OverdueCount,
	)
	if err != nil {
		return domain.ReportGoalSummary{}, err
	}
	return result, nil
}

type anchorPeriodRecords struct {
	PendingIssues  []domain.AnchorIssue
	NewIssues      []domain.AnchorIssue
	ResolvedIssues []domain.AnchorIssue
	ActivePlans    []domain.ImprovementPlan
	CompletedPlans []domain.ImprovementPlan
	Followups      []domain.PlanFollowup
	Goals          []domain.StageGoal
	Events         []domain.AnchorEvent
}

func anchorPeriodRecordsDB(db *sql.DB, anchorID int64, startDate, endDate string) (anchorPeriodRecords, error) {
	issues, err := listIssuesDB(db, anchorID, "")
	if err != nil {
		return anchorPeriodRecords{}, err
	}
	plans, err := listPlansDB(db, anchorID, "")
	if err != nil {
		return anchorPeriodRecords{}, err
	}
	followups, err := listFollowupsDB(db, anchorID)
	if err != nil {
		return anchorPeriodRecords{}, err
	}
	goals, err := listGoalsDB(db, anchorID)
	if err != nil {
		return anchorPeriodRecords{}, err
	}
	events, err := listEventsDB(db, anchorID)
	if err != nil {
		return anchorPeriodRecords{}, err
	}
	result := anchorPeriodRecords{
		PendingIssues: make([]domain.AnchorIssue, 0), NewIssues: make([]domain.AnchorIssue, 0), ResolvedIssues: make([]domain.AnchorIssue, 0),
		ActivePlans: make([]domain.ImprovementPlan, 0), CompletedPlans: make([]domain.ImprovementPlan, 0),
		Followups: make([]domain.PlanFollowup, 0), Goals: make([]domain.StageGoal, 0), Events: make([]domain.AnchorEvent, 0),
	}
	for _, issue := range issues {
		if issue.DiscoveredAt <= endDate && issue.Status != "已解决" && issue.Status != "已关闭" {
			result.PendingIssues = append(result.PendingIssues, issue)
		}
		if reportDateInRange(issue.DiscoveredAt, startDate, endDate) {
			result.NewIssues = append(result.NewIssues, issue)
		}
		if (issue.Status == "已解决" || issue.Status == "已关闭") && issue.ResolvedAt != nil && reportDateInRange(*issue.ResolvedAt, startDate, endDate) {
			result.ResolvedIssues = append(result.ResolvedIssues, issue)
		}
	}
	for _, plan := range plans {
		if plan.StartDate <= endDate && (plan.Status == "待执行" || plan.Status == "执行中" || plan.Status == "观察中") {
			result.ActivePlans = append(result.ActivePlans, plan)
		}
		completedDate := plan.CompletedAt
		if completedDate == nil {
			completedDate = stringPtrFromValue(plan.UpdatedAt)
		}
		if (plan.Status == "已验证有效" || plan.Status == "无效" || plan.Status == "已终止") && completedDate != nil && reportDateInRange(*completedDate, startDate, endDate) {
			result.CompletedPlans = append(result.CompletedPlans, plan)
		}
	}
	for _, followup := range followups {
		if reportDateInRange(followup.FollowupDate, startDate, endDate) {
			result.Followups = append(result.Followups, followup)
		}
	}
	for _, goal := range goals {
		if goal.StartDate <= endDate && goal.EndDate >= startDate {
			result.Goals = append(result.Goals, goal)
		}
	}
	for _, event := range events {
		if reportDateInRange(event.EventDate, startDate, endDate) {
			result.Events = append(result.Events, event)
		}
	}
	return result, nil
}

func reportDateInRange(value, startDate, endDate string) bool {
	value = strings.TrimSpace(value)
	if len(value) > 10 {
		value = value[:10]
	}
	return value >= startDate && value <= endDate
}

func stringPtrFromValue(value string) *string {
	return &value
}
