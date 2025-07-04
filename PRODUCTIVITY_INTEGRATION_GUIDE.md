# 🚀 Productivity Integration Guide

FlowGenius now supports **advanced workflow automation** that connects file organization to your favorite productivity tools. This transforms file management from a standalone task into an integrated part of your workflow.

## 🎯 Overview

The Productivity Integration System automatically triggers workflows when files are organized:

- **☁️ Cloud Storage Sync**: Auto-sync organized files to Google Drive, Dropbox, OneDrive
- **📢 Team Notifications**: Send updates to Slack, Teams, Discord when files are organized
- **📋 Project Management**: Create tasks in Trello, Notion, Asana for file review and action
- **💾 Smart Backup**: Intelligent backup to AWS S3, Google Cloud, Azure based on file importance
- **📧 Email Reports**: Automated daily/weekly organization summaries

## 🏗️ Architecture

```
File Organization → AI Analysis → Productivity Workflows → External Tools
                                        ↓
                    Cloud Storage | Team Chat | Project Boards | Backup Storage
```

## 🚀 Quick Setup

### 1. Enable Productivity Integrations

In your main application file (`src/main.js`), enable the integrations you want:

```javascript
// Enable productivity integrations
orchestrator.enableProductivityIntegration('cloud-sync', {
  provider: 'google-drive',
  enabled: true
});

orchestrator.enableProductivityIntegration('team-notifications', {
  provider: 'slack',
  channel: '#file-organization',
  enabled: true
});

orchestrator.enableProductivityIntegration('project-management', {
  provider: 'trello',
  boardId: 'your-board-id',
  enabled: true
});

orchestrator.enableProductivityIntegration('smart-backup', {
  provider: 'aws-s3',
  enabled: true
});
```

### 2. Import N8N Workflows

Import these workflow files into your N8N instance:

1. `n8n-workflows/productivity-cloud-sync-workflow.json`
2. `n8n-workflows/productivity-team-notification-workflow.json`
3. `n8n-workflows/productivity-project-management-workflow.json`
4. `n8n-workflows/smart-backup-workflow.json` (existing)

### 3. Configure Credentials

Set up the required credentials in N8N for each integration you plan to use.

## 📋 Detailed Integration Setup

### ☁️ Cloud Storage Sync

**Supported Providers:** Google Drive, Dropbox, OneDrive

**Setup Steps:**
1. In N8N, go to Credentials and add your cloud storage OAuth2 credentials
2. Import the cloud sync workflow
3. Enable in FlowGenius:

```javascript
orchestrator.enableProductivityIntegration('cloud-sync', {
  provider: 'google-drive', // or 'dropbox', 'onedrive'
  enabled: true,
  syncOnOrganize: true,
  createFolders: true
});
```

**What it does:**
- Automatically uploads organized files to your cloud storage
- Maintains folder structure based on AI organization
- Provides shareable links for team collaboration
- Supports multiple cloud providers simultaneously

### 📢 Team Notifications

**Supported Platforms:** Slack, Microsoft Teams, Discord

**Setup Steps:**
1. Create a webhook or bot token for your team platform
2. Configure credentials in N8N
3. Enable notifications:

```javascript
orchestrator.enableProductivityIntegration('team-notifications', {
  provider: 'slack',
  channel: '#file-organization',
  enabled: true,
  mentionTeamOnImportant: true,
  includePreview: true
});
```

**Notification Format:**
```
🗂️ File Organized Successfully

📄 File: important-document.pdf
📁 Category: work
🎯 Confidence: 92%
📍 Location: Documents/Work/Projects
🏷️ Tags: contract, legal, high-priority
📊 Size: 2.4 MB
```

### 📋 Project Management Integration

**Supported Tools:** Trello, Notion, Asana

**Setup Steps:**
1. Get API credentials for your project management tool
2. Configure in N8N with board/project IDs
3. Enable integration:

```javascript
orchestrator.enableProductivityIntegration('project-management', {
  provider: 'trello',
  boardId: 'your-board-id',
  listId: 'to-do-list-id',
  enabled: true,
  createTasksForImportant: true,
  assignToTeam: true
});
```

