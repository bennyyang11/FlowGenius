const OpenAI = require('openai');

class NaturalLanguageRuleService {
  constructor() {
    this.rules = new Map();
    this.initializeOpenAI();
  }

  initializeOpenAI() {
    // Try to get API key from multiple sources
    let apiKey = process.env.OPENAI_API_KEY;
    console.log('🔍 Checking for OpenAI API key...');
    console.log(`📝 Environment variable OPENAI_API_KEY: ${apiKey ? '✅ Found' : '❌ Not found'}`);
    
    // Try to load from config.json if env var not available
    if (!apiKey) {
      try {
        const configPath = require('path').join(process.cwd(), 'config.json');
        const config = JSON.parse(require('fs').readFileSync(configPath, 'utf8'));
        apiKey = config.api?.openai?.apiKey;
        console.log(`📝 Config.json API key: ${apiKey ? '✅ Found' : '❌ Not found'}`);
      } catch (error) {
        console.log('🔑 No config.json found or OpenAI API key not configured');
      }
    }
    
    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: apiKey || 'your-openai-api-key-here'
    });
    
    this.hasValidApiKey = apiKey && apiKey !== 'your-openai-api-key-here' && apiKey.startsWith('sk-');
    
    if (this.hasValidApiKey) {
      console.log('✅ Valid OpenAI API key configured! AI parsing enabled.');
    } else {
      console.log('⚠️ OpenAI API key not configured. AI parsing will fall back to pattern matching.');
      console.log('💡 To enable AI parsing:');
      console.log('   1. Add OPENAI_API_KEY=your-key-here to .env file');
      console.log('   2. Or copy config.example.json to config.json and add your key');
      console.log('   3. Make sure your API key starts with "sk-"');
      if (apiKey && !apiKey.startsWith('sk-')) {
        console.log(`   ⚠️ Current key format: ${apiKey.substring(0, 10)}... (should start with "sk-")`);
      }
    }
    
    // System prompt for rule parsing
    this.systemPrompt = `You are FlowGenius AI, an expert at understanding file management automation rules written in natural language.

Your job is to convert user's natural language file management rules into structured JSON format.

SUPPORTED ACTIONS:
- move: Move files to a location
- copy: Copy files to a location  
- delete: Delete files
- archive: Archive/compress files
- sync: Sync files to cloud storage
- organize: Organize files by type/date/etc
- backup: Create backups
- cleanup: Remove temp/empty files
- rename: Rename files
- classify: Categorize files
- notify: Send notifications

SUPPORTED FILE FILTERS:
- File types: PDFs, images, videos, documents, etc.
- File properties: size, age, name patterns
- Content-based: files containing text, metadata
- Location-based: from specific folders

SUPPORTED CONDITIONS:
- Age: older than X days/weeks/months
- Size: larger/smaller than X MB/GB
- Name: containing specific text
- Type: specific file extensions
- Empty: empty files/folders

OUTPUT FORMAT (JSON):
{
  "action": "action_name",
  "fileFilter": "description of what files to target",
  "targetLocation": "where to move/copy files (if applicable)",
  "conditions": {
    "age": { "value": number, "unit": "days|weeks|months", "operator": "older|newer" },
    "size": { "value": number, "unit": "MB|GB", "operator": "larger|smaller" },
    "name": "pattern to match",
    "type": "file extensions or types"
  },
  "schedule": "daily|weekly|monthly (if applicable)",
  "provider": "google drive|dropbox|onedrive (for sync)",
  "parameters": { "additional": "action-specific parameters" }
}

Examples:
"Move all PDFs to Documents" → {"action": "move", "fileFilter": "PDF files", "targetLocation": "Documents", "conditions": {"type": "pdf"}}
"Delete temp files older than 7 days" → {"action": "delete", "fileFilter": "temporary files", "conditions": {"age": {"value": 7, "unit": "days", "operator": "older"}}}
"Sync work files to Google Drive" → {"action": "sync", "fileFilter": "work files", "provider": "google drive"}

Always respond with valid JSON only.`;
  }

  async parseRule(ruleText) {
    console.log(`🧠 AI Parsing rule: "${ruleText}"`);
    
    // If no valid API key, use fallback immediately
    if (!this.hasValidApiKey) {
      console.log('🔄 No OpenAI API key available, using fallback parsing');
      return this.fallbackParse(ruleText);
    }
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: ruleText }
        ],
        temperature: 0.1,
        max_tokens: 500
      });

      const aiResponse = completion.choices[0].message.content.trim();
      console.log('🤖 AI Response:', aiResponse);
      
      // Parse the JSON response
      let parsedRule;
      try {
        parsedRule = JSON.parse(aiResponse);
      } catch (jsonError) {
        // If JSON parsing fails, try to extract JSON from the response
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedRule = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('AI response was not valid JSON');
        }
      }

      // Create the complete rule object
      const rule = {
        id: 'rule_' + Date.now(),
        originalText: ruleText,
        type: parsedRule.action,
        action: parsedRule.action,
        fileFilter: parsedRule.fileFilter,
        targetLocation: parsedRule.targetLocation,
        conditions: parsedRule.conditions || {},
        schedule: parsedRule.schedule,
        provider: parsedRule.provider,
        parameters: parsedRule.parameters || {},
        enabled: true,
        createdAt: new Date().toISOString(),
        aiGenerated: true
      };
      
      this.rules.set(rule.id, rule);
      console.log('✅ AI Rule parsed successfully:', rule);
      return rule;
      
    } catch (error) {
      console.error('❌ AI parsing failed:', error);
      
      // Fallback to basic pattern matching for simple cases
      return this.fallbackParse(ruleText);
    }
  }

  fallbackParse(ruleText) {
    console.log('🔄 Using fallback parsing for:', ruleText);
    
    const text = ruleText.toLowerCase().trim();
    
    // Basic patterns as fallback
    const patterns = [
      {
        pattern: /move.*?(\w+.*?) to (.*)/i,
        action: 'move',
        handler: (matches, original) => ({
          action: 'move',
          fileFilter: matches[1],
          targetLocation: matches[2]
        })
      },
      {
        pattern: /delete.*?(empty folders?|temp files?|.*? older than \d+)/i,
        action: 'delete',
        handler: (matches, original) => ({
          action: 'delete',
          fileFilter: matches[1] || 'specified files'
        })
      },
      {
        pattern: /sync.*?(.*?) to (google drive|dropbox|onedrive)/i,
        action: 'sync',
        handler: (matches, original) => ({
          action: 'sync',
          fileFilter: matches[1] || 'files',
          provider: matches[2]
        })
      },
      {
        pattern: /(archive|organize|cleanup|backup)/i,
        action: 'general',
        handler: (matches, original) => ({
          action: matches[1].toLowerCase(),
          fileFilter: 'files based on rule context'
        })
      }
    ];
    
    for (const pattern of patterns) {
      const matches = text.match(pattern.pattern);
      if (matches) {
        const baseRule = pattern.handler(matches, ruleText);
        return {
          id: 'rule_' + Date.now(),
          originalText: ruleText,
          type: baseRule.action,
          ...baseRule,
          enabled: true,
          createdAt: new Date().toISOString(),
          aiGenerated: false
        };
      }
    }
    
    throw new Error('Could not understand the rule. Please try rephrasing it or check your OpenAI API key.');
  }

  getAllRules() {
    return Array.from(this.rules.values());
  }

  executeRule(ruleId, fileData) {
    const rule = this.rules.get(ruleId);
    if (!rule) throw new Error('Rule not found');
    
    // Execute based on action type
    switch (rule.action) {
      case 'move':
        return this.executeMoveAction(rule, fileData);
      case 'copy':
        return this.executeCopyAction(rule, fileData);
      case 'delete':
        return this.executeDeleteAction(rule, fileData);
      case 'archive':
        return this.executeArchiveAction(rule, fileData);
      case 'sync':
        return this.executeSyncAction(rule, fileData);
      case 'organize':
        return this.executeOrganizeAction(rule, fileData);
      case 'backup':
        return this.executeBackupAction(rule, fileData);
      case 'cleanup':
        return this.executeCleanupAction(rule, fileData);
      case 'rename':
        return this.executeRenameAction(rule, fileData);
      case 'classify':
        return this.executeClassifyAction(rule, fileData);
      case 'notify':
        return this.executeNotifyAction(rule, fileData);
      default:
        return this.executeGenericAction(rule, fileData);
    }
  }

  executeMoveAction(rule, fileData) {
    return {
      success: true,
      action: 'move',
      targetPath: rule.targetLocation,
      conditions: rule.conditions,
      message: `Moving ${fileData.fileName} to ${rule.targetLocation}`,
      details: rule.fileFilter
    };
  }

  executeCopyAction(rule, fileData) {
    return {
      success: true,
      action: 'copy',
      targetPath: rule.targetLocation,
      conditions: rule.conditions,
      message: `Copying ${fileData.fileName} to ${rule.targetLocation}`,
      details: rule.fileFilter
    };
  }

  executeDeleteAction(rule, fileData) {
    return {
      success: true,
      action: 'delete',
      conditions: rule.conditions,
      message: `Deleting ${fileData.fileName} (${rule.fileFilter})`,
      details: rule.fileFilter,
      warning: 'This action cannot be undone'
    };
  }

  executeArchiveAction(rule, fileData) {
    const ageInfo = rule.conditions?.age ? 
      `older than ${rule.conditions.age.value} ${rule.conditions.age.unit}` : 
      'matching criteria';
    
    return {
      success: true,
      action: 'archive',
      conditions: rule.conditions,
      message: `Archiving ${fileData.fileName} (${ageInfo})`,
      details: rule.fileFilter
    };
  }

  executeSyncAction(rule, fileData) {
    return {
      success: true,
      action: 'sync',
      provider: rule.provider,
      conditions: rule.conditions,
      message: `Syncing ${fileData.fileName} to ${rule.provider}`,
      details: rule.fileFilter
    };
  }

  executeOrganizeAction(rule, fileData) {
    return {
      success: true,
      action: 'organize',
      conditions: rule.conditions,
      message: `Organizing ${fileData.fileName} (${rule.fileFilter})`,
      details: rule.fileFilter
    };
  }

  executeBackupAction(rule, fileData) {
    return {
      success: true,
      action: 'backup',
      schedule: rule.schedule,
      conditions: rule.conditions,
      message: `Creating backup of ${fileData.fileName}`,
      details: rule.fileFilter
    };
  }

  executeCleanupAction(rule, fileData) {
    return {
      success: true,
      action: 'cleanup',
      conditions: rule.conditions,
      message: `Cleaning up ${fileData.fileName} (${rule.fileFilter})`,
      details: rule.fileFilter
    };
  }

  executeRenameAction(rule, fileData) {
    return {
      success: true,
      action: 'rename',
      conditions: rule.conditions,
      parameters: rule.parameters,
      message: `Renaming ${fileData.fileName} based on rule`,
      details: rule.fileFilter
    };
  }

  executeClassifyAction(rule, fileData) {
    return {
      success: true,
      action: 'classify',
      conditions: rule.conditions,
      message: `Classifying ${fileData.fileName} (${rule.fileFilter})`,
      details: rule.fileFilter
    };
  }

  executeNotifyAction(rule, fileData) {
    return {
      success: true,
      action: 'notify',
      conditions: rule.conditions,
      message: `Notification rule active for ${fileData.fileName}`,
      details: rule.fileFilter
    };
  }

  executeGenericAction(rule, fileData) {
    return {
      success: true,
      action: rule.action,
      conditions: rule.conditions,
      message: `Executing ${rule.action} on ${fileData.fileName}`,
      details: rule.fileFilter
    };
  }

  getRuleExamples() {
    return [
      // Basic file operations
      'Move all PDFs to Documents folder',
      'Copy all images to Photos backup',
      'Delete all empty folders',
      
      // Time-based rules
      'Archive files older than 30 days',
      'Delete temp files older than 1 week',
      'Backup documents created today',
      
      // Cloud sync rules
      'Sync all work files to Google Drive',
      'Upload photos to Dropbox automatically',
      'Backup important documents to OneDrive',
      
      // Organization rules
      'Organize downloads by file type',
      'Sort music files by artist and album',
      'Group photos by date taken',
      
      // Cleanup rules
      'Remove duplicate files',
      'Clean up cache files',
      'Delete files larger than 1GB from Downloads',
      
      // Advanced rules
      'Move screenshots to Desktop/Screenshots folder',
      'Rename files with today\'s date',
      'Classify documents by content type',
      'Notify when large files are downloaded'
    ];
  }
}

module.exports = { NaturalLanguageRuleService }; 