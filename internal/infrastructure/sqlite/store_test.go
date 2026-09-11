package sqlite

import (
	"encoding/base64"
	"fmt"
	"math"
	"path/filepath"
	"testing"
	"time"

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
	var statusHistoryMigrationCount int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version = 2 AND name = '002_status_history.sql'`).Scan(&statusHistoryMigrationCount); err != nil {
		t.Fatalf("status history migration query: %v", err)
	}
	if statusHistoryMigrationCount != 1 {
		t.Fatalf("status history migration count = %d, want 1", statusHistoryMigrationCount)
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
	if session.StartedAt == nil {
		t.Fatal("normalized start time is nil")
	}
	if _, err := time.Parse(time.RFC3339Nano, *session.StartedAt); err != nil {
		t.Fatalf("normalized start time = %q, want RFC3339: %v", *session.StartedAt, err)
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

func TestSessionHistoryIsPagedAndPersistsAcrossReopen(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "livemate.db")
	store, err := OpenAt(databasePath, nil)
	if err != nil {
		t.Fatal(err)
	}
	anchor := testAnchor(t, store, "分页主播")
	for index := 0; index < 23; index++ {
		if _, err := store.CreateSession(domain.LiveSessionInput{AnchorID: anchor.ID, SessionDate: "2026-01-01", Notes: string(rune('A' + index))}); err != nil {
			t.Fatal(err)
		}
	}
	first, err := store.ListSessionPage(domain.SessionFilter{AnchorID: anchor.ID, Page: 1, PageSize: 20})
	if err != nil || first.Page.Total != 23 || first.Page.TotalPages != 2 || len(first.Items) != 20 {
		t.Fatalf("first session page = %#v err=%v", first, err)
	}
	second, err := store.ListSessionPage(domain.SessionFilter{AnchorID: anchor.ID, Page: 2, PageSize: 20})
	if err != nil || len(second.Items) != 3 {
		t.Fatalf("second session page = %#v err=%v", second, err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := OpenAt(databasePath, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	page, _, err := reopened.ListAnchors(domain.AnchorFilter{})
	if err != nil || page.Total != 1 {
		t.Fatalf("reopened anchor page = %#v err=%v", page, err)
	}
}

func TestDailyDataUpsertAndAtomicBatch(t *testing.T) {
	store := testStore(t)
	anchorA := testAnchor(t, store, "小鱼")
	anchorB := testAnchor(t, store, "小雨")
	date := "2026-09-12"

	daily, err := store.GetDailyData(domain.DailyDataQuery{SessionDate: date})
	if err != nil {
		t.Fatal(err)
	}
	if daily.SessionDate != date || len(daily.Rows) != 2 || daily.Rows[0].SessionID != nil || daily.Rows[1].SessionID != nil {
		t.Fatalf("initial daily rows = %#v", daily)
	}

	result, err := store.SaveDailyData(domain.DailyDataInput{SessionDate: date, Rows: []domain.DailySessionInput{
		{AnchorID: anchorA.ID, DurationMinutes: intp(120), Views: int64p(1000), AvgOnline: int64p(80), AvgStaySeconds: int64p(42), FollowersGained: int64p(12), RevenueCents: int64p(12345)},
		{AnchorID: anchorB.ID},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if result.SavedCount != 1 || result.CreatedCount != 1 || result.UpdatedCount != 0 || len(result.Sessions) != 1 {
		t.Fatalf("daily save result = %#v", result)
	}
	if result.Sessions[0].Source != "每日数据" || result.Sessions[0].DurationMinutes == nil || *result.Sessions[0].DurationMinutes != 120 {
		t.Fatalf("daily-created session = %#v", result.Sessions[0])
	}

	updated, err := store.SaveDailyData(domain.DailyDataInput{SessionDate: date, Rows: []domain.DailySessionInput{{AnchorID: anchorA.ID, Views: int64p(1200)}}})
	if err != nil {
		t.Fatal(err)
	}
	if updated.SavedCount != 1 || updated.CreatedCount != 0 || updated.UpdatedCount != 1 || updated.Sessions[0].Views == nil || *updated.Sessions[0].Views != 1200 {
		t.Fatalf("daily-update result = %#v", updated)
	}
	var sessionCount int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM live_sessions WHERE anchor_id = ? AND session_date = ?`, anchorA.ID, date).Scan(&sessionCount); err != nil {
		t.Fatal(err)
	}
	if sessionCount != 1 {
		t.Fatalf("daily upsert created duplicate session count = %d", sessionCount)
	}
	imported, err := store.SaveDailyData(domain.DailyDataInput{SessionDate: "2026-09-14", Source: "文件导入", Rows: []domain.DailySessionInput{{AnchorID: anchorB.ID, FollowersGained: int64p(-3)}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(imported.Sessions) != 1 || imported.Sessions[0].Source != "文件导入" || imported.Sessions[0].FollowersGained == nil || *imported.Sessions[0].FollowersGained != -3 {
		t.Fatalf("imported daily session = %#v", imported)
	}

	if _, err := store.SaveDailyData(domain.DailyDataInput{SessionDate: "2026-09-13", Rows: []domain.DailySessionInput{
		{AnchorID: anchorA.ID, Views: int64p(10)},
		{AnchorID: anchorB.ID, AvgOnline: int64p(-1)},
	}}); err == nil {
		t.Fatal("negative batch value should fail")
	}
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM live_sessions WHERE session_date = '2026-09-13'`).Scan(&sessionCount); err != nil {
		t.Fatal(err)
	}
	if sessionCount != 0 {
		t.Fatalf("failed batch was partially committed: %d sessions", sessionCount)
	}

	filtered, err := store.GetDailyData(domain.DailyDataQuery{SessionDate: date, Query: "小雨"})
	if err != nil || len(filtered.Rows) != 1 || filtered.Rows[0].AnchorID != anchorB.ID {
		t.Fatalf("filtered daily rows = %#v err=%v", filtered, err)
	}
}

func TestDailyDataPreservesDetailedSessionContext(t *testing.T) {
	store := testStore(t)
	anchor := testAnchor(t, store, "上下文主播")
	created, err := store.CreateSession(domain.LiveSessionInput{
		AnchorID: anchor.ID, SessionDate: "2026-09-12", DurationMinutes: intp(90), DurationOverride: true,
		PeakOnline: int64p(321), OperatorName: "运营甲", Source: "平台后台", Notes: "保留这段上下文",
	})
	if err != nil {
		t.Fatal(err)
	}
	updated, err := store.SaveDailyData(domain.DailyDataInput{SessionDate: "2026-09-12", Rows: []domain.DailySessionInput{{AnchorID: anchor.ID, AvgOnline: int64p(88)}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(updated.Sessions) != 1 || updated.Sessions[0].ID != created.ID || updated.Sessions[0].PeakOnline == nil || *updated.Sessions[0].PeakOnline != 321 || updated.Sessions[0].OperatorName != "运营甲" || updated.Sessions[0].Source != "平台后台" || updated.Sessions[0].Notes != "保留这段上下文" {
		t.Fatalf("daily update erased detailed context: %#v", updated.Sessions)
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
	if followup1.MetricChangeRate == nil || math.Abs(*followup1.MetricChangeRate-(3.0/42.0)) > 0.000001 {
		t.Fatalf("metric change rate = %#v, want 3/42", followup1.MetricChangeRate)
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

func TestPlanEffectComparisonUsesThreeSessionsOnEachSide(t *testing.T) {
	store := testStore(t)
	anchor := testAnchor(t, store, "效果对比主播")
	for _, item := range []struct {
		date string
		stay int64
	}{
		{"2026-09-07", 40}, {"2026-09-08", 42}, {"2026-09-09", 44},
		{"2026-09-10", 50}, {"2026-09-11", 55}, {"2026-09-12", 58},
	} {
		if _, err := store.CreateSession(domain.LiveSessionInput{AnchorID: anchor.ID, SessionDate: item.date, AvgStaySeconds: int64p(item.stay)}); err != nil {
			t.Fatal(err)
		}
	}
	review, err := store.CreateReview(domain.OperationReviewInput{AnchorID: anchor.ID, ReviewDate: "2026-09-09"})
	if err != nil {
		t.Fatal(err)
	}
	issue, err := store.CreateIssue(domain.AnchorIssueInput{AnchorID: anchor.ID, ReviewID: int64p(review.ID), Title: "留存问题", Category: "留存", Priority: "重点"})
	if err != nil {
		t.Fatal(err)
	}
	plan, err := store.CreatePlan(domain.ImprovementPlanInput{AnchorID: anchor.ID, IssueID: issue.ID, Title: "调整承接", MetricName: "avg_stay_seconds", MetricUnit: "秒", BaselineValue: floatp(42), TargetValue: floatp(60), StartDate: "2026-09-10", Status: "执行中"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.AddFollowup(domain.PlanFollowupInput{PlanID: plan.ID, AnchorID: anchor.ID, FollowupDate: "2026-09-12", MetricValue: floatp(58), Effect: "部分有效", NextAction: "继续观察"}); err != nil {
		t.Fatal(err)
	}
	comparison, err := store.GetPlanEffectComparison(plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	if comparison.BeforeCount != 3 || comparison.AfterCount != 3 || comparison.BeforeAverage == nil || comparison.AfterAverage == nil {
		t.Fatalf("comparison windows = %#v", comparison)
	}
	if math.Abs(*comparison.BeforeAverage-42) > 0.001 || math.Abs(*comparison.AfterAverage-(163.0/3.0)) > 0.001 {
		t.Fatalf("comparison averages = %#v", comparison)
	}
	if comparison.CurrentValue == nil || comparison.CurrentChange == nil || math.Abs(*comparison.CurrentChange-16) > 0.001 {
		t.Fatalf("comparison current value = %#v", comparison)
	}
}

func TestAnchorPeriodComparisonUsesAdjacentCalendarWindows(t *testing.T) {
	store := testStore(t)
	anchor := testAnchor(t, store, "周期对比主播")
	if _, err := store.CreateSession(domain.LiveSessionInput{AnchorID: anchor.ID, SessionDate: "2026-09-01", DurationMinutes: intp(60), DurationOverride: true, AvgOnline: int64p(38), AvgStaySeconds: int64p(41), FollowersGained: int64p(18), RevenueCents: int64p(42000)}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateSession(domain.LiveSessionInput{AnchorID: anchor.ID, SessionDate: "2026-09-08", DurationMinutes: intp(60), DurationOverride: true, AvgOnline: int64p(46), AvgStaySeconds: int64p(53), FollowersGained: int64p(27), RevenueCents: int64p(48600)}); err != nil {
		t.Fatal(err)
	}
	comparison, err := store.GetAnchorPeriodComparison(anchor.ID, "2026-09-14", 7)
	if err != nil {
		t.Fatal(err)
	}
	if comparison.PreviousStartDate != "2026-09-01" || comparison.PreviousEndDate != "2026-09-07" || comparison.CurrentStartDate != "2026-09-08" || comparison.CurrentEndDate != "2026-09-14" {
		t.Fatalf("period dates = %#v", comparison)
	}
	if len(comparison.Metrics) != 4 {
		t.Fatalf("period metrics = %#v", comparison.Metrics)
	}
	if comparison.Metrics[0].CurrentValue == nil || *comparison.Metrics[0].CurrentValue != 46 || comparison.Metrics[0].ChangeRate == nil || math.Abs(*comparison.Metrics[0].ChangeRate-(8.0/38.0)) > 0.000001 {
		t.Fatalf("average online comparison = %#v", comparison.Metrics[0])
	}
	if comparison.Metrics[3].CurrentValue == nil || math.Abs(*comparison.Metrics[3].CurrentValue-486) > 0.001 {
		t.Fatalf("revenue/hour comparison = %#v", comparison.Metrics[3])
	}
}

func TestAnchorAnomaliesAreConservativeRuleCandidates(t *testing.T) {
	store := testStore(t)
	anchor := testAnchor(t, store, "异常规则主播")
	for _, item := range []struct {
		date    string
		online  int64
		stay    int64
		revenue int64
	}{
		{"2026-09-07", 50, 50, 500000},
		{"2026-09-08", 40, 50, 500000},
		{"2026-09-09", 30, 50, 500000},
		{"2026-09-10", 20, 20, 100000},
	} {
		if _, err := store.CreateSession(domain.LiveSessionInput{AnchorID: anchor.ID, SessionDate: item.date, AvgOnline: int64p(item.online), AvgStaySeconds: int64p(item.stay), RevenueCents: int64p(item.revenue)}); err != nil {
			t.Fatal(err)
		}
	}
	anomalies, err := store.GetAnchorAnomalies(anchor.ID, 30)
	if err != nil {
		t.Fatal(err)
	}
	if len(anomalies) != 3 {
		t.Fatalf("anomalies = %#v", anomalies)
	}
	for _, anomaly := range anomalies {
		if anomaly.Title == "主播表现差" || anomaly.DetectedAt == "" || len(anomaly.RelatedSessionIDs) < 3 {
			t.Fatalf("anomaly should remain a contextual candidate: %#v", anomaly)
		}
	}
}

func TestNegativeFollowerAnomalyIsAllowedAndContextual(t *testing.T) {
	store := testStore(t)
	anchor := testAnchor(t, store, "负涨粉主播")
	for index, followers := range []int64{-3, -5, -2} {
		if _, err := store.CreateSession(domain.LiveSessionInput{
			AnchorID: anchor.ID, SessionDate: fmt.Sprintf("2026-09-%02d", 7+index), FollowersGained: int64p(followers),
		}); err != nil {
			t.Fatal(err)
		}
	}
	anomalies, err := store.GetAnchorAnomalies(anchor.ID, 30)
	if err != nil {
		t.Fatal(err)
	}
	if len(anomalies) != 1 || anomalies[0].ID != "followers-negative" || len(anomalies[0].RelatedSessionIDs) != 3 {
		t.Fatalf("negative follower anomaly = %#v", anomalies)
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
	if dashboard.AnchorCount != 1 || dashboard.TodayLiveAnchorCount != 1 || dashboard.TodayDurationMinutes == nil || *dashboard.TodayDurationMinutes != 120 || dashboard.TodayRevenueCents == nil || *dashboard.TodayRevenueCents != 10000 || dashboard.TodayFollowersGained == nil || *dashboard.TodayFollowersGained != 7 {
		t.Fatalf("dashboard overview incorrect: %#v", dashboard)
	}
	if len(dashboard.FocusAnchors) != 0 || len(dashboard.PendingIssues) != 1 || len(dashboard.ActivePlans) != 1 || len(dashboard.StalePlans) != 1 {
		t.Fatalf("dashboard lists incorrect: %#v", dashboard)
	}
	if len(dashboard.StaleAnchors) != 0 {
		t.Fatalf("active anchor with a session today was marked stale: %#v", dashboard.StaleAnchors)
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

	dbBytes, configBytes, manifest, err := readArchive(mustArchiveBytes(t, export.ArchiveBase64))
	if err != nil {
		t.Fatal(err)
	}
	manifest.Version = "2.0.0"
	futureArchive, err := buildArchive(dbBytes, configBytes, manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.ImportBackup(base64.StdEncoding.EncodeToString(futureArchive), domain.AppVersion); err == nil {
		t.Fatal("future major backup should be rejected")
	}
}

func mustArchiveBytes(t *testing.T, value string) []byte {
	t.Helper()
	archive, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		t.Fatal(err)
	}
	return archive
}

func TestStatusHistoryAndCrossAnchorOwnership(t *testing.T) {
	store := testStore(t)
	anchorA := testAnchor(t, store, "主播 A")
	anchorB := testAnchor(t, store, "主播 B")
	reviewA, err := store.CreateReview(domain.OperationReviewInput{AnchorID: anchorA.ID, ReviewDate: today(), Summary: "A 的复盘"})
	if err != nil {
		t.Fatal(err)
	}
	issueA, err := store.CreateIssue(domain.AnchorIssueInput{AnchorID: anchorA.ID, ReviewID: int64p(reviewA.ID), Title: "A 的问题", Category: "留存", Priority: "重点"})
	if err != nil {
		t.Fatal(err)
	}
	issueB, err := store.CreateIssue(domain.AnchorIssueInput{AnchorID: anchorB.ID, Title: "B 的问题", Category: "互动", Priority: "普通"})
	if err != nil {
		t.Fatal(err)
	}
	planA, err := store.CreatePlan(domain.ImprovementPlanInput{AnchorID: anchorA.ID, IssueID: issueA.ID, Title: "A 的方案", StartDate: today(), Status: "待执行"})
	if err != nil {
		t.Fatal(err)
	}
	planB, err := store.CreatePlan(domain.ImprovementPlanInput{AnchorID: anchorB.ID, IssueID: issueB.ID, Title: "B 的方案", StartDate: today(), Status: "待执行"})
	if err != nil {
		t.Fatal(err)
	}
	sessionA, err := store.CreateSession(domain.LiveSessionInput{AnchorID: anchorA.ID, SessionDate: today(), StartedAt: stringp(today() + "T18:00"), EndedAt: stringp(today() + "T19:30")})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.UpdateSession(sessionA.ID, domain.LiveSessionInput{AnchorID: anchorB.ID, SessionDate: today()}); err == nil {
		t.Fatal("session should not move between anchors")
	}
	followup, err := store.AddFollowup(domain.PlanFollowupInput{PlanID: planA.ID, AnchorID: anchorA.ID, FollowupDate: today(), ExecutionStatus: "未执行", Effect: "暂不判断", NextAction: "继续"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.UpdateFollowup(followup.ID, domain.PlanFollowupInput{PlanID: planB.ID, AnchorID: anchorB.ID, FollowupDate: today(), ExecutionStatus: "未执行", Effect: "暂不判断", NextAction: "继续"}); err == nil {
		t.Fatal("followup should not move between plans or anchors")
	}
	if _, err := store.ChangeIssueStatus(issueA.ID, "处理中"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ChangePlanStatus(planA.ID, "执行中"); err != nil {
		t.Fatal(err)
	}
	detail, err := store.GetAnchorDetail(anchorA.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Followups) != 1 {
		t.Fatalf("anchor detail followups = %d, want 1", len(detail.Followups))
	}
	if len(detail.StatusChanges) < 4 {
		t.Fatalf("status history entries = %d, want insert and change entries", len(detail.StatusChanges))
	}
	seenIssue, seenPlan := false, false
	for _, change := range detail.StatusChanges {
		if change.EntityType == "issue" && change.EntityID == issueA.ID && change.Status == "处理中" && change.EntityTitle == "A 的问题" {
			seenIssue = true
		}
		if change.EntityType == "plan" && change.EntityID == planA.ID && change.Status == "执行中" && change.EntityTitle == "A 的方案" {
			seenPlan = true
		}
	}
	if !seenIssue || !seenPlan {
		t.Fatalf("status history missing issue/plan changes: %#v", detail.StatusChanges)
	}

	stale, err := store.CreateAnchor(domain.AnchorInput{Nickname: "长期未播", Platform: "抖音", Status: "正常开播"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.Exec(`UPDATE anchors SET created_at = ? WHERE id = ?`, dateDaysAgo(8)+"T00:00:00+08:00", stale.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateSession(domain.LiveSessionInput{AnchorID: stale.ID, SessionDate: dateDaysAgo(5)}); err != nil {
		t.Fatal(err)
	}
	dashboard, err := store.GetDashboard(3)
	if err != nil {
		t.Fatal(err)
	}
	if len(dashboard.StaleAnchors) != 1 || dashboard.StaleAnchors[0].AnchorID != stale.ID {
		t.Fatalf("stale anchors = %#v, want only %d", dashboard.StaleAnchors, stale.ID)
	}
}
