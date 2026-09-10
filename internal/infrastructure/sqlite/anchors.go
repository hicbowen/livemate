package sqlite

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"

	"github.com/hicbowen/livemate/internal/domain"
)

type rowScanner interface {
	Scan(dest ...any) error
}

func (s *Store) CreateAnchor(input domain.AnchorInput) (domain.Anchor, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := validateAnchorInput(input); err != nil {
		return domain.Anchor{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.Anchor{}, err
	}
	createdAt := now()
	stage, attention, status := withAnchorDefaults(input)
	result, err := db.Exec(`INSERT INTO anchors(
        name, nickname, platform, platform_uid, account_name, category, gender,
        age, joined_at, operator_name, stage, attention_level, status, notes,
        created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		strings.TrimSpace(input.Name), strings.TrimSpace(input.Nickname), strings.TrimSpace(input.Platform),
		strings.TrimSpace(input.PlatformUID), strings.TrimSpace(input.AccountName), strings.TrimSpace(input.Category),
		strings.TrimSpace(input.Gender), int32Value(input.Age), stringValue(input.JoinedAt), strings.TrimSpace(input.OperatorName),
		stage, attention, status, input.Notes, createdAt, createdAt)
	if err != nil {
		return domain.Anchor{}, fmt.Errorf("保存主播失败：%w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.Anchor{}, fmt.Errorf("保存主播失败：读取主键失败：%w", err)
	}
	if err := replaceTagsTx(db, id, input.Tags, createdAt); err != nil {
		return domain.Anchor{}, fmt.Errorf("保存主播失败：保存标签失败：%w", err)
	}
	return s.getAnchorLocked(id)
}

func (s *Store) UpdateAnchor(id int64, input domain.AnchorInput) (domain.Anchor, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if id <= 0 {
		return domain.Anchor{}, fmt.Errorf("主播 ID 无效")
	}
	if err := validateAnchorInput(input); err != nil {
		return domain.Anchor{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.Anchor{}, err
	}
	stage, attention, status := withAnchorDefaults(input)
	updatedAt := now()
	result, err := db.Exec(`UPDATE anchors SET
        name = ?, nickname = ?, platform = ?, platform_uid = ?, account_name = ?, category = ?, gender = ?,
        age = ?, joined_at = ?, operator_name = ?, stage = ?, attention_level = ?, status = ?, notes = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL`,
		strings.TrimSpace(input.Name), strings.TrimSpace(input.Nickname), strings.TrimSpace(input.Platform),
		strings.TrimSpace(input.PlatformUID), strings.TrimSpace(input.AccountName), strings.TrimSpace(input.Category),
		strings.TrimSpace(input.Gender), int32Value(input.Age), stringValue(input.JoinedAt), strings.TrimSpace(input.OperatorName),
		stage, attention, status, input.Notes, updatedAt, id)
	if err != nil {
		return domain.Anchor{}, fmt.Errorf("保存主播失败：%w", err)
	}
	count, err := result.RowsAffected()
	if err != nil || count == 0 {
		return domain.Anchor{}, fmt.Errorf("主播不存在或已归档")
	}
	if err := replaceTagsTx(db, id, input.Tags, updatedAt); err != nil {
		return domain.Anchor{}, fmt.Errorf("保存主播失败：保存标签失败：%w", err)
	}
	return s.getAnchorLocked(id)
}

func (s *Store) ArchiveAnchor(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	db, err := s.dbLocked()
	if err != nil {
		return err
	}
	result, err := db.Exec(`UPDATE anchors SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`, now(), now(), id)
	if err != nil {
		return fmt.Errorf("删除主播失败：%w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return fmt.Errorf("主播不存在或已删除")
	}
	return nil
}

func (s *Store) GetAnchor(id int64) (domain.Anchor, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getAnchorLocked(id)
}

func (s *Store) getAnchorLocked(id int64) (domain.Anchor, error) {
	db, err := s.dbLocked()
	if err != nil {
		return domain.Anchor{}, err
	}
	anchor, err := scanAnchor(db.QueryRow(`SELECT id, name, nickname, platform, platform_uid, account_name, category, gender,
        age, joined_at, operator_name, stage, attention_level, status, notes, created_at, updated_at, deleted_at
        FROM anchors WHERE id = ?`, id))
	if errorsIsNoRows(err) {
		return domain.Anchor{}, fmt.Errorf("主播不存在")
	}
	if err != nil {
		return domain.Anchor{}, err
	}
	anchor.Tags, err = loadTags(db, id)
	if err != nil {
		return domain.Anchor{}, err
	}
	return anchor, nil
}

func (s *Store) ListAnchors(filter domain.AnchorFilter) (domain.PageInfo, []domain.AnchorListItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	db, err := s.dbLocked()
	if err != nil {
		return domain.PageInfo{}, nil, err
	}
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize <= 0 || filter.PageSize > 200 {
		filter.PageSize = 50
	}
	where, args := anchorListWhere(filter)
	var total int
	if err := db.QueryRow(`SELECT COUNT(*) FROM anchors a `+where, args...).Scan(&total); err != nil {
		return domain.PageInfo{}, nil, err
	}
	pageInfo := domain.PageInfo{Page: filter.Page, PageSize: filter.PageSize, Total: total}
	if total > 0 {
		pageInfo.TotalPages = (total + filter.PageSize - 1) / filter.PageSize
	}
	orderBy := anchorOrderBy(filter)
	query := `SELECT a.id, a.name, a.nickname, a.platform, a.platform_uid, a.account_name, a.category, a.gender,
        a.age, a.joined_at, a.operator_name, a.stage, a.attention_level, a.status, a.notes, a.created_at, a.updated_at, a.deleted_at,
        (SELECT s.session_date FROM live_sessions s WHERE s.anchor_id = a.id ORDER BY s.session_date DESC, s.id DESC LIMIT 1) AS last_session_date,
        (SELECT MAX(x.activity_date) FROM (
            SELECT s.session_date AS activity_date FROM live_sessions s WHERE s.anchor_id = a.id
            UNION ALL SELECT r.review_date FROM operation_reviews r WHERE r.anchor_id = a.id
            UNION ALL SELECT i.discovered_at FROM anchor_issues i WHERE i.anchor_id = a.id
            UNION ALL SELECT p.start_date FROM improvement_plans p WHERE p.anchor_id = a.id
        ) x) AS last_activity_date,
        COALESCE((SELECT SUM(COALESCE(s.duration_minutes, 0)) FROM live_sessions s WHERE s.anchor_id = a.id AND s.session_date >= ?), 0),
        COALESCE((SELECT SUM(COALESCE(s.revenue_cents, 0)) FROM live_sessions s WHERE s.anchor_id = a.id AND s.session_date >= ?), 0),
        COALESCE((SELECT SUM(COALESCE(s.followers_gained, 0)) FROM live_sessions s WHERE s.anchor_id = a.id AND s.session_date >= ?), 0),
        (SELECT COUNT(*) FROM anchor_issues i WHERE i.anchor_id = a.id AND i.status NOT IN ('已解决', '已关闭')),
        (SELECT COUNT(*) FROM improvement_plans p WHERE p.anchor_id = a.id AND p.status IN ('执行中', '观察中'))
        FROM anchors a ` + where + ` ORDER BY ` + orderBy + ` LIMIT ? OFFSET ?`
	startDate := dateDaysAgo(6)
	args = append([]any{startDate, startDate, startDate}, args...)
	args = append(args, filter.PageSize, (filter.Page-1)*filter.PageSize)
	rows, err := db.Query(query, args...)
	if err != nil {
		return pageInfo, nil, err
	}
	defer rows.Close()
	items := make([]domain.AnchorListItem, 0)
	for rows.Next() {
		item, err := scanAnchorListItem(rows)
		if err != nil {
			return pageInfo, nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return pageInfo, nil, err
	}
	if err := rows.Close(); err != nil {
		return pageInfo, nil, err
	}
	for index := range items {
		items[index].Tags, err = loadTags(db, items[index].ID)
		if err != nil {
			return pageInfo, nil, err
		}
	}
	return pageInfo, items, nil
}

func (s *Store) ListTagNames() ([]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	db, err := s.dbLocked()
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(`SELECT DISTINCT name FROM anchor_tags ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

func validateAnchorInput(input domain.AnchorInput) error {
	if strings.TrimSpace(input.Nickname) == "" {
		return fmt.Errorf("主播昵称不能为空")
	}
	if strings.TrimSpace(input.Platform) == "" {
		return fmt.Errorf("平台不能为空")
	}
	if err := validateChoice(defaultString(input.Stage, domain.AnchorStages[0]), "主播阶段", domain.AnchorStages); err != nil {
		return err
	}
	if err := validateChoice(defaultString(input.AttentionLevel, domain.AttentionLevels[0]), "关注等级", domain.AttentionLevels); err != nil {
		return err
	}
	if err := validateChoice(defaultString(input.Status, domain.AnchorStatuses[0]), "主播状态", domain.AnchorStatuses); err != nil {
		return err
	}
	if input.Age != nil && (*input.Age < 0 || *input.Age > 150) {
		return fmt.Errorf("年龄范围无效")
	}
	if input.JoinedAt != nil && *input.JoinedAt != "" {
		if err := validateDate(*input.JoinedAt, "签约时间"); err != nil {
			return err
		}
	}
	return nil
}

func withAnchorDefaults(input domain.AnchorInput) (string, string, string) {
	return defaultString(input.Stage, domain.AnchorStages[0]), defaultString(input.AttentionLevel, domain.AttentionLevels[0]), defaultString(input.Status, domain.AnchorStatuses[0])
}

func anchorListWhere(filter domain.AnchorFilter) (string, []any) {
	where := `WHERE a.deleted_at IS NULL
        AND (? = '' OR lower(a.nickname) LIKE lower('%' || ? || '%') OR lower(a.name) LIKE lower('%' || ? || '%') OR lower(a.platform_uid) LIKE lower('%' || ? || '%') OR lower(a.account_name) LIKE lower('%' || ? || '%'))
        AND (? = '' OR a.stage = ?)
        AND (? = '' OR a.status = ?)
        AND (? = '' OR a.attention_level = ?)
        AND (? = '' OR EXISTS (SELECT 1 FROM anchor_tags at WHERE at.anchor_id = a.id AND at.name = ?))`
	return where, []any{filter.Query, filter.Query, filter.Query, filter.Query, filter.Query, filter.Stage, filter.Stage, filter.Status, filter.Status, filter.AttentionLevel, filter.AttentionLevel, filter.Tag, filter.Tag}
}

func anchorOrderBy(filter domain.AnchorFilter) string {
	direction := "ASC"
	if filter.SortDesc {
		direction = "DESC"
	}
	switch filter.SortBy {
	case "nickname":
		return "a.nickname " + direction + ", a.id DESC"
	case "stage":
		return "a.stage " + direction + ", a.id DESC"
	case "status":
		return "a.status " + direction + ", a.id DESC"
	case "recent":
		return "last_activity_date " + direction + ", a.id DESC"
	default:
		return `CASE a.attention_level WHEN '紧急' THEN 3 WHEN '重点关注' THEN 2 ELSE 1 END DESC,
            last_activity_date DESC, a.id DESC`
	}
}

func replaceTagsTx(db *sql.DB, anchorID int64, tags []string, createdAt string) error {
	if _, err := db.Exec(`DELETE FROM anchor_tags WHERE anchor_id = ?`, anchorID); err != nil {
		return err
	}
	seen := make(map[string]struct{}, len(tags))
	cleaned := make([]string, 0, len(tags))
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}
		if _, ok := seen[tag]; ok {
			continue
		}
		seen[tag] = struct{}{}
		cleaned = append(cleaned, tag)
	}
	sort.Strings(cleaned)
	for _, tag := range cleaned {
		if _, err := db.Exec(`INSERT INTO anchor_tags(anchor_id, name, created_at) VALUES (?, ?, ?)`, anchorID, tag, createdAt); err != nil {
			return err
		}
	}
	return nil
}

func loadTags(db *sql.DB, anchorID int64) ([]string, error) {
	rows, err := db.Query(`SELECT name FROM anchor_tags WHERE anchor_id = ? ORDER BY name`, anchorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var tags []string
	for rows.Next() {
		var tag string
		if err := rows.Scan(&tag); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, rows.Err()
}

func scanAnchor(scanner rowScanner) (domain.Anchor, error) {
	var anchor domain.Anchor
	var age sql.NullInt64
	var joinedAt, deletedAt sql.NullString
	if err := scanner.Scan(&anchor.ID, &anchor.Name, &anchor.Nickname, &anchor.Platform, &anchor.PlatformUID,
		&anchor.AccountName, &anchor.Category, &anchor.Gender, &age, &joinedAt, &anchor.OperatorName,
		&anchor.Stage, &anchor.AttentionLevel, &anchor.Status, &anchor.Notes, &anchor.CreatedAt, &anchor.UpdatedAt, &deletedAt); err != nil {
		return domain.Anchor{}, err
	}
	if age.Valid {
		anchor.Age = int32Ptr(int(age.Int64))
	}
	if joinedAt.Valid {
		anchor.JoinedAt = &joinedAt.String
	}
	if deletedAt.Valid {
		anchor.DeletedAt = &deletedAt.String
	}
	anchor.Tags = []string{}
	return anchor, nil
}

func scanAnchorListItem(scanner rowScanner) (domain.AnchorListItem, error) {
	var item domain.AnchorListItem
	var age sql.NullInt64
	var joinedAt, deletedAt, lastSession, lastActivity sql.NullString
	var duration, revenue, followers, pending, plans int64
	if err := scanner.Scan(&item.ID, &item.Name, &item.Nickname, &item.Platform, &item.PlatformUID,
		&item.AccountName, &item.Category, &item.Gender, &age, &joinedAt, &item.OperatorName,
		&item.Stage, &item.AttentionLevel, &item.Status, &item.Notes, &item.CreatedAt, &item.UpdatedAt, &deletedAt,
		&lastSession, &lastActivity, &duration, &revenue, &followers, &pending, &plans); err != nil {
		return domain.AnchorListItem{}, err
	}
	if age.Valid {
		item.Age = int32Ptr(int(age.Int64))
	}
	if joinedAt.Valid {
		item.JoinedAt = &joinedAt.String
	}
	if deletedAt.Valid {
		item.DeletedAt = &deletedAt.String
	}
	if lastSession.Valid {
		item.LastSessionDate = &lastSession.String
	}
	if lastActivity.Valid {
		item.LastActivityDate = &lastActivity.String
	}
	item.Last7DurationMinutes = int(duration)
	item.Last7RevenueCents = revenue
	item.Last7FollowersGained = followers
	item.PendingIssueCount = int(pending)
	item.ActivePlanCount = int(plans)
	item.Tags = []string{}
	return item, nil
}

func defaultString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func errorsIsNoRows(err error) bool { return err == sql.ErrNoRows }
