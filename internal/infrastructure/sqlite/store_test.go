package sqlite

import (
	"math"
	"path/filepath"
	"testing"

	"github.com/hicbowen/livemate/internal/domain"
)

func testStore(t *testing.T) *Store {
	t.Helper()
	store, err := OpenAt(filepath.Join(t.TempDir(), "livemate.db"), nil)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func testAnchor(t *testing.T, store *Store, nickname string) domain.Anchor {
	t.Helper()
	anchor, err := store.CreateAnchor(domain.AnchorInput{
		Nickname:       nickname,
		Platform:       "抖音",
		Category:       "聊天",
		Stage:          "新人",
		AttentionLevel: "正常",
		Status:         "正常开播",
		Tags:           []string{"新人", "高潜", "新人"},
	})
	if err != nil {
		t.Fatalf("create anchor: %v", err)
	}
	return anchor
}

func int64p(value int64) *int64     { return &value }
func intp(value int) *int           { return &value }
func floatp(value float64) *float64 { return &value }
func stringp(value string) *string  { return &value }

func TestMigrationAndAnchorSoftDelete(t *testing.T) {
	store := testStore(t)
	var migrationCount int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version = 1 AND name = '001_initial_schema.sql'`).Scan(&migrationCount); err != nil {
		t.Fatalf("migration query: %v", err)
	}
	if migrationCount != 1 {
		t.Fatalf("migration count = %d, want 1", migrationCount)
	}
	anchor := testAnchor(t, store, "小鱼")
	if len(anchor.Tags) != 2 {
		t.Fatalf("tags = %#v, want deduplicated tags", anchor.Tags)
	}
	if _, err := store.CreateSession(domain.LiveSessionInput{AnchorID: anchor.ID, SessionDate: today()}); err != nil {
		t.Fatalf("create historical session: %v", err)
	}
	if err := store.ArchiveAnchor(anchor.ID); err != nil {
		t.Fatalf("archive anchor: %v", err)
	}
	page, items, err := store.ListAnchors(domain.AnchorFilter{})
	if err != nil {
		t.Fatalf("list anchors: %v", err)
	}
	if page.Total != 0 || len(items) != 0 {
		t.Fatalf("archived anchor still in default list: page=%#v items=%#v", page, items)
	}
	if _, err := store.GetAnchor(anchor.ID); err != nil {
		t.Fatalf("soft-deleted anchor should remain readable for history: %v", err)
	}
	var sessionCount int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM live_sessions WHERE anchor_id = ?`, anchor.ID).Scan(&sessionCount); err != nil {
		t.Fatal(err)
	}
	if sessionCount != 1 {
		t.Fatalf("historical session count = %d, want 1", sessionCount)
	}
}

