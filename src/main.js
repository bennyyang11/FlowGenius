// Load environment variables from .env file first
require('dotenv').config();

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { FileMonitorService } = require('./services/fileMonitor');
const { AIClassificationService } = require('./ai/classificationService');
const { WorkflowOrchestrator } = require('./workflows/orchestrator');
const { AuthService } = require('./services/authService');
const { DemoService } = require('./services/demoService');
const { SearchService } = require('./services/searchService');
const { NaturalLanguageRuleService } = require('./services/naturalLanguageRuleService');
const { AdvancedTriggersService } = require('./services/advancedTriggersService');
const os = require('os');

// Initialize electron store for persistent settings
const store = new Store();

let mainWindow;
let fileMonitor;
let aiService;
let workflowOrchestrator;
let authService;
let demoService;
let searchService;
let naturalLanguageRuleService;
let advancedTriggersService;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    titleBarStyle: 'hiddenInset',
    show: false
  });

  // Load the React app
  mainWindow.loadFile('src/renderer/index.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Make mainWindow globally accessible for monitoring events
    global.mainWindow = mainWindow;
    
    // Initialize AI services
    initializeServices();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
    
    // Clean up services
    if (fileMonitor) {
      fileMonitor.stop();
    }
  });
}

async function initializeServices() {
  try {
    // Initialize Authentication Service
    authService = new AuthService();
    console.log('🔐 Authentication service initialized');

    // Initialize Demo Service
    demoService = new DemoService();
    await demoService.initialize();
    
    // Initialize AI Classification Service
    aiService = new AIClassificationService();
    await aiService.initialize();
    
    // Initialize Search Service
    searchService = new SearchService();
    await searchService.initialize();
    
    // Initialize Natural Language Rule Service
    naturalLanguageRuleService = new NaturalLanguageRuleService();
    console.log('🧠 Natural Language Rule Service initialized');
    
    // Initialize Advanced Triggers Service
    advancedTriggersService = new AdvancedTriggersService();
    advancedTriggersService.initialize();
    console.log('🕐 Advanced Triggers Service initialized');
    
    // N8n configuration
    const n8nConfig = {
      enabled: true, // Set to false to disable n8n and use in-memory storage
      n8nBaseUrl: 'http://localhost:5678',
      webhookBaseUrl: 'http://localhost:5678/webhook',
      apiKey: null, // Set your n8n API key if authentication is enabled
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      enablePhysicalBackup: false, // Set to true to create physical file copies
      backupDirectory: path.join(process.cwd(), 'backups')
    };

    // Initialize workflow orchestrator with n8n backup service
    workflowOrchestrator = new WorkflowOrchestrator(aiService, n8nConfig);
    await workflowOrchestrator.initialize();
    console.log('Workflow Orchestrator with Productivity Integration initialized');
    
    // Enable productivity integrations for testing
    // Note: These require proper N8N workflows and credentials to be configured
    workflowOrchestrator.enableProductivityIntegration('smart-backup', {
      provider: 'aws-s3',
      enabled: true,
      retentionDays: 30
    });
    
    console.log('🚀 Productivity integrations configured:');
    console.log('  - Smart Backup: Enabled (requires N8N workflow)');
    console.log('  - To enable more integrations, configure N8N workflows first');
    console.log('  - See PRODUCTIVITY_INTEGRATION_GUIDE.md for setup instructions');

    // Initialize and start file monitor
    fileMonitor = new FileMonitorService(aiService, workflowOrchestrator);
    
    // Watch common directories
    const watchedDirs = [
      path.join(os.homedir(), 'Downloads'),
      path.join(os.homedir(), 'Documents'),
      path.join(os.homedir(), 'Desktop')
    ];
    
    fileMonitor.start(watchedDirs);
    
    console.log('FlowGenius services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize services:', error);
  }
}

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle('get-user-directories', async () => {
  const homeDir = require('os').homedir();
  return {
    home: homeDir,
    documents: path.join(homeDir, 'Documents'),
    downloads: path.join(homeDir, 'Downloads'),
    desktop: path.join(homeDir, 'Desktop'),
    pictures: path.join(homeDir, 'Pictures')
  };
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('get-directory-contents', async (event, dirPath) => {
  try {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const contents = [];
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      const stats = await fs.promises.stat(fullPath);
      
      contents.push({
        name: item.name,
        path: fullPath,
        isDirectory: item.isDirectory(),
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime
      });
    }
    
    return contents;
  } catch (error) {
    console.error('Error reading directory:', error);
    return [];
  }
});

ipcMain.handle('get-parent-directory', (event, dirPath) => {
  try {
    const parentDir = path.dirname(dirPath);
    // Prevent going above root
    if (parentDir === dirPath) {
      return null;
    }
    return parentDir;
  } catch (error) {
    console.error('Error getting parent directory:', error);
    return null;
  }
});

ipcMain.handle('analyze-file', async (event, filePath) => {
  if (aiService) {
    return await aiService.analyzeFile(filePath);
  }
  return null;
});

ipcMain.handle('organize-files', async (event, options) => {
  if (workflowOrchestrator) {
    return await workflowOrchestrator.organizeFiles(options);
  }
  return { success: false, error: 'Workflow orchestrator not initialized' };
});

ipcMain.handle('get-file-suggestions', async (event, filePath) => {
  if (aiService) {
    return await aiService.getOrganizationSuggestions(filePath);
  }
  return [];
});

ipcMain.handle('get-settings', () => {
  return store.store;
});

ipcMain.handle('save-settings', (event, settings) => {
  Object.keys(settings).forEach(key => {
    store.set(key, settings[key]);
  });
  return true;
});

// Authentication IPC Handlers
ipcMain.handle('auth-sign-up', async (event, { email, password, displayName }) => {
  if (authService) {
    return await authService.signUp(email, password, displayName);
  }
  return { success: false, error: 'Authentication service not available' };
});

ipcMain.handle('auth-sign-in', async (event, { email, password }) => {
  if (authService) {
    return await authService.signIn(email, password);
  }
  return { success: false, error: 'Authentication service not available' };
});

ipcMain.handle('auth-sign-in-google', async () => {
  if (authService) {
    return await authService.signInWithGoogle();
  }
  return { success: false, error: 'Authentication service not available' };
});

ipcMain.handle('auth-sign-out', async () => {
  if (authService) {
    return await authService.signOut();
  }
  return { success: false, error: 'Authentication service not available' };
});

ipcMain.handle('auth-reset-password', async (event, email) => {
  if (authService) {
    return await authService.resetPassword(email);
  }
  return { success: false, error: 'Authentication service not available' };
});

ipcMain.handle('auth-get-current-user', () => {
  if (authService) {
    const user = authService.getCurrentUser();
    return user ? {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL
    } : null;
  }
  return null;
});

ipcMain.handle('auth-is-authenticated', () => {
  return authService ? authService.isAuthenticated() : false;
});

// Demo Service IPC Handlers
ipcMain.handle('demo-generate-files', async () => {
  if (demoService) {
    return await demoService.generateDemoFiles();
  }
  return { success: false, error: 'Demo service not available' };
});

ipcMain.handle('demo-clear-files', async () => {
  if (demoService) {
    await demoService.clearDemoFiles();
    return { success: true };
  }
  return { success: false, error: 'Demo service not available' };
});

ipcMain.handle('demo-get-directory', () => {
  if (demoService) {
    return demoService.getDemoDirectory();
  }
  return null;
});

ipcMain.handle('demo-is-active', async () => {
  if (demoService) {
    return await demoService.isDemoDirectoryActive();
  }
  return false;
});

// Search Service IPC Handlers
ipcMain.handle('search-files', async (event, query) => {
  console.log('🔍 Search request received:', query);
  
  if (!searchService) {
    console.error('❌ Search service not initialized');
    return [];
  }
  
  try {
    // Create progress callback to send updates to frontend
    const progressCallback = (progress, currentDirectory) => {
      event.sender.send('search-progress', { progress, currentDirectory });
    };
    
    const results = await searchService.searchFiles({
      ...query,
      onProgress: progressCallback
    });
    
    console.log(`✅ Search completed: Found ${results.length} results for "${query.query || query}"`);
    
    // Log first few results for debugging
    if (results.length > 0) {
      console.log('Sample results:', results.slice(0, 3).map(r => ({
        fileName: r.fileName,
        matchType: r.matchType,
        filePath: r.filePath
      })));
    }
    
    return results;
  } catch (error) {
    console.error('❌ Search failed:', error);
    return [];
  }
});

// Monitoring IPC Handlers
ipcMain.handle('get-monitoring-status', async () => {
  if (fileMonitor) {
    const status = fileMonitor.getQueueStatus();
    return {
      ...status,
      watchedDirectories: fileMonitor.getWatchedDirectories()
    };
  }
  return {
    queueLength: 0,
    isProcessing: false,
    processedFilesCount: 0,
    watchedDirectories: []
  };
});

// Productivity Integration IPC Handlers
ipcMain.handle('get-productivity-integrations', async () => {
  if (workflowOrchestrator) {
    return workflowOrchestrator.getProductivityIntegrations();
  }
  return [];
});

ipcMain.handle('get-productivity-workflows', async () => {
  if (workflowOrchestrator) {
    return workflowOrchestrator.getProductivityWorkflows();
  }
  return [];
});

ipcMain.handle('get-cloud-sync-status', async () => {
  if (workflowOrchestrator) {
    try {
      const config = workflowOrchestrator.getConfig();
      return {
        enabled: config.enableCloudSync || true, // Default to true
        provider: config.productivityConfig?.cloudStorage?.provider || 'google-drive',
        // Include bulk sync state
        isRunning: bulkSyncState.isRunning,
        totalFiles: bulkSyncState.totalFiles,
        processedFiles: bulkSyncState.processedFiles,
        successCount: bulkSyncState.successCount,
        errorCount: bulkSyncState.errorCount
      };
    } catch (error) {
      console.error('Failed to get cloud sync status:', error);
      return { 
        enabled: false, 
        provider: null,
        isRunning: false,
        totalFiles: 0,
        processedFiles: 0,
        successCount: 0,
        errorCount: 0
      };
    }
  }
  return { 
    enabled: false, 
    provider: null,
    isRunning: false,
    totalFiles: 0,
    processedFiles: 0,
    successCount: 0,
    errorCount: 0
  };
});

// Bulk Cloud Sync functionality
let bulkSyncState = {
  isRunning: false,
  shouldStop: false,
  totalFiles: 0,
  processedFiles: 0,
  successCount: 0,
  errorCount: 0,
  results: []
};

ipcMain.handle('start-bulk-cloud-sync', async (event) => {
  if (bulkSyncState.isRunning) {
    return { success: false, error: 'Bulk sync already running' };
  }

  if (!workflowOrchestrator) {
    return { success: false, error: 'Workflow orchestrator not available' };
  }

  try {
    // Reset state
    bulkSyncState = {
      isRunning: true,
      shouldStop: false,
      totalFiles: 0,
      processedFiles: 0,
      successCount: 0,
      errorCount: 0,
      results: []
    };

    console.log('🚀 Starting bulk cloud sync...');
    console.log(`📡 Event sender object:`, event.sender ? 'Available' : 'NOT AVAILABLE');
    
    // Start the sync process in the background (non-blocking)
    setImmediate(() => {
      processBulkSync(event.sender);
    });
    
    return { success: true };
  } catch (error) {
    bulkSyncState.isRunning = false;
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-bulk-cloud-sync', async () => {
  bulkSyncState.shouldStop = true;
  bulkSyncState.isRunning = false;
  console.log('⏹️ Bulk sync stopped by user');
  return { success: true };
});



// Add a test IPC handler to verify communication
ipcMain.handle('test-ipc-communication', async () => {
  console.log('🧪 Backend received IPC test request');
  return { success: true, message: 'IPC communication working!' };
});

// Add a test event sender to verify event communication
ipcMain.handle('test-sync-events', async (event) => {
  console.log('🧪 Testing sync event communication...');
  
  // Send a test progress event
  event.sender.send('bulk-sync-progress', {
    isRunning: true,
    progress: 25,
    totalFiles: 100,
    processedFiles: 25,
    successCount: 20,
    errorCount: 5,
    currentFile: '/test/fake-file.txt'
  });
  
  console.log('📡 Test sync event sent to frontend');
  return { success: true, message: 'Test sync event sent!' };
});

async function processBulkSync(sender) {
  console.log('🚀 processBulkSync started with sender:', !!sender);
  
  try {
    // Get all files from monitored directories
    const fs = require('fs').promises;
    const path = require('path');
    const os = require('os');

    const monitoredDirs = [
      path.join(os.homedir(), 'Desktop'),
      path.join(os.homedir(), 'Documents'), 
      path.join(os.homedir(), 'Downloads')
    ];

    console.log('📁 Scanning monitored directories for files...');
    
    // Send initial scanning status
    console.log('📡 Sending initial scanning status to frontend');
    sender.send('bulk-sync-progress', {
      isRunning: true,
      progress: 0,
      totalFiles: 0,
      processedFiles: 0,
      successCount: 0,
      errorCount: 0,
      currentFile: 'Scanning directories...',
      scanning: true
    });
    
    // Collect all files with progress updates
    const allFiles = [];
    for (let i = 0; i < monitoredDirs.length; i++) {
      const dir = monitoredDirs[i];
      try {
        console.log(`📂 Scanning ${dir}...`);
        console.log(`📡 Sending directory scan progress for ${path.basename(dir)}`);
        sender.send('bulk-sync-progress', {
          isRunning: true,
          progress: 0,
          totalFiles: 0,
          processedFiles: 0,
          successCount: 0,
          errorCount: 0,
          currentFile: `Scanning ${path.basename(dir)} folder...`,
          scanning: true
        });
        
        const files = await getAllFilesRecursively(dir);
        allFiles.push(...files);
        console.log(`📊 Found ${files.length} files in ${dir}`);
      } catch (error) {
        console.error(`Failed to scan directory ${dir}:`, error);
      }
    }

    console.log(`📊 Total files found: ${allFiles.length}, now filtering...`);
    
    // Send filtering progress
    sender.send('bulk-sync-progress', {
      isRunning: true,
      progress: 0,
      totalFiles: 0,
      processedFiles: 0,
      successCount: 0,
      errorCount: 0,
      currentFile: `Filtering ${allFiles.length} files...`,
      scanning: true
    });

    // Filter out large files (>50MB) and system files with progress
    const syncableFiles = [];
    const filterBatchSize = 100; // Process files in batches
    
    for (let i = 0; i < allFiles.length; i += filterBatchSize) {
      const batch = allFiles.slice(i, Math.min(i + filterBatchSize, allFiles.length));
      
      for (const filePath of batch) {
        try {
          const stats = require('fs').statSync(filePath);
          const fileName = path.basename(filePath);
          
          // Skip files larger than 50MB
          if (stats.size > 50 * 1024 * 1024) continue;
          
          // Skip system files and hidden files
          if (fileName.startsWith('.')) continue;
          if (fileName.includes('.DS_Store')) continue;
          if (fileName.includes('Thumbs.db')) continue;
          
          syncableFiles.push(filePath);
        } catch (error) {
          // Skip files we can't access
          continue;
        }
      }
      
      // Send progress update every batch
      if (i % (filterBatchSize * 5) === 0) { // Every 500 files
        sender.send('bulk-sync-progress', {
          isRunning: true,
          progress: Math.round((i / allFiles.length) * 100),
          totalFiles: 0,
          processedFiles: 0,
          successCount: 0,
          errorCount: 0,
          currentFile: `Filtering ${i}/${allFiles.length} files...`,
          scanning: true
        });
        
        // Small delay to keep UI responsive
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    bulkSyncState.totalFiles = syncableFiles.length;
    
    console.log(`📊 Found ${syncableFiles.length} syncable files (filtered from ${allFiles.length})`);

    // Send initial sync progress (filtering complete)
    console.log(`📡 Sending initial sync progress to frontend: totalFiles=${bulkSyncState.totalFiles}`);
    sender.send('bulk-sync-progress', {
      isRunning: true,
      progress: 0,
      totalFiles: bulkSyncState.totalFiles,
      processedFiles: 0,
      successCount: 0,
      errorCount: 0,
      currentFile: `Ready to sync ${bulkSyncState.totalFiles} files`,
      scanning: false
    });

    // Process files in smaller batches with better CPU throttling
    const batchSize = 3; // Process 3 files at a time (reduced from 5)
    const delayBetweenFiles = 500; // 500ms delay between each file (increased from 200ms)
    const delayBetweenBatches = 1000; // 1 second delay between batches
    
    for (let i = 0; i < syncableFiles.length; i += batchSize) {
      if (bulkSyncState.shouldStop) break;

      const batch = syncableFiles.slice(i, Math.min(i + batchSize, syncableFiles.length));
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(syncableFiles.length / batchSize);
      
      console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} files)`);
      
      // Process batch
      for (const filePath of batch) {
        if (bulkSyncState.shouldStop) break;

        const fileName = path.basename(filePath);
        const stats = require('fs').statSync(filePath);
        
        console.log(`☁️ Syncing: ${fileName}`);

        try {
          // Create file data for productivity service
          const fileData = {
            filePath: filePath,
            fileName: fileName,
            fileSize: stats.size,
            classification: 'document', // Will be determined by AI
            confidence: 0.8,
            tags: [path.extname(fileName).slice(1)],
            organizationSuggestion: {
              relativePath: 'BulkSync/' + path.dirname(filePath).split('/').pop(),
              fullPath: filePath
            }
          };

          // Sync to Google Drive directly (bypasses N8N)
          const result = await workflowOrchestrator.productivityService.executeCloudStorageSyncDirect(fileData, 'google-drive');
          
          if (result.success) {
            bulkSyncState.successCount++;
            bulkSyncState.results.push({
              fileName: fileName,
              filePath: filePath,
              success: true,
              message: 'Successfully synced'
            });

            // Send real-time monitoring update for successful sync
            sender.send('monitoring-update', {
              type: 'cloud-sync-success',
              message: `✅ Synced to Google Drive: ${fileName}`,
              filePath: filePath,
              details: `File successfully uploaded to Google Drive`,
              statType: 'filesProcessed'
            });
          } else {
            bulkSyncState.errorCount++;
            bulkSyncState.results.push({
              fileName: fileName,
              filePath: filePath,
              success: false,
              error: result.message || 'Sync failed'
            });

            // Send real-time monitoring update for failed sync
            sender.send('monitoring-update', {
              type: 'cloud-sync-error',
              message: `❌ Sync failed: ${fileName}`,
              filePath: filePath,
              details: `Error: ${result.error || result.message || 'Unknown error'}`,
              statType: 'errorsEncountered'
            });
          }
        } catch (error) {
          console.error(`Failed to sync ${fileName}:`, error);
          bulkSyncState.errorCount++;
          bulkSyncState.results.push({
            fileName: fileName,
            filePath: filePath,
            success: false,
            error: error.message
          });
        }

        bulkSyncState.processedFiles++;
        
        // Send progress update to UI
        const progressData = {
          isRunning: true,
          progress: Math.round((bulkSyncState.processedFiles / bulkSyncState.totalFiles) * 100),
          totalFiles: bulkSyncState.totalFiles,
          processedFiles: bulkSyncState.processedFiles,
          successCount: bulkSyncState.successCount,
          errorCount: bulkSyncState.errorCount,
          currentFile: filePath
        };
        console.log(`📡 Sending progress update: ${bulkSyncState.processedFiles}/${bulkSyncState.totalFiles} (${progressData.progress}%)`);
        sender.send('bulk-sync-progress', progressData);
        
        // Longer delay to prevent overwhelming the system and reduce CPU usage
        await new Promise(resolve => setTimeout(resolve, delayBetweenFiles));
      }
      
      // Longer pause between batches to give CPU a break
      if (i + batchSize < syncableFiles.length && !bulkSyncState.shouldStop) {
        console.log(`⏸️ Pausing for ${delayBetweenBatches}ms between batches...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    // Final completion
    bulkSyncState.isRunning = false;
    
    console.log(`✅ Bulk sync completed: ${bulkSyncState.successCount} successful, ${bulkSyncState.errorCount} failed`);
    
    // Send bulk sync completion
    sender.send('bulk-sync-complete', {
      totalFiles: bulkSyncState.totalFiles,
      successCount: bulkSyncState.successCount,
      errorCount: bulkSyncState.errorCount,
      results: bulkSyncState.results
    });

    // Update monitoring stats
    console.log(`📊 Sending cloud-sync-stats-update: synced=${bulkSyncState.successCount}, errors=${bulkSyncState.errorCount}`);
    sender.send('cloud-sync-stats-update', {
      totalSynced: bulkSyncState.successCount,
      syncErrors: bulkSyncState.errorCount,
      lastSync: new Date().toISOString(),
      isActive: false
    });

    // Send monitoring update
    sender.send('monitoring-update', {
      type: 'cloud-sync-complete',
      message: `☁️ Bulk sync completed: ${bulkSyncState.successCount} files synced successfully`,
      filePath: null,
      details: `Total: ${bulkSyncState.totalFiles} files, Success: ${bulkSyncState.successCount}, Errors: ${bulkSyncState.errorCount}`,
      statType: 'filesProcessed'
    });

  } catch (error) {
    console.error('Bulk sync failed:', error);
    bulkSyncState.isRunning = false;
    
    sender.send('bulk-sync-complete', {
      totalFiles: bulkSyncState.totalFiles,
      successCount: bulkSyncState.successCount,
      errorCount: bulkSyncState.errorCount,
      results: bulkSyncState.results,
      error: error.message
    });
  }
}

async function getAllFilesRecursively(dir) {
  const fs = require('fs').promises;
  const path = require('path');
  
  let files = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip some common system directories
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'Library') {
          continue;
        }
        
        // Recursively get files from subdirectory
        try {
          const subFiles = await getAllFilesRecursively(fullPath);
          files.push(...subFiles);
        } catch (error) {
          // Skip directories we can't access
          continue;
        }
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Return empty array if we can't access the directory
    return [];
  }
  
  return files;
}

ipcMain.handle('test-productivity-integration', async (event, integrationType) => {
  if (!workflowOrchestrator) {
    return { success: false, error: 'Workflow orchestrator not available' };
  }

  try {
    // Create test file data
    const testFileData = {
      filePath: '/test/sample-document.pdf',
      fileName: 'sample-document.pdf',
      fileSize: 1024000,
      classification: 'work',
      confidence: 0.92,
      tags: ['important', 'review', 'document'],
      organizationSuggestion: {
        relativePath: 'Documents/Work/Important',
        fullPath: '/Users/test/Documents/Work/Important/sample-document.pdf',
        reasoning: 'High confidence work document'
      },
      importance: 'high'
    };

    console.log(`🧪 Testing productivity integration: ${integrationType}`);

    let result;
    switch (integrationType) {
      case 'smart-backup':
        result = await workflowOrchestrator.productivityService.executeSmartBackup(testFileData);
        break;
      case 'cloud-sync':
        result = await workflowOrchestrator.productivityService.executeCloudStorageSyncDirect(testFileData, 'google-drive');
        
        // Send real-time update to UI
        event.sender.send('productivity-integration-update', {
          type: 'cloud-sync',
          integration: 'google-drive',
          fileName: testFileData.fileName,
          success: result.success,
          message: result.message || (result.success ? 'Test sync successful' : 'Test sync failed'),
          details: JSON.stringify(result)
        });

        // Also send test cloud sync stats update for testing
        if (result.success) {
          console.log('📊 Sending test cloud-sync-stats-update');
          event.sender.send('cloud-sync-stats-update', {
            totalSynced: 1,
            syncErrors: 0,
            lastSync: new Date().toISOString(),
            isActive: false
          });
        }
        break;
      case 'team-notification':
        result = await workflowOrchestrator.productivityService.executeTeamNotification(testFileData, 'slack', {
          channel: '#test-channel',
          message: 'Test productivity integration'
        });
        
        // Send real-time update to UI
        event.sender.send('productivity-integration-update', {
          type: 'team-notification',
          integration: 'slack',
          fileName: testFileData.fileName,
          success: result.success,
          message: result.message || (result.success ? 'Test notification successful' : 'Test notification failed'),
          details: JSON.stringify(result)
        });
        break;
      case 'project-management':
        result = await workflowOrchestrator.productivityService.executeProjectManagement(testFileData, 'trello', {
          boardId: 'test-board',
          listId: 'test-list'
        });
        
        // Send real-time update to UI
        event.sender.send('productivity-integration-update', {
          type: 'project-management',
          integration: 'trello',
          fileName: testFileData.fileName,
          success: result.success,
          message: result.message || (result.success ? 'Test project sync successful' : 'Test project sync failed'),
          details: JSON.stringify(result)
        });
        break;
      default:
        return { success: false, error: `Unknown integration type: ${integrationType}` };
    }

    console.log(`✅ Productivity integration test result:`, result);
    return { success: true, result };

  } catch (error) {
    console.error(`❌ Productivity integration test failed:`, error);
    return { success: false, error: error.message };
  }
});

// Global queue simulation state
let queueSimulation = {
  isRunning: false,
  queue: [],
  processedCount: 0
};

ipcMain.handle('trigger-test-monitoring-event', async (event, eventType) => {
  const testEvents = {
    'file-added': {
      type: 'file-added',
      message: 'Test file detected in monitored directory',
      filePath: '/Users/test/Documents/test-file.txt',
      details: 'Simulated file addition event for testing purposes',
      statType: 'filesProcessed'
    },
    'file-analyzed': {
      type: 'file-analyzed',
      message: 'AI analysis completed successfully',
      filePath: '/Users/test/Documents/report.pdf',
      details: 'LangGraph workflow analyzed file and determined classification: document (85% confidence)',
      statType: 'filesAnalyzed'
    },
    'file-organized': {
      type: 'file-organized',
      message: 'File organized into target directory',
      filePath: '/Users/test/Downloads/photo.jpg',
      details: 'Moved to Documents/Photos based on AI recommendation',
      statType: 'filesOrganized'
    },
    'file-error': {
      type: 'file-error',
      message: 'Error processing file',
      filePath: '/Users/test/Desktop/corrupted.zip',
      details: 'File appears to be corrupted or inaccessible',
      statType: 'errorsEncountered'
    },
    'search-completed': {
      type: 'search-completed',
      message: 'AI search operation completed',
      filePath: null,
      details: 'Found 23 files matching search criteria with 89% accuracy',
      statType: 'filesProcessed'
    }
  };

  const eventData = testEvents[eventType];
  if (eventData) {
    // Send the monitoring update to the frontend
    event.sender.send('monitoring-update', eventData);
    
    // Also send a system status update
    event.sender.send('system-status', {
      isProcessing: Math.random() > 0.5, // Randomly show as processing
      lastActivity: new Date()
    });
  }
  
  return { success: true };
});

ipcMain.handle('start-queue-simulation', async (event) => {
  if (queueSimulation.isRunning) {
    return { success: false, message: 'Queue simulation already running' };
  }

  // Reset simulation state
  queueSimulation.isRunning = true;
  queueSimulation.processedCount = 0;

  // Create 10 test files for the queue
  const testFiles = [
    { name: 'presentation.pptx', type: 'document', dir: 'Documents' },
    { name: 'vacation-photo.jpg', type: 'image', dir: 'Downloads' },
    { name: 'budget-report.xlsx', type: 'document', dir: 'Desktop' },
    { name: 'meeting-recording.mp4', type: 'media', dir: 'Documents' },
    { name: 'project-archive.zip', type: 'archive', dir: 'Downloads' },
    { name: 'script.py', type: 'code', dir: 'Desktop' },
    { name: 'invoice.pdf', type: 'document', dir: 'Downloads' },
    { name: 'song.mp3', type: 'media', dir: 'Downloads' },
    { name: 'notes.txt', type: 'document', dir: 'Documents' },
    { name: 'design.psd', type: 'image', dir: 'Desktop' }
  ];

  queueSimulation.queue = [...testFiles];

  // Send initial queue status
  event.sender.send('queue-status', {
    queueLength: queueSimulation.queue.length,
    isProcessing: true,
    totalFiles: testFiles.length,
    processedCount: 0
  });

  // Add initial batch notification
  event.sender.send('monitoring-update', {
    type: 'system-start',
    message: `🚀 Queue simulation started - Processing ${testFiles.length} files`,
    filePath: null,
    details: 'Files detected and added to processing queue',
    statType: 'filesProcessed'
  });

  // Process files one by one
  processQueueSimulation(event.sender);

  return { success: true, message: 'Queue simulation started' };
});

async function processQueueSimulation(sender) {
  while (queueSimulation.queue.length > 0 && queueSimulation.isRunning) {
    const file = queueSimulation.queue.shift();
    queueSimulation.processedCount++;

    // Send queue status update
    sender.send('queue-status', {
      queueLength: queueSimulation.queue.length,
      isProcessing: true,
      processedCount: queueSimulation.processedCount,
      currentFile: file.name
    });

    // Simulate file detection
    sender.send('monitoring-update', {
      type: 'file-added',
      message: `📁 File detected: ${file.name}`,
      filePath: `/Users/test/${file.dir}/${file.name}`,
      details: `Added to processing queue (${queueSimulation.queue.length + 1} remaining)`,
      statType: 'filesProcessed'
    });

    // Wait 1-2 seconds to simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));

    if (!queueSimulation.isRunning) break;

    // Simulate AI analysis
    const confidences = ['92%', '87%', '94%', '78%', '89%', '95%', '83%', '91%'];
    const confidence = confidences[Math.floor(Math.random() * confidences.length)];
    
    sender.send('monitoring-update', {
      type: 'file-analyzed',
      message: `🧠 AI analysis completed: ${file.name}`,
      filePath: `/Users/test/${file.dir}/${file.name}`,
      details: `LangGraph workflow classified as ${file.type} (${confidence} confidence)`,
      statType: 'filesAnalyzed'
    });

    // Wait 0.5-1 seconds
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));

    if (!queueSimulation.isRunning) break;

    // Simulate organization (80% success rate)
    const isSuccess = Math.random() > 0.2;
    
    if (isSuccess) {
      const targetFolders = {
        'document': 'Documents/Office Files',
        'image': 'Pictures/Images',
        'media': 'Media/Videos & Audio',
        'code': 'Development/Code',
        'archive': 'Archives/Compressed'
      };

      sender.send('monitoring-update', {
        type: 'file-organized',
        message: `✨ File organized: ${file.name}`,
        filePath: `/Users/test/${file.dir}/${file.name}`,
        details: `Moved to ${targetFolders[file.type] || 'Organized Files'} based on AI recommendation`,
        statType: 'filesOrganized'
      });
    } else {
      sender.send('monitoring-update', {
        type: 'file-error',
        message: `⚠️ Processing error: ${file.name}`,
        filePath: `/Users/test/${file.dir}/${file.name}`,
        details: 'File may be locked or inaccessible - retrying later',
        statType: 'errorsEncountered'
      });
    }

    // Wait before next file
    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 700));
  }

  // Simulation complete
  queueSimulation.isRunning = false;
  
  sender.send('queue-status', {
    queueLength: 0,
    isProcessing: false,
    processedCount: queueSimulation.processedCount,
    totalFiles: queueSimulation.processedCount
  });

  sender.send('monitoring-update', {
    type: 'system-start',
    message: `🎉 Queue processing completed!`,
    filePath: null,
    details: `Successfully processed ${queueSimulation.processedCount} files with AI organization`,
    statType: 'filesProcessed'
  });
}

