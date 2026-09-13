package domain

// Product constants are kept in the domain package so the desktop shell,
// backend logs and exported backups all use the same product identity.
const (
	ProductName        = "播伴"
	ProjectName        = "livemate"
	AppID              = "cn.cbowen.livemate"
	ProductDescription = "主播运营管理与 AI 辅助工具"
	AppVersion         = "1.0.0"
)

var (
	AnchorStages      = []string{"新人", "培养期", "成长期", "稳定期", "核心期", "暂停", "已离开"}
	AttentionLevels   = []string{"正常", "重点关注", "紧急"}
	AnchorStatuses    = []string{"正常开播", "短暂停播", "长期停播", "待开播", "已离开"}
	IssueCategories   = []string{"留存", "互动", "涨粉", "流水", "转化", "开场", "内容", "PK", "话术", "直播节奏", "开播稳定性", "主播状态", "设备", "违规", "其他"}
	Priorities        = []string{"普通", "重点", "紧急"}
	IssueStatuses     = []string{"待处理", "处理中", "观察中", "已解决", "已关闭"}
	PlanStatuses      = []string{"待执行", "执行中", "观察中", "已验证有效", "无效", "已终止"}
	ExecutionStatuses = []string{"未执行", "部分执行", "完整执行", "无法执行"}
	Effects           = []string{"暂不判断", "有效", "部分有效", "无明显变化", "变差"}
	NextActions       = []string{"继续", "调整方案", "结束方案", "新增方案", "继续观察"}
	GoalStatuses      = []string{"进行中", "已完成", "已取消"}
	EventTypes        = []string{"更换直播时间", "调整直播内容", "更换运营", "停播", "恢复开播", "违规", "设备变化", "账号变化", "活动", "合作", "主播个人状态", "其他"}
	AnomalyDecisions  = []string{"已忽略", "继续观察", "已转为问题"}
)

type AppInfo struct {
	Name         string `json:"name"`
	Project      string `json:"project"`
	AppID        string `json:"app_id"`
	Version      string `json:"version"`
	Description  string `json:"description"`
	DataDir      string `json:"data_dir"`
	DatabasePath string `json:"database_path"`
	LogDir       string `json:"log_dir"`
	BackupDir    string `json:"backup_dir"`
}

// TodoTask is the persisted unit used by the daily task page. Tasks are
// intentionally scoped to a calendar date; the frontend can move or copy a
// task by replacing the dated snapshot through the application service.
type TodoTask struct {
	ID                   string   `json:"id"`
	Text                 string   `json:"text"`
	Completed            bool     `json:"completed"`
	TimeRange            []string `json:"time_range,omitempty"`
	StartReminderEnabled bool     `json:"start_reminder_enabled"`
}

type Anchor struct {
	ID             int64    `json:"id"`
	Name           string   `json:"name"`
	Nickname       string   `json:"nickname"`
	Platform       string   `json:"platform"`
	PlatformUID    string   `json:"platform_uid"`
	AccountName    string   `json:"account_name"`
	Category       string   `json:"category"`
	Gender         string   `json:"gender"`
	Age            *int     `json:"age"`
	JoinedAt       *string  `json:"joined_at"`
	OperatorName   string   `json:"operator_name"`
	Stage          string   `json:"stage"`
	AttentionLevel string   `json:"attention_level"`
	Status         string   `json:"status"`
	Notes          string   `json:"notes"`
	Tags           []string `json:"tags"`
	CreatedAt      string   `json:"created_at"`
	UpdatedAt      string   `json:"updated_at"`
	DeletedAt      *string  `json:"deleted_at"`
}

type AnchorInput struct {
	Name           string   `json:"name"`
	Nickname       string   `json:"nickname"`
	Platform       string   `json:"platform"`
	PlatformUID    string   `json:"platform_uid"`
	AccountName    string   `json:"account_name"`
	Category       string   `json:"category"`
	Gender         string   `json:"gender"`
	Age            *int     `json:"age"`
	JoinedAt       *string  `json:"joined_at"`
	OperatorName   string   `json:"operator_name"`
	Stage          string   `json:"stage"`
	AttentionLevel string   `json:"attention_level"`
	Status         string   `json:"status"`
	Notes          string   `json:"notes"`
	Tags           []string `json:"tags"`
}

