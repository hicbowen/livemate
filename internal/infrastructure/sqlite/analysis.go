package sqlite

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/hicbowen/livemate/internal/domain"
)

// GetPlanEffectComparison provides the factual before/after view used on a
// plan detail. The windows are deliberately small: the three most recent
// sessions before the plan and the first three sessions after it.
func (s *Store) GetPlanEffectComparison(planID int64) (domain.PlanEffectComparison, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if planID <= 0 {
		return domain.PlanEffectComparison{}, fmt.Errorf("方案 ID 无效")
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.PlanEffectComparison{}, err
	}
	plan, err := s.getPlanLocked(planID)
	if err != nil {
		return domain.PlanEffectComparison{}, err
	}
	comparison := domain.PlanEffectComparison{
		PlanID:        plan.ID,
		MetricName:    plan.MetricName,
		MetricUnit:    plan.MetricUnit,
		BaselineValue: plan.BaselineValue,
		TargetValue:   plan.TargetValue,
		CurrentValue:  plan.CurrentMetricValue,
	}
	comparison.CurrentChange = metricChange(plan.BaselineValue, plan.CurrentMetricValue)
	comparison.CurrentChangeRate = metricRate(plan.BaselineValue, plan.CurrentMetricValue)
	if plan.MetricName == "" {
		return comparison, nil
	}
	before, err := planSessionsBefore(db, plan.AnchorID, plan.StartDate)
	if err != nil {
		return domain.PlanEffectComparison{}, err
	}
	after, err := planSessionsAfter(db, plan.AnchorID, plan.StartDate)
	if err != nil {
		return domain.PlanEffectComparison{}, err
	}
	comparison.BeforeCount = len(before)
	comparison.AfterCount = len(after)
	comparison.BeforeAverage = averageSessionMetric(before, plan.MetricName)
	comparison.AfterAverage = averageSessionMetric(after, plan.MetricName)
	comparison.BeforeAfterChange = metricChange(comparison.BeforeAverage, comparison.AfterAverage)
	comparison.BeforeAfterRate = metricRate(comparison.BeforeAverage, comparison.AfterAverage)
	return comparison, nil
}

// GetAnchorPeriodComparison compares two adjacent calendar periods. Raw
// sessions are aggregated in SQLite so the dashboard and detail page use the
// same definition for averages, daily follower growth, and hourly revenue.
func (s *Store) GetAnchorPeriodComparison(anchorID int64, endDate string, days int) (domain.PeriodComparison, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if anchorID <= 0 {
		return domain.PeriodComparison{}, fmt.Errorf("主播 ID 无效")
	}
	endDate = normalizeDate(endDate)
	if err := validateDate(endDate, "对比结束日期"); err != nil {
		return domain.PeriodComparison{}, err
	}
	if days <= 0 || days > 90 {
		days = 7
	}
	currentStart := shiftDate(endDate, -(days - 1))
	previousEnd := shiftDate(currentStart, -1)
	previousStart := shiftDate(previousEnd, -(days - 1))
	db, err := s.dbLocked()
	if err != nil {
		return domain.PeriodComparison{}, err
	}
	previous, err := aggregatePeriod(db, anchorID, previousStart, previousEnd)
	if err != nil {
		return domain.PeriodComparison{}, err
	}
	current, err := aggregatePeriod(db, anchorID, currentStart, endDate)
	if err != nil {
		return domain.PeriodComparison{}, err
	}
	metrics := []domain.PeriodComparisonMetric{
		periodMetric("avg_online", "平均在线", "人", previous.AvgOnline, current.AvgOnline),
		periodMetric("avg_stay_seconds", "平均停留", "秒", previous.AvgStay, current.AvgStay),
		periodMetric("followers_per_day", "日均涨粉", "人/天", dailyValue(previous.Followers, days), dailyValue(current.Followers, days)),
		periodMetric("revenue_per_hour", "时均流水", "元/小时", revenuePerHour(previous), revenuePerHour(current)),
	}
	return domain.PeriodComparison{
		PeriodDays: days, PreviousStartDate: previousStart, PreviousEndDate: previousEnd,
		CurrentStartDate: currentStart, CurrentEndDate: endDate, Metrics: metrics,
	}, nil
}

