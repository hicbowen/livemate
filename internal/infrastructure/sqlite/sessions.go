package sqlite

import (
	"database/sql"
	"fmt"

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
		"开播前粉丝": input.FollowersBefore, "下播后粉丝": input.FollowersAfter, "新增粉丝": input.FollowersGained,
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