type AnchorFilter struct {
	Query          string `json:"query"`
	Stage          string `json:"stage"`
	Status         string `json:"status"`
	AttentionLevel string `json:"attention_level"`
	Tag            string `json:"tag"`
	Page           int    `json:"page"`
	PageSize       int    `json:"page_size"`
	SortBy         string `json:"sort_by"`
	SortDesc       bool   `json:"sort_desc"`
}

type PageInfo struct {
	Page       int `json:"page"`
	PageSize   int `json:"page_size"`
	Total      int `json:"total"`
	TotalPages int `json:"total_pages"`
}

type AnchorPage struct {
	Page  PageInfo         `json:"page"`
	Items []AnchorListItem `json:"items"`
}

// SessionFilter keeps potentially large session history paged at the
// application boundary. The anchor detail response only carries the recent
// window needed for its overview.
type SessionFilter struct {
	AnchorID int64 `json:"anchor_id"`
	Page     int   `json:"page"`
	PageSize int   `json:"page_size"`
}

type SessionPage struct {
	Page  PageInfo      `json:"page"`
	Items []LiveSession `json:"items"`
}

// DailyDataQuery is the compact view used by the daily operations workbench.
// It deliberately exposes only the fields that operators enter repeatedly;
// the full LiveSession model remains available from the anchor detail page.
type DailyDataQuery struct {
	SessionDate string `json:"session_date"`
	Query       string `json:"query"`
}

type DailyDataRow struct {
	AnchorID        int64  `json:"anchor_id"`
	Nickname        string `json:"nickname"`
	Platform        string `json:"platform"`
	Stage           string `json:"stage"`
	Status          string `json:"status"`
	SessionID       *int64 `json:"session_id"`
	DurationMinutes *int   `json:"duration_minutes"`
	Views           *int64 `json:"views"`
	AvgOnline       *int64 `json:"avg_online"`
	AvgStaySeconds  *int64 `json:"avg_stay_seconds"`
	FollowersGained *int64 `json:"followers_gained"`
	RevenueCents    *int64 `json:"revenue_cents"`
}

type DailyData struct {
	SessionDate string         `json:"session_date"`
	Rows        []DailyDataRow `json:"rows"`
}

type DailySessionInput struct {
	AnchorID        int64    `json:"anchor_id"`
	DurationMinutes *int     `json:"duration_minutes"`
	Views           *int64   `json:"views"`
	AvgOnline       *int64   `json:"avg_online"`
	AvgStaySeconds  *int64   `json:"avg_stay_seconds"`
	FollowersGained *int64   `json:"followers_gained"`
	RevenueCents    *int64   `json:"revenue_cents"`
	ClearFields     []string `json:"clear_fields,omitempty"`
}

type DailyDataInput struct {
	SessionDate string              `json:"session_date"`
	Source      string              `json:"source"`
	Rows        []DailySessionInput `json:"rows"`
}

type DailyDataSaveResult struct {
	SessionDate  string        `json:"session_date"`
	SavedCount   int           `json:"saved_count"`
	CreatedCount int           `json:"created_count"`
	UpdatedCount int           `json:"updated_count"`
	Sessions     []LiveSession `json:"sessions"`
}

// DailyDataBatchInput is the file-import boundary. All dated batches are
// committed in one transaction so a failed file cannot leave earlier dates
// partially imported.
type DailyDataBatchInput struct {
	Source  string           `json:"source"`
	Batches []DailyDataInput `json:"batches"`
}

type DailyDataBatchSaveResult struct {
	SavedCount   int      `json:"saved_count"`
	CreatedCount int      `json:"created_count"`
	UpdatedCount int      `json:"updated_count"`
	Dates        []string `json:"dates"`
}

type AnomalyDecisionInput struct {
	AnchorID   int64  `json:"anchor_id"`
	AnomalyID  string `json:"anomaly_id"`
	DetectedAt string `json:"detected_at"`
	Decision   string `json:"decision"`
}

// ImportTable is the neutral table shape shared by the spreadsheet parser
// and the frontend mapping/validation workflow.
type ImportTable struct {
	FileName  string     `json:"file_name"`
	SheetName string     `json:"sheet_name"`
	Headers   []string   `json:"headers"`
	Rows      [][]string `json:"rows"`
}