// GetAnchorAnomalies applies deliberately conservative rules to recent raw
// sessions. The result is a prompt for human review, never an automatic
// performance judgement.
func (s *Store) GetAnchorAnomalies(anchorID int64, days int) ([]domain.AnomalyCandidate, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if anchorID <= 0 {
		return nil, fmt.Errorf("主播 ID 无效")
	}
	if days <= 0 || days > 365 {
		days = 30
	}
	db, err := s.dbLocked()
	if err != nil {
		return nil, err
	}
	sessions, err := listSessionsDB(db, anchorID)
	if err != nil {
		return nil, err
	}
	cutoff := shiftDate(today(), -(days - 1))
	recent := make([]domain.LiveSession, 0, len(sessions))
	for _, session := range sessions {
		if session.SessionDate >= cutoff {
			recent = append(recent, session)
		}
	}
	if len(recent) == 0 {
		return []domain.AnomalyCandidate{}, nil
	}
	result := make([]domain.AnomalyCandidate, 0, 3)
	if len(recent) >= 3 && recent[0].AvgOnline != nil && recent[1].AvgOnline != nil && recent[2].AvgOnline != nil && *recent[2].AvgOnline > *recent[1].AvgOnline && *recent[1].AvgOnline > *recent[0].AvgOnline {
		result = append(result, domain.AnomalyCandidate{
			ID: "avg-online-decline", Rule: "连续三场下降", Title: "平均在线连续下降",
			Evidence:   fmt.Sprintf("最近三场平均在线：%d → %d → %d", *recent[2].AvgOnline, *recent[1].AvgOnline, *recent[0].AvgOnline),
			DetectedAt: recent[0].SessionDate, RelatedSessionIDs: anomalySessionIDs(recent[:3]),
		})
	}
	if len(recent) >= 3 && recent[0].FollowersGained != nil && recent[1].FollowersGained != nil && recent[2].FollowersGained != nil && *recent[0].FollowersGained < 0 && *recent[1].FollowersGained < 0 && *recent[2].FollowersGained < 0 {
		result = append(result, domain.AnomalyCandidate{
			ID: "followers-negative", Rule: "连续三场为负", Title: "新增粉丝连续为负",
			Evidence:   fmt.Sprintf("最近三场新增粉丝：%d → %d → %d", *recent[2].FollowersGained, *recent[1].FollowersGained, *recent[0].FollowersGained),
			DetectedAt: recent[0].SessionDate, RelatedSessionIDs: anomalySessionIDs(recent[:3]),
		})
	}
	if len(recent) >= 4 && recent[0].AvgStaySeconds != nil {
		previousAverage := averageIntMetric(recent[1:4], func(session domain.LiveSession) *int64 { return session.AvgStaySeconds })
		if previousAverage != nil && *previousAverage > 0 && float64(*recent[0].AvgStaySeconds) < *previousAverage*0.8 {
			result = append(result, domain.AnomalyCandidate{
				ID: "avg-stay-drop", Rule: "低于近期均值 20%", Title: "平均停留可能下降",
				Evidence:   fmt.Sprintf("本场平均停留 %d 秒，前 3 场均值 %.0f 秒", *recent[0].AvgStaySeconds, *previousAverage),
				DetectedAt: recent[0].SessionDate, RelatedSessionIDs: anomalySessionIDs(recent[:4]),
			})
		}
	}
	if len(recent) >= 4 && recent[0].RevenueCents != nil {
		previousAverage := averageIntMetric(recent[1:4], func(session domain.LiveSession) *int64 { return session.RevenueCents })
		if previousAverage != nil && *previousAverage > 0 && float64(*recent[0].RevenueCents) < *previousAverage*0.6 {
			result = append(result, domain.AnomalyCandidate{
				ID: "revenue-drop", Rule: "低于近期均值 40%", Title: "流水可能明显下降",
				Evidence:   fmt.Sprintf("本场流水 %.2f 元，前 3 场均值 %.2f 元", float64(*recent[0].RevenueCents)/100, float64(*previousAverage)/100),
				DetectedAt: recent[0].SessionDate, RelatedSessionIDs: anomalySessionIDs(recent[:4]),
			})
		}
	}
	return result, nil
}

func averageIntMetric(sessions []domain.LiveSession, value func(domain.LiveSession) *int64) *float64 {
	var total float64
	count := 0
	for _, session := range sessions {
		item := value(session)
		if item == nil {
			continue
		}
		total += float64(*item)
		count++
	}
	if count == 0 {
		return nil
	}
	average := total / float64(count)
	return &average
}

func anomalySessionIDs(sessions []domain.LiveSession) []int64 {
	ids := make([]int64, 0, len(sessions))
	for _, session := range sessions {
		ids = append(ids, session.ID)
	}
	return ids
}

type periodAggregate struct {
	AvgOnline *float64
	AvgStay   *float64
	Duration  *float64
	Followers *float64
	Revenue   *float64
}

