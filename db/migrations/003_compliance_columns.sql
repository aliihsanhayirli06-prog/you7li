ALTER TABLE publishes
ADD COLUMN IF NOT EXISTS compliance_status TEXT,
ADD COLUMN IF NOT EXISTS compliance_risk_score INTEGER,
ADD COLUMN IF NOT EXISTS compliance_report JSONB;
