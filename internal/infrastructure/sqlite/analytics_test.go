package sqlite

import (
	"math"
	"testing"

	"github.com/hicbowen/livemate/internal/domain"
)

func TestAnalyticsEmptyDatabaseReturnsValidEmptyResult(t *testing.T) {
	store := testStore(t)
	result, err := store.GetAnalytics(domain.AnalyticsQuery{StartDate: "2026-09-07", EndDate: "2026-09-13"})
	if err != nil {
		t.Fatal(err)
	}
	if result.PreviousStart != "2026-08-31" || result.PreviousEnd != "2026-09-06" {
		t.Fatalf("previous range = %s ~ %s", result.PreviousStart, result.PreviousEnd)
	}
	if result.Comparison.Current.SessionCount != 0 || result.Comparison.Previous.SessionCount != 0 {
		t.Fatalf("empty summaries = %#v", result.Comparison)
	}
	if result.Trend == nil || result.PreviousTrend == nil || result.Anchors == nil || result.Insights == nil {
		t.Fatalf("empty result should expose empty arrays: %#v", result)
	}
}

func TestAnalyticsPreservesNullMetricsAndAveragesKnownValuesOnly(t *testing.T) {
	store := testStore(t)
	anchor := testAnchor(t, store, "空值统计主播")
	if _, err := store.CreateSession(domain.LiveSessionInput{AnchorID: anchor.ID, SessionDate: "2026-09-07", DurationMinutes: intp(30), Views: int64p(100), AvgOnline: int64p(10)}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateSession(domain.LiveSessionInput{AnchorID: anchor.ID, SessionDate: "2026-09-08", DurationMinutes: intp(20), Views: int64p(200)}); err != nil {
		t.Fatal(err)
	}
	result, err := store.GetAnalytics(domain.AnalyticsQuery{StartDate: "2026-09-07", EndDate: "2026-09-13"})
	if err != nil {
		t.Fatal(err)
	}
	current := result.Comparison.Current
	if current.DurationMinutes == nil || *current.DurationMinutes != 50 {
		t.Fatalf("duration = %#v, want 50", current.DurationMinutes)
	}
	if current.Views == nil || *current.Views != 300 {
		t.Fatalf("views = %#v, want 300", current.Views)
	}
	if current.AvgOnline == nil || math.Abs(*current.AvgOnline-10) > 0.000001 {
		t.Fatalf("average online = %#v, want 10", current.AvgOnline)
	}
	if current.AvgStaySeconds != nil || current.RevenueCents != nil || current.FollowersGained != nil {
		t.Fatalf("all-null metrics should remain unknown: %#v", current)
	}
}

func TestAnalyticsFiltersAndArchivedHistory(t *testing.T) {
	store := testStore(t)
	archived := testAnchor(t, store, "已归档统计主播")
	filtered := testAnchor(t, store, "阶段筛选主播")
	if _, err := store.UpdateAnchor(filtered.ID, domain.AnchorInput{
		Nickname: "阶段筛选主播", Platform: "快手", Category: "舞蹈", Stage: "成长期", AttentionLevel: "正常", Status: "正常开播",
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateSession(domain.LiveSessionInput{AnchorID: archived.ID, SessionDate: "2026-09-07", RevenueCents: int64p(900)}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateSession(domain.LiveSessionInput{AnchorID: filtered.ID, SessionDate: "2026-09-08", RevenueCents: int64p(1200)}); err != nil {
		t.Fatal(err)
	}
	if err := store.ArchiveAnchor(archived.ID); err != nil {
		t.Fatal(err)
	}

	all, err := store.GetAnalytics(domain.AnalyticsQuery{StartDate: "2026-09-07", EndDate: "2026-09-13"})
	if err != nil {
		t.Fatal(err)
	}
	if all.Comparison.Current.SessionCount != 2 || all.Comparison.Current.AnchorCount != 2 || all.Comparison.Current.ActiveAnchorCount != 1 {
		t.Fatalf("archived history counts = %#v", all.Comparison.Current)
	}
	if all.Comparison.Current.RevenueCents == nil || *all.Comparison.Current.RevenueCents != 2100 {
		t.Fatalf("archived history revenue = %#v", all.Comparison.Current.RevenueCents)
	}
	if len(all.Anchors) != 2 {
		t.Fatalf("archived anchor row missing: %#v", all.Anchors)
	}

	for name, query := range map[string]domain.AnalyticsQuery{
		"anchor":   {StartDate: "2026-09-07", EndDate: "2026-09-13", AnchorIDs: []int64{filtered.ID}},
		"stage":    {StartDate: "2026-09-07", EndDate: "2026-09-13", Stage: "成长期"},
		"platform": {StartDate: "2026-09-07", EndDate: "2026-09-13", Platform: "快手"},
		"category": {StartDate: "2026-09-07", EndDate: "2026-09-13", Category: "舞蹈"},
	} {
		filteredResult, filterErr := store.GetAnalytics(query)
		if filterErr != nil {
			t.Fatalf("%s filter: %v", name, filterErr)
		}
		if filteredResult.Comparison.Current.SessionCount != 1 || len(filteredResult.Anchors) != 1 || filteredResult.Anchors[0].AnchorID != filtered.ID {
			t.Fatalf("%s filter result = %#v", name, filteredResult)
		}
	}
}

func TestAnalyticsComparisonAndInsightMinimumSample(t *testing.T) {
	store := testStore(t)
	anchor := testAnchor(t, store, "环比主播")
	for _, item := range []struct {
		date    string
		revenue int64
		online  int64
	}{
		{"2026-08-31", 500, 50}, {"2026-09-01", 500, 50},
		{"2026-09-07", 600, 45}, {"2026-09-08", 600, 45},
	} {
		if _, err := store.CreateSession(domain.LiveSessionInput{AnchorID: anchor.ID, SessionDate: item.date, RevenueCents: int64p(item.revenue), AvgOnline: int64p(item.online)}); err != nil {
			t.Fatal(err)
		}
	}
	result, err := store.GetAnalytics(domain.AnalyticsQuery{StartDate: "2026-09-07", EndDate: "2026-09-13"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Comparison.RevenueChangeRate == nil || math.Abs(*result.Comparison.RevenueChangeRate-0.2) > 0.000001 {
		t.Fatalf("revenue change = %#v, want .2", result.Comparison.RevenueChangeRate)
	}
	if len(result.Insights) != 0 {
		t.Fatalf("20%% change should not trigger a 30%% insight: %#v", result.Insights)
	}

	if _, err := store.CreateSession(domain.LiveSessionInput{AnchorID: anchor.ID, SessionDate: "2026-09-09", RevenueCents: int64p(100), AvgOnline: int64p(30)}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateSession(domain.LiveSessionInput{AnchorID: anchor.ID, SessionDate: "2026-09-10", RevenueCents: int64p(100), AvgOnline: int64p(30)}); err != nil {
		t.Fatal(err)
	}
	result, err = store.GetAnalytics(domain.AnalyticsQuery{StartDate: "2026-09-07", EndDate: "2026-09-13"})
	if err != nil {
		t.Fatal(err)
	}
	foundRevenueUp := false
	for _, insight := range result.Insights {
		if insight.Type == "revenue_up" {
			foundRevenueUp = true
		}
	}
	if !foundRevenueUp {
		t.Fatalf("sample-qualified revenue increase insight missing: %#v", result.Insights)
	}
}

func TestReportsReuseAnalyticsAndSummarizeOperationalRecords(t *testing.T) {
	store := testStore(t)
	anchor := testAnchor(t, store, "报告主播")
	if _, err := store.CreateSession(domain.LiveSessionInput{AnchorID: anchor.ID, SessionDate: "2026-09-07", RevenueCents: int64p(1000)}); err != nil {
		t.Fatal(err)
	}
	review, err := store.CreateReview(domain.OperationReviewInput{AnchorID: anchor.ID, ReviewDate: "2026-09-08"})
	if err != nil {
		t.Fatal(err)
	}
	issue, err := store.CreateIssue(domain.AnchorIssueInput{AnchorID: anchor.ID, ReviewID: int64p(review.ID), Title: "报告问题", Category: "留存", Priority: "重点", DiscoveredAt: "2026-09-08"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreatePlan(domain.ImprovementPlanInput{AnchorID: anchor.ID, IssueID: issue.ID, Title: "报告方案", StartDate: "2026-09-09", Status: "执行中"}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateGoal(domain.StageGoalInput{AnchorID: anchor.ID, Title: "报告目标", StartDate: "2026-09-01", EndDate: "2026-09-30", Status: "进行中"}); err != nil {
		t.Fatal(err)
	}

	operations, err := store.GetOperationsReport(domain.ReportQuery{Type: "operations_period", StartDate: "2026-09-07", EndDate: "2026-09-13"})
	if err != nil {
		t.Fatal(err)
	}
	if operations.Analytics.Comparison.Current.SessionCount != 1 || operations.IssueSummary.NewCount != 1 || operations.IssueSummary.PendingCount != 1 || operations.PlanSummary.InProgressCount != 1 || operations.GoalSummary.InProgressCount != 1 {
		t.Fatalf("operations report = %#v", operations)
	}
	anchorReport, err := store.GetAnchorPeriodReport(domain.ReportQuery{Type: "anchor_period", StartDate: "2026-09-07", EndDate: "2026-09-13", AnchorID: int64p(anchor.ID)})
	if err != nil {
		t.Fatal(err)
	}
	if anchorReport.Anchor.ID != anchor.ID || len(anchorReport.NewIssues) != 1 || len(anchorReport.PendingIssues) != 1 || len(anchorReport.ActivePlans) != 1 {
		t.Fatalf("anchor report = %#v", anchorReport)
	}
}