func aggregatePeriod(db *sql.DB, anchorID int64, startDate, endDate string) (periodAggregate, error) {
	var avgOnline, avgStay, duration, followers, revenue sql.NullFloat64
	if err := db.QueryRow(`SELECT AVG(avg_online), AVG(avg_stay_seconds), SUM(duration_minutes), SUM(followers_gained), SUM(revenue_cents)
        FROM live_sessions WHERE anchor_id = ? AND session_date >= ? AND session_date <= ?`, anchorID, startDate, endDate).Scan(&avgOnline, &avgStay, &duration, &followers, &revenue); err != nil {
		return periodAggregate{}, err
	}
	return periodAggregate{AvgOnline: nullFloat64Ptr(avgOnline), AvgStay: nullFloat64Ptr(avgStay), Duration: nullFloat64Ptr(duration), Followers: nullFloat64Ptr(followers), Revenue: nullFloat64Ptr(revenue)}, nil
}

func periodMetric(name, label, unit string, previous, current *float64) domain.PeriodComparisonMetric {
	return domain.PeriodComparisonMetric{MetricName: name, Label: label, Unit: unit, PreviousValue: previous, CurrentValue: current, ChangeRate: metricRate(previous, current)}
}

func dailyValue(value *float64, days int) *float64 {
	if value == nil || days <= 0 {
		return nil
	}
	result := *value / float64(days)
	return &result
}

func revenuePerHour(aggregate periodAggregate) *float64 {
	if aggregate.Revenue == nil || aggregate.Duration == nil || *aggregate.Duration <= 0 {
		return nil
	}
	result := (*aggregate.Revenue / 100) / (*aggregate.Duration / 60)
	return &result
}

func shiftDate(value string, days int) string {
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		return value
	}
	return parsed.AddDate(0, 0, days).Format("2006-01-02")
}

func planSessionsBefore(db *sql.DB, anchorID int64, startDate string) ([]domain.LiveSession, error) {
	return queryPlanSessions(db, `session_date < ? ORDER BY session_date DESC, id DESC LIMIT 3`, anchorID, startDate)
}

func planSessionsAfter(db *sql.DB, anchorID int64, startDate string) ([]domain.LiveSession, error) {
	return queryPlanSessions(db, `session_date >= ? ORDER BY session_date ASC, id ASC LIMIT 3`, anchorID, startDate)
}

func queryPlanSessions(db *sql.DB, condition string, anchorID int64, date string) ([]domain.LiveSession, error) {
	rows, err := db.Query(`SELECT `+liveSessionColumns+` FROM live_sessions WHERE anchor_id = ? AND `+condition, anchorID, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]domain.LiveSession, 0, 3)
	for rows.Next() {
		item, err := scanLiveSession(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func averageSessionMetric(sessions []domain.LiveSession, metricName string) *float64 {
	var total float64
	count := 0
	for _, session := range sessions {
		value := sessionMetricValue(session, metricName)
		if value == nil {
			continue
		}
		total += *value
		count++
	}
	if count == 0 {
		return nil
	}
	average := total / float64(count)
	return &average
}

func sessionMetricValue(session domain.LiveSession, metricName string) *float64 {
	var value float64
	switch metricName {
	case "duration_minutes", "直播时长":
		if session.DurationMinutes == nil {
			return nil
		}
		value = float64(*session.DurationMinutes)
	case "avg_online", "平均在线":
		if session.AvgOnline == nil {
			return nil
		}
		value = float64(*session.AvgOnline)
	case "avg_stay_seconds", "平均停留":
		if session.AvgStaySeconds == nil {
			return nil
		}
		value = float64(*session.AvgStaySeconds)
	case "followers_gained", "新增粉丝", "涨粉":
		if session.FollowersGained == nil {
			return nil
		}
		value = float64(*session.FollowersGained)
	case "revenue_cents", "流水":
		if session.RevenueCents == nil {
			return nil
		}
		value = float64(*session.RevenueCents)
	case "revenue_per_hour", "时均流水":
		return session.Metrics.RevenuePerHour
	case "followers_per_hour", "涨粉效率":
		return session.Metrics.FollowersPerHour
	case "followers_per_1000_views", "千场观涨粉":
		return session.Metrics.FollowersPer1000Views
	case "payer_rate", "付费率":
		return session.Metrics.PayerRate
	case "comment_user_rate", "评论用户率":
		return session.Metrics.CommentUserRate
	case "pk_win_rate", "PK胜率":
		return session.Metrics.PKWinRate
	default:
		return nil
	}
	return &value
}

func metricRate(previous, current *float64) *float64 {
	if previous == nil || current == nil || *previous == 0 {
		return nil
	}
	rate := (*current - *previous) / *previous
	return &rate
}