type AnchorListItem struct {
	Anchor
	LastSessionDate      *string `json:"last_session_date"`
	LastActivityDate     *string `json:"last_activity_date"`
	Last7DurationMinutes int     `json:"last_7_duration_minutes"`
	Last7RevenueCents    int64   `json:"last_7_revenue_cents"`
	Last7FollowersGained int64   `json:"last_7_followers_gained"`
	PendingIssueCount    int     `json:"pending_issue_count"`
	ActivePlanCount      int     `json:"active_plan_count"`
}

type LiveSession struct {
	ID               int64          `json:"id"`
	AnchorID         int64          `json:"anchor_id"`
	SessionDate      string         `json:"session_date"`
	StartedAt        *string        `json:"started_at"`
	EndedAt          *string        `json:"ended_at"`
	DurationMinutes  *int           `json:"duration_minutes"`
	DurationOverride bool           `json:"duration_override"`
	Views            *int64         `json:"views"`
	PeakOnline       *int64         `json:"peak_online"`
	AvgOnline        *int64         `json:"avg_online"`
	AvgStaySeconds   *int64         `json:"avg_stay_seconds"`
	Likes            *int64         `json:"likes"`
	Comments         *int64         `json:"comments"`
	CommentUsers     *int64         `json:"comment_users"`
	Shares           *int64         `json:"shares"`
	FollowersBefore  *int64         `json:"followers_before"`
	FollowersAfter   *int64         `json:"followers_after"`
	FollowersGained  *int64         `json:"followers_gained"`
	RevenueCents     *int64         `json:"revenue_cents"`
	PayerCount       *int64         `json:"payer_count"`
	GiftUserCount    *int64         `json:"gift_user_count"`
	PKCount          *int64         `json:"pk_count"`
	PKWinCount       *int64         `json:"pk_win_count"`
	PKRevenueCents   *int64         `json:"pk_revenue_cents"`
	OperatorName     string         `json:"operator_name"`
	IsAbnormal       bool           `json:"is_abnormal"`
	AbnormalNote     string         `json:"abnormal_note"`
	Source           string         `json:"source"`
	Notes            string         `json:"notes"`
	Metrics          SessionMetrics `json:"metrics"`
	CreatedAt        string         `json:"created_at"`
	UpdatedAt        string         `json:"updated_at"`
}

type LiveSessionInput struct {
	AnchorID         int64   `json:"anchor_id"`
	SessionDate      string  `json:"session_date"`
	StartedAt        *string `json:"started_at"`
	EndedAt          *string `json:"ended_at"`
	DurationMinutes  *int    `json:"duration_minutes"`
	DurationOverride bool    `json:"duration_override"`
	Views            *int64  `json:"views"`
	PeakOnline       *int64  `json:"peak_online"`
	AvgOnline        *int64  `json:"avg_online"`
	AvgStaySeconds   *int64  `json:"avg_stay_seconds"`
	Likes            *int64  `json:"likes"`
	Comments         *int64  `json:"comments"`
	CommentUsers     *int64  `json:"comment_users"`
	Shares           *int64  `json:"shares"`
	FollowersBefore  *int64  `json:"followers_before"`
	FollowersAfter   *int64  `json:"followers_after"`
	FollowersGained  *int64  `json:"followers_gained"`
	RevenueCents     *int64  `json:"revenue_cents"`
	PayerCount       *int64  `json:"payer_count"`
	GiftUserCount    *int64  `json:"gift_user_count"`
	PKCount          *int64  `json:"pk_count"`
	PKWinCount       *int64  `json:"pk_win_count"`
	PKRevenueCents   *int64  `json:"pk_revenue_cents"`
	OperatorName     string  `json:"operator_name"`
	IsAbnormal       bool    `json:"is_abnormal"`
	AbnormalNote     string  `json:"abnormal_note"`
	Source           string  `json:"source"`
	Notes            string  `json:"notes"`
}

type SessionMetrics struct {
	RevenuePerHour        *float64 `json:"revenue_per_hour"`
	FollowersPerHour      *float64 `json:"followers_per_hour"`
	FollowersPer1000Views *float64 `json:"followers_per_1000_views"`
	PayerRate             *float64 `json:"payer_rate"`
	CommentUserRate       *float64 `json:"comment_user_rate"`
	PKWinRate             *float64 `json:"pk_win_rate"`
}