ipcMain.handle('stop-queue-simulation', async (event) => {
  queueSimulation.isRunning = false;
  queueSimulation.queue = [];
  
  event.sender.send('queue-status', {
    queueLength: 0,
    isProcessing: false,
    processedCount: queueSimulation.processedCount
  });

  return { success: true, message: 'Queue simulation stopped' };
});

// Undo Organization IPC Handlers
ipcMain.handle('get-backup-records', async () => {
  if (workflowOrchestrator) {
    try {
      return await workflowOrchestrator.getBackupRecords();
    } catch (error) {
      console.error('Failed to get backup records:', error);
      return [];
    }
  }
  return [];
});

ipcMain.handle('undo-organization', async (event, backupId) => {
  if (workflowOrchestrator) {
    try {
      return await workflowOrchestrator.undoOrganization(backupId);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'Workflow orchestrator not initialized' };
});

ipcMain.handle('undo-multiple-organizations', async (event, backupIds) => {
  if (workflowOrchestrator) {
    try {
      return await workflowOrchestrator.undoMultipleOrganizations(backupIds);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'Workflow orchestrator not initialized' };
});

// Google Drive Authentication handlers
ipcMain.handle('google-drive-authenticate', async () => {
  try {
    if (!workflowOrchestrator) {
      return { success: false, error: 'Workflow orchestrator not available' };
    }
    
    const result = await workflowOrchestrator.productivityService.authenticateGoogleDrive();
    return result;
  } catch (error) {
    console.error('Google Drive authentication error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('google-drive-sign-out', async () => {
  try {
    if (!workflowOrchestrator) {
      return { success: false, error: 'Workflow orchestrator not available' };
    }
    
    const result = await workflowOrchestrator.productivityService.signOutGoogleDrive();
    return result;
  } catch (error) {
    console.error('Google Drive sign out error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('google-drive-auth-status', async () => {
  try {
    if (!workflowOrchestrator) {
      return { 
        isAuthenticated: false, 
        user: null, 
        configured: false,
        error: 'Workflow orchestrator not available' 
      };
    }
    
    const status = await workflowOrchestrator.productivityService.getGoogleDriveAuthStatus();
    return status;
  } catch (error) {
    console.error('Google Drive auth status error:', error);
    return { 
      isAuthenticated: false, 
      user: null, 
      configured: false,
      error: error.message 
    };
  }
});

ipcMain.handle('google-drive-storage-info', async () => {
  try {
    if (!workflowOrchestrator) {
      return { error: 'Workflow orchestrator not available' };
    }
    
    const storageInfo = await workflowOrchestrator.productivityService.getGoogleDriveStorageInfo();
    return storageInfo;
  } catch (error) {
    console.error('Google Drive storage info error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('google-drive-sync-file', async (event, fileData) => {
  try {
    if (!workflowOrchestrator) {
      return { success: false, error: 'Workflow orchestrator not available' };
    }
    
    const result = await workflowOrchestrator.productivityService.syncFileToGoogleDrive(fileData);
    return result;
  } catch (error) {
    console.error('Google Drive sync error:', error);
    return { success: false, error: error.message };
  }
});

// Natural Language Rule Service IPC Handlers
ipcMain.handle('parse-natural-language-rule', async (event, ruleText) => {
  try {
    if (!naturalLanguageRuleService) {
      return { success: false, error: 'Natural language rule service not available' };
    }
    
    const parsedRule = await naturalLanguageRuleService.parseRule(ruleText);
    return { success: true, rule: parsedRule };
  } catch (error) {
    console.error('Natural language rule parsing error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-all-rules', async () => {
  if (naturalLanguageRuleService) {
    return naturalLanguageRuleService.getAllRules();
  }
  return [];
});

ipcMain.handle('execute-rule', async (event, ruleId, fileData) => {
  try {
    if (!naturalLanguageRuleService) {
      return { success: false, error: 'Natural language rule service not available' };
    }
    
    const result = await naturalLanguageRuleService.executeRule(ruleId, fileData);
    return { success: true, result };
  } catch (error) {
    console.error('Rule execution error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-rule-examples', async () => {
  if (naturalLanguageRuleService) {
    return naturalLanguageRuleService.getRuleExamples();
  }
  return [];
});

// Advanced Triggers Service IPC Handlers
ipcMain.handle('get-all-triggers', async () => {
  if (advancedTriggersService) {
    return advancedTriggersService.getAllTriggers();
  }
  return [];
});

ipcMain.handle('get-available-actions', async () => {
  if (advancedTriggersService) {
    return advancedTriggersService.getAvailableActions();
  }
  return [];
});

ipcMain.handle('get-schedule-options', async () => {
  if (advancedTriggersService) {
    return advancedTriggersService.getScheduleOptions();
  }
  return [];
});

ipcMain.handle('update-trigger', async (event, triggerId, updates) => {
  try {
    if (!advancedTriggersService) {
      return { success: false, error: 'Advanced triggers service not available' };
    }
    
    const updatedTrigger = await advancedTriggersService.updateTrigger(triggerId, updates);
    return { success: true, trigger: updatedTrigger };
  } catch (error) {
    console.error('Trigger update error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('add-trigger', async (event, triggerConfig) => {
  try {
    if (!advancedTriggersService) {
      return { success: false, error: 'Advanced triggers service not available' };
    }
    
    const triggerId = await advancedTriggersService.addTrigger(triggerConfig);
    return { success: true, triggerId };
  } catch (error) {
    console.error('Trigger creation error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-trigger', async (event, triggerId) => {
  try {
    if (!advancedTriggersService) {
      return { success: false, error: 'Advanced triggers service not available' };
    }
    
    const result = await advancedTriggersService.deleteTrigger(triggerId);
    return { success: true, deleted: result };
  } catch (error) {
    console.error('Trigger deletion error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('execute-trigger', async (event, triggerId) => {
  try {
    if (!advancedTriggersService) {
      return { success: false, error: 'Advanced triggers service not available' };
    }
    
    await advancedTriggersService.executeTrigger(triggerId);
    return { success: true };
  } catch (error) {
    console.error('Trigger execution error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-trigger-examples', async () => {
  if (advancedTriggersService) {
    return advancedTriggersService.getTriggerExamples();
  }
  return [];
});

// Visual Workflow Editor IPC Handlers
ipcMain.handle('execute-visual-workflow', async (event, workflowData) => {
  try {
    console.log('🔄 Executing visual workflow:', workflowData.workflowId);
    
    // Simulate workflow execution
    const result = {
      success: true,
      executedNodes: workflowData.workflow?.nodes?.length || 0,
      message: `Workflow "${workflowData.workflow?.name}" executed successfully`
    };
    
    return result;
  } catch (error) {
    console.error('Visual workflow execution error:', error);
    return { success: false, error: error.message };
  }
});