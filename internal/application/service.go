package application

import (
	"fmt"
	"strings"

	"github.com/hicbowen/livemate/internal/domain"
	"github.com/hicbowen/livemate/internal/infrastructure/sqlite"
	"github.com/hicbowen/livemate/internal/platform"
)

// Service contains application use cases. The Wails bridge delegates to this
// type, keeping the UI unaware of SQLite and keeping business writes ordered:
// Go -> SQLite -> fresh query -> Zustand.
type Service struct {
	store *sqlite.Store
}

func NewService(store *sqlite.Store) *Service {
	return &Service{store: store}
}

func (s *Service) AppInfo() domain.AppInfo { return s.store.AppInfo() }

func (s *Service) ListAnchors(filter domain.AnchorFilter) (domain.AnchorPage, error) {
	page, items, err := s.store.ListAnchors(filter)
	return domain.AnchorPage{Page: page, Items: items}, err
}

func (s *Service) GetAnchor(id int64) (domain.Anchor, error) { return s.store.GetAnchor(id) }
func (s *Service) CreateAnchor(input domain.AnchorInput) (domain.Anchor, error) {
	return s.store.CreateAnchor(input)
}
func (s *Service) UpdateAnchor(id int64, input domain.AnchorInput) (domain.Anchor, error) {
	return s.store.UpdateAnchor(id, input)
}
func (s *Service) ArchiveAnchor(id int64) error    { return s.store.ArchiveAnchor(id) }
func (s *Service) ListTagNames() ([]string, error) { return s.store.ListTagNames() }

func (s *Service) GetAnchorDetail(id int64) (domain.AnchorDetail, error) {
	if id <= 0 {
		return domain.AnchorDetail{}, fmt.Errorf("主播 ID 无效")
	}
	return s.store.GetAnchorDetail(id)
}

func (s *Service) ListSessions(anchorID int64) ([]domain.LiveSession, error) {
	return s.store.ListSessions(anchorID)
}
func (s *Service) ListSessionPage(filter domain.SessionFilter) (domain.SessionPage, error) {
	return s.store.ListSessionPage(filter)
}
func (s *Service) GetSession(id int64) (domain.LiveSession, error) { return s.store.GetSession(id) }
func (s *Service) CreateSession(input domain.LiveSessionInput) (domain.LiveSession, error) {
	return s.store.CreateSession(input)
}
func (s *Service) UpdateSession(id int64, input domain.LiveSessionInput) (domain.LiveSession, error) {
	return s.store.UpdateSession(id, input)
}
func (s *Service) DeleteSession(id int64) error { return s.store.DeleteSession(id) }
func (s *Service) GetAnchorTrend(anchorID int64, days int) ([]domain.TrendPoint, error) {
	return s.store.GetAnchorTrend(anchorID, days)
}
func (s *Service) GetAnchorTrendRange(anchorID int64, startDate, endDate string) ([]domain.TrendPoint, error) {
	return s.store.GetAnchorTrendRange(anchorID, startDate, endDate)
}

func (s *Service) ListReviews(anchorID int64) ([]domain.OperationReview, error) {
	return s.store.ListReviews(anchorID)
}
func (s *Service) GetReview(id int64) (domain.OperationReview, error) { return s.store.GetReview(id) }
func (s *Service) CreateReview(input domain.OperationReviewInput) (domain.OperationReview, error) {
	return s.store.CreateReview(input)
}
func (s *Service) UpdateReview(id int64, input domain.OperationReviewInput) (domain.OperationReview, error) {
	return s.store.UpdateReview(id, input)
}

func (s *Service) ListIssues(anchorID int64, status string) ([]domain.AnchorIssue, error) {
	return s.store.ListIssues(anchorID, status)
}
func (s *Service) GetIssue(id int64) (domain.AnchorIssue, error) { return s.store.GetIssue(id) }
func (s *Service) CreateIssue(input domain.AnchorIssueInput) (domain.AnchorIssue, error) {
	return s.store.CreateIssue(input)
}
func (s *Service) UpdateIssue(id int64, input domain.AnchorIssueInput) (domain.AnchorIssue, error) {
	return s.store.UpdateIssue(id, input)
}
func (s *Service) ChangeIssueStatus(id int64, status string) (domain.AnchorIssue, error) {
	return s.store.ChangeIssueStatus(id, status)
}

