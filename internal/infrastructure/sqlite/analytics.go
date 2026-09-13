package sqlite

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/hicbowen/livemate/internal/domain"
)

const analyticsStaleDays = 7

// GetAnalytics is the single aggregate entry point shared by the analytics
// page and report queries. All values come from live_sessions; NULLs remain
// NULL so an unknown metric is never silently presented as zero.
func (s *Store) GetAnalytics(query domain.AnalyticsQuery) (domain.AnalyticsResult, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	normalized, err := normalizeAnalyticsQuery(query)
	if err != nil {
		return domain.AnalyticsResult{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.AnalyticsResult{}, err
	}
	return s.getAnalyticsLocked(db, normalized)
}

func normalizeAnalyticsQuery(query domain.AnalyticsQuery) (domain.AnalyticsQuery, error) {
	query.StartDate = strings.TrimSpace(query.StartDate)
	query.EndDate = strings.TrimSpace(query.EndDate)
	switch {
	case query.StartDate == "" && query.EndDate == "":
		query.EndDate = today()
		query.StartDate = shiftDate(query.EndDate, -6)
	case query.StartDate == "":
		query.EndDate = normalizeDate(query.EndDate)
		query.StartDate = shiftDate(query.EndDate, -6)
	case query.EndDate == "":
		query.StartDate = normalizeDate(query.StartDate)
		query.EndDate = shiftDate(query.StartDate, 6)
	}
	if err := validateDate(query.StartDate, "分析开始日期"); err != nil {
		return domain.AnalyticsQuery{}, err
	}
	if err := validateDate(query.EndDate, "分析结束日期"); err != nil {
		return domain.AnalyticsQuery{}, err
	}
	if query.StartDate > query.EndDate {
		return domain.AnalyticsQuery{}, fmt.Errorf("分析开始日期不能晚于结束日期")
	}
	ids := make([]int64, 0, len(query.AnchorIDs))
	seen := make(map[int64]struct{}, len(query.AnchorIDs))
	for _, id := range query.AnchorIDs {
		if id <= 0 {
			return domain.AnalyticsQuery{}, fmt.Errorf("主播 ID 无效")
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	query.AnchorIDs = ids
	query.Stage = strings.TrimSpace(query.Stage)
	query.Platform = strings.TrimSpace(query.Platform)
	query.Category = strings.TrimSpace(query.Category)
	return query, nil
}

func analyticsPreviousRange(query domain.AnalyticsQuery) (string, string) {
	days := dateDistance(query.StartDate, query.EndDate) + 1
	previousEnd := shiftDate(query.StartDate, -1)
	return shiftDate(previousEnd, -(days - 1)), previousEnd
}

func (s *Store) getAnalyticsLocked(db *sql.DB, query domain.AnalyticsQuery) (domain.AnalyticsResult, error) {
	previousStart, previousEnd := analyticsPreviousRange(query)
	current, err := analyticsSummaryDB(db, query)
	if err != nil {
		return domain.AnalyticsResult{}, err
	}
	previousQuery := query
	previousQuery.StartDate = previousStart
	previousQuery.EndDate = previousEnd
	previous, err := analyticsSummaryDB(db, previousQuery)
	if err != nil {
		return domain.AnalyticsResult{}, err
	}
	trend, err := analyticsTrendDB(db, query)
	if err != nil {
		return domain.AnalyticsResult{}, err
	}
	previousTrend, err := analyticsTrendDB(db, previousQuery)
	if err != nil {
		return domain.AnalyticsResult{}, err
	}
	anchors, err := analyticsAnchorsDB(db, query, previousQuery)
	if err != nil {
		return domain.AnalyticsResult{}, err
	}
	insights, err := analyticsInsightsDB(db, query, anchors)
	if err != nil {
		return domain.AnalyticsResult{}, err
	}
	return domain.AnalyticsResult{
		Query:         query,
		PreviousStart: previousStart,
		PreviousEnd:   previousEnd,
		Comparison: domain.AnalyticsComparison{
			Current:             current,
			Previous:            previous,
			DurationChangeRate:  changeRateInt64(previous.DurationMinutes, current.DurationMinutes),
			ViewsChangeRate:     changeRateInt64(previous.Views, current.Views),
			AvgOnlineChangeRate: changeRateFloat(previous.AvgOnline, current.AvgOnline),
			AvgStayChangeRate:   changeRateFloat(previous.AvgStaySeconds, current.AvgStaySeconds),
			FollowersChangeRate: changeRateInt64(previous.FollowersGained, current.FollowersGained),
			RevenueChangeRate:   changeRateInt64(previous.RevenueCents, current.RevenueCents),
		},
		Trend:         trend,
		PreviousTrend: previousTrend,
		Anchors:       anchors,
		Insights:      insights,
	}, nil
}

func analyticsSessionScope(query domain.AnalyticsQuery) (string, []any) {
	conditions := []string{"s.session_date >= ?", "s.session_date <= ?"}
	args := []any{query.StartDate, query.EndDate}
	if len(query.AnchorIDs) > 0 {
		conditions = append(conditions, "s.anchor_id IN ("+placeholders(len(query.AnchorIDs))+")")
		for _, id := range query.AnchorIDs {
			args = append(args, id)
		}
	}
	if query.Stage != "" {
		conditions = append(conditions, "a.stage = ?")
		args = append(args, query.Stage)
	}
	if query.Platform != "" {
		conditions = append(conditions, "a.platform = ?")
		args = append(args, query.Platform)
	}
	if query.Category != "" {
		conditions = append(conditions, "a.category = ?")
		args = append(args, query.Category)
	}
	return strings.Join(conditions, " AND "), args
}

func analyticsAnchorScope(query domain.AnalyticsQuery) (string, []any) {
	conditions := []string{"1 = 1"}
	args := make([]any, 0, len(query.AnchorIDs)+3)
	if len(query.AnchorIDs) > 0 {
		conditions = append(conditions, "a.id IN ("+placeholders(len(query.AnchorIDs))+")")
		for _, id := range query.AnchorIDs {
			args = append(args, id)
		}
	}
	if query.Stage != "" {
		conditions = append(conditions, "a.stage = ?")
		args = append(args, query.Stage)
	}
	if query.Platform != "" {
		conditions = append(conditions, "a.platform = ?")
		args = append(args, query.Platform)
	}
	if query.Category != "" {
		conditions = append(conditions, "a.category = ?")
		args = append(args, query.Category)
	}
	return strings.Join(conditions, " AND "), args
}

func placeholders(count int) string {
	items := make([]string, count)
	for index := range items {
		items[index] = "?"
	}
	return strings.Join(items, ", ")
}

func analyticsSummaryDB(db *sql.DB, query domain.AnalyticsQuery) (domain.AnalyticsSummary, error) {
	where, args := analyticsSessionScope(query)
	var anchorCount, activeAnchorCount, sessionCount int64
	var duration, views, followers, revenue sql.NullInt64
	var avgOnline, avgStay sql.NullFloat64
	err := db.QueryRow(`SELECT
        COUNT(DISTINCT s.anchor_id),
        COUNT(DISTINCT CASE WHEN a.deleted_at IS NULL THEN s.anchor_id END),
        COUNT(*),
        SUM(s.duration_minutes), SUM(s.views), AVG(s.avg_online), AVG(s.avg_stay_seconds),
        SUM(s.followers_gained), SUM(s.revenue_cents)
        FROM live_sessions s JOIN anchors a ON a.id = s.anchor_id WHERE `+where, args...).Scan(
		&anchorCount, &activeAnchorCount, &sessionCount,
		&duration, &views, &avgOnline, &avgStay, &followers, &revenue,
	)
	if err != nil {
		return domain.AnalyticsSummary{}, err
	}
	return domain.AnalyticsSummary{
		AnchorCount:       int(anchorCount),
		ActiveAnchorCount: int(activeAnchorCount),
		SessionCount:      int(sessionCount),
		DurationMinutes:   nullInt64Ptr(duration),
		Views:             nullInt64Ptr(views),
		AvgOnline:         nullFloat64Ptr(avgOnline),
		AvgStaySeconds:    nullFloat64Ptr(avgStay),
		FollowersGained:   nullInt64Ptr(followers),
		RevenueCents:      nullInt64Ptr(revenue),
	}, nil
}

func analyticsTrendDB(db *sql.DB, query domain.AnalyticsQuery) ([]domain.AnalyticsTrendPoint, error) {
	where, args := analyticsSessionScope(query)
	rows, err := db.Query(`SELECT s.session_date, COUNT(*), SUM(s.duration_minutes), SUM(s.views),
        AVG(s.avg_online), AVG(s.avg_stay_seconds), SUM(s.followers_gained), SUM(s.revenue_cents)
        FROM live_sessions s JOIN anchors a ON a.id = s.anchor_id
        WHERE `+where+` GROUP BY s.session_date ORDER BY s.session_date`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]domain.AnalyticsTrendPoint, 0)
	for rows.Next() {
		var item domain.AnalyticsTrendPoint
		var sessionCount int64
		var duration, views, followers, revenue sql.NullInt64
		var avgOnline, avgStay sql.NullFloat64
		if err := rows.Scan(&item.Date, &sessionCount, &duration, &views, &avgOnline, &avgStay, &followers, &revenue); err != nil {
			return nil, err
		}
		item.SessionCount = int(sessionCount)
		item.DurationMinutes = nullInt64Ptr(duration)
		item.Views = nullInt64Ptr(views)
		item.AvgOnline = nullFloat64Ptr(avgOnline)
		item.AvgStaySeconds = nullFloat64Ptr(avgStay)
		item.FollowersGained = nullInt64Ptr(followers)
		item.RevenueCents = nullInt64Ptr(revenue)
		result = append(result, item)
	}
	return result, rows.Err()
}

type analyticsAnchorAggregate struct {
	SessionCount    int
	RevenueCents    *int64
	FollowersGained *int64
	AvgOnline       *float64
}

func analyticsAnchorAggregatesDB(db *sql.DB, query domain.AnalyticsQuery) (map[int64]analyticsAnchorAggregate, error) {
	where, args := analyticsSessionScope(query)
	rows, err := db.Query(`SELECT s.anchor_id, COUNT(*), SUM(s.revenue_cents), SUM(s.followers_gained), AVG(s.avg_online)
        FROM live_sessions s JOIN anchors a ON a.id = s.anchor_id WHERE `+where+` GROUP BY s.anchor_id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make(map[int64]analyticsAnchorAggregate)
	for rows.Next() {
		var anchorID, sessionCount int64
		var revenue, followers sql.NullInt64
		var avgOnline sql.NullFloat64
		if err := rows.Scan(&anchorID, &sessionCount, &revenue, &followers, &avgOnline); err != nil {
			return nil, err
		}
		result[anchorID] = analyticsAnchorAggregate{
			SessionCount:    int(sessionCount),
			RevenueCents:    nullInt64Ptr(revenue),
			FollowersGained: nullInt64Ptr(followers),
			AvgOnline:       nullFloat64Ptr(avgOnline),
		}
	}
	return result, rows.Err()
}

func analyticsAnchorsDB(db *sql.DB, currentQuery, previousQuery domain.AnalyticsQuery) ([]domain.AnchorAnalyticsRow, error) {
	// The store keeps one SQLite connection. Finish the previous aggregate
	// before opening the current rows so a database/sql cursor cannot block the
	// next query.
	previous, err := analyticsAnchorAggregatesDB(db, previousQuery)
	if err != nil {
		return nil, err
	}
	where, args := analyticsSessionScope(currentQuery)
	rows, err := db.Query(`SELECT a.id, a.nickname, a.stage, a.platform, a.category, COUNT(*),
        SUM(s.duration_minutes), SUM(s.views), AVG(s.avg_online), AVG(s.avg_stay_seconds),
        SUM(s.followers_gained), SUM(s.revenue_cents)
        FROM live_sessions s JOIN anchors a ON a.id = s.anchor_id
        WHERE `+where+` GROUP BY a.id, a.nickname, a.stage, a.platform, a.category
        ORDER BY CASE WHEN SUM(s.revenue_cents) IS NULL THEN 1 ELSE 0 END,
        SUM(s.revenue_cents) DESC, a.nickname COLLATE NOCASE, a.id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]domain.AnchorAnalyticsRow, 0)
	for rows.Next() {
		var item domain.AnchorAnalyticsRow
		var sessionCount int64
		var duration, views, followers, revenue sql.NullInt64
		var avgOnline, avgStay sql.NullFloat64
		if err := rows.Scan(&item.AnchorID, &item.Nickname, &item.Stage, &item.Platform, &item.Category,
			&sessionCount, &duration, &views, &avgOnline, &avgStay, &followers, &revenue); err != nil {
			return nil, err
		}
		item.SessionCount = int(sessionCount)
		item.DurationMinutes = nullInt64Ptr(duration)
		item.Views = nullInt64Ptr(views)
		item.AvgOnline = nullFloat64Ptr(avgOnline)
		item.AvgStaySeconds = nullFloat64Ptr(avgStay)
		item.FollowersGained = nullInt64Ptr(followers)
		item.RevenueCents = nullInt64Ptr(revenue)
		if prior, ok := previous[item.AnchorID]; ok {
			item.PreviousRevenueCents = prior.RevenueCents
			item.RevenueChangeRate = changeRateInt64(prior.RevenueCents, item.RevenueCents)
			item.PreviousFollowersGained = prior.FollowersGained
			item.FollowersChangeRate = changeRateInt64(prior.FollowersGained, item.FollowersGained)
			item.PreviousAvgOnline = prior.AvgOnline
			item.AvgOnlineChangeRate = changeRateFloat(prior.AvgOnline, item.AvgOnline)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

type analyticsAnchorState struct {
	AnchorID     int64
	Nickname     string
	Status       string
	CreatedAt    string
	LastSession  sql.NullString
	CurrentCount int64
}

func analyticsAnchorStatesDB(db *sql.DB, query domain.AnalyticsQuery) ([]analyticsAnchorState, error) {
	where, filterArgs := analyticsAnchorScope(query)
	args := []any{query.StartDate, query.EndDate}
	args = append(args, filterArgs...)
	rows, err := db.Query(`SELECT a.id, a.nickname, a.status, a.created_at, MAX(s.session_date),
        SUM(CASE WHEN s.session_date >= ? AND s.session_date <= ? THEN 1 ELSE 0 END)
        FROM anchors a LEFT JOIN live_sessions s ON s.anchor_id = a.id
        WHERE a.deleted_at IS NULL AND a.status = '正常开播' AND `+where+`
        GROUP BY a.id, a.nickname, a.status, a.created_at`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]analyticsAnchorState, 0)
	for rows.Next() {
		var item analyticsAnchorState
		if err := rows.Scan(&item.AnchorID, &item.Nickname, &item.Status, &item.CreatedAt, &item.LastSession, &item.CurrentCount); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func analyticsInsightsDB(db *sql.DB, query domain.AnalyticsQuery, anchors []domain.AnchorAnalyticsRow) ([]domain.AnalyticsInsight, error) {
	previousStart, _ := analyticsPreviousRange(query)
	previousQuery := query
	previousQuery.StartDate = previousStart
	previousQuery.EndDate = shiftDate(query.StartDate, -1)
	previousAggregates, err := analyticsAnchorAggregatesDB(db, previousQuery)
	if err != nil {
		return nil, err
	}
	result := make([]domain.AnalyticsInsight, 0, 8)
	for _, anchor := range anchors {
		prior, ok := previousAggregates[anchor.AnchorID]
		if !ok || anchor.SessionCount < 2 || prior.SessionCount < 2 {
			continue
		}
		if anchor.RevenueChangeRate != nil && *anchor.RevenueChangeRate >= 0.30 {
			result = append(result, insightChange(anchor, "revenue_up", "success", "流水明显上涨", fmt.Sprintf("流水较上一周期增长 %.1f%%", *anchor.RevenueChangeRate*100), anchor.RevenueChangeRate))
		}
		if anchor.RevenueChangeRate != nil && *anchor.RevenueChangeRate <= -0.25 {
			result = append(result, insightChange(anchor, "revenue_down", "danger", "流水明显下降", fmt.Sprintf("流水较上一周期下降 %.1f%%", -*anchor.RevenueChangeRate*100), anchor.RevenueChangeRate))
		}
		if anchor.FollowersChangeRate != nil && *anchor.FollowersChangeRate >= 0.30 {
			result = append(result, insightChange(anchor, "followers_up", "success", "涨粉明显上涨", fmt.Sprintf("新增粉丝较上一周期增长 %.1f%%", *anchor.FollowersChangeRate*100), anchor.FollowersChangeRate))
		}
		if anchor.FollowersChangeRate != nil && *anchor.FollowersChangeRate <= -0.25 {
			result = append(result, insightChange(anchor, "followers_down", "warning", "涨粉明显下降", fmt.Sprintf("新增粉丝较上一周期下降 %.1f%%", -*anchor.FollowersChangeRate*100), anchor.FollowersChangeRate))
		}
		if anchor.AvgOnlineChangeRate != nil && *anchor.AvgOnlineChangeRate <= -0.20 {
			result = append(result, insightChange(anchor, "avg_online_down", "warning", "平均在线下降", fmt.Sprintf("平均在线较上一周期下降 %.1f%%", -*anchor.AvgOnlineChangeRate*100), anchor.AvgOnlineChangeRate))
		}
	}

	states, err := analyticsAnchorStatesDB(db, query)
	if err != nil {
		return nil, err
	}
	for _, state := range states {
		if state.CurrentCount != 0 {
			continue
		}
		lastDate := state.LastSession.String
		if !state.LastSession.Valid {
			lastDate = state.CreatedAt
		}
		lastDate = strings.TrimSpace(lastDate)
		if len(lastDate) > 10 {
			lastDate = lastDate[:10]
		}
		if lastDate == "" || dateDistance(lastDate, query.EndDate) < analyticsStaleDays {
			continue
		}
		days := float64(dateDistance(lastDate, query.EndDate))
		value := days
		lastText := "暂无历史直播记录"
		if state.LastSession.Valid {
			lastText = "上次直播 " + lastDate
		}
		result = append(result, domain.AnalyticsInsight{
			ID:       fmt.Sprintf("inactive-%d", state.AnchorID),
			AnchorID: state.AnchorID,
			Nickname: state.Nickname,
			Type:     "inactive",
			Severity: "danger",
			Title:    "长期未开播",
			Detail:   fmt.Sprintf("已 %d 天未开播（%s）", int(days), lastText),
			Value:    &value,
		})
	}

	sort.SliceStable(result, func(i, j int) bool {
		leftPriority, rightPriority := insightPriority(result[i]), insightPriority(result[j])
		if leftPriority != rightPriority {
			return leftPriority > rightPriority
		}
		leftValue, rightValue := insightMagnitude(result[i]), insightMagnitude(result[j])
		if leftValue != rightValue {
			return leftValue > rightValue
		}
		if result[i].Nickname != result[j].Nickname {
			return result[i].Nickname < result[j].Nickname
		}
		return result[i].ID < result[j].ID
	})
	if len(result) > 8 {
		result = result[:8]
	}
	return result, nil
}

func insightChange(anchor domain.AnchorAnalyticsRow, kind, severity, title, detail string, value *float64) domain.AnalyticsInsight {
	return domain.AnalyticsInsight{
		ID:       fmt.Sprintf("%s-%d", kind, anchor.AnchorID),
		AnchorID: anchor.AnchorID,
		Nickname: anchor.Nickname,
		Type:     kind,
		Severity: severity,
		Title:    title,
		Detail:   detail,
		Value:    value,
	}
}

func insightPriority(insight domain.AnalyticsInsight) int {
	switch insight.Type {
	case "inactive":
		return 600
	case "revenue_down":
		return 500
	case "followers_down":
		return 450
	case "avg_online_down":
		return 400
	case "revenue_up":
		return 250
	case "followers_up":
		return 200
	default:
		return 0
	}
}

func insightMagnitude(insight domain.AnalyticsInsight) float64 {
	if insight.Value == nil {
		return 0
	}
	if *insight.Value < 0 {
		return -*insight.Value
	}
	return *insight.Value
}

func changeRateInt64(previous, current *int64) *float64 {
	if previous == nil || current == nil || *previous == 0 {
		return nil
	}
	value := (float64(*current) - float64(*previous)) / float64(*previous)
	return &value
}

func changeRateFloat(previous, current *float64) *float64 {
	if previous == nil || current == nil || *previous == 0 {
		return nil
	}
	value := (*current - *previous) / *previous
	return &value
}

func dateDistance(startDate, endDate string) int {
	start, err := time.Parse("2006-01-02", startDate)
	if err != nil {
		return 0
	}
	end, err := time.Parse("2006-01-02", endDate)
	if err != nil {
		return 0
	}
	return int(end.Sub(start).Hours() / 24)
}
