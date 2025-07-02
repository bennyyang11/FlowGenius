const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const N8nBackupService = require('../services/n8nBackupService');

class WorkflowOrchestrator extends EventEmitter {
  constructor(aiService, n8nConfig = {}) {
    super();
    this.aiService = aiService;
    this.workflows = new Map();
    this.activeWorkflows = new Set();
    this.workflowHistory = [];
    this.rules = [];
    
    // Initialize n8n backup service
    this.n8nBackupService = new N8nBackupService(n8nConfig);
    this.useN8nBackup = n8nConfig.enabled !== false; // Default to true if config provided
    
    // Fallback to in-memory storage if n8n is not available
    this.backupRecords = []; // Store backup records for undo functionality (fallback)
    
    // Configuration
    this.config = {
      autoOrganizeEnabled: true,
      createDirectories: true,
      backupBeforeMove: true,
      maxBackupFiles: 100,
      dryRun: false // Set to true for testing
    };
  }

  async initialize() {
    // Load default organization rules
    this.loadDefaultRules();
    
    // Set up N8N workflow templates
    await this.setupN8NWorkflows();
    
    console.log('Workflow Orchestrator initialized');
  }

  loadDefaultRules() {
    this.rules = [
      {
        id: 'downloads-cleanup',
        name: 'Downloads Cleanup',
        description: 'Auto-organize downloads folder',
        trigger: {
          type: 'file-added',
          directory: path.join(require('os').homedir(), 'Downloads')
        },
        conditions: [
          { field: 'confidence', operator: '>', value: 0.7 },
          { field: 'classification', operator: 'in', value: ['document', 'media', 'archive'] }
        ],
        actions: [
          { type: 'move-file', target: 'suggested-location' },
          { type: 'add-tags', tags: 'auto-organized' }
        ],
        enabled: true
      },
      {
        id: 'temp-file-cleanup',
        name: 'Temporary File Cleanup',
        description: 'Delete temporary files older than 24 hours',
        trigger: {
          type: 'scheduled',
          schedule: '0 2 * * *' // Daily at 2 AM
        },
        conditions: [
          { field: 'classification', operator: '==', value: 'temporary' },
          { field: 'age', operator: '>', value: 86400000 } // 24 hours in ms
        ],
        actions: [
          { type: 'delete-file' }
        ],
        enabled: true
      },
      {
        id: 'duplicate-detection',
        name: 'Duplicate File Detection',
        description: 'Detect and handle duplicate files',
        trigger: {
          type: 'file-added'
        },
        conditions: [
          { field: 'confidence', operator: '>', value: 0.8 }
        ],
        actions: [
          { type: 'check-duplicates' },
          { type: 'suggest-duplicate-action' }
        ],
        enabled: true
      }
    ];
  }

  async setupN8NWorkflows() {
    // Define N8N workflow templates
    const workflows = {
      'file-organization': {
        name: 'File Organization Workflow',
        description: 'Automated file organization based on AI analysis',
        nodes: [
          {
            name: 'File Trigger',
            type: 'n8n-nodes-base.webhook',
            parameters: {
              path: 'file-added',
              httpMethod: 'POST'
            }
          },
          {
            name: 'Analyze File',
            type: 'n8n-nodes-base.function',
            parameters: {
              functionCode: this.getAnalyzeFileFunction()
            }
          },
          {
            name: 'Decision Node',
            type: 'n8n-nodes-base.if',
            parameters: {
              conditions: {
                number: [
                  {
                    value1: '={{$json["confidence"]}}',
                    operation: 'larger',
                    value2: 0.7
                  }
                ]
              }
            }
          },
          {
            name: 'Move File',
            type: 'n8n-nodes-base.function',
            parameters: {
              functionCode: this.getMoveFileFunction()
            }
          },
          {
            name: 'Update Database',
            type: 'n8n-nodes-base.function',
            parameters: {
              functionCode: this.getUpdateDatabaseFunction()
            }
          }
        ],
        connections: {
          'File Trigger': {
            main: [['Analyze File']]
          },
          'Analyze File': {
            main: [['Decision Node']]
          },
          'Decision Node': {
            main: [
              ['Move File'],
              []
            ]
          },
          'Move File': {
            main: [['Update Database']]
          }
        }
      }
    };

    this.workflows = new Map(Object.entries(workflows));
  }

