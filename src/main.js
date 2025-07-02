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
    console.log('Workflow Orchestrator initialized with n8n backup service');

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