type OperationReview struct {
	ID            int64  `json:"id"`
	AnchorID      int64  `json:"anchor_id"`
	LiveSessionID *int64 `json:"live_session_id"`
	ReviewDate    string `json:"review_date"`
	Summary       string `json:"summary"`
	Strengths     string `json:"strengths"`
	Observations  string `json:"observations"`
	Conclusion    string `json:"conclusion"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

type OperationReviewInput struct {
	AnchorID      int64  `json:"anchor_id"`
	LiveSessionID *int64 `json:"live_session_id"`
	ReviewDate    string `json:"review_date"`
	Summary       string `json:"summary"`
	Strengths     string `json:"strengths"`
	Observations  string `json:"observations"`
	Conclusion    string `json:"conclusion"`
}

type AnchorIssue struct {
	ID              int64   `json:"id"`
	AnchorID        int64   `json:"anchor_id"`
	ReviewID        *int64  `json:"review_id"`
	Title           string  `json:"title"`
	Category        string  `json:"category"`
	Description     string  `json:"description"`
	Evidence        string  `json:"evidence"`
	CauseHypothesis string  `json:"cause_hypothesis"`
	Priority        string  `json:"priority"`
	Status          string  `json:"status"`
	DiscoveredAt    string  `json:"discovered_at"`
	ResolvedAt      *string `json:"resolved_at"`
	PlanCount       int     `json:"plan_count"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
}

type AnchorIssueInput struct {
	AnchorID        int64  `json:"anchor_id"`
	ReviewID        *int64 `json:"review_id"`
	Title           string `json:"title"`
	Category        string `json:"category"`
	Description     string `json:"description"`
	Evidence        string `json:"evidence"`
	CauseHypothesis string `json:"cause_hypothesis"`
	Priority        string `json:"priority"`
	Status          string `json:"status"`
	DiscoveredAt    string `json:"discovered_at"`
}

type ImprovementPlan struct {
	ID                 int64    `json:"id"`
	AnchorID           int64    `json:"anchor_id"`
	IssueID            int64    `json:"issue_id"`
	Title              string   `json:"title"`
	Objective          string   `json:"objective"`
	Actions            string   `json:"actions"`
	MetricName         string   `json:"metric_name"`
	BaselineValue      *float64 `json:"baseline_value"`
	TargetValue        *float64 `json:"target_value"`
	MetricUnit         string   `json:"metric_unit"`
	StartDate          string   `json:"start_date"`
	ExpectedEndDate    *string  `json:"expected_end_date"`
	Priority           string   `json:"priority"`
	Status             string   `json:"status"`
	ResultSummary      string   `json:"result_summary"`
	CompletedAt        *string  `json:"completed_at"`
	LastFollowupDate   *string  `json:"last_followup_date"`
	CurrentMetricValue *float64 `json:"current_metric_value"`
	FollowupCount      int      `json:"followup_count"`
	CreatedAt          string   `json:"created_at"`
	UpdatedAt          string   `json:"updated_at"`
}

type ImprovementPlanInput struct {
	AnchorID        int64    `json:"anchor_id"`
	IssueID         int64    `json:"issue_id"`
	Title           string   `json:"title"`
	Objective       string   `json:"objective"`
	Actions         string   `json:"actions"`
	MetricName      string   `json:"metric_name"`
	BaselineValue   *float64 `json:"baseline_value"`
	TargetValue     *float64 `json:"target_value"`
	MetricUnit      string   `json:"metric_unit"`
	StartDate       string   `json:"start_date"`
	ExpectedEndDate *string  `json:"expected_end_date"`
	Priority        string   `json:"priority"`
	Status          string   `json:"status"`
	ResultSummary   string   `json:"result_summary"`
}

// PlanEffectComparison compares the last three available sessions before a
// plan started with the first three sessions after it started. It is a
// compact, factual signal; it does not claim that the plan caused the change.
type PlanEffectComparison struct {
	PlanID            int64    `json:"plan_id"`
	MetricName        string   `json:"metric_name"`
	MetricUnit        string   `json:"metric_unit"`
	BaselineValue     *float64 `json:"baseline_value"`
	TargetValue       *float64 `json:"target_value"`
	CurrentValue      *float64 `json:"current_value"`
	CurrentChange     *float64 `json:"current_change"`
	CurrentChangeRate *float64 `json:"current_change_rate"`
	BeforeCount       int      `json:"before_count"`
	AfterCount        int      `json:"after_count"`
	BeforeAverage     *float64 `json:"before_average"`
	AfterAverage      *float64 `json:"after_average"`
	BeforeAfterChange *float64 `json:"before_after_change"`
	BeforeAfterRate   *float64 `json:"before_after_rate"`
}