func TestSessionMetricsAndNullHandling(t *testing.T) {
	store := testStore(t)
	anchor := testAnchor(t, store, "小鱼")
	start := today() + "T18:00:00+08:00"
	end := today() + "T22:00:00+08:00"
	session, err := store.CreateSession(domain.LiveSessionInput{
		AnchorID:        anchor.ID,
		SessionDate:     today(),
		StartedAt:       stringp(start),
		EndedAt:         stringp(end),
		Views:           int64p(5000),
		AvgStaySeconds:  int64p(42),
		FollowersBefore: int64p(100),
		FollowersAfter:  int64p(120),
		RevenueCents:    int64p(250000),
		PayerCount:      int64p(25),
		CommentUsers:    int64p(80),
		PKCount:         int64p(4),
		PKWinCount:      int64p(3),
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	if session.DurationMinutes == nil || *session.DurationMinutes != 240 {
		t.Fatalf("duration = %#v, want 240", session.DurationMinutes)
	}
	if session.FollowersGained == nil || *session.FollowersGained != 20 {
		t.Fatalf("followers gained = %#v, want 20", session.FollowersGained)
	}
	if session.Metrics.RevenuePerHour == nil || math.Abs(*session.Metrics.RevenuePerHour-625) > 0.001 {
		t.Fatalf("revenue/hour = %#v, want 625", session.Metrics.RevenuePerHour)
	}
	if session.Metrics.PayerRate == nil || math.Abs(*session.Metrics.PayerRate-0.005) > 0.000001 {
		t.Fatalf("payer rate = %#v, want .005", session.Metrics.PayerRate)
	}
	if session.Metrics.PKWinRate == nil || math.Abs(*session.Metrics.PKWinRate-.75) > 0.000001 {
		t.Fatalf("pk win rate = %#v, want .75", session.Metrics.PKWinRate)
	}

	unknown, err := store.CreateSession(domain.LiveSessionInput{AnchorID: anchor.ID, SessionDate: today()})
	if err != nil {
		t.Fatalf("create unknown session: %v", err)
	}
	if unknown.DurationMinutes != nil || unknown.Views != nil || unknown.RevenueCents != nil || unknown.Metrics.RevenuePerHour != nil {
		t.Fatalf("unknown values were coerced into known values: %#v", unknown)
	}
	var nullCount int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM live_sessions WHERE id = ? AND duration_minutes IS NULL AND views IS NULL AND revenue_cents IS NULL`, unknown.ID).Scan(&nullCount); err != nil {
		t.Fatal(err)
	}
	if nullCount != 1 {
		t.Fatalf("unknown values are not stored as SQL NULL")
	}

	zero := int64(0)
	zeroSession, err := store.CreateSession(domain.LiveSessionInput{AnchorID: anchor.ID, SessionDate: today(), Views: &zero, RevenueCents: &zero})
	if err != nil {
		t.Fatalf("create zero session: %v", err)
	}
	if zeroSession.Views == nil || *zeroSession.Views != 0 || zeroSession.RevenueCents == nil || *zeroSession.RevenueCents != 0 {
		t.Fatalf("confirmed zero values were not preserved: %#v", zeroSession)
	}
	if zeroSession.Metrics.PayerRate != nil || zeroSession.Metrics.RevenuePerHour != nil {
		t.Fatalf("zero denominators should produce nil metrics: %#v", zeroSession.Metrics)
	}
}

func TestOneIssueMultiplePlansAndIndependentFollowups(t *testing.T) {
	store := testStore(t)
	anchor := testAnchor(t, store, "小鱼")
	review, err := store.CreateReview(domain.OperationReviewInput{AnchorID: anchor.ID, ReviewDate: today(), Summary: "高在线阶段掉人明显"})
	if err != nil {
		t.Fatal(err)
	}
	issue, err := store.CreateIssue(domain.AnchorIssueInput{AnchorID: anchor.ID, ReviewID: int64p(review.ID), Title: "高在线阶段留存下降", Category: "留存", Priority: "重点"})
	if err != nil {
		t.Fatal(err)
	}
	planA, err := store.CreatePlan(domain.ImprovementPlanInput{AnchorID: anchor.ID, IssueID: issue.ID, Title: "调整欢迎话术", Objective: "提升新人留存", Actions: "新人进入后主动点名", BaselineValue: floatp(42), TargetValue: floatp(60), MetricName: "avg_stay_seconds", StartDate: today(), Status: "执行中"})
	if err != nil {
		t.Fatal(err)
	}
	planB, err := store.CreatePlan(domain.ImprovementPlanInput{AnchorID: anchor.ID, IssueID: issue.ID, Title: "减少开场 PK", StartDate: today(), Status: "待执行"})
	if err != nil {
		t.Fatal(err)
	}
	if planA.IssueID != issue.ID || planB.IssueID != issue.ID || planA.ID == planB.ID {
		t.Fatalf("plans not independent under one issue: A=%#v B=%#v", planA, planB)
	}
	followup1, err := store.AddFollowup(domain.PlanFollowupInput{PlanID: planA.ID, AnchorID: anchor.ID, FollowupDate: "2026-09-10", ExecutionStatus: "部分执行", MetricValue: floatp(45), Effect: "部分有效", NextAction: "继续观察"})
	if err != nil {
		t.Fatal(err)
	}
	if followup1.MetricChange == nil || math.Abs(*followup1.MetricChange-3) > 0.001 {
		t.Fatalf("metric change = %#v, want 3", followup1.MetricChange)
	}
	if _, err := store.AddFollowup(domain.PlanFollowupInput{PlanID: planA.ID, AnchorID: anchor.ID, FollowupDate: "2026-09-11", ExecutionStatus: "完整执行", MetricValue: floatp(53), Effect: "有效", NextAction: "继续"}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.AddFollowup(domain.PlanFollowupInput{PlanID: planB.ID, AnchorID: anchor.ID, FollowupDate: "2026-09-11", ExecutionStatus: "未执行", Effect: "暂不判断", NextAction: "调整方案"}); err != nil {
		t.Fatal(err)
	}
	followups, err := store.ListFollowups(planA.ID)
	if err != nil || len(followups) != 2 {
		t.Fatalf("plan A followups = %#v err=%v", followups, err)
	}
	if planBUpdated, err := store.ChangePlanStatus(planB.ID, "执行中"); err != nil || planBUpdated.Status != "执行中" {
		t.Fatalf("changing plan B status affected/faulted: %#v err=%v", planBUpdated, err)
	}
	planARead, err := store.GetPlan(planA.ID)
	if err != nil || planARead.Status != "执行中" || planARead.FollowupCount != 2 {
		t.Fatalf("plan A changed unexpectedly: %#v err=%v", planARead, err)
	}
	if err := store.DeletePlan(planA.ID); err == nil {
		t.Fatal("plan with followups should not be physically deleted")
	}
	if err := store.DeleteFollowup(followup1.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetPlan(planA.ID); err != nil {
		t.Fatalf("deleting followup deleted plan: %v", err)
	}
}

func TestDashboardAndBackupRestore(t *testing.T) {
	store := testStore(t)
	anchor := testAnchor(t, store, "小鱼")
	if _, err := store.CreateSession(domain.LiveSessionInput{AnchorID: anchor.ID, SessionDate: today(), DurationMinutes: intp(120), DurationOverride: true, RevenueCents: int64p(10000), FollowersGained: int64p(7)}); err != nil {
		t.Fatal(err)
	}
	review, err := store.CreateReview(domain.OperationReviewInput{AnchorID: anchor.ID, ReviewDate: today()})
	if err != nil {
		t.Fatal(err)
	}
	issue, err := store.CreateIssue(domain.AnchorIssueInput{AnchorID: anchor.ID, ReviewID: int64p(review.ID), Title: "重点问题", Category: "互动", Priority: "紧急"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreatePlan(domain.ImprovementPlanInput{AnchorID: anchor.ID, IssueID: issue.ID, Title: "执行方案", StartDate: "2026-01-01", Status: "执行中"}); err != nil {
		t.Fatal(err)
	}
	dashboard, err := store.GetDashboard(3)
	if err != nil {
		t.Fatal(err)
	}
	if dashboard.AnchorCount != 1 || dashboard.TodayLiveAnchorCount != 1 || dashboard.TodayDurationMinutes != 120 || dashboard.TodayRevenueCents != 10000 || dashboard.TodayFollowersGained != 7 {
		t.Fatalf("dashboard overview incorrect: %#v", dashboard)
	}
	if len(dashboard.FocusAnchors) != 0 || len(dashboard.PendingIssues) != 1 || len(dashboard.ActivePlans) != 1 || len(dashboard.StalePlans) != 1 {
		t.Fatalf("dashboard lists incorrect: %#v", dashboard)
	}

	export, err := store.ExportBackup(domain.AppVersion)
	if err != nil {
		t.Fatal(err)
	}
	if export.ArchiveBase64 == "" || export.Path == "" {
		t.Fatalf("empty backup export: %#v", export)
	}
	if _, err := store.CreateAnchor(domain.AnchorInput{Nickname: "第二批", Platform: "快手"}); err != nil {
		t.Fatal(err)
	}
	if err := store.ImportBackup(export.ArchiveBase64, domain.AppVersion); err != nil {
		t.Fatal(err)
	}
	page, _, err := store.ListAnchors(domain.AnchorFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 1 {
		t.Fatalf("restore did not return to first backup state: total=%d", page.Total)
	}
	if err := store.ImportBackup("not-a-backup", domain.AppVersion); err == nil {
		t.Fatal("corrupt backup should fail")
	}
	page, _, err = store.ListAnchors(domain.AnchorFilter{})
	if err != nil || page.Total != 1 {
		t.Fatalf("corrupt import changed current data: page=%#v err=%v", page, err)
	}

	var integrity string
	if err := store.db.QueryRow(`PRAGMA integrity_check`).Scan(&integrity); err != nil || integrity != "ok" {
		t.Fatalf("integrity after restore = %q err=%v", integrity, err)
	}
}
