CREATE TABLE status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anchor_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    entity_title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    changed_at TEXT NOT NULL,
    FOREIGN KEY (anchor_id) REFERENCES anchors(id) ON DELETE RESTRICT
);

CREATE INDEX idx_status_history_anchor_changed_at ON status_history(anchor_id, changed_at);
CREATE INDEX idx_status_history_entity ON status_history(entity_type, entity_id);

CREATE TRIGGER status_history_issue_insert
AFTER INSERT ON anchor_issues
BEGIN
    INSERT INTO status_history(anchor_id, entity_type, entity_id, entity_title, status, changed_at)
    VALUES (NEW.anchor_id, 'issue', NEW.id, NEW.title, NEW.status, NEW.updated_at);
END;

CREATE TRIGGER status_history_issue_update
AFTER UPDATE OF status ON anchor_issues
WHEN OLD.status IS NOT NEW.status
BEGIN
    INSERT INTO status_history(anchor_id, entity_type, entity_id, entity_title, status, changed_at)
    VALUES (NEW.anchor_id, 'issue', NEW.id, NEW.title, NEW.status, NEW.updated_at);
END;

CREATE TRIGGER status_history_plan_insert
AFTER INSERT ON improvement_plans
BEGIN
    INSERT INTO status_history(anchor_id, entity_type, entity_id, entity_title, status, changed_at)
    VALUES (NEW.anchor_id, 'plan', NEW.id, NEW.title, NEW.status, NEW.updated_at);
END;

CREATE TRIGGER status_history_plan_update
AFTER UPDATE OF status ON improvement_plans
WHEN OLD.status IS NOT NEW.status
BEGIN
    INSERT INTO status_history(anchor_id, entity_type, entity_id, entity_title, status, changed_at)
    VALUES (NEW.anchor_id, 'plan', NEW.id, NEW.title, NEW.status, NEW.updated_at);
END;

CREATE TRIGGER status_history_goal_insert
AFTER INSERT ON stage_goals
BEGIN
    INSERT INTO status_history(anchor_id, entity_type, entity_id, entity_title, status, changed_at)
    VALUES (NEW.anchor_id, 'goal', NEW.id, NEW.title, NEW.status, NEW.updated_at);
END;

CREATE TRIGGER status_history_goal_update
AFTER UPDATE OF status ON stage_goals
WHEN OLD.status IS NOT NEW.status
BEGIN
    INSERT INTO status_history(anchor_id, entity_type, entity_id, entity_title, status, changed_at)
    VALUES (NEW.anchor_id, 'goal', NEW.id, NEW.title, NEW.status, NEW.updated_at);
END;

INSERT INTO status_history(anchor_id, entity_type, entity_id, entity_title, status, changed_at)
SELECT anchor_id, 'issue', id, title, status, updated_at FROM anchor_issues;

INSERT INTO status_history(anchor_id, entity_type, entity_id, entity_title, status, changed_at)
SELECT anchor_id, 'plan', id, title, status, updated_at FROM improvement_plans;

INSERT INTO status_history(anchor_id, entity_type, entity_id, entity_title, status, changed_at)
SELECT anchor_id, 'goal', id, title, status, updated_at FROM stage_goals;
