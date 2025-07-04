class NaturalLanguageRuleParser {
  constructor() {
    this.patterns = this.initializePatterns();
    this.timeUnits = {
      'day': 24 * 60 * 60 * 1000,
      'days': 24 * 60 * 60 * 1000,
      'week': 7 * 24 * 60 * 60 * 1000,
      'weeks': 7 * 24 * 60 * 60 * 1000,
      'month': 30 * 24 * 60 * 60 * 1000,
      'months': 30 * 24 * 60 * 60 * 1000,
      'year': 365 * 24 * 60 * 60 * 1000,
      'years': 365 * 24 * 60 * 60 * 1000
    };
  }

  initializePatterns() {
    return [
      // Move/Archive patterns
      {
        pattern: /move all (.*?) (?:files? )?(?:from (.*?) )?to (.*?)$/i,
        type: 'move',
        handler: (matches) => ({
          action: 'move',
          fileFilter: this.parseFileFilter(matches[1]),
          sourceLocation: matches[2] || 'any',
          targetLocation: matches[3]
        })
      },
      {
        pattern: /archive (.*?) (?:files? )?(?:older than|after) (\d+) (days?|weeks?|months?|years?)$/i,
        type: 'archive_by_age',
        handler: (matches) => ({
          action: 'archive',
          fileFilter: this.parseFileFilter(matches[1]),
          ageThreshold: parseInt(matches[2]) * this.timeUnits[matches[3].toLowerCase()],
          targetLocation: 'Archive'
        })
      },
      {
        pattern: /organize (.*?) (?:files? )?by (date|type|size|project)$/i,
        type: 'organize_by',
        handler: (matches) => ({
          action: 'organize',
          fileFilter: this.parseFileFilter(matches[1]),
          organizationMethod: matches[2].toLowerCase()
        })
      },
      // Sync patterns
      {
        pattern: /sync all (.*?) (?:files? )?to (google drive|dropbox|onedrive)$/i,
        type: 'cloud_sync',
        handler: (matches) => ({
          action: 'sync',
          fileFilter: this.parseFileFilter(matches[1]),
          cloudProvider: matches[2].toLowerCase().replace(' ', '-')
        })
      },
      // Delete/Clean patterns
      {
        pattern: /delete (?:all )?(.*?) (?:files? )?older than (\d+) (days?|weeks?|months?)$/i,
        type: 'delete_by_age',
        handler: (matches) => ({
          action: 'delete',
          fileFilter: this.parseFileFilter(matches[1]),
          ageThreshold: parseInt(matches[2]) * this.timeUnits[matches[3].toLowerCase()]
        })
      },
      // Notification patterns
      {
        pattern: /notify (?:me|team) when (.*?) (?:files? )?(?:are )?(added|created|modified|deleted)$/i,
        type: 'notification',
        handler: (matches) => ({
          action: 'notify',
          fileFilter: this.parseFileFilter(matches[1]),
          trigger: matches[2].toLowerCase()
        })
      },
      // Backup patterns
      {
        pattern: /backup (.*?) (?:files? )?(?:every|each) (day|week|month)$/i,
        type: 'scheduled_backup',
        handler: (matches) => ({
          action: 'backup',
          fileFilter: this.parseFileFilter(matches[1]),
          schedule: matches[2].toLowerCase()
        })
      },
      // Classification patterns
      {
        pattern: /classify (.*?) (?:files? )?as (.*?)$/i,
        type: 'classify',
        handler: (matches) => ({
          action: 'classify',
          fileFilter: this.parseFileFilter(matches[1]),
          classification: matches[2].toLowerCase()
        })
      }
    ];
  }

  parseFileFilter(filterText) {
    const filter = {
      extensions: [],
      keywords: [],
      classifications: [],
      sizeRange: null,
      dateRange: null
    };

    // Extension patterns
    const extMatches = filterText.match(/\b(\w+)\s+files?\b/gi);
    if (extMatches) {
      extMatches.forEach(match => {
        const ext = match.replace(/\s+files?/gi, '').toLowerCase();
        if (['pdf', 'doc', 'docx', 'jpg', 'png', 'mp4', 'txt', 'csv', 'xlsx'].includes(ext)) {
          filter.extensions.push(ext);
        }
      });
    }

    // Direct extensions like "PDFs", "images", etc.
    const directExtensions = {
      'pdfs': ['pdf'],
      'documents': ['pdf', 'doc', 'docx', 'txt'],
      'images': ['jpg', 'jpeg', 'png', 'gif', 'bmp'],
      'videos': ['mp4', 'avi', 'mov', 'mkv'],
      'photos': ['jpg', 'jpeg', 'png', 'raw', 'heic'],
      'spreadsheets': ['xlsx', 'xls', 'csv'],
      'presentations': ['ppt', 'pptx'],
      'archives': ['zip', 'rar', '7z', 'tar'],
      'code': ['js', 'py', 'java', 'cpp', 'html', 'css']
    };

    Object.entries(directExtensions).forEach(([key, extensions]) => {
      if (filterText.toLowerCase().includes(key)) {
        filter.extensions.push(...extensions);
      }
    });

    // Keywords
    const keywords = filterText.match(/containing ['"]([^'"]+)['"]/i);
    if (keywords) {
      filter.keywords.push(keywords[1]);
    }

    // Size patterns
    const sizeMatch = filterText.match(/(?:larger|bigger) than (\d+)(mb|gb|kb)/i);
    if (sizeMatch) {
      const size = parseInt(sizeMatch[1]);
      const unit = sizeMatch[2].toLowerCase();
      const multipliers = { kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
      filter.sizeRange = { min: size * multipliers[unit] };
    }

    // Classification patterns
    const classifications = ['work', 'personal', 'financial', 'temporary', 'important', 'media'];
    classifications.forEach(classification => {
      if (filterText.toLowerCase().includes(classification)) {
        filter.classifications.push(classification);
      }
    });

    return filter;
  }

  parseRule(ruleText) {
    console.log(`🧠 Parsing natural language rule: "${ruleText}"`);
    
    const normalizedRule = ruleText.trim().toLowerCase();
    
    for (const pattern of this.patterns) {
      const matches = normalizedRule.match(pattern.pattern);
      if (matches) {
        console.log(`✅ Matched pattern type: ${pattern.type}`);
        const parsedRule = {
          id: this.generateRuleId(),
          originalText: ruleText,
          type: pattern.type,
          ...pattern.handler(matches),
          enabled: true,
          createdAt: new Date().toISOString()
        };
        
        console.log('📋 Parsed rule:', parsedRule);
        return parsedRule;
      }
    }
    
    console.log('❌ No pattern matched for rule');
    throw new Error('Could not understand the rule. Please try rephrasing it.');
  }

  generateRuleId() {
    return 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Execute a parsed rule against a file
  async executeRule(rule, fileData) {
    try {
      // Check if file matches the rule's filter
      if (!this.fileMatchesFilter(fileData, rule.fileFilter)) {
        return { matches: false, reason: 'File does not match filter criteria' };
      }

      // Execute the action based on rule type
      switch (rule.action) {
        case 'move':
          return await this.executeMoveAction(rule, fileData);
        case 'archive':
          return await this.executeArchiveAction(rule, fileData);
        case 'organize':
          return await this.executeOrganizeAction(rule, fileData);
        case 'sync':
          return await this.executeSyncAction(rule, fileData);
        case 'delete':
          return await this.executeDeleteAction(rule, fileData);
        case 'notify':
          return await this.executeNotifyAction(rule, fileData);
        case 'backup':
          return await this.executeBackupAction(rule, fileData);
        case 'classify':
          return await this.executeClassifyAction(rule, fileData);
        default:
          throw new Error(`Unknown action: ${rule.action}`);
      }
    } catch (error) {
      console.error('❌ Error executing rule:', error);
      return { 
        matches: true, 
        success: false, 
        error: error.message 
      };
    }
  }

  fileMatchesFilter(fileData, filter) {
    const path = require('path');
    const fs = require('fs');
    
    // Check extensions
    if (filter.extensions.length > 0) {
      const fileExt = path.extname(fileData.filePath).slice(1).toLowerCase();
      if (!filter.extensions.includes(fileExt)) {
        return false;
      }
    }

    // Check keywords
    if (filter.keywords.length > 0) {
      const fileName = fileData.fileName.toLowerCase();
      const hasKeyword = filter.keywords.some(keyword => 
        fileName.includes(keyword.toLowerCase())
      );
      if (!hasKeyword) {
        return false;
      }
    }

    // Check classifications
    if (filter.classifications.length > 0) {
      if (!filter.classifications.includes(fileData.classification)) {
        return false;
      }
    }

    // Check size
    if (filter.sizeRange) {
      if (filter.sizeRange.min && fileData.fileSize < filter.sizeRange.min) {
        return false;
      }
      if (filter.sizeRange.max && fileData.fileSize > filter.sizeRange.max) {
        return false;
      }
    }

    // Check age for time-based rules
    if (filter.ageThreshold) {
      try {
        const stats = fs.statSync(fileData.filePath);
        const fileAge = Date.now() - stats.mtime.getTime();
        if (fileAge < filter.ageThreshold) {
          return false;
        }
      } catch (error) {
        console.warn('Could not check file age:', error);
      }
    }

    return true;
  }

  // Action execution methods
  async executeMoveAction(rule, fileData) {
    return {
      matches: true,
      success: true,
      action: 'move',
      targetPath: this.resolveTargetPath(rule.targetLocation, fileData),
      message: `File will be moved to ${rule.targetLocation}`
    };
  }

  async executeArchiveAction(rule, fileData) {
    const archivePath = this.resolveTargetPath('Archive', fileData);
    return {
      matches: true,
      success: true,
      action: 'archive',
      targetPath: archivePath,
      message: `File will be archived to ${archivePath}`
    };
  }

  async executeOrganizeAction(rule, fileData) {
    let organizedPath;
    
    switch (rule.organizationMethod) {
      case 'date':
        const date = new Date();
        organizedPath = `Organized/${date.getFullYear()}/${date.getMonth() + 1}`;
        break;
      case 'type':
        organizedPath = `Organized/${fileData.classification}`;
        break;
      case 'size':
        const sizeCategory = this.getFileSizeCategory(fileData.fileSize);
        organizedPath = `Organized/By Size/${sizeCategory}`;
        break;
      case 'project':
        organizedPath = this.detectProjectPath(fileData);
        break;
      default:
        organizedPath = 'Organized/Other';
    }

    return {
      matches: true,
      success: true,
      action: 'organize',
      targetPath: organizedPath,
      message: `File will be organized by ${rule.organizationMethod} to ${organizedPath}`
    };
  }

  async executeSyncAction(rule, fileData) {
    return {
      matches: true,
      success: true,
      action: 'sync',
      cloudProvider: rule.cloudProvider,
      message: `File will be synced to ${rule.cloudProvider}`
    };
  }

  async executeDeleteAction(rule, fileData) {
    return {
      matches: true,
      success: true,
      action: 'delete',
      message: 'File will be deleted (moved to trash)',
      warning: 'This action will permanently remove the file'
    };
  }

  async executeNotifyAction(rule, fileData) {
    return {
      matches: true,
      success: true,
      action: 'notify',
      trigger: rule.trigger,
      message: `Notification will be sent when file is ${rule.trigger}`
    };
  }

  async executeBackupAction(rule, fileData) {
    return {
      matches: true,
      success: true,
      action: 'backup',
      schedule: rule.schedule,
      message: `File will be backed up ${rule.schedule}ly`
    };
  }

  async executeClassifyAction(rule, fileData) {
    return {
      matches: true,
      success: true,
      action: 'classify',
      newClassification: rule.classification,
      message: `File will be classified as ${rule.classification}`
    };
  }

  // Helper methods
  resolveTargetPath(targetLocation, fileData) {
    const os = require('os');
    const path = require('path');
    
    const basePaths = {
      'documents': path.join(os.homedir(), 'Documents'),
      'downloads': path.join(os.homedir(), 'Downloads'),
      'desktop': path.join(os.homedir(), 'Desktop'),
      'archive': path.join(os.homedir(), 'Documents', 'Archive'),
      'organized': path.join(os.homedir(), 'Documents', 'Organized')
    };

    const normalizedTarget = targetLocation.toLowerCase();
    
    if (basePaths[normalizedTarget]) {
      return basePaths[normalizedTarget];
    }
    
    // Default to Documents if not recognized
    return path.join(os.homedir(), 'Documents', targetLocation);
  }

  getFileSizeCategory(fileSize) {
    if (fileSize < 1024 * 1024) return 'Small (< 1MB)';
    if (fileSize < 10 * 1024 * 1024) return 'Medium (1-10MB)';
    if (fileSize < 100 * 1024 * 1024) return 'Large (10-100MB)';
    return 'Very Large (> 100MB)';
  }

  detectProjectPath(fileData) {
    // Simple project detection based on file path patterns
    const pathParts = fileData.filePath.split('/');
    
    // Look for common project indicators
    const projectIndicators = ['project', 'proj', 'client', 'work'];
    
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i].toLowerCase();
      if (projectIndicators.some(indicator => part.includes(indicator))) {
        return `Projects/${pathParts[i]}`;
      }
    }
    
    return 'Projects/General';
  }

  // Validation methods
  validateRule(ruleText) {
    try {
      this.parseRule(ruleText);
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error.message,
        suggestions: this.getSuggestions(ruleText)
      };
    }
  }

  getSuggestions(ruleText) {
    return [
      'Try: "Move all PDFs to Documents"',
      'Try: "Archive images older than 30 days"',
      'Try: "Sync all work files to Google Drive"',
      'Try: "Organize documents by date"',
      'Try: "Delete temporary files older than 7 days"',
      'Try: "Notify me when important files are added"'
    ];
  }

  // Get rule examples for UI
  getRuleExamples() {
    return [
      {
        category: 'File Organization',
        examples: [
          'Move all PDFs to Documents',
          'Organize images by date',
          'Move work files to Work folder'
        ]
      },
      {
        category: 'Time-based Actions',
        examples: [
          'Archive files older than 30 days',
          'Delete temporary files older than 7 days',
          'Backup important files every week'
        ]
      },
      {
        category: 'Cloud Sync',
        examples: [
          'Sync all documents to Google Drive',
          'Sync photos to Dropbox',
          'Backup projects to OneDrive'
        ]
      },
      {
        category: 'Notifications',
        examples: [
          'Notify me when important files are added',
          'Alert team when project files are modified',
          'Send email when backup completes'
        ]
      }
    ];
  }
}

module.exports = { NaturalLanguageRuleParser }; 