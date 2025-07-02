const chokidar = require('chokidar');
const path = require('path');
const EventEmitter = require('events');

class FileMonitorService extends EventEmitter {
  constructor(aiService, workflowOrchestrator) {
    super();
    this.aiService = aiService;
    this.workflowOrchestrator = workflowOrchestrator;
    this.watchers = new Map();
    this.watchedDirectories = new Set();
    this.processingQueue = [];
    this.isProcessing = false;
    this.processedFiles = new Set();
    
    // Rate limiting to prevent overwhelming the AI service
    this.rateLimitDelay = 2000; // 2 seconds between file processing
    this.lastProcessTime = 0;
  }

  start(directories) {
    console.log('Starting file monitor for directories:', directories);
    
    directories.forEach(dir => {
      this.watchDirectory(dir);
    });
  }

  watchDirectory(directoryPath) {
    if (this.watchedDirectories.has(directoryPath)) {
      console.log(`Already watching directory: ${directoryPath}`);
      return;
    }

    console.log(`Setting up watcher for: ${directoryPath}`);

    const watcher = chokidar.watch(directoryPath, {
      ignored: [
        /(^|[\/\\])\../, // Ignore dotfiles
        /node_modules/,
        /\.tmp$/,
        /\.temp$/,
        /~$/,
        /\.lock$/,
        /\.log$/
      ],
      persistent: true,
      ignoreInitial: true, // Don't trigger for existing files on startup
      followSymlinks: false,
      depth: 2, // Limit depth to prevent excessive monitoring
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    // File added event
    watcher.on('add', (filePath) => {
      this.handleFileAdded(filePath);
    });

    // File changed event
    watcher.on('change', (filePath) => {
      this.handleFileChanged(filePath);
    });

    // File moved/renamed event
    watcher.on('unlink', (filePath) => {
      this.handleFileRemoved(filePath);
    });

    // Directory events
    watcher.on('addDir', (dirPath) => {
      this.handleDirectoryAdded(dirPath);
    });

    // Error handling
    watcher.on('error', (error) => {
      console.error(`Watcher error for ${directoryPath}:`, error);
      this.emit('error', { directory: directoryPath, error });
    });

    // Ready event
    watcher.on('ready', () => {
      console.log(`File watcher ready for: ${directoryPath}`);
      this.emit('watcher-ready', { directory: directoryPath });
    });

    this.watchers.set(directoryPath, watcher);
    this.watchedDirectories.add(directoryPath);
  }

  async handleFileAdded(filePath) {
    console.log(`File added: ${filePath}`);
    
    // Skip if file was recently processed
    if (this.processedFiles.has(filePath)) {
      return;
    }

    // Add to processing queue
    this.addToQueue({
      type: 'added',
      filePath,
      timestamp: Date.now()
    });

    this.emit('file-added', { filePath, timestamp: Date.now() });
    
    // Emit monitoring event for UI
    this.emitMonitoringEvent('file-added', `New file detected: ${path.basename(filePath)}`, filePath, 'File added to monitoring queue for analysis');
  }

  async handleFileChanged(filePath) {
    console.log(`File changed: ${filePath}`);
    
    this.addToQueue({
      type: 'changed',
      filePath,
      timestamp: Date.now()
    });

    this.emit('file-changed', { filePath, timestamp: Date.now() });
  }

  handleFileRemoved(filePath) {
    console.log(`File removed: ${filePath}`);
    
    // Remove from processed files cache
    this.processedFiles.delete(filePath);
    
    this.emit('file-removed', { filePath, timestamp: Date.now() });
  }

  handleDirectoryAdded(dirPath) {
    console.log(`Directory added: ${dirPath}`);
    this.emit('directory-added', { dirPath, timestamp: Date.now() });
  }

  addToQueue(fileEvent) {
    // Remove duplicate events for the same file
    this.processingQueue = this.processingQueue.filter(
      event => event.filePath !== fileEvent.filePath
    );
    
    this.processingQueue.push(fileEvent);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.processingQueue.length > 0) {
      const event = this.processingQueue.shift();
      
      try {
        // Rate limiting
        const now = Date.now();
        const timeSinceLastProcess = now - this.lastProcessTime;
        
        if (timeSinceLastProcess < this.rateLimitDelay) {
          await new Promise(resolve => 
            setTimeout(resolve, this.rateLimitDelay - timeSinceLastProcess)
          );
        }

        await this.processFileEvent(event);
        this.lastProcessTime = Date.now();
        
        // Mark file as processed
        this.processedFiles.add(event.filePath);
        
        // Clean up old processed files (keep only last 1000)
        if (this.processedFiles.size > 1000) {
          const sorted = Array.from(this.processedFiles).slice(0, 500);
          this.processedFiles.clear();
          sorted.forEach(file => this.processedFiles.add(file));
        }

      } catch (error) {
        console.error(`Error processing file event:`, error);
        this.emit('processing-error', { event, error });
      }
    }

    this.isProcessing = false;
  }

  async processFileEvent(event) {
    const { type, filePath } = event;
    
    console.log(`Processing ${type} event for: ${path.basename(filePath)}`);

    try {
      // Skip certain file types that shouldn't be analyzed
      if (this.shouldSkipFile(filePath)) {
        return;
      }

      // Analyze file with AI service
      const analysis = await this.aiService.analyzeFile(filePath);
      
      if (analysis) {
        console.log(`AI Analysis complete for ${path.basename(filePath)}:`, {
          classification: analysis.classification,
          confidence: analysis.confidence,
          tags: analysis.tags
        });

        // Emit monitoring event for UI
        this.emitMonitoringEvent(
          'file-analyzed', 
          `Analysis completed: ${path.basename(filePath)}`,
          filePath,
          `Classification: ${analysis.classification} (${Math.round(analysis.confidence * 100)}% confidence)`
        );

        // Emit analysis complete event
        this.emit('analysis-complete', {
          filePath,
          analysis,
          event: type
        });

        // Trigger workflow orchestration for automatic organization
        if (analysis.confidence > 0.7 && analysis.organizationSuggestion) {
          const organized = await this.workflowOrchestrator.handleFileAnalysis({
            filePath,
            analysis,
            autoOrganize: this.shouldAutoOrganize(analysis)
          });
          
          if (organized && organized.success) {
            this.emitMonitoringEvent(
              'file-organized',
              `Auto-organized: ${path.basename(filePath)}`,
              filePath,
              `Moved to ${analysis.organizationSuggestion.relativePath}`
            );
          }
        }
      }
    } catch (error) {
      console.error(`Error analyzing file ${filePath}:`, error);
      
      // Emit error monitoring event
      this.emitMonitoringEvent(
        'file-error',
        `Error processing: ${path.basename(filePath)}`,
        filePath,
        `Error: ${error.message}`
      );
    }
  }

  shouldSkipFile(filePath) {
    const skipExtensions = [
      '.tmp', '.temp', '.log', '.cache', '.lock',
      '.DS_Store', 'Thumbs.db', '.gitignore'
    ];
    
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    
    return skipExtensions.includes(ext) || 
           fileName.startsWith('.') ||
           fileName.includes('~') ||
           path.dirname(filePath).includes('node_modules');
  }

  shouldAutoOrganize(analysis) {
    // Auto-organize files with high confidence in specific categories
    const autoOrganizeCategories = [
      'temporary', 'archive', 'media'
    ];
    
    return analysis.confidence > 0.8 && 
           autoOrganizeCategories.includes(analysis.classification);
  }

  addWatchDirectory(directoryPath) {
    this.watchDirectory(directoryPath);
  }

  removeWatchDirectory(directoryPath) {
    const watcher = this.watchers.get(directoryPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(directoryPath);
      this.watchedDirectories.delete(directoryPath);
      console.log(`Stopped watching directory: ${directoryPath}`);
    }
  }

  getWatchedDirectories() {
    return Array.from(this.watchedDirectories);
  }

  getQueueStatus() {
    return {
      queueLength: this.processingQueue.length,
      isProcessing: this.isProcessing,
      processedFilesCount: this.processedFiles.size
    };
  }

  stop() {
    console.log('Stopping file monitor service...');
    
    // Close all watchers
    this.watchers.forEach((watcher, path) => {
      watcher.close();
      console.log(`Closed watcher for: ${path}`);
    });

    // Clear data structures
    this.watchers.clear();
    this.watchedDirectories.clear();
    this.processingQueue = [];
    this.processedFiles.clear();
    this.isProcessing = false;

    console.log('File monitor service stopped');
  }

  // Manual file analysis trigger
  async analyzeFileManually(filePath) {
    try {
      const analysis = await this.aiService.analyzeFile(filePath);
      
      this.emit('manual-analysis-complete', {
        filePath,
        analysis
      });

      return analysis;
    } catch (error) {
      console.error(`Error in manual file analysis:`, error);
      throw error;
    }
  }

  // Emit monitoring events for the UI
  emitMonitoringEvent(type, message, filePath = null, details = null) {
    const statTypes = {
      'file-added': 'filesProcessed',
      'file-analyzed': 'filesAnalyzed', 
      'file-organized': 'filesOrganized',
      'file-error': 'errorsEncountered',
      'search-completed': 'filesProcessed'
    };

    // Emit to main process which will forward to renderer
    if (global.mainWindow) {
      global.mainWindow.webContents.send('monitoring-update', {
        type,
        message,
        filePath,
        details,
        statType: statTypes[type] || 'filesProcessed'
      });
    }
  }
}

module.exports = { FileMonitorService }; 