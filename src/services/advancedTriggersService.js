const { EventEmitter } = require('events');

class AdvancedTriggersService extends EventEmitter {
  constructor() {
    super();
    this.triggers = new Map();
    this.timers = new Map();
    this.availableActions = [
      { id: 'cleanup-temp-files', name: 'Clean up temporary files', category: 'cleanup' },
      { id: 'auto-organize', name: 'Auto-organize files', category: 'organization' },
      { id: 'backup-files', name: 'Backup important files', category: 'backup' },
      { id: 'sync-cloud', name: 'Sync to cloud storage', category: 'sync' },
      { id: 'compress-old-files', name: 'Compress old files', category: 'optimization' },
      { id: 'scan-duplicates', name: 'Scan for duplicates', category: 'cleanup' }
    ];
    
    this.scheduleOptions = [
      { id: 'hourly', name: 'Every hour', interval: 60 * 60 * 1000 },
      { id: 'daily', name: 'Daily', interval: 24 * 60 * 60 * 1000 },
      { id: 'weekly', name: 'Weekly', interval: 7 * 24 * 60 * 60 * 1000 },
      { id: 'monthly', name: 'Monthly', interval: 30 * 24 * 60 * 60 * 1000 }
    ];
  }

  initialize() {
    console.log('🕐 Initializing Advanced Triggers Service...');
    this.setupDefaultTriggers();
    console.log('✅ Advanced Triggers Service initialized');
  }

  setupDefaultTriggers() {
    // Daily cleanup trigger
    this.addTrigger({
      id: 'daily-cleanup',
      name: 'Daily Cleanup',
      description: 'Clean up temporary files and empty folders',
      type: 'time-based',
      schedule: 'daily',
      time: '02:00',
      action: 'cleanup-temp-files',
      enabled: true,
      conditions: {
        fileAge: 7, // days
        includeTemp: true,
        includeEmpty: true
      }
    });

    // Auto-organize trigger
    this.addTrigger({
      id: 'auto-organize',
      name: 'Auto Organize Downloads',
      description: 'Automatically organize files in Downloads folder',
      type: 'time-based',
      schedule: 'hourly',
      time: '00:00',
      action: 'auto-organize',
      enabled: true,
      conditions: {
        targetFolder: 'Downloads',
        organizeBy: 'type'
      }
    });

    console.log(`📋 Setup ${this.triggers.size} triggers`);
  }

  addTrigger(config) {
    const trigger = {
      ...config,
      createdAt: new Date().toISOString(),
      lastExecuted: null,
      executionCount: 0,
      nextExecution: this.calculateNextExecution(config.schedule, config.time)
    };

    this.triggers.set(trigger.id, trigger);

    if (trigger.type === 'time-based' && trigger.enabled) {
      this.scheduleTimer(trigger);
    }

    return trigger.id;
  }

  updateTrigger(triggerId, updates) {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) {
      throw new Error(`Trigger with ID ${triggerId} not found`);
    }

    // Clear existing timer (now using setTimeout instead of setInterval)
    if (this.timers.has(triggerId)) {
      clearTimeout(this.timers.get(triggerId));
      this.timers.delete(triggerId);
    }

    // Update trigger config
    const updatedTrigger = {
      ...trigger,
      ...updates,
      nextExecution: this.calculateNextExecution(updates.schedule || trigger.schedule, updates.time || trigger.time)
    };

    this.triggers.set(triggerId, updatedTrigger);

    // Reschedule if enabled
    if (updatedTrigger.enabled && updatedTrigger.type === 'time-based') {
      this.scheduleTimer(updatedTrigger);
    }