type PlanFollowup struct {
	ID               int64    `json:"id"`
	PlanID           int64    `json:"plan_id"`
	AnchorID         int64    `json:"anchor_id"`
	LiveSessionID    *int64   `json:"live_session_id"`
	FollowupDate     string   `json:"followup_date"`
	ExecutionStatus  string   `json:"execution_status"`
	ExecutionNote    string   `json:"execution_note"`
	MetricValue      *float64 `json:"metric_value"`
	MetricChange     *float64 `json:"metric_change"`
	MetricChangeRate *float64 `json:"metric_change_rate"`
	Effect           string   `json:"effect"`
	EffectNote       string   `json:"effect_note"`
	NextAction       string   `json:"next_action"`
	CreatedAt        string   `json:"created_at"`
	UpdatedAt        string   `json:"updated_at"`
}

type PlanFollowupInput struct {
	PlanID          int64    `json:"plan_id"`
	AnchorID        int64    `json:"anchor_id"`
	LiveSessionID   *int64   `json:"live_session_id"`
	FollowupDate    string   `json:"followup_date"`
	ExecutionStatus string   `json:"execution_status"`
	ExecutionNote   string   `json:"execution_note"`
	MetricValue     *float64 `json:"metric_value"`
	Effect          string   `json:"effect"`
	EffectNote      string   `json:"effect_note"`
	NextAction      string   `json:"next_action"`
}

type StageGoal struct {
	ID          int64        `json:"id"`
	AnchorID    int64        `json:"anchor_id"`
	Title       string       `json:"title"`
	StartDate   string       `json:"start_date"`
	EndDate     string       `json:"end_date"`
	Description string       `json:"description"`
	Status      string       `json:"status"`
	Metrics     []GoalMetric `json:"metrics"`
	CreatedAt   string       `json:"created_at"`
	UpdatedAt   string       `json:"updated_at"`
}

type StageGoalInput struct {
	AnchorID    int64             `json:"anchor_id"`
	Title       string            `json:"title"`
	StartDate   string            `json:"start_date"`
	EndDate     string            `json:"end_date"`
	Description string            `json:"description"`
	Status      string            `json:"status"`
	Metrics     []GoalMetricInput `json:"metrics"`
}

type GoalMetric struct {
	ID            int64    `json:"id"`
	GoalID        int64    `json:"goal_id"`
	MetricName    string   `json:"metric_name"`
	BaselineValue *float64 `json:"baseline_value"`
	TargetValue   *float64 `json:"target_value"`
	MetricUnit    string   `json:"metric_unit"`
	CreatedAt     string   `json:"created_at"`
}

type GoalMetricInput struct {
	MetricName    string   `json:"metric_name"`
	BaselineValue *float64 `json:"baseline_value"`
	TargetValue   *float64 `json:"target_value"`
	MetricUnit    string   `json:"metric_unit"`
}

