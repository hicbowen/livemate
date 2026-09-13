CREATE TABLE todo_tasks (
    id TEXT PRIMARY KEY,
    task_date TEXT NOT NULL,
    text TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    time_range_json TEXT NOT NULL DEFAULT '[]',
    start_reminder_enabled INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_todo_tasks_date_order ON todo_tasks(task_date, sort_order, id);
