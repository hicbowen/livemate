package sqlite

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/hicbowen/livemate/internal/domain"
)

func (s *Store) CreateReview(input domain.OperationReviewInput) (domain.OperationReview, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	input.ReviewDate = normalizeDate(input.ReviewDate)
	if input.AnchorID <= 0 {
		return domain.OperationReview{}, fmt.Errorf("主播不能为空")
	}
	if err := validateDate(input.ReviewDate, "复盘日期"); err != nil {
		return domain.OperationReview{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.OperationReview{}, err
	}
	if err := anchorExists(db, input.AnchorID, true); err != nil {
		return domain.OperationReview{}, err
	}
	if input.LiveSessionID != nil {
		if err := sessionBelongsToAnchor(db, *input.LiveSessionID, input.AnchorID); err != nil {
			return domain.OperationReview{}, err
		}
	}
	createdAt := now()
	result, err := db.Exec(`INSERT INTO operation_reviews(anchor_id, live_session_id, review_date, summary, strengths, observations, conclusion, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, input.AnchorID, intValue(input.LiveSessionID), input.ReviewDate, input.Summary, input.Strengths, input.Observations, input.Conclusion, createdAt, createdAt)
	if err != nil {
		return domain.OperationReview{}, fmt.Errorf("保存复盘失败：%w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.OperationReview{}, err
	}
	return s.getReviewLocked(id)
}

func (s *Store) UpdateReview(id int64, input domain.OperationReviewInput) (domain.OperationReview, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	input.ReviewDate = normalizeDate(input.ReviewDate)
	if id <= 0 || input.AnchorID <= 0 {
		return domain.OperationReview{}, fmt.Errorf("复盘参数无效")
	}
	if err := validateDate(input.ReviewDate, "复盘日期"); err != nil {
		return domain.OperationReview{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.OperationReview{}, err
	}
	if err := anchorExists(db, input.AnchorID, true); err != nil {
		return domain.OperationReview{}, err
	}
	if input.LiveSessionID != nil {
		if err := sessionBelongsToAnchor(db, *input.LiveSessionID, input.AnchorID); err != nil {
			return domain.OperationReview{}, err
		}
	}
	result, err := db.Exec(`UPDATE operation_reviews SET live_session_id = ?, review_date = ?, summary = ?, strengths = ?, observations = ?, conclusion = ?, updated_at = ? WHERE id = ? AND anchor_id = ?`,
		intValue(input.LiveSessionID), input.ReviewDate, input.Summary, input.Strengths, input.Observations, input.Conclusion, now(), id, input.AnchorID)
	if err != nil {
		return domain.OperationReview{}, fmt.Errorf("保存复盘失败：%w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return domain.OperationReview{}, fmt.Errorf("复盘不存在")
	}
	return s.getReviewLocked(id)
}

func (s *Store) GetReview(id int64) (domain.OperationReview, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getReviewLocked(id)
}

func (s *Store) getReviewLocked(id int64) (domain.OperationReview, error) {
	db, err := s.dbLocked()
	if err != nil {
		return domain.OperationReview{}, err
	}
	return scanReview(db.QueryRow(`SELECT id, anchor_id, live_session_id, review_date, summary, strengths, observations, conclusion, created_at, updated_at FROM operation_reviews WHERE id = ?`, id))
}

func (s *Store) ListReviews(anchorID int64) ([]domain.OperationReview, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	db, err := s.dbLocked()
	if err != nil {
		return nil, err
	}
	query := `SELECT id, anchor_id, live_session_id, review_date, summary, strengths, observations, conclusion, created_at, updated_at FROM operation_reviews`
	args := []any{}
	if anchorID > 0 {
		query += ` WHERE anchor_id = ?`
		args = append(args, anchorID)
	}
	query += ` ORDER BY review_date DESC, id DESC LIMIT 500`
	rows, err := db.Query(query, args...)
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

func (s *Store) CreateIssue(input domain.AnchorIssueInput) (domain.AnchorIssue, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	input.DiscoveredAt = normalizeDate(input.DiscoveredAt)
	if strings.TrimSpace(input.Title) == "" {
		return domain.AnchorIssue{}, fmt.Errorf("问题标题不能为空")
	}
	if err := validateDate(input.DiscoveredAt, "发现日期"); err != nil {
		return domain.AnchorIssue{}, err
	}
	category := defaultString(input.Category, "其他")
	priority := defaultString(input.Priority, domain.Priorities[0])
	status := defaultString(input.Status, domain.IssueStatuses[0])
	if err := validateChoice(category, "问题分类", domain.IssueCategories); err != nil {
		return domain.AnchorIssue{}, err
	}
	if err := validateChoice(priority, "问题优先级", domain.Priorities); err != nil {
		return domain.AnchorIssue{}, err
	}
	if err := validateChoice(status, "问题状态", domain.IssueStatuses); err != nil {
		return domain.AnchorIssue{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.AnchorIssue{}, err
	}
	if err := anchorExists(db, input.AnchorID, true); err != nil {
		return domain.AnchorIssue{}, err
	}
	if input.ReviewID != nil {
		if err := reviewBelongsToAnchor(db, *input.ReviewID, input.AnchorID); err != nil {
			return domain.AnchorIssue{}, err
		}
	}
	createdAt := now()
	result, err := db.Exec(`INSERT INTO anchor_issues(anchor_id, review_id, title, category, description, evidence, cause_hypothesis, priority, status, discovered_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, input.AnchorID, intValue(input.ReviewID), strings.TrimSpace(input.Title), category, input.Description, input.Evidence, input.CauseHypothesis, priority, status, input.DiscoveredAt, createdAt, createdAt)
	if err != nil {
		return domain.AnchorIssue{}, fmt.Errorf("保存问题失败：%w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.AnchorIssue{}, err
	}
	return s.getIssueLocked(id)
}

func (s *Store) UpdateIssue(id int64, input domain.AnchorIssueInput) (domain.AnchorIssue, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	input.DiscoveredAt = normalizeDate(input.DiscoveredAt)
	if id <= 0 || strings.TrimSpace(input.Title) == "" {
		return domain.AnchorIssue{}, fmt.Errorf("问题参数无效")
	}
	if err := validateDate(input.DiscoveredAt, "发现日期"); err != nil {
		return domain.AnchorIssue{}, err
	}
	category := defaultString(input.Category, "其他")
	priority := defaultString(input.Priority, domain.Priorities[0])
	status := defaultString(input.Status, domain.IssueStatuses[0])
	if err := validateChoice(category, "问题分类", domain.IssueCategories); err != nil {
		return domain.AnchorIssue{}, err
	}
	if err := validateChoice(priority, "问题优先级", domain.Priorities); err != nil {
		return domain.AnchorIssue{}, err
	}
	if err := validateChoice(status, "问题状态", domain.IssueStatuses); err != nil {
		return domain.AnchorIssue{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.AnchorIssue{}, err
	}
	if err := anchorExists(db, input.AnchorID, true); err != nil {
		return domain.AnchorIssue{}, err
	}
	if input.ReviewID != nil {
		if err := reviewBelongsToAnchor(db, *input.ReviewID, input.AnchorID); err != nil {
			return domain.AnchorIssue{}, err
		}
	}
	result, err := db.Exec(`UPDATE anchor_issues SET review_id = ?, title = ?, category = ?, description = ?, evidence = ?, cause_hypothesis = ?, priority = ?, status = ?, discovered_at = ?, updated_at = ?, resolved_at = CASE WHEN ? IN ('已解决', '已关闭') THEN COALESCE(resolved_at, ?) ELSE NULL END WHERE id = ? AND anchor_id = ?`,
		intValue(input.ReviewID), strings.TrimSpace(input.Title), category, input.Description, input.Evidence, input.CauseHypothesis, priority, status, input.DiscoveredAt, now(), status, now(), id, input.AnchorID)
	if err != nil {
		return domain.AnchorIssue{}, fmt.Errorf("保存问题失败：%w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return domain.AnchorIssue{}, fmt.Errorf("问题不存在")
	}
	return s.getIssueLocked(id)
}

func (s *Store) ChangeIssueStatus(id int64, status string) (domain.AnchorIssue, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := validateChoice(status, "问题状态", domain.IssueStatuses); err != nil {
		return domain.AnchorIssue{}, err
	}
	db, err := s.dbLocked()
	if err != nil {
		return domain.AnchorIssue{}, err
	}
	resolvedAt := any(nil)
	if status == "已解决" || status == "已关闭" {
		resolvedAt = now()
	}
	result, err := db.Exec(`UPDATE anchor_issues SET status = ?, resolved_at = ?, updated_at = ? WHERE id = ?`, status, resolvedAt, now(), id)
	if err != nil {
		return domain.AnchorIssue{}, fmt.Errorf("更新问题状态失败：%w", err)
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return domain.AnchorIssue{}, fmt.Errorf("问题不存在")
	}
	return s.getIssueLocked(id)
}

func (s *Store) GetIssue(id int64) (domain.AnchorIssue, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getIssueLocked(id)
}

func (s *Store) getIssueLocked(id int64) (domain.AnchorIssue, error) {
	db, err := s.dbLocked()
	if err != nil {
		return domain.AnchorIssue{}, err
	}
	return scanIssue(db.QueryRow(`SELECT i.id, i.anchor_id, i.review_id, i.title, i.category, i.description, i.evidence, i.cause_hypothesis, i.priority, i.status, i.discovered_at, i.resolved_at, i.created_at, i.updated_at,
        (SELECT COUNT(*) FROM improvement_plans p WHERE p.issue_id = i.id) FROM anchor_issues i WHERE i.id = ?`, id))
}

func (s *Store) ListIssues(anchorID int64, status string) ([]domain.AnchorIssue, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	db, err := s.dbLocked()
	if err != nil {
		return nil, err
	}
	query := `SELECT i.id, i.anchor_id, i.review_id, i.title, i.category, i.description, i.evidence, i.cause_hypothesis, i.priority, i.status, i.discovered_at, i.resolved_at, i.created_at, i.updated_at,
        (SELECT COUNT(*) FROM improvement_plans p WHERE p.issue_id = i.id) FROM anchor_issues i WHERE (? = 0 OR i.anchor_id = ?) AND (? = '' OR i.status = ?) ORDER BY i.discovered_at DESC, i.id DESC LIMIT 500`
	rows, err := db.Query(query, anchorID, anchorID, status, status)
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

func scanReview(scanner rowScanner) (domain.OperationReview, error) {
	var item domain.OperationReview
	var sessionID sql.NullInt64
	if err := scanner.Scan(&item.ID, &item.AnchorID, &sessionID, &item.ReviewDate, &item.Summary, &item.Strengths, &item.Observations, &item.Conclusion, &item.CreatedAt, &item.UpdatedAt); err != nil {
		return domain.OperationReview{}, err
	}
	item.LiveSessionID = nullInt64Ptr(sessionID)
	return item, nil
}

func scanIssue(scanner rowScanner) (domain.AnchorIssue, error) {
	var item domain.AnchorIssue
	var resolvedAt sql.NullString
	var reviewIDInt sql.NullInt64
	var planCount int
	if err := scanner.Scan(&item.ID, &item.AnchorID, &reviewIDInt, &item.Title, &item.Category, &item.Description, &item.Evidence, &item.CauseHypothesis, &item.Priority, &item.Status, &item.DiscoveredAt, &resolvedAt, &item.CreatedAt, &item.UpdatedAt, &planCount); err != nil {
		return domain.AnchorIssue{}, err
	}
	item.ReviewID = nullInt64Ptr(reviewIDInt)
	item.ResolvedAt = nullStringPtr(resolvedAt)
	item.PlanCount = planCount
	return item, nil
}

func reviewBelongsToAnchor(db *sql.DB, reviewID, anchorID int64) error {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM operation_reviews WHERE id = ? AND anchor_id = ?`, reviewID, anchorID).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("复盘不存在或不属于当前主播")
	}
	return nil
}

func sessionBelongsToAnchor(db *sql.DB, sessionID, anchorID int64) error {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM live_sessions WHERE id = ? AND anchor_id = ?`, sessionID, anchorID).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("直播场次不存在或不属于当前主播")
	}
	return nil
}
