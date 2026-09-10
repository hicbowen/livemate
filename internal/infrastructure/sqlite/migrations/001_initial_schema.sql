CREATE TABLE anchors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    nickname TEXT NOT NULL,
    platform TEXT NOT NULL,
    platform_uid TEXT NOT NULL DEFAULT '',
    account_name TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    gender TEXT NOT NULL DEFAULT '',
    age INTEGER,
    joined_at TEXT,
    operator_name TEXT NOT NULL DEFAULT '',
    stage TEXT NOT NULL,
    attention_level TEXT NOT NULL,
    status TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE anchor_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anchor_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(anchor_id, name),
    FOREIGN KEY (anchor_id) REFERENCES anchors(id) ON DELETE RESTRICT
);

CREATE TABLE live_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anchor_id INTEGER NOT NULL,
    session_date TEXT NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    duration_minutes INTEGER,
    duration_overridden INTEGER NOT NULL DEFAULT 0,
    views INTEGER,
    peak_online INTEGER,
    avg_online INTEGER,
    avg_stay_seconds INTEGER,
    likes INTEGER,
    comments INTEGER,
    comment_users INTEGER,
    shares INTEGER,
    followers_before INTEGER,
    followers_after INTEGER,
    followers_gained INTEGER,
    revenue_cents INTEGER,
    payer_count INTEGER,
    gift_user_count INTEGER,
    pk_count INTEGER,
    pk_win_count INTEGER,
    pk_revenue_cents INTEGER,
    operator_name TEXT NOT NULL DEFAULT '',
    is_abnormal INTEGER NOT NULL DEFAULT 0,
    abnormal_note TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (anchor_id) REFERENCES anchors(id) ON DELETE RESTRICT
);

CREATE TABLE operation_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anchor_id INTEGER NOT NULL,
    live_session_id INTEGER,
    review_date TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    strengths TEXT NOT NULL DEFAULT '',
    observations TEXT NOT NULL DEFAULT '',
    conclusion TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (anchor_id) REFERENCES anchors(id) ON DELETE RESTRICT,
    FOREIGN KEY (live_session_id) REFERENCES live_sessions(id) ON DELETE RESTRICT
);

CREATE TABLE anchor_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anchor_id INTEGER NOT NULL,
    review_id INTEGER,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    evidence TEXT NOT NULL DEFAULT '',
    cause_hypothesis TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    discovered_at TEXT NOT NULL,
    resolved_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (anchor_id) REFERENCES anchors(id) ON DELETE RESTRICT,
    FOREIGN KEY (review_id) REFERENCES operation_reviews(id) ON DELETE RESTRICT
);

CREATE TABLE improvement_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anchor_id INTEGER NOT NULL,
    issue_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    objective TEXT NOT NULL DEFAULT '',
    actions TEXT NOT NULL DEFAULT '',
    metric_name TEXT NOT NULL DEFAULT '',
    baseline_value REAL,
    target_value REAL,
    metric_unit TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL,
    expected_end_date TEXT,
    priority TEXT NOT NULL DEFAULT '普通',
    status TEXT NOT NULL,
    result_summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (anchor_id) REFERENCES anchors(id) ON DELETE RESTRICT,
    FOREIGN KEY (issue_id) REFERENCES anchor_issues(id) ON DELETE RESTRICT
);

CREATE TABLE plan_followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    anchor_id INTEGER NOT NULL,
    live_session_id INTEGER,
    followup_date TEXT NOT NULL,
    execution_status TEXT NOT NULL,
    execution_note TEXT NOT NULL DEFAULT '',
    metric_value REAL,
    metric_change REAL,
    effect TEXT NOT NULL,
    effect_note TEXT NOT NULL DEFAULT '',
    next_action TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (plan_id) REFERENCES improvement_plans(id) ON DELETE RESTRICT,
    FOREIGN KEY (anchor_id) REFERENCES anchors(id) ON DELETE RESTRICT,
    FOREIGN KEY (live_session_id) REFERENCES live_sessions(id) ON DELETE RESTRICT
);

CREATE TABLE stage_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anchor_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (anchor_id) REFERENCES anchors(id) ON DELETE RESTRICT
);

CREATE TABLE goal_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL,
    metric_name TEXT NOT NULL,
    baseline_value REAL,
    target_value REAL,
    metric_unit TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (goal_id) REFERENCES stage_goals(id) ON DELETE RESTRICT
);

CREATE TABLE anchor_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anchor_id INTEGER NOT NULL,
    event_date TEXT NOT NULL,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    live_session_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (anchor_id) REFERENCES anchors(id) ON DELETE RESTRICT,
    FOREIGN KEY (live_session_id) REFERENCES live_sessions(id) ON DELETE RESTRICT
);

CREATE INDEX idx_anchors_deleted_at ON anchors(deleted_at);
CREATE INDEX idx_anchors_attention_level ON anchors(attention_level);
CREATE INDEX idx_anchors_stage ON anchors(stage);
CREATE INDEX idx_anchors_status ON anchors(status);
CREATE INDEX idx_anchor_tags_anchor_id ON anchor_tags(anchor_id);
CREATE INDEX idx_anchor_tags_name ON anchor_tags(name);
CREATE INDEX idx_live_sessions_anchor_id ON live_sessions(anchor_id);
CREATE INDEX idx_live_sessions_session_date ON live_sessions(session_date);
CREATE INDEX idx_operation_reviews_anchor_id ON operation_reviews(anchor_id);
CREATE INDEX idx_anchor_issues_anchor_id ON anchor_issues(anchor_id);
CREATE INDEX idx_anchor_issues_status ON anchor_issues(status);
CREATE INDEX idx_anchor_issues_priority ON anchor_issues(priority);
CREATE INDEX idx_improvement_plans_anchor_id ON improvement_plans(anchor_id);
CREATE INDEX idx_improvement_plans_issue_id ON improvement_plans(issue_id);
CREATE INDEX idx_improvement_plans_status ON improvement_plans(status);
CREATE INDEX idx_plan_followups_plan_id ON plan_followups(plan_id);
CREATE INDEX idx_plan_followups_followup_date ON plan_followups(followup_date);
CREATE INDEX idx_anchor_events_anchor_id ON anchor_events(anchor_id);
CREATE INDEX idx_anchor_events_event_date ON anchor_events(event_date);
