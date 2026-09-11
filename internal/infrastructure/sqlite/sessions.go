package sqlite

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/hicbowen/livemate/internal/domain"
	"github.com/hicbowen/livemate/internal/domain/metrics"
)

const liveSessionColumns = `id, anchor_id, session_date, started_at, ended_at, duration_minutes, duration_overridden,
    views, peak_online, avg_online, avg_stay_seconds, likes, comments, comment_users, shares,
    followers_before, followers_after, followers_gained, revenue_cents, payer_count, gift_user_count,
    pk_count, pk_win_count, pk_revenue_cents, operator_name, is_abnormal, abnormal_note, source, notes,
    created_at, updated_at`

func (s *Store) CreateSession(input domain.LiveSessionInput) (domain.LiveSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	input.SessionDate = normalizeDate(input.SessionDate)
	var err error
	input.StartedAt, err = normalizeDateTimePtr(input.StartedAt)
	if err != nil {
		return domain.LiveSession{}, fmt.Errorf("保存直播记录失败：开播时间%s", err)
	}
	input.EndedAt, err = normalizeDateTimePtr(input.EndedAt)
	if err != nil {
		return domain.LiveSession{}, fmt.Errorf("保存直播记录失败：下播时间%s", err)
	}
	if err := validateSessionInput(input); err != nil {
		return domain.LiveSession{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.LiveSession{}, err
	}
	if err := anchorExists(db, input.AnchorID, true); err != nil {
		return domain.LiveSession{}, err
	}
	duration, err := metrics.ResolveDuration(input.StartedAt, input.EndedAt, input.DurationMinutes, input.DurationOverride)
	if err != nil {
		return domain.LiveSession{}, err
	}
	followersGained := metrics.ResolveFollowers(input.FollowersBefore, input.FollowersAfter, input.FollowersGained)
	createdAt := now()
	result, err := db.Exec(`INSERT INTO live_sessions(
        anchor_id, session_date, started_at, ended_at, duration_minutes, duration_overridden,
        views, peak_online, avg_online, avg_stay_seconds, likes, comments, comment_users, shares,
        followers_before, followers_after, followers_gained, revenue_cents, payer_count, gift_user_count,
        pk_count, pk_win_count, pk_revenue_cents, operator_name, is_abnormal, abnormal_note, source, notes,
        created_at, updated_at
	) VALUES (
		?, ?, ?, ?, ?, ?,
		?, ?, ?, ?, ?, ?, ?, ?,
		?, ?, ?, ?, ?, ?,
		?, ?, ?, ?, ?, ?, ?, ?,
		?, ?
	)`,
		input.AnchorID, input.SessionDate, stringValue(input.StartedAt), stringValue(input.EndedAt), int32Value(duration), boolInt(input.DurationOverride),
		intValue(input.Views), intValue(input.PeakOnline), intValue(input.AvgOnline), intValue(input.AvgStaySeconds), intValue(input.Likes), intValue(input.Comments), intValue(input.CommentUsers), intValue(input.Shares),
		intValue(input.FollowersBefore), intValue(input.FollowersAfter), intValue(followersGained), intValue(input.RevenueCents), intValue(input.PayerCount), intValue(input.GiftUserCount),
		intValue(input.PKCount), intValue(input.PKWinCount), intValue(input.PKRevenueCents), input.OperatorName, boolInt(input.IsAbnormal), input.AbnormalNote, input.Source, input.Notes,
		createdAt, createdAt)
	if err != nil {
		return domain.LiveSession{}, fmt.Errorf("保存直播记录失败：%w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.LiveSession{}, fmt.Errorf("保存直播记录失败：读取主键失败：%w", err)
	}
	return s.getSessionLocked(id)
}

func (s *Store) UpdateSession(id int64, input domain.LiveSessionInput) (domain.LiveSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	input.SessionDate = normalizeDate(input.SessionDate)
	var err error
	input.StartedAt, err = normalizeDateTimePtr(input.StartedAt)
	if err != nil {
		return domain.LiveSession{}, fmt.Errorf("保存直播记录失败：开播时间%s", err)
	}
	input.EndedAt, err = normalizeDateTimePtr(input.EndedAt)
	if err != nil {
		return domain.LiveSession{}, fmt.Errorf("保存直播记录失败：下播时间%s", err)
	}
	if id <= 0 {
		return domain.LiveSession{}, fmt.Errorf("直播记录 ID 无效")
	}
	if err := validateSessionInput(input); err != nil {
		return domain.LiveSession{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.LiveSession{}, err
	}
	if err := anchorExists(db, input.AnchorID, true); err != nil {
		return domain.LiveSession{}, err
	}
	if err := sessionBelongsToAnchor(db, id, input.AnchorID); err != nil {
		return domain.LiveSession{}, err
	}
	duration, err := metrics.ResolveDuration(input.StartedAt, input.EndedAt, input.DurationMinutes, input.DurationOverride)
	if err != nil {
		return domain.LiveSession{}, err
	}
	followersGained := metrics.ResolveFollowers(input.FollowersBefore, input.FollowersAfter, input.FollowersGained)
	updatedAt := now()
	result, err := db.Exec(`UPDATE live_sessions SET
        anchor_id = ?, session_date = ?, started_at = ?, ended_at = ?, duration_minutes = ?, duration_overridden = ?,
        views = ?, peak_online = ?, avg_online = ?, avg_stay_seconds = ?, likes = ?, comments = ?, comment_users = ?, shares = ?,
        followers_before = ?, followers_after = ?, followers_gained = ?, revenue_cents = ?, payer_count = ?, gift_user_count = ?,
        pk_count = ?, pk_win_count = ?, pk_revenue_cents = ?, operator_name = ?, is_abnormal = ?, abnormal_note = ?, source = ?, notes = ?, updated_at = ?
        WHERE id = ?`,
		input.AnchorID, input.SessionDate, stringValue(input.StartedAt), stringValue(input.EndedAt), int32Value(duration), boolInt(input.DurationOverride),
		intValue(input.Views), intValue(input.PeakOnline), intValue(input.AvgOnline), intValue(input.AvgStaySeconds), intValue(input.Likes), intValue(input.Comments), intValue(input.CommentUsers), intValue(input.Shares),
		intValue(input.FollowersBefore), intValue(input.FollowersAfter), intValue(followersGained), intValue(input.RevenueCents), intValue(input.PayerCount), intValue(input.GiftUserCount),
		intValue(input.PKCount), intValue(input.PKWinCount), intValue(input.PKRevenueCents), input.OperatorName, boolInt(input.IsAbnormal), input.AbnormalNote, input.Source, input.Notes,
		updatedAt, id)
	if err != nil {
		return domain.LiveSession{}, fmt.Errorf("保存直播记录失败：%w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return domain.LiveSession{}, fmt.Errorf("直播记录不存在")
	}
	return s.getSessionLocked(id)
}

func (s *Store) DeleteSession(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	db, err := s.dbLocked()
	if err != nil {
		return err
	}
	var reviewCount, followupCount, eventCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM operation_reviews WHERE live_session_id = ?`, id).Scan(&reviewCount); err != nil {
		return err
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM plan_followups WHERE live_session_id = ?`, id).Scan(&followupCount); err != nil {
		return err
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM anchor_events WHERE live_session_id = ?`, id).Scan(&eventCount); err != nil {
		return err
	}
	if reviewCount+followupCount+eventCount > 0 {
		return fmt.Errorf("直播场次存在关联数据，请先处理关联复盘、跟进或事件后再删除")
	}
	result, err := db.Exec(`DELETE FROM live_sessions WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("删除直播记录失败：%w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return fmt.Errorf("直播记录不存在")
	}
	return nil
}

func (s *Store) GetSession(id int64) (domain.LiveSession, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getSessionLocked(id)
}

func (s *Store) getSessionLocked(id int64) (domain.LiveSession, error) {
	db, err := s.dbLocked()
	if err != nil {
		return domain.LiveSession{}, err
	}
	session, err := scanLiveSession(db.QueryRow(`SELECT `+liveSessionColumns+` FROM live_sessions WHERE id = ?`, id))
	if err == sql.ErrNoRows {
		return domain.LiveSession{}, fmt.Errorf("直播记录不存在")
	}
	return session, err
}

func (s *Store) ListSessions(anchorID int64) ([]domain.LiveSession, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	db, err := s.dbLocked()
	if err != nil {
		return nil, err
	}
	query := `SELECT ` + liveSessionColumns + ` FROM live_sessions`
	args := []any{}
	if anchorID > 0 {
		query += ` WHERE anchor_id = ?`
		args = append(args, anchorID)
	}
	query += ` ORDER BY session_date DESC, id DESC LIMIT 500`
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	sessions := make([]domain.LiveSession, 0)
	for rows.Next() {
		session, err := scanLiveSession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}

// ListSessionPage is the bounded history endpoint used by the desktop detail
// page. It avoids loading an entire anchor's history into the frontend.
func (s *Store) ListSessionPage(filter domain.SessionFilter) (domain.SessionPage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if filter.AnchorID <= 0 {
		return domain.SessionPage{}, fmt.Errorf("主播 ID 无效")
	}
	page := filter.Page
	if page <= 0 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.SessionPage{}, err
	}
	var total int
	if err := db.QueryRow(`SELECT COUNT(*) FROM live_sessions WHERE anchor_id = ?`, filter.AnchorID).Scan(&total); err != nil {
		return domain.SessionPage{}, err
	}
	rows, err := db.Query(`SELECT `+liveSessionColumns+` FROM live_sessions WHERE anchor_id = ? ORDER BY session_date DESC, id DESC LIMIT ? OFFSET ?`, filter.AnchorID, pageSize, (page-1)*pageSize)
	if err != nil {
		return domain.SessionPage{}, err
	}
	defer rows.Close()
	items := make([]domain.LiveSession, 0, pageSize)
	for rows.Next() {
		item, err := scanLiveSession(rows)
		if err != nil {
			return domain.SessionPage{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return domain.SessionPage{}, err
	}
	totalPages := 0
	if total > 0 {
		totalPages = (total + pageSize - 1) / pageSize
	}
	return domain.SessionPage{Page: domain.PageInfo{Page: page, PageSize: pageSize, Total: total, TotalPages: totalPages}, Items: items}, nil
}

// GetDailyData returns one compact row per active anchor for the requested
// date. The latest record is selected when legacy data contains duplicate
// sessions for the same anchor and date; new writes use the same upsert rule.
func (s *Store) GetDailyData(query domain.DailyDataQuery) (domain.DailyData, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	query.SessionDate = normalizeDate(query.SessionDate)
	if err := validateDate(query.SessionDate, "数据日期"); err != nil {
		return domain.DailyData{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.DailyData{}, err
	}
	where := ""
	args := []any{query.SessionDate}
	if term := strings.TrimSpace(query.Query); term != "" {
		pattern := "%" + term + "%"
		where = " AND (a.nickname LIKE ? OR a.name LIKE ? OR a.platform LIKE ? OR a.operator_name LIKE ?)"
		args = append(args, pattern, pattern, pattern, pattern)
	}
	rows, err := db.Query(`SELECT a.id, a.nickname, a.platform, a.stage, a.status,
        s.id, s.duration_minutes, s.views, s.avg_online, s.avg_stay_seconds, s.followers_gained, s.revenue_cents
        FROM anchors a
        LEFT JOIN live_sessions s ON s.id = (
            SELECT latest.id FROM live_sessions latest
            WHERE latest.anchor_id = a.id AND latest.session_date = ?
            ORDER BY latest.id DESC LIMIT 1
        )
        WHERE a.deleted_at IS NULL`+where+` ORDER BY a.nickname COLLATE NOCASE, a.id`, args...)
	if err != nil {
		return domain.DailyData{}, err
	}
	defer rows.Close()
	result := domain.DailyData{SessionDate: query.SessionDate, Rows: make([]domain.DailyDataRow, 0)}
	for rows.Next() {
		var item domain.DailyDataRow
		var sessionID, views, avgOnline, avgStay, followers, revenue sql.NullInt64
		var duration sql.NullInt64
		if err := rows.Scan(&item.AnchorID, &item.Nickname, &item.Platform, &item.Stage, &item.Status,
			&sessionID, &duration, &views, &avgOnline, &avgStay, &followers, &revenue); err != nil {
			return domain.DailyData{}, err
		}
		item.SessionID = nullInt64Ptr(sessionID)
		item.DurationMinutes = nullIntPtr(duration)
		item.Views = nullInt64Ptr(views)
		item.AvgOnline = nullInt64Ptr(avgOnline)
		item.AvgStaySeconds = nullInt64Ptr(avgStay)
		item.FollowersGained = nullInt64Ptr(followers)
		item.RevenueCents = nullInt64Ptr(revenue)
		result.Rows = append(result.Rows, item)
	}
	if err := rows.Err(); err != nil {
		return domain.DailyData{}, err
	}
	return result, nil
}

// SaveDailyData upserts only the six high-frequency fields used by the daily
// workbench. Existing sessions keep their detailed timing, source, operator,
// and low-frequency fields intact, so a batch edit cannot erase context that
// was recorded from the anchor detail page.
func (s *Store) SaveDailyData(input domain.DailyDataInput) (domain.DailyDataSaveResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	input.SessionDate = normalizeDate(input.SessionDate)
	if err := validateDate(input.SessionDate, "数据日期"); err != nil {
		return domain.DailyDataSaveResult{}, err
	}
	if len(input.Rows) > 500 {
		return domain.DailyDataSaveResult{}, fmt.Errorf("单次最多保存 500 位主播")
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.DailyDataSaveResult{}, err
	}
	source := strings.TrimSpace(input.Source)
	if source == "" {
		source = "每日数据"
	}
	tx, err := db.Begin()
	if err != nil {
		return domain.DailyDataSaveResult{}, fmt.Errorf("批量保存直播数据失败：开启事务失败：%w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	ids := make([]int64, 0, len(input.Rows))
	seenAnchors := make(map[int64]struct{}, len(input.Rows))
	createdCount, updatedCount := 0, 0
	for _, row := range input.Rows {
		if !dailyDataHasValues(row) {
			continue
		}
		if row.AnchorID <= 0 {
			return domain.DailyDataSaveResult{}, fmt.Errorf("批量保存直播数据失败：主播不能为空")
		}
		if _, exists := seenAnchors[row.AnchorID]; exists {
			return domain.DailyDataSaveResult{}, fmt.Errorf("批量保存直播数据失败：同一主播不能重复出现")
		}
		seenAnchors[row.AnchorID] = struct{}{}
		if err := validateDailySessionInput(row); err != nil {
			return domain.DailyDataSaveResult{}, err
		}
		var anchorCount int
		if err := tx.QueryRow(`SELECT COUNT(*) FROM anchors WHERE id = ? AND deleted_at IS NULL`, row.AnchorID).Scan(&anchorCount); err != nil {
			return domain.DailyDataSaveResult{}, err
		}
		if anchorCount == 0 {
			return domain.DailyDataSaveResult{}, fmt.Errorf("批量保存直播数据失败：主播不存在或已归档")
		}

		var existingID sql.NullInt64
		if err := tx.QueryRow(`SELECT id FROM live_sessions WHERE anchor_id = ? AND session_date = ? ORDER BY id DESC LIMIT 1`, row.AnchorID, input.SessionDate).Scan(&existingID); err != nil && err != sql.ErrNoRows {
			return domain.DailyDataSaveResult{}, err
		}
		updatedAt := now()
		if existingID.Valid {
			sets := make([]string, 0, 7)
			args := make([]any, 0, 8)
			if row.DurationMinutes != nil {
				sets = append(sets, "duration_minutes = ?", "duration_overridden = 1")
				args = append(args, *row.DurationMinutes)
			}
			if row.Views != nil {
				sets = append(sets, "views = ?")
				args = append(args, *row.Views)
			}
			if row.AvgOnline != nil {
				sets = append(sets, "avg_online = ?")
				args = append(args, *row.AvgOnline)
			}
			if row.AvgStaySeconds != nil {
				sets = append(sets, "avg_stay_seconds = ?")
				args = append(args, *row.AvgStaySeconds)
			}
			if row.FollowersGained != nil {
				sets = append(sets, "followers_gained = ?")
				args = append(args, *row.FollowersGained)
			}
			if row.RevenueCents != nil {
				sets = append(sets, "revenue_cents = ?")
				args = append(args, *row.RevenueCents)
			}
			sets = append(sets, "updated_at = ?")
			args = append(args, updatedAt, existingID.Int64)
			if _, err := tx.Exec(`UPDATE live_sessions SET `+strings.Join(sets, ", ")+` WHERE id = ?`, args...); err != nil {
				return domain.DailyDataSaveResult{}, fmt.Errorf("批量保存直播数据失败：更新场次失败：%w", err)
			}
			ids = append(ids, existingID.Int64)
			updatedCount++
			continue
		}

		result, err := tx.Exec(`INSERT INTO live_sessions(
            anchor_id, session_date, duration_minutes, duration_overridden, views, avg_online,
            avg_stay_seconds, followers_gained, revenue_cents, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			row.AnchorID, input.SessionDate, int32Value(row.DurationMinutes), boolInt(row.DurationMinutes != nil),
			intValue(row.Views), intValue(row.AvgOnline), intValue(row.AvgStaySeconds), intValue(row.FollowersGained),
			intValue(row.RevenueCents), source, updatedAt, updatedAt)
		if err != nil {
			return domain.DailyDataSaveResult{}, fmt.Errorf("批量保存直播数据失败：新增场次失败：%w", err)
		}
		id, err := result.LastInsertId()
		if err != nil {
			return domain.DailyDataSaveResult{}, fmt.Errorf("批量保存直播数据失败：读取主键失败：%w", err)
		}
		ids = append(ids, id)
		createdCount++
	}
	if len(ids) == 0 {
		return domain.DailyDataSaveResult{SessionDate: input.SessionDate, Sessions: []domain.LiveSession{}}, nil
	}
	if err := tx.Commit(); err != nil {
		return domain.DailyDataSaveResult{}, fmt.Errorf("批量保存直播数据失败：提交事务失败：%w", err)
	}
	committed = true
	sessions := make([]domain.LiveSession, 0, len(ids))
	for _, id := range ids {
		item, err := s.getSessionLocked(id)
		if err != nil {
			return domain.DailyDataSaveResult{}, err
		}
		sessions = append(sessions, item)
	}
	return domain.DailyDataSaveResult{SessionDate: input.SessionDate, SavedCount: len(ids), CreatedCount: createdCount, UpdatedCount: updatedCount, Sessions: sessions}, nil
}

func dailyDataHasValues(row domain.DailySessionInput) bool {
	return row.DurationMinutes != nil || row.Views != nil || row.AvgOnline != nil || row.AvgStaySeconds != nil || row.FollowersGained != nil || row.RevenueCents != nil
}

func validateDailySessionInput(input domain.DailySessionInput) error {
	if input.DurationMinutes != nil && *input.DurationMinutes < 0 {
		return fmt.Errorf("直播时长不能为负数")
	}
	for name, value := range map[string]*int64{
		"场观": input.Views, "平均在线": input.AvgOnline, "平均停留": input.AvgStaySeconds,
		"流水": input.RevenueCents,
	} {
		if value != nil && *value < 0 {
			return fmt.Errorf("%s不能为负数", name)
		}
	}
	return nil
}

func validateSessionInput(input domain.LiveSessionInput) error {
	if input.AnchorID <= 0 {
		return fmt.Errorf("主播不能为空")
	}
	if err := validateDate(normalizeDate(input.SessionDate), "直播日期"); err != nil {
		return err
	}
	if input.DurationMinutes != nil && *input.DurationMinutes < 0 {
		return fmt.Errorf("直播时长不能为负数")
	}
	for name, value := range map[string]*int64{
		"场观": input.Views, "最高在线": input.PeakOnline, "平均在线": input.AvgOnline, "平均停留": input.AvgStaySeconds,
		"点赞": input.Likes, "评论": input.Comments, "评论用户": input.CommentUsers, "分享": input.Shares,
		"开播前粉丝": input.FollowersBefore, "下播后粉丝": input.FollowersAfter,
		"流水": input.RevenueCents, "付费人数": input.PayerCount, "礼物用户": input.GiftUserCount,
		"PK 场次": input.PKCount, "PK 胜场": input.PKWinCount, "PK 流水": input.PKRevenueCents,
	} {
		if value != nil && *value < 0 {
			return fmt.Errorf("%s不能为负数", name)
		}
	}
	return nil
}

func anchorExists(db *sql.DB, id int64, activeOnly bool) error {
	query := `SELECT COUNT(*) FROM anchors WHERE id = ?`
	if activeOnly {
		query += ` AND deleted_at IS NULL`
	}
	var count int
	if err := db.QueryRow(query, id).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("主播不存在或已归档")
	}
	return nil
}

func scanLiveSession(scanner rowScanner) (domain.LiveSession, error) {
	var session domain.LiveSession
	var startedAt, endedAt sql.NullString
	var duration, durationOverride sql.NullInt64
	var views, peakOnline, avgOnline, avgStay, likes, comments, commentUsers, shares sql.NullInt64
	var followersBefore, followersAfter, followersGained, revenue, payerCount, giftUsers sql.NullInt64
	var pkCount, pkWinCount, pkRevenue sql.NullInt64
	var abnormal int64
	if err := scanner.Scan(&session.ID, &session.AnchorID, &session.SessionDate, &startedAt, &endedAt, &duration, &durationOverride,
		&views, &peakOnline, &avgOnline, &avgStay, &likes, &comments, &commentUsers, &shares,
		&followersBefore, &followersAfter, &followersGained, &revenue, &payerCount, &giftUsers,
		&pkCount, &pkWinCount, &pkRevenue, &session.OperatorName, &abnormal, &session.AbnormalNote, &session.Source, &session.Notes,
		&session.CreatedAt, &session.UpdatedAt); err != nil {
		return domain.LiveSession{}, err
	}
	session.StartedAt = nullStringPtr(startedAt)
	session.EndedAt = nullStringPtr(endedAt)
	session.DurationMinutes = nullIntPtr(duration)
	session.DurationOverride = durationOverride.Valid && durationOverride.Int64 != 0
	session.Views = nullInt64Ptr(views)
	session.PeakOnline = nullInt64Ptr(peakOnline)
	session.AvgOnline = nullInt64Ptr(avgOnline)
	session.AvgStaySeconds = nullInt64Ptr(avgStay)
	session.Likes = nullInt64Ptr(likes)
	session.Comments = nullInt64Ptr(comments)
	session.CommentUsers = nullInt64Ptr(commentUsers)
	session.Shares = nullInt64Ptr(shares)
	session.FollowersBefore = nullInt64Ptr(followersBefore)
	session.FollowersAfter = nullInt64Ptr(followersAfter)
	session.FollowersGained = nullInt64Ptr(followersGained)
	session.RevenueCents = nullInt64Ptr(revenue)
	session.PayerCount = nullInt64Ptr(payerCount)
	session.GiftUserCount = nullInt64Ptr(giftUsers)
	session.PKCount = nullInt64Ptr(pkCount)
	session.PKWinCount = nullInt64Ptr(pkWinCount)
	session.PKRevenueCents = nullInt64Ptr(pkRevenue)
	session.IsAbnormal = abnormal != 0
	session.Metrics = metrics.SessionMetrics(session.DurationMinutes, session.RevenueCents, session.FollowersGained, session.Views, session.PayerCount, session.CommentUsers, session.PKCount, session.PKWinCount)
	return session, nil
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func nullStringPtr(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func nullInt64Ptr(value sql.NullInt64) *int64 {
	if !value.Valid {
		return nil
	}
	return &value.Int64
}

func nullIntPtr(value sql.NullInt64) *int {
	if !value.Valid {
		return nil
	}
	v := int(value.Int64)
	return &v
}
