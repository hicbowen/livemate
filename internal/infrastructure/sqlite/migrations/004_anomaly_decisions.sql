CREATE TABLE anomaly_decisions (
    anchor_id INTEGER NOT NULL,
    anomaly_id TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('已忽略', '继续观察', '已转为问题')),
    decided_at TEXT NOT NULL,
    PRIMARY KEY (anchor_id, anomaly_id, detected_at),
    FOREIGN KEY (anchor_id) REFERENCES anchors(id) ON DELETE CASCADE
);

CREATE INDEX idx_anomaly_decisions_anchor ON anomaly_decisions(anchor_id, anomaly_id, detected_at);