**Task Creation Logic:**
- **High-importance files** → Create task with 3-day due date
- **Work/Financial files** → Auto-assign to relevant team member
- **Low-confidence files** → Create review task with longer due date

### 💾 Smart Backup System

**Supported Providers:** AWS S3, Google Cloud Storage, Azure Blob

**Backup Priority Logic:**
- **High Priority**: Financial, work files, high-confidence files → Immediate backup
- **Medium Priority**: Regular documents → Scheduled backup
- **Low Priority**: Temporary, low-confidence files → Weekly backup

**Setup:**
```javascript
orchestrator.enableProductivityIntegration('smart-backup', {
  provider: 'aws-s3',
  enabled: true,
  retentionDays: 30,
  compressionEnabled: true,
  encryptionEnabled: true
});
```

## 🎮 Usage Examples

### Example 1: Complete Workflow for Work Files

When you organize a work document with high confidence:

1. **File Organization** → `Documents/Work/Projects/contract.pdf`
2. **Cloud Sync** → Uploaded to Google Drive `/Work/Projects/`
3. **Slack Notification** → Team notified with file details
4. **Trello Task** → Card created: "Review: contract.pdf" (due in 3 days)
5. **Smart Backup** → Immediate backup to AWS S3 (high priority)

### Example 2: Media File Workflow

When organizing family photos:

1. **File Organization** → `Media/Photos/2024/family-vacation.jpg`
2. **Cloud Sync** → Synced to Google Photos
3. **Personal Notification** → Optional Discord notification
4. **Standard Backup** → Scheduled backup (medium priority)

## ⚙️ Configuration Options

### Global Configuration

```javascript
const productivityConfig = {
  // Enable/disable individual integrations
  enableCloudSync: true,
  enableTeamNotifications: false,
  enableProjectManagement: true,
  enableSmartBackup: true,
  
  // Provider-specific settings
  productivityConfig: {
    cloudStorage: {
      provider: 'google-drive',
      enabled: true,
      syncOnOrganize: true,
      createShareLinks: true
    },
    teamNotification: {
      provider: 'slack',
      channel: '#file-organization',
      enabled: false,
      mentionOnImportant: true,
      quietHours: { start: '22:00', end: '08:00' }
    },
    projectManagement: {
      provider: 'trello',
      boardId: 'your-board-id',
      enabled: true,
      autoAssign: true,
      dueDateOffset: 7 // days
    },
    smartBackup: {
      provider: 'aws-s3',
      enabled: true,
      compressionLevel: 'standard',
      encryptionEnabled: true,
      retentionDays: 30
    }
  }
};
```

### File-Type Specific Rules

```javascript
// Custom rules for different file types
const fileTypeRules = {
  'financial': {
    cloudSync: true,
    teamNotification: true,
    projectManagement: true,
    backupPriority: 'high',
    retentionDays: 365
  },
  'temporary': {
    cloudSync: false,
    teamNotification: false,
    projectManagement: false,
    backupPriority: 'low'
  },
  'media': {
    cloudSync: true,
    teamNotification: false,
    projectManagement: false,
    backupPriority: 'medium'
  }
};
```

## 📊 Monitoring & Analytics

### Workflow Status Monitoring

```javascript
// Listen for productivity workflow events
orchestrator.on('productivity-workflow-completed', (event) => {
  console.log(`✅ ${event.type} completed for ${event.fileData.fileName}`);
});

orchestrator.on('productivity-workflow-failed', (event) => {
  console.error(`❌ ${event.type} failed: ${event.error}`);
});

// Get workflow statistics
const stats = orchestrator.getProductivityStats();
console.log(`Success rate: ${stats.successRate}%`);
```

### Available Integrations

```javascript
// Get list of available integrations
const integrations = orchestrator.getProductivityIntegrations();
console.log('Available integrations:', integrations);

// Get workflow templates
const workflows = orchestrator.getProductivityWorkflows();
console.log('Available workflows:', workflows);
```

## 🔧 Troubleshooting

### Common Issues

