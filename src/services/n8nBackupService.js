const axios = require('axios');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;

class N8nBackupService {
  constructor(config = {}) {
    this.config = {
      n8nBaseUrl: config.n8nBaseUrl || 'http://localhost:5678',
      apiKey: config.apiKey || null, // n8n API key for authentication
      webhookBaseUrl: config.webhookBaseUrl || 'http://localhost:5678/webhook',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      enablePhysicalBackup: config.enablePhysicalBackup || false,
      backupDirectory: config.backupDirectory || path.join(process.cwd(), 'backups'),
      ...config
    };

    // Initialize axios instance with default config
    this.client = axios.create({
      baseURL: this.config.n8nBaseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'X-N8N-API-KEY': this.config.apiKey })
      }
    });

    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[N8N] Making request to: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[N8N] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[N8N] Response received: ${response.status} from ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('[N8N] Response error:', error.response?.status, error.response?.data);
        return Promise.reject(error);
      }
    );
  }

  async createBackup(backupData) {
    const {
      originalPath,
      newPath,
      fileName,
      organizationMethod = 'ai-smart',
      workflowId = null,
      enablePhysicalBackup = this.config.enablePhysicalBackup
    } = backupData;

    try {
      // Generate unique backup ID
      const backupId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      
      // Get file metadata
      const fileStats = await this.getFileMetadata(originalPath);
      
      // Prepare backup path for physical backup if enabled
      let backupPath = null;
      if (enablePhysicalBackup) {
        backupPath = path.join(
          this.config.backupDirectory,
          `${backupId}_${fileName}`
        );
      }

      const payload = {
        id: backupId,
        original_path: originalPath,
        new_path: newPath,
        file_name: fileName,
        organization_method: organizationMethod,
        workflow_id: workflowId,
        backup_type: enablePhysicalBackup ? 'physical_copy' : 'metadata',
        backup_path: backupPath,
        file_size: fileStats.size,
        file_type: path.extname(fileName),
        checksum: fileStats.checksum,
        metadata: {
          created_at: fileStats.birthtime,
          modified_at: fileStats.mtime,
          accessed_at: fileStats.atime,
          permissions: fileStats.mode,
          ...fileStats.metadata
        }
      };

      console.log('[N8N] Creating backup record:', { backupId, fileName, organizationMethod });

      const response = await this.makeRequest(
        'POST',
        `${this.config.webhookBaseUrl}/backup-file`,
        payload
      );

      if (response.data.success) {
        console.log(`[N8N] ✅ Backup created successfully: ${backupId}`);
        return {
          success: true,
          backupId: response.data.backup_id,
          message: response.data.message
        };
      } else {
        throw new Error(response.data.error || 'Failed to create backup');
      }

    } catch (error) {
      console.error('[N8N] Failed to create backup:', error);
      throw new Error(`Backup creation failed: ${error.message}`);
    }
  }

  async restoreBackup(backupId) {
    try {
      console.log('[N8N] Restoring backup:', backupId);

      const response = await this.makeRequest(
        'POST',
        `${this.config.webhookBaseUrl}/restore-file`,
        { backup_id: backupId }
      );

      if (response.data.success) {
        console.log(`[N8N] ✅ Backup restored successfully: ${backupId}`);
        return {
          success: true,
          backupId: response.data.backup_id,
          fileName: response.data.file_name,
          restoredTo: response.data.restored_to,
          message: response.data.message
        };
      } else {
        throw new Error(response.data.error || 'Failed to restore backup');
      }

    } catch (error) {
      console.error('[N8N] Failed to restore backup:', error);
      
      if (error.response?.status === 404) {
        throw new Error('Backup record not found or already restored');
      } else if (error.response?.status === 500) {
        throw new Error(`Restore operation failed: ${error.response.data?.error || error.message}`);
      }
      
      throw new Error(`Backup restoration failed: ${error.message}`);
    }
  }

  async getBackupRecords(limit = 50) {
    try {
      console.log('[N8N] Fetching backup records...');

      const response = await this.makeRequest(
        'GET',
        `${this.config.webhookBaseUrl}/backup-records`,
        null,
        { limit }
      );

      console.log(`[N8N] ✅ Retrieved ${response.data.count} backup records`);
      return response.data.backups || [];

    } catch (error) {
      console.error('[N8N] Failed to get backup records:', error);
      throw new Error(`Failed to retrieve backup records: ${error.message}`);
    }
  }

  async restoreMultipleBackups(backupIds) {
    const results = [];
    
    for (const backupId of backupIds) {
      try {
        const result = await this.restoreBackup(backupId);
        results.push({ ...result, backupId });
      } catch (error) {
        results.push({ 
          success: false, 
          backupId, 
          error: error.message 
        });
      }
    }

    return {
      results,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length
    };
  }

  async getFileMetadata(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const data = await fs.readFile(filePath);
      const checksum = crypto.createHash('md5').update(data).digest('hex');

      return {
        size: stats.size,
        birthtime: stats.birthtime,
        mtime: stats.mtime,
        atime: stats.atime,
        mode: stats.mode,
        checksum,
        metadata: {
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          blocks: stats.blocks,
          blksize: stats.blksize
        }
      };
    } catch (error) {
      console.warn(`[N8N] Could not get metadata for ${filePath}:`, error.message);
      return {
        size: 0,
        birthtime: new Date(),
        mtime: new Date(),
        atime: new Date(),
        mode: 0,
        checksum: null,
        metadata: {}
      };
    }
  }

  async makeRequest(method, url, data = null, params = null) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const config = {
          method,
          url,
          ...(data && { data }),
          ...(params && { params })
        };

        const response = await this.client.request(config);
        return response;

      } catch (error) {
        lastError = error;
        
        if (attempt === this.config.retryAttempts) {
          break;
        }

        console.warn(`[N8N] Request failed (attempt ${attempt}/${this.config.retryAttempts}), retrying in ${this.config.retryDelay}ms...`);
        await this.delay(this.config.retryDelay);
      }
    }

    throw lastError;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async healthCheck() {
    try {
      const response = await this.client.get('/healthz');
      return {
        healthy: true,
        status: response.status,
        version: response.data?.version || 'unknown'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  async cleanup(olderThanDays = 30) {
    try {
      // This would require a custom n8n workflow or direct database access
      // For now, we'll use the webhook approach
      const response = await this.makeRequest(
        'POST',
        `${this.config.webhookBaseUrl}/cleanup-backups`,
        { older_than_days: olderThanDays }
      );

      return {
        success: true,
        deletedCount: response.data.deleted_count || 0
      };
    } catch (error) {
      console.error('[N8N] Cleanup failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = N8nBackupService; 