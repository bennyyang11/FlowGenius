const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const { GoogleDriveService } = require('./googleDriveService');

class ProductivityIntegrationService extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      n8nBaseUrl: config.n8nBaseUrl || 'http://localhost:5678',
      webhookBaseUrl: config.webhookBaseUrl || 'http://localhost:5678/webhook',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      ...config
    };
    
    this.integrations = new Map();
    this.activeWorkflows = new Map();
    this.workflowHistory = [];
    
    // Initialize Google Drive service
    this.googleDriveService = new GoogleDriveService();
    this.isDemoMode = config.isDemoMode || false;
  }

  async initialize() {
    console.log('🔗 Initializing Productivity Integration Service...');
    
    // Initialize Google Drive service
    await this.googleDriveService.initialize();
    
    // Setup default productivity workflows
    await this.setupProductivityWorkflows();
    
    // Initialize available integrations
    await this.discoverAvailableIntegrations();
    
    console.log('✅ Productivity Integration Service initialized');
  }

  async setupProductivityWorkflows() {
    const workflows = [
      {
        name: 'Cloud Storage Sync',
        description: 'Automatically sync organized files to cloud storage',
        webhook: 'cloud-storage-sync',
        triggers: ['file-organized', 'file-moved'],
        integrations: ['google-drive', 'dropbox', 'onedrive']
      },
      {
        name: 'Team Notification',
        description: 'Notify team when important files are organized',
        webhook: 'team-notification',
        triggers: ['file-organized', 'batch-complete'],
        integrations: ['slack', 'teams', 'discord']
      },
      {
        name: 'Project Management Integration',
        description: 'Create tasks or update projects based on file organization',
        webhook: 'project-management',
        triggers: ['file-organized', 'project-file-detected'],
        integrations: ['trello', 'notion', 'asana', 'monday']
      },
      {
        name: 'Smart Backup System',
        description: 'Intelligent backup based on file importance and change frequency',
        webhook: 'smart-backup',
        triggers: ['file-organized', 'scheduled-backup'],
        integrations: ['aws-s3', 'google-cloud', 'azure-blob']
      },
      {
        name: 'Email Automation',
        description: 'Send file summaries and organization reports via email',
        webhook: 'email-automation',
        triggers: ['daily-summary', 'weekly-report', 'file-shared'],
        integrations: ['gmail', 'outlook', 'sendgrid']
      }
    ];

    this.productivityWorkflows = workflows;
    console.log(`📋 Setup ${workflows.length} productivity workflow templates`);
  }

  async discoverAvailableIntegrations() {
    const integrations = [
      {
        id: 'google-drive',
        name: 'Google Drive',
        type: 'cloud-storage',
        description: 'Sync files to Google Drive',
        webhook: 'google-drive-sync',
        requiredCredentials: ['google-oauth2'],
        capabilities: ['upload', 'download', 'share', 'organize']
      },
      {
        id: 'slack',
        name: 'Slack',
        type: 'communication',
        description: 'Send notifications to Slack channels',
        webhook: 'slack-notification',
        requiredCredentials: ['slack-token'],
        capabilities: ['message', 'file-upload', 'channel-notify']
      },
      {
        id: 'trello',
        name: 'Trello',
        type: 'project-management',
        description: 'Create cards and update boards',
        webhook: 'trello-integration',
        requiredCredentials: ['trello-api'],
        capabilities: ['create-card', 'update-card', 'attach-file']
      },
      {
        id: 'notion',
        name: 'Notion',
        type: 'knowledge-management',
        description: 'Create pages and update databases',
        webhook: 'notion-integration',
        requiredCredentials: ['notion-token'],
        capabilities: ['create-page', 'update-database', 'upload-file']
      },
      {
        id: 'gmail',
        name: 'Gmail',
        type: 'email',
        description: 'Send emails with file summaries',
        webhook: 'gmail-send',
        requiredCredentials: ['gmail-oauth2'],
        capabilities: ['send-email', 'attach-file', 'schedule-send']
      },
      {
        id: 'aws-s3',
        name: 'Amazon S3',
        type: 'cloud-storage',
        description: 'Backup files to AWS S3',
        webhook: 'aws-s3-backup',
        requiredCredentials: ['aws-credentials'],
        capabilities: ['upload', 'backup', 'archive', 'lifecycle']
      }
    ];

    integrations.forEach(integration => {
      this.integrations.set(integration.id, integration);
    });

    console.log(`🔌 Discovered ${integrations.length} productivity integrations`);
  }

  // Main workflow execution methods
  async executeCloudStorageSync(fileData, integrationId = 'google-drive') {
    try {
      console.log(`☁️ Syncing ${fileData.fileName} to ${integrationId}`);

      const payload = {
        file_path: fileData.filePath,
        file_name: fileData.fileName,
        classification: fileData.classification,
        tags: fileData.tags,
        target_integration: integrationId,
        sync_type: 'organize-and-sync',
        folder_structure: fileData.organizationSuggestion?.relativePath || 'Organized Files',
        metadata: {
          confidence: fileData.confidence,
          file_size: fileData.fileSize,
          organized_at: new Date().toISOString()
        }
      };

      const response = await this.makeN8nRequest('cloud-storage-sync', payload);
      
      this.emit('workflow-completed', {
        type: 'cloud-storage-sync',
        fileData,
        integrationId,
        success: true
      });

      return {
        success: true,
        message: `File synced to ${integrationId}`,
        cloudUrl: response.data.cloud_url,
        shareUrl: response.data.share_url
      };

    } catch (error) {
      this.emit('workflow-failed', {
        type: 'cloud-storage-sync',
        fileData,
        error: error.message
      });

      console.error(`❌ Cloud sync failed for ${fileData.fileName}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async executeTeamNotification(fileData, integrationId = 'slack', options = {}) {
    try {
      const {
        channel = '#file-organization',
        message = 'File organized',
        includePreview = true,
        mentionTeam = false
      } = options;

      console.log(`📢 Sending team notification to ${integrationId}`);

      const payload = {
        integration: integrationId,
        channel,
        message: this.buildNotificationMessage(fileData, message),
        file_info: {
          name: fileData.fileName,
          category: fileData.classification,
          confidence: fileData.confidence,
          tags: fileData.tags,
          size: fileData.fileSize,
          organized_path: fileData.organizationSuggestion?.relativePath
        },
        options: {
          include_preview: includePreview,
          mention_team: mentionTeam,
          thread_reply: false
        }
      };

      const response = await this.makeN8nRequest('team-notification', payload);
      
      this.emit('workflow-completed', {
        type: 'team-notification',
        fileData,
        integrationId,
        success: true
      });

      return {
        success: true,
        message: 'Team notification sent',
        messageId: response.data.message_id
      };

    } catch (error) {
      this.emit('workflow-failed', {
        type: 'team-notification',
        fileData,
        error: error.message
      });

      console.error(`❌ Team notification failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async executeProjectManagement(fileData, integrationId = 'trello', projectConfig = {}) {
    try {
      console.log(`📋 Creating project task in ${integrationId}`);

      const {
        boardId = 'default',
        listId = 'to-do',
        assignee = null,
        dueDate = null,
        labels = []
      } = projectConfig;

      const payload = {
        integration: integrationId,
        action: 'create-task',
        task_data: {
          title: `Review: ${fileData.fileName}`,
          description: this.buildTaskDescription(fileData),
          board_id: boardId,
          list_id: listId,
          assignee,
          due_date: dueDate,
          labels: [...labels, fileData.classification, ...fileData.tags.slice(0, 3)],
          attachments: [{
            name: fileData.fileName,
            path: fileData.filePath,
            type: 'file'
          }]
        },
        file_metadata: {
          classification: fileData.classification,
          confidence: fileData.confidence,
          organized_path: fileData.organizationSuggestion?.relativePath
        }
      };

      const response = await this.makeN8nRequest('project-management', payload);
      
      this.emit('workflow-completed', {
        type: 'project-management',
        fileData,
        integrationId,
        success: true
      });

      return {
        success: true,
        message: 'Project task created',
        taskId: response.data.task_id,
        taskUrl: response.data.task_url
      };

    } catch (error) {
      this.emit('workflow-failed', {
        type: 'project-management',
        fileData,
        error: error.message
      });

      console.error(`❌ Project management integration failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async executeSmartBackup(fileData, backupConfig = {}) {
    try {
      console.log(`💾 Executing smart backup for ${fileData.fileName}`);

      const backupPriority = this.calculateBackupPriority(fileData);
      const {
        storageProvider = 'aws-s3',
        retentionDays = 30,
        compressionLevel = 'standard',
        encryptionEnabled = true
      } = backupConfig;

      const payload = {
        file_data: {
          path: fileData.filePath,
          name: fileData.fileName,
          size: fileData.fileSize,
          classification: fileData.classification,
          importance: fileData.importance || 'medium',
          confidence: fileData.confidence
        },
        backup_config: {
          provider: storageProvider,
          priority: backupPriority,
          retention_days: retentionDays,
          compression: compressionLevel,
          encryption: encryptionEnabled,
          backup_type: backupPriority === 'high' ? 'immediate' : 'scheduled'
        },
        metadata: {
          tags: fileData.tags,
          organized_path: fileData.organizationSuggestion?.relativePath,
          backup_timestamp: new Date().toISOString()
        }
      };

      const response = await this.makeN8nRequest('smart-backup', payload);
      
      this.emit('workflow-completed', {
        type: 'smart-backup',
        fileData,
        success: true
      });

      return {
        success: true,
        message: `Smart backup completed (${backupPriority} priority)`,
        backupId: response.data.backup_id,
        storageLocation: response.data.storage_location
      };

    } catch (error) {
      this.emit('workflow-failed', {
        type: 'smart-backup',
        fileData,
        error: error.message
      });

      console.error(`❌ Smart backup failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Helper methods
  async makeN8nRequest(webhook, payload) {
    const url = `${this.config.webhookBaseUrl}/${webhook}`;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await axios.post(url, payload, {
          timeout: this.config.timeout,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'FlowGenius-ProductivityIntegration/1.0'
          }
        });
        
        return response;
      } catch (error) {
        if (attempt === this.config.retryAttempts) {
          throw error;
        }
        
        console.log(`N8N request attempt ${attempt} failed, retrying...`);
        await this.delay(this.config.retryDelay * attempt);
      }
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  calculateBackupPriority(fileData) {
    let priority = 'medium';
    
    // High priority conditions
    if (fileData.classification === 'financial' || 
        fileData.classification === 'work' ||
        fileData.importance === 'high' ||
        fileData.confidence > 0.9) {
      priority = 'high';
    }
    
    // Low priority conditions
    if (fileData.classification === 'temporary' ||
        fileData.classification === 'misc' ||
        fileData.confidence < 0.5) {
      priority = 'low';
    }
    
    return priority;
  }

  buildNotificationMessage(fileData, baseMessage) {
    return `${baseMessage}: **${fileData.fileName}** has been organized into *${fileData.classification}* category with ${Math.round(fileData.confidence * 100)}% confidence. Location: \`${fileData.organizationSuggestion?.relativePath || 'Unknown'}\``;
  }

  buildTaskDescription(fileData) {
    return `
File: ${fileData.fileName}
Category: ${fileData.classification}
Confidence: ${Math.round(fileData.confidence * 100)}%
Tags: ${fileData.tags.join(', ')}
Size: ${this.formatFileSize(fileData.fileSize)}
Organized to: ${fileData.organizationSuggestion?.relativePath || 'Unknown'}

Please review the file organization and take any necessary actions.
    `.trim();
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Public API methods
  getAvailableIntegrations() {
    return Array.from(this.integrations.values());
  }

  getProductivityWorkflows() {
    return this.productivityWorkflows;
  }

  getWorkflowHistory(limit = 50) {
    return this.workflowHistory.slice(-limit);
  }

  getActiveWorkflows() {
    return Array.from(this.activeWorkflows.values());
  }

  // Google Drive Integration Methods
  async authenticateGoogleDrive() {
    try {
      // Allow authentication in demo mode, but file syncing will still be blocked
      const result = await this.googleDriveService.authenticate();
      
      this.emit('google-drive-authenticated', {
        success: true,
        user: result.user,
        demoMode: this.isDemoMode
      });
      
      return result;
    } catch (error) {
      this.emit('google-drive-auth-failed', {
        success: false,
        error: error.message
      });
      throw error;
    }
  }

  async signOutGoogleDrive() {
    try {
      const result = await this.googleDriveService.signOut();
      
      this.emit('google-drive-signed-out', {
        success: true
      });
      
      return result;
    } catch (error) {
      this.emit('google-drive-signout-failed', {
        success: false,
        error: error.message
      });
      throw error;
    }
  }

  async getGoogleDriveAuthStatus() {
    try {
      const status = await this.googleDriveService.getAuthStatus();
      return {
        ...status,
        configured: this.googleDriveService.isConfigured(),
        demoMode: this.isDemoMode
      };
    } catch (error) {
      return {
        isAuthenticated: false,
        user: null,
        configured: false,
        demoMode: this.isDemoMode,
        error: error.message
      };
    }
  }

  async syncFileToGoogleDrive(fileData) {
    try {
      if (this.isDemoMode) {
        throw new Error('Google Drive sync is disabled in demo mode');
      }

      if (!this.googleDriveService.isAuthenticated) {
        throw new Error('Not authenticated with Google Drive');
      }

      const result = await this.googleDriveService.syncFileToGoogleDrive(
        fileData.filePath,
        fileData.organizationSuggestion
      );

      this.emit('google-drive-sync-completed', {
        success: true,
        fileName: fileData.fileName,
        result
      });

      return result;
    } catch (error) {
      this.emit('google-drive-sync-failed', {
        success: false,
        fileName: fileData.fileName,
        error: error.message
      });
      throw error;
    }
  }

  async bulkSyncToGoogleDrive(files, onProgress = null) {
    try {
      if (this.isDemoMode) {
        throw new Error('Google Drive sync is disabled in demo mode');
      }

      if (!this.googleDriveService.isAuthenticated) {
        throw new Error('Not authenticated with Google Drive');
      }

      const result = await this.googleDriveService.bulkSync(files, onProgress);

      this.emit('google-drive-bulk-sync-completed', {
        success: true,
        result
      });

      return result;
    } catch (error) {
      this.emit('google-drive-bulk-sync-failed', {
        success: false,
        error: error.message
      });
      throw error;
    }
  }

  async getGoogleDriveStorageInfo() {
    try {
      if (!this.googleDriveService.isAuthenticated) {
        throw new Error('Not authenticated with Google Drive');
      }

      return await this.googleDriveService.getStorageInfo();
    } catch (error) {
      console.error('Failed to get Google Drive storage info:', error);
      throw error;
    }
  }

  // Enhanced cloud storage sync with direct Google Drive support
  async executeCloudStorageSyncDirect(fileData, integrationId = 'google-drive') {
    try {
      if (integrationId === 'google-drive' && this.googleDriveService.isAuthenticated) {
        // Use direct Google Drive service
        const result = await this.syncFileToGoogleDrive(fileData);
        
        this.emit('workflow-completed', {
          type: 'cloud-storage-sync',
          fileData,
          integrationId,
          success: true,
          direct: true
        });

        return {
          success: true,
          message: `File synced to Google Drive`,
          cloudUrl: result.file.id,
          shareUrl: `https://drive.google.com/file/d/${result.file.id}/view`
        };
      } else {
        // Fallback to N8N webhook
        return await this.executeCloudStorageSync(fileData, integrationId);
      }
    } catch (error) {
      console.error(`❌ Direct cloud sync failed for ${fileData.fileName}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Get productivity integration status
  getProductivityIntegrationStatus() {
    return {
      serviceStatus: 'active',
      availableIntegrations: this.getAvailableIntegrations().length,
      googleDriveConfigured: this.googleDriveService.isConfigured(),
      demoMode: this.isDemoMode,
      syncStats: {
        totalFiles: 0,
        successCount: 0,
        errorCount: 0,
        lastSync: null
      }
    };
  }
}

module.exports = { ProductivityIntegrationService }; 