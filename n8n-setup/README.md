# N8n Backup Integration Setup

This directory contains the n8n workflows and setup instructions for integrating n8n with FlowGenius file backup and restoration.

## Prerequisites

1. **n8n Installation**: Install n8n locally or use cloud version
2. **PostgreSQL Database**: For storing backup records
3. **Node.js Dependencies**: Ensure axios is installed (already in package.json)

## Quick Setup

### 1. Install n8n

```bash
# Option 1: Global installation
npm install -g n8n

# Option 2: Using Docker
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

### 2. Set up PostgreSQL Database

```bash
# Install PostgreSQL (macOS)
brew install postgresql
brew services start postgresql

# Create database and user
createdb flowgenius_backups
psql flowgenius_backups < ../database/schema.sql
```

### 3. Configure n8n Database Connection

1. Start n8n: `n8n start`
2. Go to http://localhost:5678
3. Go to Settings > Credentials
4. Add PostgreSQL credentials:
   - Name: "Backup Database"
   - Host: localhost
   - Port: 5432
   - Database: flowgenius_backups
   - User: [your postgres user]
   - Password: [your postgres password]

### 4. Import Workflows

1. In n8n, go to Workflows
2. Click "Import from file"
3. Import these workflows in order:
   - `backup-workflow.json` (File Organization Backup)
   - `restore-workflow.json` (File Organization Restore)
   - `list-backups-workflow.json` (List Backup Records)

### 5. Configure FlowGenius

Update the n8n configuration in `src/main.js`:

```javascript
const n8nConfig = {
  enabled: true,
  n8nBaseUrl: 'http://localhost:5678',
  webhookBaseUrl: 'http://localhost:5678/webhook',
  apiKey: null, // Set if you enable n8n authentication
  enablePhysicalBackup: false, // Set to true for file copies
  backupDirectory: path.join(process.cwd(), 'backups')
};
```

## Workflow Details

### Backup Workflow
- **Webhook**: `POST /webhook/backup-file`
- **Purpose**: Store file backup information before organization
- **Features**: 
  - Metadata storage in PostgreSQL
  - Optional physical file backup
  - File integrity checksums

### Restore Workflow
- **Webhook**: `POST /webhook/restore-file`
- **Purpose**: Restore files to original locations
- **Features**:
  - File existence validation
  - Location conflict detection
  - Automatic cleanup

### List Backups Workflow
- **Webhook**: `GET /webhook/backup-records`
- **Purpose**: Retrieve available backup records
- **Features**:
  - Recent-first ordering
  - Time-ago calculations
  - Filtering by restoration status

## Configuration Options

### Physical Backup
Enable `enablePhysicalBackup: true` to create actual file copies:
- Files are copied to the backup directory before organization
- Provides extra protection against data loss
- Requires more disk space

### Authentication
Set up n8n API authentication:
1. Enable authentication in n8n settings
2. Generate API key
3. Add to `n8nConfig.apiKey`

### Custom Backup Directory
```javascript
backupDirectory: '/path/to/custom/backup/directory'
```

## Database Schema

The PostgreSQL database stores:
- File paths (original and new locations)
- Organization metadata
- Timestamps and restore status
- File checksums for integrity
- Optional custom metadata

## Testing

1. **Health Check**: The service includes a health check for n8n connectivity
2. **Fallback**: If n8n is unavailable, falls back to in-memory storage
3. **Queue Simulation**: Use the existing queue simulation to test backup creation

## Troubleshooting

### Common Issues

**n8n Connection Failed**
- Check if n8n is running on port 5678
- Verify webhook URLs are accessible
- Check firewall settings

**Database Connection Issues**
- Verify PostgreSQL is running
- Check database credentials in n8n
- Ensure schema is properly imported

**Backup/Restore Failures**
- Check file permissions
- Verify file paths exist
- Review n8n workflow execution logs

### Logs
- n8n logs: Available in n8n interface under Executions
- FlowGenius logs: Check console output for `[N8N]` prefixed messages

## Advanced Configuration

### Cleanup Automation
Schedule automatic cleanup of old backup records:
```sql
-- Run weekly to clean records older than 30 days
SELECT cleanup_old_backups(30);
```

### Monitoring
Use n8n's built-in monitoring and webhook logging to track:
- Backup creation rates
- Restore success rates
- System performance

### Scaling
For high-volume usage:
- Use dedicated PostgreSQL instance
- Configure n8n with multiple workers
- Implement backup retention policies

## Security Considerations

1. **API Keys**: Store n8n API keys securely
2. **Database Access**: Use dedicated database user with minimal permissions
3. **File Permissions**: Ensure backup directory has appropriate access controls
4. **Network Security**: Consider HTTPS for production deployments

## Support

For issues specific to:
- **n8n**: Check [n8n documentation](https://docs.n8n.io)
- **PostgreSQL**: Review [PostgreSQL docs](https://www.postgresql.org/docs)
- **FlowGenius Integration**: Check the main application logs and error messages 