func (s *Service) ListPlans(anchorID int64, status string) ([]domain.ImprovementPlan, error) {
	return s.store.ListPlans(anchorID, status)
}
func (s *Service) GetPlan(id int64) (domain.ImprovementPlan, error) { return s.store.GetPlan(id) }
func (s *Service) CreatePlan(input domain.ImprovementPlanInput) (domain.ImprovementPlan, error) {
	return s.store.CreatePlan(input)
}
func (s *Service) UpdatePlan(id int64, input domain.ImprovementPlanInput) (domain.ImprovementPlan, error) {
	return s.store.UpdatePlan(id, input)
}
func (s *Service) ChangePlanStatus(id int64, status string) (domain.ImprovementPlan, error) {
	return s.store.ChangePlanStatus(id, status)
}
func (s *Service) DeletePlan(id int64) error { return s.store.DeletePlan(id) }
func (s *Service) ListFollowups(planID int64) ([]domain.PlanFollowup, error) {
	return s.store.ListFollowups(planID)
}
func (s *Service) GetFollowup(id int64) (domain.PlanFollowup, error) { return s.store.GetFollowup(id) }
func (s *Service) AddFollowup(input domain.PlanFollowupInput) (domain.PlanFollowup, error) {
	return s.store.AddFollowup(input)
}
func (s *Service) UpdateFollowup(id int64, input domain.PlanFollowupInput) (domain.PlanFollowup, error) {
	return s.store.UpdateFollowup(id, input)
}
func (s *Service) DeleteFollowup(id int64) error { return s.store.DeleteFollowup(id) }

func (s *Service) ListGoals(anchorID int64) ([]domain.StageGoal, error) {
	return s.store.ListGoals(anchorID)
}
func (s *Service) GetGoal(id int64) (domain.StageGoal, error) { return s.store.GetGoal(id) }
func (s *Service) CreateGoal(input domain.StageGoalInput) (domain.StageGoal, error) {
	return s.store.CreateGoal(input)
}
func (s *Service) UpdateGoal(id int64, input domain.StageGoalInput) (domain.StageGoal, error) {
	return s.store.UpdateGoal(id, input)
}
func (s *Service) ChangeGoalStatus(id int64, status string) (domain.StageGoal, error) {
	return s.store.ChangeGoalStatus(id, status)
}

func (s *Service) ListEvents(anchorID int64) ([]domain.AnchorEvent, error) {
	return s.store.ListEvents(anchorID)
}
func (s *Service) GetEvent(id int64) (domain.AnchorEvent, error) { return s.store.GetEvent(id) }
func (s *Service) CreateEvent(input domain.AnchorEventInput) (domain.AnchorEvent, error) {
	return s.store.CreateEvent(input)
}
func (s *Service) UpdateEvent(id int64, input domain.AnchorEventInput) (domain.AnchorEvent, error) {
	return s.store.UpdateEvent(id, input)
}
func (s *Service) DeleteEvent(id int64) error { return s.store.DeleteEvent(id) }

func (s *Service) GetDashboard(staleDays int) (domain.Dashboard, error) {
	return s.store.GetDashboard(staleDays)
}
func (s *Service) Search(query string) ([]domain.SearchResult, error) {
	return s.store.Search(strings.TrimSpace(query))
}

func (s *Service) ExportBackup() (domain.BackupExport, error) {
	return s.store.ExportBackup(domain.AppVersion)
}

func (s *Service) ImportBackup(archiveBase64 string) error {
	return s.store.ImportBackup(archiveBase64, domain.AppVersion)
}

func (s *Service) DataDirectory() string    { return s.store.Paths().DataDir }
func (s *Service) LogDirectory() string     { return s.store.Paths().LogDir }
func (s *Service) BackupDirectory() string  { return s.store.Paths().BackupDir }
func (s *Service) OpenDataDirectory() error { return platform.OpenDirectory(s.store.Paths().DataDir) }
func (s *Service) OpenLogDirectory() error  { return platform.OpenDirectory(s.store.Paths().LogDir) }