**"Productivity workflow failed"**
- Check N8N is running: `curl http://localhost:5678/healthz`
- Verify webhook URLs are accessible
- Check credentials are properly configured

**"Cloud sync authentication failed"**
- Refresh OAuth2 tokens in N8N credentials
- Verify API quotas haven't been exceeded
- Check folder permissions in cloud storage

**"Team notification not sent"**
- Verify bot permissions in Slack/Teams
- Check channel exists and bot is invited
- Validate webhook URLs

### Debug Commands

```bash
# Test productivity webhook
curl -X POST http://localhost:5678/webhook/cloud-storage-sync \
  -H "Content-Type: application/json" \
  -d '{
    "file_path": "/test/file.txt",
    "file_name": "test-file.txt",
    "target_integration": "google-drive",
    "folder_structure": "Test/Files"
  }'

# Check N8N workflow status
curl http://localhost:5678/api/v1/workflows
```

## 🚀 Advanced Usage

### Custom Workflow Triggers

```javascript
// Trigger specific workflows programmatically
await orchestrator.productivityService.executeCloudStorageSync(fileData, 'dropbox');
await orchestrator.productivityService.executeTeamNotification(fileData, 'slack', {
  channel: '#urgent',
  mentionTeam: true
});
```

### Batch Operations

```javascript
// Productivity workflows for multiple files
const results = await Promise.all(
  files.map(file => orchestrator.triggerProductivityWorkflows(file.analysis, file.paths))
);
```

### Custom Integration

```javascript
// Add custom productivity integration
class CustomIntegration {
  async execute(fileData, config) {
    // Your custom workflow logic
    console.log(`Processing ${fileData.fileName} with custom integration`);
  }
}

// Register custom integration
orchestrator.productivityService.registerIntegration('custom', new CustomIntegration());
```

## 📈 Performance Optimization

### Batch Processing
- Group multiple file operations to reduce API calls
- Use queue-based processing for high-volume scenarios
- Implement rate limiting for API-heavy integrations

### Caching
- Cache frequently accessed data (board IDs, channel IDs)
- Store integration status to avoid redundant calls
- Implement retry logic with exponential backoff

### Resource Management
- Set reasonable timeouts for all external API calls
- Monitor API quotas and implement throttling
- Use connection pooling for database operations

## 🔒 Security Best Practices

### Credential Management
- Store all API keys securely in N8N credentials
- Use OAuth2 where possible instead of API keys
- Regularly rotate API keys and tokens

### Data Privacy
- Ensure file metadata doesn't contain sensitive information
- Implement data retention policies
- Use encryption for all backup operations

### Access Control
- Limit N8N workflow permissions
- Use service accounts with minimal required permissions
- Monitor and log all external API calls

## 🔄 Migration Guide

### From Basic to Productivity Integration

1. **Backup existing configuration**
2. **Update orchestrator initialization**
3. **Import N8N workflows**
4. **Configure credentials**
5. **Enable integrations gradually**
6. **Test with demo files first**

### Updating Existing Workflows

```javascript
// Update existing N8N workflows to new format
// Check workflow compatibility
// Update webhook endpoints if needed
```

## 🤝 Contributing

To add new productivity integrations:

1. **Create integration class** in `src/services/productivityIntegrationService.js`
2. **Add N8N workflow** in `n8n-workflows/`
3. **Update orchestrator** configuration options
4. **Add tests** and documentation
5. **Submit pull request**

## 📚 Resources

- [N8N Documentation](https://docs.n8n.io)
- [Google Drive API](https://developers.google.com/drive)
- [Slack API](https://api.slack.com)
- [Trello API](https://developer.atlassian.com/cloud/trello)
- [Notion API](https://developers.notion.com)

## 🎯 Future Enhancements

- **AI-powered workflow suggestions** based on file content
- **Custom workflow builder** with visual interface  
- **Advanced analytics** and reporting dashboard
- **Multi-tenant support** for team environments
- **Real-time collaboration** features
- **Mobile app integration** for remote workflow management

---

**Transform your file organization into a complete productivity system! 🚀** 