type AnchorEvent struct {
	ID            int64  `json:"id"`
	AnchorID      int64  `json:"anchor_id"`
	EventDate     string `json:"event_date"`
	EventType     string `json:"event_type"`
	Title         string `json:"title"`
	Content       string `json:"content"`
	LiveSessionID *int64 `json:"live_session_id"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

type AnchorEventInput struct {
	AnchorID      int64  `json:"anchor_id"`
	EventDate     string `json:"event_date"`
	EventType     string `json:"event_type"`
	Title         string `json:"title"`
	Content       string `json:"content"`
	LiveSessionID *int64 `json:"live_session_id"`
}

type TrendPoint struct {
	Date            string `json:"date"`
	DurationMinutes *int   `json:"duration_minutes"`
	AvgOnline       *int64 `json:"avg_online"`
	AvgStaySeconds  *int64 `json:"avg_stay_seconds"`
	FollowersGained *int64 `json:"followers_gained"`
	RevenueCents    *int64 `json:"revenue_cents"`
	EventCount      int    `json:"event_count"`
}

// AnalyticsQuery is the shared filter boundary for the analytics and report
// use cases. Keep this intentionally small: adding a filter here changes the
// meaning of every aggregate consumer.
type AnalyticsQuery struct {
	StartDate string  `json:"start_date"`
	EndDate   string  `json:"end_date"`
	AnchorIDs []int64 `json:"anchor_ids"`
	Stage     string  `json:"stage"`
	Platform  string  `json:"platform"`
	Category  string  `json:"category"`
}

type AnalyticsSummary struct {
	AnchorCount       int `json:"anchor_count"`
	ActiveAnchorCount int `json:"active_anchor_count"`
	SessionCount      int `json:"session_count"`

	DurationMinutes *int64   `json:"duration_minutes"`
	Views           *int64   `json:"views"`
	AvgOnline       *float64 `json:"avg_online"`
	AvgStaySeconds  *float64 `json:"avg_stay_seconds"`
	FollowersGained *int64   `json:"followers_gained"`
	RevenueCents    *int64   `json:"revenue_cents"`
}

type AnalyticsComparison struct {
	Current  AnalyticsSummary `json:"current"`
	Previous AnalyticsSummary `json:"previous"`

	DurationChangeRate  *float64 `json:"duration_change_rate"`
	ViewsChangeRate     *float64 `json:"views_change_rate"`
	AvgOnlineChangeRate *float64 `json:"avg_online_change_rate"`
	AvgStayChangeRate   *float64 `json:"avg_stay_change_rate"`
	FollowersChangeRate *float64 `json:"followers_change_rate"`
	RevenueChangeRate   *float64 `json:"revenue_change_rate"`
}

type AnalyticsTrendPoint struct {
	Date            string   `json:"date"`
	SessionCount    int      `json:"session_count"`
	DurationMinutes *int64   `json:"duration_minutes"`
	Views           *int64   `json:"views"`
	AvgOnline       *float64 `json:"avg_online"`
	AvgStaySeconds  *float64 `json:"avg_stay_seconds"`
	FollowersGained *int64   `json:"followers_gained"`
	RevenueCents    *int64   `json:"revenue_cents"`
}

type AnchorAnalyticsRow struct {
	AnchorID        int64    `json:"anchor_id"`
	Nickname        string   `json:"nickname"`
	Stage           string   `json:"stage"`
	Platform        string   `json:"platform"`
	Category        string   `json:"category"`
	SessionCount    int      `json:"session_count"`
	DurationMinutes *int64   `json:"duration_minutes"`
	Views           *int64   `json:"views"`
	AvgOnline       *float64 `json:"avg_online"`
	AvgStaySeconds  *float64 `json:"avg_stay_seconds"`
	FollowersGained *int64   `json:"followers_gained"`
	RevenueCents    *int64   `json:"revenue_cents"`

	PreviousRevenueCents    *int64   `json:"previous_revenue_cents"`
	RevenueChangeRate       *float64 `json:"revenue_change_rate"`
	PreviousFollowersGained *int64   `json:"previous_followers_gained"`
	FollowersChangeRate     *float64 `json:"followers_change_rate"`
	PreviousAvgOnline       *float64 `json:"previous_avg_online"`
	AvgOnlineChangeRate     *float64 `json:"avg_online_change_rate"`
}

type AnalyticsInsight struct {
	ID       string   `json:"id"`
	AnchorID int64    `json:"anchor_id"`
	Nickname string   `json:"nickname"`
	Type     string   `json:"type"`
	Severity string   `json:"severity"`
	Title    string   `json:"title"`
	Detail   string   `json:"detail"`
	Value    *float64 `json:"value"`
}

type AnalyticsResult struct {
	Query         AnalyticsQuery        `json:"query"`
	PreviousStart string                `json:"previous_start"`
	PreviousEnd   string                `json:"previous_end"`
	Comparison    AnalyticsComparison   `json:"comparison"`
	Trend         []AnalyticsTrendPoint `json:"trend"`
	// PreviousTrend lets the frontend overlay adjacent periods without a
	// second analytics request.
	PreviousTrend []AnalyticsTrendPoint `json:"previous_trend"`
	Anchors       []AnchorAnalyticsRow  `json:"anchors"`
	Insights      []AnalyticsInsight    `json:"insights"`
}

type ReportQuery struct {
	Type      string `json:"type"`
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
	AnchorID  *int64 `json:"anchor_id"`
}

type ReportIssueSummary struct {
	NewCount       int `json:"new_count"`
	PendingCount   int `json:"pending_count"`
	ImportantCount int `json:"important_count"`
	UrgentCount    int `json:"urgent_count"`
	ResolvedCount  int `json:"resolved_count"`
}

type ReportPlanSummary struct {
	NewCount        int `json:"new_count"`
	InProgressCount int `json:"in_progress_count"`
	PendingFollowup int `json:"pending_followup_count"`
	ValidatedCount  int `json:"validated_count"`
	InvalidCount    int `json:"invalid_count"`
	TerminatedCount int `json:"terminated_count"`
}

type ReportGoalSummary struct {
	InProgressCount int `json:"in_progress_count"`
	CompletedCount  int `json:"completed_count"`
	DueSoonCount    int `json:"due_soon_count"`
	OverdueCount    int `json:"overdue_count"`
}

type OperationsReport struct {
	StartDate    string             `json:"start_date"`
	EndDate      string             `json:"end_date"`
	Analytics    AnalyticsResult    `json:"analytics"`
	IssueSummary ReportIssueSummary `json:"issue_summary"`
	PlanSummary  ReportPlanSummary  `json:"plan_summary"`
	GoalSummary  ReportGoalSummary  `json:"goal_summary"`
}

// AnchorPeriodReport intentionally exposes only period-relevant operational
// records. The full historical detail remains on AnchorDetail.
type AnchorPeriodReport struct {
	StartDate      string             `json:"start_date"`
	EndDate        string             `json:"end_date"`
	Anchor         Anchor             `json:"anchor"`
	Analytics      AnalyticsResult    `json:"analytics"`
	IssueSummary   ReportIssueSummary `json:"issue_summary"`
	PlanSummary    ReportPlanSummary  `json:"plan_summary"`
	GoalSummary    ReportGoalSummary  `json:"goal_summary"`
	PendingIssues  []AnchorIssue      `json:"pending_issues"`
	NewIssues      []AnchorIssue      `json:"new_issues"`
	ResolvedIssues []AnchorIssue      `json:"resolved_issues"`
	ActivePlans    []ImprovementPlan  `json:"active_plans"`
	CompletedPlans []ImprovementPlan  `json:"completed_plans"`
	Followups      []PlanFollowup     `json:"followups"`
	Goals          []StageGoal        `json:"goals"`
	Events         []AnchorEvent      `json:"events"`
}

type PeriodComparisonMetric struct {
	MetricName    string   `json:"metric_name"`
	Label         string   `json:"label"`
	Unit          string   `json:"unit"`
	PreviousValue *float64 `json:"previous_value"`
	CurrentValue  *float64 `json:"current_value"`
	ChangeRate    *float64 `json:"change_rate"`
}

type PeriodComparison struct {
	PeriodDays        int                      `json:"period_days"`
	PreviousStartDate string                   `json:"previous_start_date"`
	PreviousEndDate   string                   `json:"previous_end_date"`
	CurrentStartDate  string                   `json:"current_start_date"`
	CurrentEndDate    string                   `json:"current_end_date"`
	Metrics           []PeriodComparisonMetric `json:"metrics"`
}

type AnomalyCandidate struct {
	ID                string  `json:"id"`
	Rule              string  `json:"rule"`
	Title             string  `json:"title"`
	Evidence          string  `json:"evidence"`
	DetectedAt        string  `json:"detected_at"`
	RelatedSessionIDs []int64 `json:"related_session_ids"`
}

type AnchorDetail struct {
	Anchor        Anchor            `json:"anchor"`
	Sessions      []LiveSession     `json:"sessions"`
	Reviews       []OperationReview `json:"reviews"`
	Issues        []AnchorIssue     `json:"issues"`
	Plans         []ImprovementPlan `json:"plans"`
	Followups     []PlanFollowup    `json:"followups"`
	Goals         []StageGoal       `json:"goals"`
	Events        []AnchorEvent     `json:"events"`
	StatusChanges []StatusChange    `json:"status_changes"`
	Trend         []TrendPoint      `json:"trend"`
}

// StatusChange is an audit entry used by the anchor timeline. Status history
// is recorded by SQLite triggers so changes made through any application use
// case are visible without relying on the frontend to remember old values.
type StatusChange struct {
	ID          int64  `json:"id"`
	AnchorID    int64  `json:"anchor_id"`
	EntityType  string `json:"entity_type"`
	EntityID    int64  `json:"entity_id"`
	EntityTitle string `json:"entity_title"`
	Status      string `json:"status"`
	ChangedAt   string `json:"changed_at"`
}

type FocusAnchor struct {
	AnchorID         int64   `json:"anchor_id"`
	Nickname         string  `json:"nickname"`
	Stage            string  `json:"stage"`
	AttentionLevel   string  `json:"attention_level"`
	AttentionReason  string  `json:"attention_reason"`
	LastSessionDate  *string `json:"last_session_date"`
	RecentChangeNote string  `json:"recent_change_note"`
}

type IssueSummary struct {
	ID             int64  `json:"id"`
	AnchorID       int64  `json:"anchor_id"`
	AnchorNickname string `json:"anchor_nickname"`
	Title          string `json:"title"`
	Category       string `json:"category"`
	Priority       string `json:"priority"`
	Status         string `json:"status"`
	DiscoveredAt   string `json:"discovered_at"`
}

type PlanSummary struct {
	ID                 int64    `json:"id"`
	AnchorID           int64    `json:"anchor_id"`
	AnchorNickname     string   `json:"anchor_nickname"`
	Title              string   `json:"title"`
	Status             string   `json:"status"`
	StartDate          string   `json:"start_date"`
	LastFollowupDate   *string  `json:"last_followup_date"`
	CurrentMetricValue *float64 `json:"current_metric_value"`
	MetricUnit         string   `json:"metric_unit"`
	DaysActive         int      `json:"days_active"`
	DaysSinceFollowup  int      `json:"days_since_followup"`
}

type ExpiringGoal struct {
	ID             int64  `json:"id"`
	AnchorID       int64  `json:"anchor_id"`
	AnchorNickname string `json:"anchor_nickname"`
	Title          string `json:"title"`
	EndDate        string `json:"end_date"`
	DaysRemaining  int    `json:"days_remaining"`
}

type StaleAnchor struct {
	AnchorID        int64   `json:"anchor_id"`
	Nickname        string  `json:"nickname"`
	Stage           string  `json:"stage"`
	Status          string  `json:"status"`
	LastSessionDate *string `json:"last_session_date"`
	DaysSinceLive   int     `json:"days_since_live"`
}

type Dashboard struct {
	GeneratedAt             string         `json:"generated_at"`
	Today                   string         `json:"today"`
	AnchorCount             int            `json:"anchor_count"`
	TodayLiveAnchorCount    int            `json:"today_live_anchor_count"`
	TodayNotLiveAnchorCount int            `json:"today_not_live_anchor_count"`
	TodayDurationMinutes    *int           `json:"today_duration_minutes"`
	TodayRevenueCents       *int64         `json:"today_revenue_cents"`
	TodayFollowersGained    *int64         `json:"today_followers_gained"`
	FocusAnchors            []FocusAnchor  `json:"focus_anchors"`
	PendingIssues           []IssueSummary `json:"pending_issues"`
	ActivePlans             []PlanSummary  `json:"active_plans"`
	StalePlans              []PlanSummary  `json:"stale_plans"`
	ExpiringGoals           []ExpiringGoal `json:"expiring_goals"`
	StaleAnchors            []StaleAnchor  `json:"stale_anchors"`
	StaleDays               int            `json:"stale_days"`
}

type SearchResult struct {
	Kind           string `json:"kind"`
	ID             int64  `json:"id"`
	AnchorID       int64  `json:"anchor_id"`
	AnchorNickname string `json:"anchor_nickname"`
	Title          string `json:"title"`
	Subtitle       string `json:"subtitle"`
}

type BackupExport struct {
	FileName      string `json:"file_name"`
	Path          string `json:"path"`
	ArchiveBase64 string `json:"archive_base64"`
	ExportedAt    string `json:"exported_at"`
}

type BackupManifest struct {
	App        string `json:"app"`
	Version    string `json:"version"`
	ExportedAt string `json:"exported_at"`
}
