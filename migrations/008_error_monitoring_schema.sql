-- Migration: 008_error_monitoring_schema.sql
-- Description: Create client_error_logs table for UI & functional error monitoring

CREATE TABLE IF NOT EXISTS client_error_logs (
    id SERIAL PRIMARY KEY,
    error_message TEXT NOT NULL,
    error_name VARCHAR(150),
    error_stack TEXT,
    error_type VARCHAR(50) DEFAULT 'ui', -- 'ui', 'functional', 'console', 'unhandled_rejection', 'network'
    severity VARCHAR(20) DEFAULT 'error', -- 'error', 'warn', 'fatal', 'info'
    url TEXT,
    component_stack TEXT,
    user_id VARCHAR(100),
    user_email VARCHAR(255),
    user_agent TEXT,
    browser VARCHAR(100),
    os VARCHAR(100),
    device_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'unresolved', -- 'unresolved', 'investigating', 'resolved', 'ignored'
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON client_error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_status ON client_error_logs(status);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON client_error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON client_error_logs(error_type);