  getAnalyzeFileFunction() {
    return `
      // Analyze file using AI service
      const filePath = items[0].json.filePath;
      
      // Call AI analysis (this would be replaced with actual API call)
      const analysis = await this.helpers.httpRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/analyze-file',
        body: { filePath },
        json: true
      });
      
      return [analysis];
    `;
  }

  getMoveFileFunction() {
    return `
      const fs = require('fs').promises;
      const path = require('path');
      
      const analysis = items[0].json;
      const sourcePath = analysis.filePath;
      const targetPath = analysis.organizationSuggestion.fullPath;
      
      try {
        // Create target directory if it doesn't exist
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        
        // Move file
        await fs.rename(sourcePath, targetPath);
        
        return [{
          json: {
            success: true,
            sourcePath,
            targetPath,
            timestamp: new Date()
          }
        }];
      } catch (error) {
        return [{
          json: {
            success: false,
            error: error.message,
            sourcePath,
            targetPath
          }
        }];
      }
    `;
  }

  getUpdateDatabaseFunction() {
    return `
      // Update local database with file organization record
      const moveResult = items[0].json;
      
      // This would update your local database/store
      console.log('File organization completed:', moveResult);
      
      return [moveResult];
    `;
  }

  async handleFileAnalysis({ filePath, analysis, autoOrganize = false, isDemoMode = false, demoDirectory = null, organizationMethod = 'ai-smart' }) {
    const workflowId = `organize-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`Starting workflow ${workflowId} for file: ${path.basename(filePath)} using ${organizationMethod} method`);
    
    try {
      this.activeWorkflows.add(workflowId);
      
      // Check if file should be auto-organized
      if (autoOrganize && this.config.autoOrganizeEnabled) {
        await this.executeAutoOrganization(filePath, analysis, workflowId, isDemoMode, demoDirectory, organizationMethod);
      } else {
        // Just log the suggestion for manual review
        this.logOrganizationSuggestion(filePath, analysis, workflowId);
      }
      
      // Record workflow completion
      this.recordWorkflowExecution(workflowId, filePath, analysis, autoOrganize);
      
    } catch (error) {
      console.error(`Workflow ${workflowId} failed:`, error);
      this.emit('workflow-error', { workflowId, filePath, error });
    } finally {
      this.activeWorkflows.delete(workflowId);
    }
  }

  async executeAutoOrganization(filePath, analysis, workflowId, isDemoMode = false, demoDirectory = null, organizationMethod = 'ai-smart') {
    const { organizationSuggestion } = analysis;
    
    if (!organizationSuggestion || !organizationSuggestion.fullPath) {
      console.log(`No organization suggestion for ${path.basename(filePath)}`);
      return;
    }

    const fileName = path.basename(filePath);
    let targetDir, finalTargetPath;

    // Handle demo mode differently - organize within demo directory
    if (isDemoMode && demoDirectory) {
      // Create organized folders within demo directory based on organization method
      const organizationFolder = this.getOrganizationFolder(analysis, organizationMethod);
      targetDir = path.join(demoDirectory, 'Organized', organizationFolder);
      finalTargetPath = path.join(targetDir, fileName);
      
      console.log(`[DEMO MODE] Organizing ${fileName} to demo folder: ${organizationFolder} (${organizationMethod})`);
    } else {
      // Normal organization to suggested location
      targetDir = path.dirname(organizationSuggestion.fullPath);
      finalTargetPath = path.join(targetDir, fileName);
      console.log(`Auto-organizing ${fileName} to ${finalTargetPath} using ${organizationMethod}`);
    }

    if (this.config.dryRun) {
      console.log(`[DRY RUN] Would move ${filePath} to ${finalTargetPath}`);
      return;
    }

    try {
      // Create target directory if needed
      if (this.config.createDirectories) {
        await fs.mkdir(targetDir, { recursive: true });
      }

      // Check if target file already exists
      let actualTargetPath = finalTargetPath;
      let counter = 1;
      
      while (await this.fileExists(actualTargetPath)) {
        const ext = path.extname(fileName);
        const name = path.basename(fileName, ext);
        actualTargetPath = path.join(targetDir, `${name}_${counter}${ext}`);
        counter++;
      }

      // Backup original file location if configured
      if (this.config.backupBeforeMove) {
        await this.createBackupRecord(filePath, actualTargetPath, workflowId, organizationMethod);
      }

      // Move the file
      await fs.rename(filePath, actualTargetPath);
      
      const logMessage = isDemoMode ? 
        `[DEMO] Successfully organized ${fileName} into ${path.basename(targetDir)} folder` :
        `Successfully moved ${fileName} to ${actualTargetPath}`;
      console.log(logMessage);
      
      this.emit('file-organized', {
        workflowId,
        originalPath: filePath,
        newPath: actualTargetPath,
        analysis,
        isDemoMode,
        organizationFolder: isDemoMode ? path.basename(targetDir) : null,
        timestamp: new Date()
      });

    } catch (error) {
      console.error(`Failed to organize file ${filePath}:`, error);
      throw error;
    }
  }

  getDemoOrganizationFolder(classification) {
    const folderMap = {
      'document': '📄 Documents',
      'code': '💻 Code Files',
      'media': '🖼️ Media',
      'work': '💼 Work Files',
      'personal': '👤 Personal',
      'financial': '💰 Financial',
      'educational': '📚 Educational',
      'archive': '📦 Archives',
      'temporary': '🗂️ Temporary',
      'misc': '📁 Miscellaneous'
    };
    
    return folderMap[classification] || '📁 Miscellaneous';
  }

  logOrganizationSuggestion(filePath, analysis, workflowId) {
    const suggestion = {
      workflowId,
      filePath,
      fileName: path.basename(filePath),
      classification: analysis.classification,
      confidence: analysis.confidence,
      tags: analysis.tags,
      suggestion: analysis.organizationSuggestion,
      timestamp: new Date(),
      status: 'pending-review'
    };

    console.log('Organization suggestion:', suggestion);
    
    this.emit('organization-suggestion', suggestion);
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async createBackupRecord(originalPath, newPath, workflowId = null, organizationMethod = 'ai-smart') {
    if (this.useN8nBackup) {
      try {
        // Use n8n backup service
        const result = await this.n8nBackupService.createBackup({
          originalPath,
          newPath,
          fileName: path.basename(originalPath),
          workflowId,
          organizationMethod
        });

        console.log('N8n backup record created:', result);
        return result.backupId;

      } catch (error) {
        console.warn('N8n backup failed, falling back to in-memory storage:', error.message);
        // Fall back to in-memory storage
        this.useN8nBackup = false;
      }
    }

    // Fallback to in-memory storage
    const backupRecord = {
      id: Date.now().toString(),
      originalPath,
      newPath,
      fileName: path.basename(originalPath),
      workflowId,
      organizationMethod,
      timestamp: new Date(),
      canRestore: true,
      isRestored: false
    };

    // Store backup record for undo functionality
    this.backupRecords.unshift(backupRecord); // Add to beginning for recent-first order
    
    // Keep only last 100 backup records
    if (this.backupRecords.length > this.config.maxBackupFiles) {
      this.backupRecords = this.backupRecords.slice(0, this.config.maxBackupFiles);
    }

    console.log('Backup record created (fallback):', backupRecord);
    return backupRecord.id;
  }

  recordWorkflowExecution(workflowId, filePath, analysis, autoOrganized) {
    const record = {
      workflowId,
      filePath,
      fileName: path.basename(filePath),
      classification: analysis.classification,
      confidence: analysis.confidence,
      autoOrganized,
      timestamp: new Date(),
      success: true
    };

    this.workflowHistory.push(record);
    
    // Keep only last 1000 records
    if (this.workflowHistory.length > 1000) {
      this.workflowHistory = this.workflowHistory.slice(-1000);
    }
  }

  async organizeFiles(options) {
    const { files, targetDirectory, organizationMethod, sourceDirectory, organizeAll } = options;
    const results = [];

    // Detect if this is demo mode by checking if source directory contains "FlowGenius-Demo"
    const isDemoMode = sourceDirectory && sourceDirectory.includes('FlowGenius-Demo');
    
    console.log(`Organizing ${files.length} files using method: ${organizationMethod}${isDemoMode ? ' [DEMO MODE]' : ''}`);

    for (const filePath of files) {
      try {
        let analysis;
        
        // For AI-based methods, we need full analysis
        if (organizationMethod === 'ai-smart' || organizationMethod === 'by-project') {
          analysis = await this.aiService.analyzeFile(filePath);
        } else {
          // For non-AI methods, create basic analysis with organization suggestion
          analysis = await this.createBasicAnalysis(filePath, organizationMethod, sourceDirectory);
        }
        
        await this.handleFileAnalysis({
          filePath,
          analysis,
          autoOrganize: true,
          isDemoMode,
          demoDirectory: isDemoMode ? sourceDirectory : null,
          organizationMethod
        });

        results.push({
          filePath,
          success: true,
          analysis,
          organizationMethod
        });

      } catch (error) {
        console.error(`Failed to organize file ${filePath}:`, error);
        results.push({
          filePath,
          success: false,
          error: error.message
        });
      }
    }

    return {
      success: true,
      results,
      totalFiles: files.length,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length,
      isDemoMode,
      organizationMethod
    };
  }

  // Configuration methods
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('Workflow configuration updated:', this.config);
  }

  getConfig() {
    return { ...this.config };
  }

  // Workflow status methods
  getActiveWorkflows() {
    return Array.from(this.activeWorkflows);
  }

  getWorkflowHistory() {
    return [...this.workflowHistory];
  }

  // Rule management
  addRule(rule) {
    this.rules.push({ ...rule, id: rule.id || Date.now().toString() });
  }

  removeRule(ruleId) {
    this.rules = this.rules.filter(rule => rule.id !== ruleId);
  }

  getRules() {
    return [...this.rules];
  }

  // Organization method handlers
  async createBasicAnalysis(filePath, organizationMethod, sourceDirectory) {
    const fs = require('fs').promises;
    const fileName = path.basename(filePath);
    const fileExtension = path.extname(filePath).toLowerCase();
    
    try {
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;
      const created = stats.birthtime;
      const modified = stats.mtime;
      
      // Basic file classification based on extension
      const classification = this.getFileTypeClassification(fileExtension);
      
      // Generate organization suggestion based on method
      const organizationSuggestion = this.generateOrganizationSuggestion(
        filePath, 
        organizationMethod, 
        { fileName, fileExtension, fileSize, created, modified, classification },
        sourceDirectory
      );
      
      return {
        fileName,
        fileExtension,
        fileSize,
        classification,
        confidence: 0.85, // Static confidence for non-AI methods
        tags: [organizationMethod, classification],
        organizationSuggestion,
        timestamp: new Date(),
        isAIAnalysis: false,
        organizationMethod
      };
    } catch (error) {
      console.error('Failed to create basic analysis:', error);
      throw error;
    }
  }

  getFileTypeClassification(extension) {
    const typeMap = {
      // Documents
      '.pdf': 'document', '.doc': 'document', '.docx': 'document', '.txt': 'document', 
      '.rtf': 'document', '.odt': 'document', '.pages': 'document', '.md': 'document',
      
      // Images
      '.jpg': 'media', '.jpeg': 'media', '.png': 'media', '.gif': 'media', 
      '.bmp': 'media', '.tiff': 'media', '.svg': 'media', '.webp': 'media',
      
      // Videos
      '.mp4': 'media', '.avi': 'media', '.mov': 'media', '.mkv': 'media', 
      '.wmv': 'media', '.flv': 'media', '.webm': 'media',
      
      // Audio
      '.mp3': 'media', '.wav': 'media', '.flac': 'media', '.aac': 'media', 
      '.ogg': 'media', '.m4a': 'media',
      
      // Code
      '.js': 'code', '.py': 'code', '.java': 'code', '.cpp': 'code', '.c': 'code',
      '.html': 'code', '.css': 'code', '.php': 'code', '.rb': 'code', '.go': 'code',
      
      // Archives
      '.zip': 'archive', '.rar': 'archive', '.7z': 'archive', '.tar': 'archive', 
      '.gz': 'archive', '.bz2': 'archive',
      
      // Spreadsheets
      '.xls': 'document', '.xlsx': 'document', '.csv': 'document', '.ods': 'document',
      
      // Presentations
      '.ppt': 'document', '.pptx': 'document', '.odp': 'document', '.key': 'document'
    };
    
    return typeMap[extension] || 'misc';
  }

  generateOrganizationSuggestion(filePath, method, fileInfo, sourceDirectory) {
    const { fileName, fileExtension, fileSize, created, modified, classification } = fileInfo;
    const baseDir = sourceDirectory || path.dirname(filePath);
    
    let targetPath;
    let reasoning;
    
    switch (method) {
      case 'by-type':
        const typeFolder = this.getTypeFolderName(classification);
        targetPath = path.join(baseDir, 'Organized', 'By Type', typeFolder, fileName);
        reasoning = `Grouped with other ${classification} files for easy access`;
        break;
        
      case 'by-date':
        const dateFolder = this.getDateFolderName(created);
        targetPath = path.join(baseDir, 'Organized', 'By Date', dateFolder, fileName);
        reasoning = `Organized by creation date for chronological access`;
        break;
        
      case 'by-modified':
        const modifiedFolder = this.getDateFolderName(modified);
        targetPath = path.join(baseDir, 'Organized', 'By Modified', modifiedFolder, fileName);
        reasoning = `Organized by last modified date for recent file access`;
        break;
        
      case 'by-size':
        const sizeFolder = this.getSizeFolderName(fileSize);
        targetPath = path.join(baseDir, 'Organized', 'By Size', sizeFolder, fileName);
        reasoning = `Grouped by file size for storage management`;
        break;
        
      case 'alphabetical':
        const letterFolder = fileName.charAt(0).toUpperCase();
        targetPath = path.join(baseDir, 'Organized', 'Alphabetical', letterFolder, fileName);
        reasoning = `Sorted alphabetically for quick name-based lookup`;
        break;
        
      case 'by-source':
        const sourceFolder = this.getSourceFolderName(sourceDirectory);
        targetPath = path.join(baseDir, 'Organized', 'By Source', sourceFolder, fileName);
        reasoning = `Organized by original source location`;
        break;
        
      case 'by-project':
        // This would use AI analysis, but for fallback
        const projectFolder = this.guessProjectCategory(fileName, classification);
        targetPath = path.join(baseDir, 'Organized', 'By Project', projectFolder, fileName);
        reasoning = `Categorized by detected project type`;
        break;
        
      default: // ai-smart
        targetPath = path.join(baseDir, 'Organized', 'AI Organized', classification, fileName);
        reasoning = `AI-suggested organization based on content analysis`;
    }
    
    return {
      fullPath: targetPath,
      relativePath: path.relative(baseDir, targetPath),
      reasoning,
      method
    };
  }

  getOrganizationFolder(analysis, method) {
    const { classification, fileName, organizationSuggestion } = analysis;
    
    switch (method) {
      case 'by-type':
        return `📁 ${this.getTypeFolderName(classification)}`;
        
      case 'by-date':
        const date = analysis.created || new Date();
        return `📅 ${this.getDateFolderName(date)}`;
        
      case 'by-modified':
        const modified = analysis.modified || new Date();
        return `🕒 ${this.getDateFolderName(modified)}`;
        
      case 'by-size':
        const size = analysis.fileSize || 0;
        return `📏 ${this.getSizeFolderName(size)}`;
        
      case 'alphabetical':
        const letter = fileName.charAt(0).toUpperCase();
        return `🔤 ${letter}`;
        
      case 'by-source':
        return `📍 Downloads`; // Simplified for demo
        
      case 'by-project':
        const project = this.guessProjectCategory(fileName, classification);
        return `🎯 ${project}`;
        
      default: // ai-smart
        return `🧠 ${this.getDemoOrganizationFolder(classification)}`;
    }
  }

  getTypeFolderName(classification) {
    const typeNames = {
      'document': 'Documents',
      'media': 'Media Files',
      'code': 'Code & Scripts',
      'archive': 'Archives',
      'misc': 'Miscellaneous'
    };
    return typeNames[classification] || 'Other Files';
  }

  getDateFolderName(date) {
    const now = new Date();
    const fileDate = new Date(date);
    const diffDays = Math.floor((now - fileDate) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays <= 7) return 'This Week';
    if (diffDays <= 30) return 'This Month';
    if (diffDays <= 365) return 'This Year';
    return 'Older Files';
  }

  getSizeFolderName(bytes) {
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return 'Small Files (< 1MB)';
    if (mb < 50) return 'Medium Files (1-50MB)';
    if (mb < 500) return 'Large Files (50-500MB)';
    return 'Very Large Files (> 500MB)';
  }

  getSourceFolderName(sourcePath) {
    if (!sourcePath) return 'Unknown Source';
    if (sourcePath.includes('Downloads')) return 'Downloads';
    if (sourcePath.includes('Desktop')) return 'Desktop';
    if (sourcePath.includes('Documents')) return 'Documents';
    return 'Other Sources';
  }

  guessProjectCategory(fileName, classification) {
    const name = fileName.toLowerCase();
    
    if (name.includes('work') || name.includes('business') || name.includes('office')) {
      return 'Work & Business';
    }
    if (name.includes('personal') || name.includes('family') || name.includes('home')) {
      return 'Personal';
    }
    if (name.includes('creative') || name.includes('art') || name.includes('design')) {
      return 'Creative Projects';
    }
    if (name.includes('study') || name.includes('learn') || name.includes('education')) {
      return 'Education';
    }
    
    // Fallback based on classification
    switch (classification) {
      case 'code': return 'Development';
      case 'media': return 'Creative Projects';
      case 'document': return 'Work & Business';
      default: return 'General';
    }
  }

  // Undo functionality methods
  async getBackupRecords(limit = 50) {
    if (this.useN8nBackup) {
      try {
        // Use n8n backup service
        const records = await this.n8nBackupService.getBackupRecords(limit);
        console.log(`Retrieved ${records.length} backup records from n8n`);
        return records;

      } catch (error) {
        console.warn('Failed to get backup records from n8n, falling back to in-memory:', error.message);
        this.useN8nBackup = false;
      }
    }

    // Fallback to in-memory storage
    return this.backupRecords
      .filter(record => record.canRestore && !record.isRestored)
      .slice(0, limit)
      .map(record => ({
        ...record,
        timeAgo: this.getTimeAgo(record.timestamp)
      }));
  }

  async undoOrganization(backupId) {
    if (this.useN8nBackup) {
      try {
        // Use n8n backup service
        const result = await this.n8nBackupService.restoreBackup(backupId);
        
        console.log(`✅ N8n undid organization: ${result.fileName} restored to ${result.restoredTo}`);
        
        // Emit undo event
        this.emit('organization-undone', {
          backupId: result.backupId,
          fileName: result.fileName,
          originalPath: result.restoredTo,
          newPath: null, // Not provided by n8n response
          organizationMethod: null, // Not provided by n8n response
          timestamp: new Date()
        });

        return {
          success: true,
          fileName: result.fileName,
          restoredTo: result.restoredTo,
          organizationMethod: null
        };

      } catch (error) {
        console.warn('N8n undo failed, falling back to in-memory:', error.message);
        this.useN8nBackup = false;
        // Continue to fallback logic below
      }
    }

    // Fallback to in-memory storage
    const backupRecord = this.backupRecords.find(record => record.id === backupId);
    
    if (!backupRecord) {
      throw new Error('Backup record not found');
    }
    
    if (backupRecord.isRestored) {
      throw new Error('This organization has already been undone');
    }
    
    if (!backupRecord.canRestore) {
      throw new Error('This organization cannot be undone');
    }

    // Check if the file still exists at the new location
    const fileExistsAtNew = await this.fileExists(backupRecord.newPath);
    if (!fileExistsAtNew) {
      throw new Error('File no longer exists at the organized location');
    }

    // Check if the original location is available
    const originalExists = await this.fileExists(backupRecord.originalPath);
    if (originalExists) {
      throw new Error('A file already exists at the original location');
    }

    try {
      // Move file back to original location
      await fs.rename(backupRecord.newPath, backupRecord.originalPath);
      
      // Mark as restored
      backupRecord.isRestored = true;
      backupRecord.restoredAt = new Date();
      
      console.log(`✅ Undid organization (fallback): ${backupRecord.fileName} restored to ${backupRecord.originalPath}`);
      
      // Emit undo event
      this.emit('organization-undone', {
        backupId: backupRecord.id,
        fileName: backupRecord.fileName,
        originalPath: backupRecord.originalPath,
        newPath: backupRecord.newPath,
        organizationMethod: backupRecord.organizationMethod,
        timestamp: new Date()
      });

      return {
        success: true,
        fileName: backupRecord.fileName,
        restoredTo: backupRecord.originalPath,
        organizationMethod: backupRecord.organizationMethod
      };

    } catch (error) {
      console.error(`Failed to undo organization for ${backupRecord.fileName}:`, error);
      throw new Error(`Failed to restore file: ${error.message}`);
    }
  }

  async undoMultipleOrganizations(backupIds) {
    if (this.useN8nBackup) {
      try {
        // Use n8n backup service for batch restore
        const result = await this.n8nBackupService.restoreMultipleBackups(backupIds);
        console.log(`N8n batch undo completed: ${result.successCount} successes, ${result.failureCount} failures`);
        return result;

      } catch (error) {
        console.warn('N8n batch undo failed, falling back to individual restores:', error.message);
        // Fall through to individual undo calls below
      }
    }

    // Fallback: Individual undo operations
    const results = [];
    
    for (const backupId of backupIds) {
      try {
        const result = await this.undoOrganization(backupId);
        results.push({ ...result, backupId });
      } catch (error) {
        results.push({ 
          success: false, 
          backupId, 
          error: error.message 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    return {
      success: true,
      results,
      successCount,
      failureCount,
      message: `Processed ${backupIds.length} files: ${successCount} succeeded, ${failureCount} failed`
    };
  }

  getTimeAgo(timestamp) {
    const now = new Date();
    const diffMs = now - new Date(timestamp);
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  clearOldBackupRecords(olderThanDays = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const originalLength = this.backupRecords.length;
    this.backupRecords = this.backupRecords.filter(record => 
      new Date(record.timestamp) > cutoffDate
    );
    
    const removed = originalLength - this.backupRecords.length;
    if (removed > 0) {
      console.log(`Cleaned up ${removed} old backup records`);
    }
    
    return removed;
  }

  // Cleanup methods
  async cleanup() {
    console.log('Cleaning up workflow orchestrator...');
    
    // Stop all active workflows
    this.activeWorkflows.clear();
    
    // Clean up old history
    this.workflowHistory = this.workflowHistory.slice(-100);
    
    // Clean up old backup records
    this.clearOldBackupRecords();
    
    console.log('Workflow orchestrator cleanup completed');
  }
}

module.exports = { WorkflowOrchestrator }; 