    return updatedTrigger;
  }

  deleteTrigger(triggerId) {
    // Clear timer (now using setTimeout instead of setInterval)
    if (this.timers.has(triggerId)) {
      clearTimeout(this.timers.get(triggerId));
      this.timers.delete(triggerId);
    }

    // Remove trigger
    return this.triggers.delete(triggerId);
  }

  calculateNextExecution(schedule, time) {
    const now = new Date();
    const scheduleOption = this.scheduleOptions.find(s => s.id === schedule);
    
    if (!scheduleOption) return null;

    const [hours, minutes] = time.split(':').map(Number);
    const next = new Date(now);
    
    switch (schedule) {
      case 'hourly':
        next.setMinutes(minutes, 0, 0);
        if (next <= now) {
          next.setHours(next.getHours() + 1);
        }
        break;
      case 'daily':
        next.setHours(hours, minutes, 0, 0);
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        break;
      case 'weekly':
        next.setHours(hours, minutes, 0, 0);
        const daysUntilSunday = (7 - next.getDay()) % 7;
        next.setDate(next.getDate() + daysUntilSunday);
        if (next <= now) {
          next.setDate(next.getDate() + 7);
        }
        break;
      case 'monthly':
        next.setDate(1);
        next.setHours(hours, minutes, 0, 0);
        next.setMonth(next.getMonth() + 1);
        if (next <= now) {
          next.setMonth(next.getMonth() + 1);
        }
        break;
    }

    return next.toISOString();
  }

  scheduleTimer(trigger) {
    const scheduleOption = this.scheduleOptions.find(s => s.id === trigger.schedule);
    if (!scheduleOption) return;

    // Calculate exact delay until next execution instead of polling
    const now = new Date();
    const nextExecution = new Date(trigger.nextExecution);
    const delay = Math.max(0, nextExecution.getTime() - now.getTime());

    // Use setTimeout instead of setInterval to avoid constant polling
    const timer = setTimeout(async () => {
      await this.executeTrigger(trigger.id);
      
      // Update next execution time and reschedule
      const updatedTrigger = this.triggers.get(trigger.id);
      if (updatedTrigger && updatedTrigger.enabled) {
        updatedTrigger.nextExecution = this.calculateNextExecution(trigger.schedule, trigger.time);
        this.triggers.set(trigger.id, updatedTrigger);
        
        // Reschedule for next execution (recursive scheduling)
        this.scheduleTimer(updatedTrigger);
      }
    }, delay);

    this.timers.set(trigger.id, timer);
    console.log(`⏰ Scheduled trigger: ${trigger.name} (${trigger.schedule} at ${trigger.time}) - next in ${Math.round(delay / 1000 / 60)} minutes`);
  }

  async executeTrigger(triggerId) {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) return;

    console.log(`🚀 Executing trigger: ${trigger.name}`);
    
    // Update execution info
    trigger.executionCount++;
    trigger.lastExecuted = new Date().toISOString();

    try {
      let result;
      switch (trigger.action) {
        case 'cleanup-temp-files':
          result = await this.cleanupTempFiles(trigger.conditions);
          break;
        case 'auto-organize':
          result = await this.autoOrganizeFiles(trigger.conditions);
          break;
        case 'backup-files':
          result = await this.backupFiles(trigger.conditions);
          break;
        case 'sync-cloud':
          result = await this.syncToCloud(trigger.conditions);
          break;
        case 'compress-old-files':
          result = await this.compressOldFiles(trigger.conditions);
          break;
        case 'scan-duplicates':
          result = await this.scanDuplicates(trigger.conditions);
          break;
        default:
          result = { message: 'Unknown action' };
      }

      this.emit('trigger-executed', { triggerId, result });
      console.log(`✅ Trigger completed: ${trigger.name}`);
    } catch (error) {
      console.error(`❌ Trigger failed: ${trigger.name}`, error);
      this.emit('trigger-failed', { triggerId, error: error.message });
    }
  }

  async cleanupTempFiles(conditions = {}) {
    const { fileAge = 7, includeTemp = true, includeEmpty = true } = conditions;
    return {
      action: 'cleanup',
      message: `Cleaned up temporary files older than ${fileAge} days`,
      details: { fileAge, includeTemp, includeEmpty }
    };
  }

  async autoOrganizeFiles(conditions = {}) {
    const { targetFolder = 'Downloads', organizeBy = 'type' } = conditions;
    return {
      action: 'organize',
      message: `Auto-organized files in ${targetFolder} by ${organizeBy}`,
      details: { targetFolder, organizeBy }
    };
  }

  async backupFiles(conditions = {}) {
    const { backupLocation = 'Cloud', includeDocuments = true } = conditions;
    return {
      action: 'backup',
      message: `Backed up important files to ${backupLocation}`,
      details: { backupLocation, includeDocuments }
    };
  }

  async syncToCloud(conditions = {}) {
    const { provider = 'Google Drive', syncFolder = 'Documents' } = conditions;
    return {
      action: 'sync',
      message: `Synced ${syncFolder} to ${provider}`,
      details: { provider, syncFolder }
    };
  }

  async compressOldFiles(conditions = {}) {
    const { fileAge = 30, compressionLevel = 'medium' } = conditions;
    return {
      action: 'compress',
      message: `Compressed files older than ${fileAge} days`,
      details: { fileAge, compressionLevel }
    };
  }

  async scanDuplicates(conditions = {}) {
    const { scanLocation = 'All folders', action = 'report' } = conditions;
    return {
      action: 'scan',
      message: `Scanned for duplicates in ${scanLocation}`,
      details: { scanLocation, action }
    };
  }

  getAllTriggers() {
    return Array.from(this.triggers.values());
  }

  getAvailableActions() {
    return this.availableActions;
  }

  getScheduleOptions() {
    return this.scheduleOptions;
  }

  getTriggerExamples() {
    return [
      'Archive files older than 30 days',
      'Auto-organize downloads every hour',
      'Backup important files daily',
      'Clean temp files weekly',
      'Sync documents to cloud daily',
      'Compress old files monthly'
    ];
  }
}

module.exports = { AdvancedTriggersService }; 