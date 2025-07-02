-- Database schema for file backup records
-- This database will be used by n8n workflows to store backup information

CREATE TABLE IF NOT EXISTS file_backups (
    id VARCHAR(50) PRIMARY KEY,
    original_path TEXT NOT NULL,
    new_path TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    organization_method VARCHAR(50) NOT NULL DEFAULT 'ai-smart',
    workflow_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_restored BOOLEAN DEFAULT FALSE,
    restored_at TIMESTAMP NULL,
    backup_path TEXT NULL, -- Path to physical backup if created
    backup_type VARCHAR(20) DEFAULT 'metadata', -- 'metadata' or 'physical_copy'
    metadata JSONB NULL, -- Additional metadata about the file
    file_size BIGINT NULL,
    file_type VARCHAR(100) NULL,
    checksum VARCHAR(64) NULL -- For integrity verification
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_file_backups_created_at ON file_backups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_backups_is_restored ON file_backups(is_restored);
CREATE INDEX IF NOT EXISTS idx_file_backups_workflow_id ON file_backups(workflow_id);
CREATE INDEX IF NOT EXISTS idx_file_backups_organization_method ON file_backups(organization_method);
CREATE INDEX IF NOT EXISTS idx_file_backups_file_name ON file_backups(file_name);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_file_backups_updated_at 
    BEFORE UPDATE ON file_backups 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- View for easy querying of active backups
CREATE OR REPLACE VIEW active_backups AS 
SELECT 
    id,
    original_path,
    new_path,
    file_name,
    organization_method,
    created_at,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) as age_seconds
FROM file_backups 
WHERE is_restored = FALSE 
ORDER BY created_at DESC;

-- View for recent restore operations
CREATE OR REPLACE VIEW recent_restores AS
SELECT 
    id,
    original_path,
    new_path,
    file_name,
    organization_method,
    created_at,
    restored_at,
    EXTRACT(EPOCH FROM (restored_at - created_at)) as backup_duration_seconds
FROM file_backups 
WHERE is_restored = TRUE 
ORDER BY restored_at DESC;

-- Function to cleanup old backup records (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_backups(older_than_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM file_backups 
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 day' * older_than_days;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Sample cleanup job (can be scheduled)
-- SELECT cleanup_old_backups(30); -- Remove backups older than 30 days 