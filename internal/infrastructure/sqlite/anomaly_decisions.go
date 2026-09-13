package sqlite

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/hicbowen/livemate/internal/domain"
)

// SetAnomalyDecision stores the operator's decision for one detected
// occurrence. The detected date is part of the key so a later occurrence of
// the same rule can be surfaced again after the underlying data changes.
func (s *Store) SetAnomalyDecision(input domain.AnomalyDecisionInput) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if input.AnchorID <= 0 {
		return fmt.Errorf("主播 ID 无效")
	}
	input.AnomalyID = strings.TrimSpace(input.AnomalyID)
	input.Decision = strings.TrimSpace(input.Decision)
	if input.AnomalyID == "" {
		return fmt.Errorf("异常规则不能为空")
	}
	if err := validateDate(input.DetectedAt, "异常检测日期"); err != nil {
		return err
	}
	if err := validateChoice(input.Decision, "异常处理方式", domain.AnomalyDecisions); err != nil {
		return err
	}
	db, err := s.dbLocked()
	if err != nil {
		return err
	}
	if err := anchorExists(db, input.AnchorID, false); err != nil {
		return err
	}
	_, err = db.Exec(`
		INSERT INTO anomaly_decisions(anchor_id, anomaly_id, detected_at, decision, decided_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(anchor_id, anomaly_id, detected_at) DO UPDATE SET
			decision = excluded.decision,
			decided_at = excluded.decided_at`,
		input.AnchorID, input.AnomalyID, input.DetectedAt, input.Decision, now())
	if err != nil {
		return fmt.Errorf("保存异常处理结果失败：%w", err)
	}
	return nil
}

func filterSuppressedAnomalies(db *sql.DB, anchorID int64, candidates []domain.AnomalyCandidate) ([]domain.AnomalyCandidate, error) {
	if len(candidates) == 0 {
		return []domain.AnomalyCandidate{}, nil
	}
	rows, err := db.Query(`SELECT anomaly_id, detected_at FROM anomaly_decisions WHERE anchor_id = ?`, anchorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	suppressed := make(map[string]struct{})
	for rows.Next() {
		var anomalyID, detectedAt string
		if err := rows.Scan(&anomalyID, &detectedAt); err != nil {
			return nil, err
		}
		suppressed[anomalyID+"\x00"+detectedAt] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	visible := make([]domain.AnomalyCandidate, 0, len(candidates))
	for _, candidate := range candidates {
		if _, hidden := suppressed[candidate.ID+"\x00"+candidate.DetectedAt]; hidden {
			continue
		}
		visible = append(visible, candidate)
	}
	return visible, nil
}
