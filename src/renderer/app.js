const { ipcRenderer } = require('electron');
const React = require('react');
const ReactDOM = require('react-dom');
const { AuthScreen } = require('./components/AuthScreen');

// Main App Component
function App() {
  // Authentication state
  const [user, setUser] = React.useState(null);
  const [authLoading, setAuthLoading] = React.useState(true);
  
  // File manager state
  const [currentDirectory, setCurrentDirectory] = React.useState('');
  const [directoryContents, setDirectoryContents] = React.useState([]);
  const [selectedFiles, setSelectedFiles] = React.useState([]);
  const [navigationHistory, setNavigationHistory] = React.useState([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = React.useState(-1);
  const [aiAnalysis, setAiAnalysis] = React.useState(null);
  const [organizationSuggestions, setOrganizationSuggestions] = React.useState([]);
  const [monitoringStatus, setMonitoringStatus] = React.useState({
    isActive: false,
    watchedDirectories: [],
    queueLength: 0,
    processedFiles: 0
  });
  const [settings, setSettings] = React.useState({
    autoOrganize: true,
    confidenceThreshold: 0.7,
    darkMode: false
  });
  const [demoMode, setDemoMode] = React.useState(false);
  const [demoDirectory, setDemoDirectory] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('browser');
  const [loading, setLoading] = React.useState(false);
  const [organizationMethod, setOrganizationMethod] = React.useState('ai-smart');
  const [undoModalOpen, setUndoModalOpen] = React.useState(false);
  const [backupRecords, setBackupRecords] = React.useState([]);
  
  // Search state
  const [searchResults, setSearchResults] = React.useState([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchHistory, setSearchHistory] = React.useState([]);

  // Initialize app
  React.useEffect(() => {
    checkAuthState();
    setupEventListeners();
    setupKeyboardShortcuts();
  }, []);

  const setupKeyboardShortcuts = () => {
    const handleKeyPress = (event) => {
      // Only handle shortcuts in file browser tab and when user is authenticated
      if (activeTab !== 'browser' || !user) return;
      
      // Alt/Option + Left Arrow = Back
      if (event.altKey && event.key === 'ArrowLeft' && canGoBack) {
        event.preventDefault();
        navigateBack();
      }
      
      // Alt/Option + Right Arrow = Forward
      if (event.altKey && event.key === 'ArrowRight' && canGoForward) {
        event.preventDefault();
        navigateForward();
      }
      
      // Alt/Option + Up Arrow = Up one level
      if (event.altKey && event.key === 'ArrowUp' && canGoUp) {
        event.preventDefault();
        navigateUp();
      }
      
      // Cmd/Ctrl + Home = Go to home directory
      if ((event.metaKey || event.ctrlKey) && event.key === 'Home') {
        event.preventDefault();
        navigateToHome();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    
    // Cleanup on unmount
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  };

  const checkAuthState = async () => {
    try {
      const currentUser = await ipcRenderer.invoke('auth-get-current-user');
      if (currentUser) {
        setUser(currentUser);
        await initializeFileManager();
      }
    } catch (error) {
      console.error('Failed to check auth state:', error);
    } finally {
      setAuthLoading(false);
    }
  };

  const initializeFileManager = async () => {
    try {
      // Check demo mode status
      const isDemoActive = await ipcRenderer.invoke('demo-is-active');
      const demoDir = await ipcRenderer.invoke('demo-get-directory');
      setDemoMode(isDemoActive);
      setDemoDirectory(demoDir);
      
      // Load initial directory (demo or home)
      if (isDemoActive && demoDir) {
        setCurrentDirectory(demoDir);
        await loadDirectoryContents(demoDir);
      } else {
        const userDirs = await ipcRenderer.invoke('get-user-directories');
        setCurrentDirectory(userDirs.home);
        await loadDirectoryContents(userDirs.home);
      }
      
      // Load settings
      const savedSettings = await ipcRenderer.invoke('get-settings');
      if (savedSettings) {
        setSettings(prev => ({ ...prev, ...savedSettings }));
      }
    } catch (error) {
      console.error('Failed to initialize file manager:', error);
    }
  };

  const handleAuthSuccess = async (authenticatedUser) => {
    setUser(authenticatedUser);
    await initializeFileManager();
  };

  const handleSignOut = async () => {
    try {
      await ipcRenderer.invoke('auth-sign-out');
      setUser(null);
      // Clear file manager state
      setCurrentDirectory('');
      setDirectoryContents([]);
      setSelectedFiles([]);
      setAiAnalysis(null);
      setOrganizationSuggestions([]);
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  const setupEventListeners = () => {
    // File analysis complete
    ipcRenderer.on('analysis-complete', (event, data) => {
      setAiAnalysis(data.analysis);
      if (data.analysis.organizationSuggestion) {
        setOrganizationSuggestions(prev => [
          ...prev.slice(-9), // Keep last 10 suggestions
          {
            id: Date.now(),
            ...data.analysis,
            filePath: data.filePath
          }
        ]);
      }
    });

    // Organization suggestion
    ipcRenderer.on('organization-suggestion', (event, suggestion) => {
      setOrganizationSuggestions(prev => [...prev.slice(-9), suggestion]);
    });

    // File organized
    ipcRenderer.on('file-organized', (event, data) => {
      console.log('File organized:', data);
      // Refresh current directory if needed
      if (currentDirectory && data.originalPath.startsWith(currentDirectory)) {
        loadDirectoryContents(currentDirectory);
      }
    });
  };

  const loadDirectoryContents = async (dirPath, addToHistory = true) => {
    setLoading(true);
    try {
      const contents = await ipcRenderer.invoke('get-directory-contents', dirPath);
      setDirectoryContents(contents);
      setCurrentDirectory(dirPath);
      setSelectedFiles([]); // Clear selection when navigating
      
      // Add to navigation history
      if (addToHistory) {
        setNavigationHistory(prev => {
          // Remove any forward history if we're navigating to a new location
          const newHistory = prev.slice(0, currentHistoryIndex + 1);
          newHistory.push(dirPath);
          return newHistory;
        });
        setCurrentHistoryIndex(prev => prev + 1);
      }
    } catch (error) {
      console.error('Failed to load directory:', error);
    } finally {
      setLoading(false);
    }
  };

  const navigateBack = async () => {
    if (currentHistoryIndex > 0) {
      const newIndex = currentHistoryIndex - 1;
      const targetDir = navigationHistory[newIndex];
      setCurrentHistoryIndex(newIndex);
      await loadDirectoryContents(targetDir, false);
    }
  };

  const navigateForward = async () => {
    if (currentHistoryIndex < navigationHistory.length - 1) {
      const newIndex = currentHistoryIndex + 1;
      const targetDir = navigationHistory[newIndex];
      setCurrentHistoryIndex(newIndex);
      await loadDirectoryContents(targetDir, false);
    }
  };

  const navigateUp = async () => {
    if (!currentDirectory) return;
    
    try {
      const parentDir = await ipcRenderer.invoke('get-parent-directory', currentDirectory);
      if (parentDir && parentDir !== currentDirectory) {
        await loadDirectoryContents(parentDir);
      }
    } catch (error) {
      console.error('Failed to navigate up:', error);
    }
  };

  const navigateToHome = async () => {
    try {
      const userDirs = await ipcRenderer.invoke('get-user-directories');
      await loadDirectoryContents(userDirs.home);
    } catch (error) {
      console.error('Failed to navigate to home:', error);
    }
  };

  const canGoBack = currentHistoryIndex > 0;
  const canGoForward = currentHistoryIndex < navigationHistory.length - 1;
  const canGoUp = currentDirectory && currentDirectory !== '/' && currentDirectory.length > 3; // Simple check to avoid root

  const analyzeSelectedFile = async (filePaths) => {
    setLoading(true);
    try {
      // Handle both single file and multiple files
      const files = Array.isArray(filePaths) ? filePaths : [filePaths];
      
      if (files.length === 1) {
        // Single file analysis
        const analysis = await ipcRenderer.invoke('analyze-file', files[0]);
        setAiAnalysis(analysis);
      } else {
        // Batch analysis
        console.log(`Starting batch analysis of ${files.length} files...`);
        setAiAnalysis({ 
          batchAnalysis: true, 
          totalFiles: files.length, 
          processedFiles: 0,
          currentFile: files[0],
          results: []
        });
        
        const results = [];
        for (let i = 0; i < files.length; i++) {
          const filePath = files[i];
          console.log(`Analyzing file ${i + 1}/${files.length}: ${filePath}`);
          
          // Update progress
          setAiAnalysis(prev => ({
            ...prev,
            processedFiles: i,
            currentFile: filePath
          }));
          
          try {
            const analysis = await ipcRenderer.invoke('analyze-file', filePath);
            results.push({ filePath, analysis, success: true });
          } catch (error) {
            console.error(`Analysis failed for ${filePath}:`, error);
            results.push({ filePath, error: error.message, success: false });
          }
        }
        
        // Set final batch results
        setAiAnalysis({
          batchAnalysis: true,
          totalFiles: files.length,
          processedFiles: files.length,
          completed: true,
          results,
          successCount: results.filter(r => r.success).length,
          failureCount: results.filter(r => !r.success).length
        });
        
        console.log(`Batch analysis completed: ${results.filter(r => r.success).length}/${files.length} successful`);
      }
    } catch (error) {
      console.error('Failed to analyze file:', error);
    } finally {
      setLoading(false);
    }
  };

  const organizeFiles = async (organizeAll = false) => {
    const filesToOrganize = organizeAll ? 
      directoryContents.filter(item => !item.isDirectory).map(item => item.path) :
      selectedFiles;
    
    if (filesToOrganize.length === 0) return;
    
    // Get organization method description
    const getMethodDescription = (method) => {
      const descriptions = {
        'ai-smart': 'AI-suggested locations based on content analysis',
        'by-type': 'folders grouped by file type (Documents, Images, Media, etc.)',
        'by-date': 'folders organized by creation date (Today, This Week, etc.)',
        'by-modified': 'folders organized by last modified date',
        'by-size': 'folders grouped by file size (Small, Medium, Large)',
        'by-project': 'AI-detected project categories (Work, Personal, Creative)',
        'alphabetical': 'A-Z folders by first letter of filename',
        'by-source': 'folders based on typical file sources (Downloads, Screenshots, etc.)'
      };
      return descriptions[method] || 'AI-suggested organization';
    };
    
    // Ask for confirmation if organizing all files
    if (organizeAll) {
      const confirmed = confirm(
        `Are you sure you want to organize all ${filesToOrganize.length} files in this directory?\n\n` +
        `Organization method: ${getMethodDescription(organizationMethod)}`
      );
      if (!confirmed) return;
    }
    
    setLoading(true);
    try {
      const result = await ipcRenderer.invoke('organize-files', {
        files: filesToOrganize,
        organizationMethod: organizationMethod,
        sourceDirectory: currentDirectory,
        organizeAll: organizeAll
      });
      
      if (result.success) {
        console.log(`Organized ${result.successCount} files successfully using ${organizationMethod} method`);
        // Refresh current directory
        await loadDirectoryContents(currentDirectory, false);
        setSelectedFiles([]);
      }
    } catch (error) {
      console.error('Failed to organize files:', error);
    } finally {
      setLoading(false);
    }
  };

  const performSearch = async (query, searchType = 'all', searchScope = 'real') => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    setSearchQuery(query);

    try {
      // Determine search directories based on scope
      let searchDirectories;
      if (searchScope === 'demo') {
        searchDirectories = demoMode ? [demoDirectory] : [];
      } else if (searchScope === 'real') {
        searchDirectories = undefined; // Will use default real directories
      } else if (searchScope === 'both') {
        searchDirectories = demoMode ? [demoDirectory] : undefined;
      }

      const results = await ipcRenderer.invoke('search-files', {
        query: query.trim(),
        searchType: searchType, // 'name', 'content', 'all'
        includeAnalysis: true,
        directories: searchDirectories,
        searchScope: searchScope // Pass scope to backend
      });

      setSearchResults(results);
      
      // Add to search history
      setSearchHistory(prev => {
        const newHistory = [query, ...prev.filter(h => h !== query)].slice(0, 10);
        return newHistory;
      });

      // Switch to search tab to show results
      if (results.length > 0) {
        setActiveTab('search');
      }
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchLoading(false);
  };

  const loadBackupRecords = async () => {
    try {
      const records = await ipcRenderer.invoke('get-backup-records');
      setBackupRecords(records);
    } catch (error) {
      console.error('Failed to load backup records:', error);
    }
  };

  const undoOrganization = async (backupId) => {
    try {
      const result = await ipcRenderer.invoke('undo-organization', backupId);
      if (result.success) {
        // Refresh backup records
        await loadBackupRecords();
        // Refresh current directory if needed
        await loadDirectoryContents(currentDirectory, false);
        return result;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Failed to undo organization:', error);
      throw error;
    }
  };

  const openUndoModal = async () => {
    await loadBackupRecords();
    setUndoModalOpen(true);
  };

  // Show loading screen while checking auth
  if (authLoading) {
    return React.createElement('div', { className: 'app-loading' },
      React.createElement('div', { className: 'loading-container' },
        React.createElement('div', { className: 'spinner' }),
        React.createElement('div', { className: 'loading-text' }, 'Initializing FlowGenius...')
      )
    );
  }

  // Show authentication screen if not logged in
  if (!user) {
    return React.createElement(AuthScreen, {
      onAuthSuccess: handleAuthSuccess
    });
  }

  // Show main file manager interface if logged in
  return React.createElement('div', { className: 'app' },
    React.createElement(Header, { 
      activeTab, 
      setActiveTab,
      monitoringStatus,
      user,
      onSignOut: handleSignOut,
      demoMode
    }),
    
    React.createElement('div', { className: 'main-content' },
      activeTab === 'browser' && React.createElement(FileBrowser, {
        currentDirectory,
        directoryContents,
        selectedFiles,
        setSelectedFiles,
        onDirectoryChange: loadDirectoryContents,
        onFileAnalyze: analyzeSelectedFile,
        onOrganizeFiles: organizeFiles,
        onNavigateBack: navigateBack,
        onNavigateForward: navigateForward,
        onNavigateUp: navigateUp,
        onNavigateHome: navigateToHome,
        canGoBack,
        canGoForward,
        canGoUp,
        loading,
        organizationMethod,
        setOrganizationMethod,
        onOpenUndo: openUndoModal
      }),
      
      activeTab === 'demo' && demoMode && React.createElement(DemoExplorer, {
        demoDirectory,
        onFileAnalyze: analyzeSelectedFile,
        aiAnalysis,
        organizationSuggestions,
        organizationMethod,
        setOrganizationMethod,
        onOpenUndo: openUndoModal
      }),
      
      activeTab === 'search' && React.createElement(SearchPanel, {
        searchQuery,
        searchResults,
        searchLoading,
        searchHistory,
        onSearch: performSearch,
        onClearSearch: clearSearch,
        onFileAnalyze: analyzeSelectedFile,
        onFileSelect: (filePath) => {
          // Navigate to file location if it's in current directory system
          if (!demoMode && filePath.includes('/')) {
            const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));
            loadDirectoryContents(parentDir);
            setActiveTab('browser');
          }
        }
      }),
      
      activeTab === 'analysis' && React.createElement(AnalysisPanel, {
        aiAnalysis,
        organizationSuggestions,
        onAnalyzeFile: analyzeSelectedFile
      }),
      
      activeTab === 'monitoring' && React.createElement(MonitoringPanel, {
        status: monitoringStatus,
        organizationSuggestions
      }),
      
      activeTab === 'settings' && React.createElement(SettingsPanel, {
        settings,
        setSettings,
        demoMode,
        setDemoMode,
        demoDirectory,
        onDirectoryChange: loadDirectoryContents
      })
    ),

    // Undo Modal
    undoModalOpen && React.createElement(UndoModal, {
      backupRecords,
      onClose: () => setUndoModalOpen(false),
      onUndo: undoOrganization,
      onRefresh: loadBackupRecords
    })
  );
}

// Expandable Result Item Component for Batch Analysis
function ExpandableResultItem({ result, index }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const iconMap = {
      'pdf': '📄', 'doc': '📝', 'docx': '📝', 'txt': '📃', 'md': '📃',
      'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
      'mp4': '🎬', 'avi': '🎬', 'mov': '🎬',
      'mp3': '🎵', 'wav': '🎵', 'flac': '🎵',
      'zip': '📦', 'rar': '📦', '7z': '📦',
      'js': '💻', 'py': '💻', 'java': '💻', 'cpp': '💻',
      'html': '🌐', 'css': '🎨', 'json': '📋'
    };
    return iconMap[ext] || '📄';
  };

  if (!result.success) {
    return React.createElement('div', { className: 'expandable-result-item error' },
      React.createElement('div', { className: 'result-summary-header' },
        React.createElement('span', { className: 'result-icon' }, '❌'),
        React.createElement('span', { className: 'file-name' }, result.filePath.split('/').pop()),
        React.createElement('span', { className: 'error-badge' }, 'Failed')
      ),
      React.createElement('div', { className: 'error-details' },
        React.createElement('span', { className: 'error-message' }, result.error)
      )
    );
  }

  const analysis = result.analysis;
  const fileName = result.filePath.split('/').pop();

  return React.createElement('div', { 
    className: `expandable-result-item success${isExpanded ? ' expanded' : ''}` 
  },
    // Compact summary header (always visible)
    React.createElement('div', { 
      className: 'result-summary-header',
      onClick: toggleExpanded
    },
      React.createElement('div', { className: 'header-left' },
        React.createElement('span', { className: 'file-icon' }, getFileIcon(fileName)),
        React.createElement('span', { className: 'file-name' }, fileName),
        React.createElement('span', { className: 'classification-compact' }, 
          `${analysis.classification || 'Unknown'} (${Math.round((analysis.confidence || 0) * 100)}%)`
        )
      ),
      React.createElement('div', { className: 'header-right' },
        analysis.importance && React.createElement('span', { 
          className: `importance-micro ${analysis.importance}` 
        }, analysis.importance),
        React.createElement('span', { className: 'expand-icon' }, isExpanded ? '🔽' : '▶️')
      )
    ),

    // One-line summary (always visible) 
    React.createElement('div', { className: 'quick-summary' },
      React.createElement('span', { className: 'summary-preview' }, 
        analysis.summary && analysis.summary.length > 10 ? 
          (analysis.summary.length > 80 ? 
            analysis.summary.substring(0, 80) + '...' : 
            analysis.summary) :
          // Fallback to constructed summary if AI summary is poor
          (() => {
            let summaryParts = [];
            
            // Build a meaningful description from available data
            if (analysis.documentType && analysis.documentType !== analysis.classification) {
              summaryParts.push(analysis.documentType);
            } else if (analysis.subCategory) {
              summaryParts.push(analysis.subCategory);
            }
            
            // Add key information
            if (analysis.keyTopics && analysis.keyTopics.length > 0) {
              summaryParts.push(`about ${analysis.keyTopics.slice(0, 2).join(' and ')}`);
            }
            
            // Add context from entities
            if (analysis.entities) {
              let entityInfo = [];
              if (analysis.entities.dates && analysis.entities.dates.length > 0) {
                entityInfo.push(`dated ${analysis.entities.dates[0]}`);
              }
              if (analysis.entities.amounts && analysis.entities.amounts.length > 0) {
                entityInfo.push(`amount: ${analysis.entities.amounts[0]}`);
              }
              if (analysis.entities.names && analysis.entities.names.length > 0) {
                entityInfo.push(`for ${analysis.entities.names[0]}`);
              }
              if (entityInfo.length > 0) {
                summaryParts.push(`(${entityInfo.slice(0, 2).join(', ')})`);
              }
            }
            
            // Add purpose if meaningful
            if (analysis.purpose && !analysis.purpose.toLowerCase().includes('unknown')) {
              summaryParts.push(`- ${analysis.purpose.toLowerCase()}`);
            }
            
            // Construct final summary
            if (summaryParts.length > 0) {
              return summaryParts.join(' ');
            } else {
              // Last resort fallback based on filename
              const baseName = fileName.replace(/\.(txt|pdf|doc|docx)$/i, '');
              const words = baseName.split(/[_\-\s]+/).filter(w => w.length > 2);
              if (words.length > 0) {
                return `File containing information about ${words.slice(0, 3).join(', ').toLowerCase()}`;
              }
              return `${analysis.classification || 'Document'} file${analysis.importance ? ` (${analysis.importance} priority)` : ''}`;
            }
          })()
      )
    ),

    // Expandable detailed section
    isExpanded && React.createElement('div', { className: 'expanded-details' },
      // Classification details
      React.createElement('div', { className: 'detail-section' },
        React.createElement('h6', null, '🏷️ Classification'),
        React.createElement('div', { className: 'detail-grid' },
          analysis.subCategory && React.createElement('div', { className: 'detail-item' },
            React.createElement('span', { className: 'detail-label' }, 'Type:'),
            React.createElement('span', { className: 'detail-value' }, analysis.subCategory)
          ),
          analysis.documentType && React.createElement('div', { className: 'detail-item' },
            React.createElement('span', { className: 'detail-label' }, 'Document:'),
            React.createElement('span', { className: 'detail-value' }, analysis.documentType)
          ),
          analysis.purpose && React.createElement('div', { className: 'detail-item' },
            React.createElement('span', { className: 'detail-label' }, 'Purpose:'),
            React.createElement('span', { className: 'detail-value' }, analysis.purpose)
          )
        )
      ),

      // Key information
      (analysis.keyTopics || analysis.entities) && React.createElement('div', { className: 'detail-section' },
        React.createElement('h6', null, '🔍 Key Information'),
        analysis.keyTopics && analysis.keyTopics.length > 0 && React.createElement('div', { className: 'topics-compact' },
          React.createElement('span', { className: 'detail-label' }, 'Topics: '),
          React.createElement('span', { className: 'topics-list' }, analysis.keyTopics.slice(0, 3).join(', '))
        ),
        analysis.entities && analysis.entities.dates && analysis.entities.dates.length > 0 && 
        React.createElement('div', { className: 'entities-compact' },
          React.createElement('span', { className: 'detail-label' }, 'Dates: '),
          React.createElement('span', { className: 'entities-list' }, analysis.entities.dates.slice(0, 2).join(', '))
        ),
        analysis.entities && analysis.entities.amounts && analysis.entities.amounts.length > 0 && 
        React.createElement('div', { className: 'entities-compact' },
          React.createElement('span', { className: 'detail-label' }, 'Amounts: '),
          React.createElement('span', { className: 'entities-list' }, analysis.entities.amounts.slice(0, 2).join(', '))
        )
      ),

      // Tags
      analysis.tags && analysis.tags.length > 0 && React.createElement('div', { className: 'detail-section' },
        React.createElement('h6', null, '🏷️ Tags'),
        React.createElement('div', { className: 'tags-compact' },
          analysis.tags.slice(0, 6).map((tag, i) =>
            React.createElement('span', { key: i, className: 'tag-compact' }, tag)
          )
        )
      )
    )
  );
}

// Header Component
function Header({ activeTab, setActiveTab, monitoringStatus, user, onSignOut, demoMode }) {
  const tabs = [
    { id: 'browser', label: 'File Browser', icon: '📁' },
    { id: 'search', label: 'AI Search', icon: '🔍' },
    { id: 'analysis', label: 'AI Analysis', icon: '🧠' },
    { id: 'monitoring', label: 'Monitoring', icon: '👁️' },
    { id: 'settings', label: 'Settings', icon: '⚙️' }
  ];

  // Add demo tab at the very beginning if demo mode is active
  if (demoMode) {
    tabs.unshift({ id: 'demo', label: 'Demo Explorer', icon: '🎭' });
  }

  return React.createElement('header', { className: 'header' },
    React.createElement('div', { className: 'header-left' },
      React.createElement('h1', { className: 'app-title' },
        React.createElement('span', { className: 'app-icon' }, '🔮'),
        'FlowGenius',
        demoMode && React.createElement('span', { className: 'demo-badge' }, '🎭 DEMO')
      )
    ),
    
    React.createElement('nav', { className: 'tab-nav' },
      tabs.map(tab => 
        React.createElement('button', {
          key: tab.id,
          className: `tab-button ${activeTab === tab.id ? 'active' : ''} ${tab.id === 'demo' ? 'demo-tab' : ''} ${tab.id === 'search' ? 'search-tab' : ''}`,
          onClick: () => setActiveTab(tab.id)
        },
          React.createElement('span', { className: 'tab-icon' }, tab.icon),
          tab.label,
          tab.id === 'monitoring' && monitoringStatus.queueLength > 0 && 
            React.createElement('span', { className: 'badge' }, monitoringStatus.queueLength),
          tab.id === 'demo' && React.createElement('span', { className: 'demo-tab-badge' }, 'SAFE'),
          tab.id === 'search' && React.createElement('span', { className: 'search-tab-badge' }, 'AI')
        )
      )
    ),

    React.createElement('div', { className: 'header-right' },
      React.createElement('div', { className: 'user-info' },
        React.createElement('span', { className: 'user-icon' }, '👤'),
        React.createElement('span', { className: 'user-name' }, 
          user?.displayName || user?.email || 'User'
        )
      ),
      React.createElement('button', {
        className: 'sign-out-btn',
        onClick: onSignOut,
        title: 'Sign Out'
      }, '🚪')
    )
  );
}

// File Browser Component
function FileBrowser({ 
  currentDirectory, 
  directoryContents, 
  selectedFiles, 
  setSelectedFiles,
  onDirectoryChange,
  onFileAnalyze,
  onOrganizeFiles,
  onNavigateBack,
  onNavigateForward,
  onNavigateUp,
  onNavigateHome,
  canGoBack,
  canGoForward,
  canGoUp,
  loading,
  organizationMethod,
  setOrganizationMethod,
  onOpenUndo
}) {
  const handleFileSelect = (filePath) => {
    setSelectedFiles(prev => {
      if (prev.includes(filePath)) {
        return prev.filter(f => f !== filePath);
      } else {
        return [...prev, filePath];
      }
    });
  };

  const handleDirectoryClick = (dirPath) => {
    onDirectoryChange(dirPath);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString();
  };

  const getFileIcon = (item) => {
    if (item.isDirectory) return '📁';
    
    const ext = item.name.split('.').pop()?.toLowerCase();
    const iconMap = {
      'pdf': '📄',
      'doc': '📝', 'docx': '📝',
      'txt': '📃', 'md': '📃',
      'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
      'mp4': '🎬', 'avi': '🎬', 'mov': '🎬',
      'mp3': '🎵', 'wav': '🎵', 'flac': '🎵',
      'zip': '📦', 'rar': '📦', '7z': '📦',
      'js': '💻', 'py': '💻', 'java': '💻', 'cpp': '💻',
      'html': '🌐', 'css': '🎨', 'json': '📋'
    };
    
    return iconMap[ext] || '📄';
  };

  const generateBreadcrumbs = () => {
    if (!currentDirectory) return [];
    
    const separator = process.platform === 'win32' ? '\\' : '/';
    const parts = currentDirectory.split(separator).filter(part => part.length > 0);
    const breadcrumbs = [];
    
    // Add root/home icon at the beginning
    breadcrumbs.push({
      name: '🏠',
      path: '', // Will be handled specially
      isHome: true
    });
    
    // Add path parts
    let currentPath = '';
    parts.forEach((part, index) => {
      if (process.platform === 'win32') {
        currentPath = index === 0 ? part : currentPath + separator + part;
      } else {
        currentPath = (index === 0 ? '' : currentPath) + separator + part;
      }
      
      breadcrumbs.push({
        name: part,
        path: currentPath,
        isHome: false
      });
    });
    
    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  return React.createElement('div', { className: 'file-browser' },
    React.createElement('div', { className: 'browser-toolbar' },
      // Navigation Controls
      React.createElement('div', { className: 'navigation-controls' },
        React.createElement('button', {
          className: `nav-btn ${!canGoBack ? 'disabled' : ''}`,
          onClick: onNavigateBack,
          disabled: !canGoBack,
          title: 'Go Back'
        }, '⬅️'),
        
        React.createElement('button', {
          className: `nav-btn ${!canGoForward ? 'disabled' : ''}`,
          onClick: onNavigateForward,
          disabled: !canGoForward,
          title: 'Go Forward'
        }, '➡️'),
        
        React.createElement('button', {
          className: `nav-btn ${!canGoUp ? 'disabled' : ''}`,
          onClick: onNavigateUp,
          disabled: !canGoUp,
          title: 'Go Up'
        }, '⬆️'),
        
        React.createElement('button', {
          className: 'nav-btn',
          onClick: onNavigateHome,
          title: 'Go Home'
        }, '🏠')
      ),

      // Breadcrumb Navigation
      React.createElement('div', { className: 'breadcrumb-nav' },
        breadcrumbs.map((crumb, index) =>
          React.createElement('span', { key: index, className: 'breadcrumb-container' },
            index > 0 && React.createElement('span', { className: 'breadcrumb-separator' }, '/'),
            React.createElement('button', {
              className: `breadcrumb ${index === breadcrumbs.length - 1 ? 'current' : ''}`,
              onClick: () => {
                if (index === breadcrumbs.length - 1) return; // Current directory, do nothing
                if (crumb.isHome) {
                  onNavigateHome();
                } else {
                  onDirectoryChange(crumb.path);
                }
              },
              disabled: index === breadcrumbs.length - 1
            }, crumb.name)
          )
        )
      ),
      
      // Action Buttons
      React.createElement('div', { className: 'toolbar-actions' },
        React.createElement('button', {
          className: 'btn btn-primary',
          onClick: () => selectedFiles.length > 0 && onFileAnalyze(selectedFiles.length === 1 ? selectedFiles[0] : selectedFiles),
          disabled: selectedFiles.length === 0 || loading
        }, selectedFiles.length === 1 ? '🧠 Analyze Selected' : `🧠 Analyze ${selectedFiles.length} Files`),
        
        React.createElement('div', { className: 'organization-controls' },
          React.createElement('div', { className: 'organization-method-selector' },
            React.createElement('label', { className: 'method-label' }, '📋 Method:'),
            React.createElement('select', {
              className: 'method-select',
              value: organizationMethod,
              onChange: (e) => setOrganizationMethod(e.target.value),
              disabled: loading
            },
              React.createElement('option', { value: 'ai-smart' }, '🧠 AI Smart'),
              React.createElement('option', { value: 'by-type' }, '📁 By Type'),
              React.createElement('option', { value: 'by-date' }, '📅 By Date Created'),
              React.createElement('option', { value: 'by-modified' }, '🕒 By Modified'),
              React.createElement('option', { value: 'by-size' }, '📏 By Size'),
              React.createElement('option', { value: 'by-project' }, '🎯 By Project'),
              React.createElement('option', { value: 'alphabetical' }, '🔤 A-Z'),
              React.createElement('option', { value: 'by-source' }, '📍 By Source')
            )
          ),
          
          React.createElement('div', { className: 'organize-buttons' },
            React.createElement('button', {
              className: 'btn btn-success',
              onClick: () => onOrganizeFiles(false),
              disabled: selectedFiles.length === 0 || loading
            }, `✨ Organize Selected (${selectedFiles.length})`),
            
            React.createElement('button', {
              className: 'btn btn-secondary',
              onClick: () => onOrganizeFiles(true),
              disabled: directoryContents.filter(item => !item.isDirectory).length === 0 || loading
            }, `🗂️ Organize All (${directoryContents.filter(item => !item.isDirectory).length})`),
            
            React.createElement('button', {
              className: 'btn btn-outline btn-sm',
              onClick: onOpenUndo,
              disabled: loading,
              title: 'Undo recent file organization'
            }, '↩️ Undo')
          )
        )
      )
    ),

    React.createElement('div', { className: 'file-list' },
      loading ? 
        React.createElement('div', { className: 'loading-state' },
          React.createElement('div', { className: 'spinner' }),
          React.createElement('span', null, 'Loading...')
        ) :
        React.createElement('table', { className: 'file-table' },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, ''),
              React.createElement('th', null, 'Name'),
              React.createElement('th', null, 'Size'),
              React.createElement('th', null, 'Modified'),
              React.createElement('th', null, 'Type')
            )
          ),
          React.createElement('tbody', null,
            directoryContents.map((item, index) =>
              React.createElement('tr', {
                key: index,
                className: `file-row ${selectedFiles.includes(item.path) ? 'selected' : ''}`,
                onClick: () => item.isDirectory ? handleDirectoryClick(item.path) : handleFileSelect(item.path)
              },
                React.createElement('td', { className: 'file-icon' }, getFileIcon(item)),
                React.createElement('td', { className: 'file-name' }, item.name),
                React.createElement('td', { className: 'file-size' }, 
                  item.isDirectory ? '-' : formatFileSize(item.size)
                ),
                React.createElement('td', { className: 'file-date' }, formatDate(item.modified)),
                React.createElement('td', { className: 'file-type' }, 
                  item.isDirectory ? 'Folder' : 'File'
                )
              )
            )
          )
        )
    ),
    
    // Status Bar
    React.createElement('div', { className: 'status-bar' },
      React.createElement('div', { className: 'status-left' },
        React.createElement('span', { className: 'status-text' },
          `${directoryContents.length} item${directoryContents.length !== 1 ? 's' : ''}`
        ),
        React.createElement('span', { className: 'status-separator' }, '•'),
        React.createElement('span', { className: 'status-text' },
          `${directoryContents.filter(item => !item.isDirectory).length} file${directoryContents.filter(item => !item.isDirectory).length !== 1 ? 's' : ''}`
        )
      ),
      React.createElement('div', { className: 'status-right' },
        selectedFiles.length > 0 && React.createElement('span', { className: 'status-text' },
          `${selectedFiles.length} selected`
        )
      )
    )
  );
}

// Analysis Panel Component
function AnalysisPanel({ aiAnalysis, organizationSuggestions, onAnalyzeFile }) {
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);

  const handleQuickAnalyze = async () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = false;
    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        setIsAnalyzing(true);
        try {
          // For demo purposes, we'll analyze a demo file
          // In real implementation, this would analyze the selected file
          await onAnalyzeFile(file.path || 'demo-file');
        } catch (error) {
          console.error('Analysis failed:', error);
        } finally {
          setIsAnalyzing(false);
        }
      }
    };
    fileInput.click();
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return '#38a169'; // Green
    if (confidence >= 0.6) return '#ed8936'; // Orange  
    return '#e53e3e'; // Red
  };

  const formatConfidence = (confidence) => {
    return `${Math.round(confidence * 100)}%`;
  };

  const getClassificationDescription = (classification) => {
    const descriptions = {
      'document': 'Text-based files like PDFs, Word docs, or important papers',
      'code': 'Programming files, scripts, and development-related content',
      'media': 'Images, videos, audio files, and multimedia content',
      'work': 'Professional documents, presentations, and business files',
      'personal': 'Private documents, photos, and personal content',
      'financial': 'Invoices, receipts, bank statements, and money-related files',
      'educational': 'Study materials, research papers, and learning content',
      'archive': 'Compressed files, backups, and archived content',
      'temporary': 'Cache files, logs, and temporary system files',
      'misc': 'Miscellaneous files that don\'t fit standard categories'
    };
    
    return descriptions[classification] || 'File type could not be determined with high confidence';
  };

  return React.createElement('div', { className: 'analysis-panel' },
    React.createElement('h2', null, '🧠 AI Analysis & Insights'),
    
    // Quick actions
    React.createElement('div', { className: 'analysis-actions' },
      React.createElement('button', {
        className: 'btn btn-primary',
        onClick: handleQuickAnalyze,
        disabled: isAnalyzing
      }, isAnalyzing ? '⏳ Analyzing...' : '📁 Analyze File'),
      
      React.createElement('div', { className: 'analysis-tip' },
        '💡 Tip: Select a file in File Browser or Demo Explorer, then click "Analyze Selected"'
      )
    ),

    aiAnalysis ? 
      // Check if it's batch analysis or single file analysis
      aiAnalysis.batchAnalysis ? 
        // Batch Analysis Results
        React.createElement('div', { className: 'batch-analysis-results' },
          React.createElement('div', { className: 'batch-header' },
            React.createElement('h3', null, 
              React.createElement('span', { className: 'batch-icon' }, '🔄'),
              `Batch Analysis${aiAnalysis.completed ? ' - Complete' : ' - In Progress'}`
            ),
            React.createElement('div', { className: 'batch-progress' },
              React.createElement('span', { className: 'progress-text' }, 
                `${aiAnalysis.processedFiles}/${aiAnalysis.totalFiles} files processed`
              ),
              React.createElement('div', { className: 'progress-bar' },
                React.createElement('div', { 
                  className: 'progress-fill',
                  style: { width: `${(aiAnalysis.processedFiles / aiAnalysis.totalFiles) * 100}%` }
                })
              )
            )
          ),

          aiAnalysis.completed ? 
            // Show batch results summary
            React.createElement('div', { className: 'batch-summary' },
              React.createElement('div', { className: 'summary-stats' },
                React.createElement('div', { className: 'stat-card success' },
                  React.createElement('div', { className: 'stat-number' }, aiAnalysis.successCount),
                  React.createElement('div', { className: 'stat-label' }, 'Successful')
                ),
                React.createElement('div', { className: 'stat-card failure' },
                  React.createElement('div', { className: 'stat-number' }, aiAnalysis.failureCount),
                  React.createElement('div', { className: 'stat-label' }, 'Failed')
                ),
                React.createElement('div', { className: 'stat-card total' },
                  React.createElement('div', { className: 'stat-number' }, aiAnalysis.totalFiles),
                  React.createElement('div', { className: 'stat-label' }, 'Total Files')
                )
              ),

              // Detailed results list with expandable items
              React.createElement('div', { className: 'batch-results-list' },
                React.createElement('h4', null, '📋 Analysis Results'),
                React.createElement('div', { className: 'results-container' },
                  aiAnalysis.results.map((result, index) =>
                    React.createElement(ExpandableResultItem, { 
                      key: index,
                      result: result,
                      index: index
                    })
                  )
                )
              )
            ) :
            // Show current processing status
            React.createElement('div', { className: 'batch-processing' },
              React.createElement('div', { className: 'processing-item' },
                React.createElement('div', { className: 'spinner' }),
                React.createElement('span', { className: 'processing-text' }, 
                  `Analyzing: ${aiAnalysis.currentFile ? aiAnalysis.currentFile.split('/').pop() : '...'}`
                )
              )
            )
        ) :
        // Single File Analysis Results
        React.createElement('div', { className: 'analysis-results' },
          // File Information Header
          React.createElement('div', { className: 'analysis-header' },
            React.createElement('div', { className: 'file-info' },
              React.createElement('h3', { className: 'file-name' }, 
                React.createElement('span', { className: 'file-icon' }, '📄'),
                aiAnalysis.fileName
              ),
            React.createElement('div', { className: 'file-metadata' },
              React.createElement('span', { className: 'file-size' }, 
                `Size: ${aiAnalysis.fileSize ? (aiAnalysis.fileSize / 1024).toFixed(1) + ' KB' : 'Unknown'}`
              ),
              React.createElement('span', { className: 'file-type' }, 
                `Type: ${aiAnalysis.fileExtension || 'Unknown'}`
              ),
              aiAnalysis.timestamp && React.createElement('span', { className: 'analysis-time' }, 
                `Analyzed: ${new Date(aiAnalysis.timestamp).toLocaleString()}`
              )
            )
          )
        ),

        // Summary Section (if available)
        aiAnalysis.summary && React.createElement('div', { className: 'analysis-section summary-section' },
          React.createElement('h4', null, '📋 Content Summary'),
          React.createElement('div', { className: 'content-summary' },
            React.createElement('p', { className: 'summary-text' }, aiAnalysis.summary)
          )
        ),

        // Classification Section
        React.createElement('div', { className: 'analysis-section classification-section' },
          React.createElement('h4', null, '🏷️ Classification & Type'),
          React.createElement('div', { className: 'classification-result' },
            React.createElement('div', { className: 'classification-grid' },
              React.createElement('div', { className: 'classification-item' },
                React.createElement('div', { className: 'classification-main' },
                  React.createElement('span', { className: 'classification-label' }, 
                    aiAnalysis.classification ? aiAnalysis.classification.charAt(0).toUpperCase() + aiAnalysis.classification.slice(1) : 'Unknown'
                  ),
                  React.createElement('span', { 
                    className: 'confidence-badge',
                    style: { backgroundColor: getConfidenceColor(aiAnalysis.confidence || 0) }
                  }, formatConfidence(aiAnalysis.confidence || 0))
                )
              ),
              aiAnalysis.subCategory && React.createElement('div', { className: 'classification-item' },
                React.createElement('span', { className: 'classification-sublabel' }, 'Sub-type:'),
                React.createElement('span', { className: 'classification-subvalue' }, aiAnalysis.subCategory)
              ),
              aiAnalysis.documentType && React.createElement('div', { className: 'classification-item' },
                React.createElement('span', { className: 'classification-sublabel' }, 'Document Type:'),
                React.createElement('span', { className: 'classification-subvalue' }, aiAnalysis.documentType)
              ),
              aiAnalysis.importance && React.createElement('div', { className: 'classification-item' },
                React.createElement('span', { className: 'classification-sublabel' }, 'Importance:'),
                React.createElement('span', { 
                  className: `importance-badge ${aiAnalysis.importance}` 
                }, aiAnalysis.importance.charAt(0).toUpperCase() + aiAnalysis.importance.slice(1))
              )
            ),
            React.createElement('div', { className: 'classification-description' },
              getClassificationDescription(aiAnalysis.classification)
            )
          )
        ),

        // Key Topics Section
        aiAnalysis.keyTopics && aiAnalysis.keyTopics.length > 0 && React.createElement('div', { className: 'analysis-section topics-section' },
          React.createElement('h4', null, '🎯 Key Topics'),
          React.createElement('div', { className: 'topics-container' },
            aiAnalysis.keyTopics.map((topic, index) =>
              React.createElement('span', { 
                key: index, 
                className: 'topic-chip' 
              }, topic)
            )
          )
        ),

        // Purpose & Context
        (aiAnalysis.purpose || aiAnalysis.urgency) && React.createElement('div', { className: 'analysis-section context-section' },
          React.createElement('h4', null, '🎯 Purpose & Context'),
          React.createElement('div', { className: 'context-grid' },
            aiAnalysis.purpose && React.createElement('div', { className: 'context-item' },
              React.createElement('span', { className: 'context-label' }, 'Purpose:'),
              React.createElement('span', { className: 'context-value' }, aiAnalysis.purpose)
            ),
            aiAnalysis.urgency && React.createElement('div', { className: 'context-item' },
              React.createElement('span', { className: 'context-label' }, 'Urgency:'),
              React.createElement('span', { 
                className: `urgency-badge ${aiAnalysis.urgency}` 
              }, aiAnalysis.urgency.charAt(0).toUpperCase() + aiAnalysis.urgency.slice(1))
            )
          )
        ),

        // Entities Section
        aiAnalysis.entities && Object.keys(aiAnalysis.entities).some(key => aiAnalysis.entities[key] && aiAnalysis.entities[key].length > 0) && 
        React.createElement('div', { className: 'analysis-section entities-section' },
          React.createElement('h4', null, '🔍 Extracted Information'),
          React.createElement('div', { className: 'entities-grid' },
            aiAnalysis.entities.dates && aiAnalysis.entities.dates.length > 0 && 
            React.createElement('div', { className: 'entity-group' },
              React.createElement('h5', null, '📅 Dates'),
              React.createElement('div', { className: 'entity-tags' },
                aiAnalysis.entities.dates.map((date, index) =>
                  React.createElement('span', { key: index, className: 'entity-tag date' }, date)
                )
              )
            ),
            aiAnalysis.entities.amounts && aiAnalysis.entities.amounts.length > 0 && 
            React.createElement('div', { className: 'entity-group' },
              React.createElement('h5', null, '💰 Amounts'),
              React.createElement('div', { className: 'entity-tags' },
                aiAnalysis.entities.amounts.map((amount, index) =>
                  React.createElement('span', { key: index, className: 'entity-tag amount' }, amount)
                )
              )
            ),
            aiAnalysis.entities.names && aiAnalysis.entities.names.length > 0 && 
            React.createElement('div', { className: 'entity-group' },
              React.createElement('h5', null, '👤 Names'),
              React.createElement('div', { className: 'entity-tags' },
                aiAnalysis.entities.names.map((name, index) =>
                  React.createElement('span', { key: index, className: 'entity-tag name' }, name)
                )
              )
            ),
            aiAnalysis.entities.keywords && aiAnalysis.entities.keywords.length > 0 && 
            React.createElement('div', { className: 'entity-group' },
              React.createElement('h5', null, '🔑 Keywords'),
              React.createElement('div', { className: 'entity-tags' },
                aiAnalysis.entities.keywords.map((keyword, index) =>
                  React.createElement('span', { key: index, className: 'entity-tag keyword' }, keyword)
                )
              )
            )
          )
        ),

        // Tags Section
        aiAnalysis.tags && aiAnalysis.tags.length > 0 && React.createElement('div', { className: 'analysis-section tags-section' },
          React.createElement('h4', null, '🏷️ Smart Tags'),
          React.createElement('div', { className: 'tags-container' },
            aiAnalysis.tags.map((tag, index) =>
              React.createElement('span', { 
                key: index, 
                className: 'tag-chip' 
              }, tag)
            )
          ),
          React.createElement('p', { className: 'tags-description' },
            'These tags help organize and search for your files more effectively.'
          )
        ),

        // Content Preview
        aiAnalysis.content && React.createElement('div', { className: 'analysis-section content-section' },
          React.createElement('h4', null, '📝 Content Preview'),
          React.createElement('div', { className: 'content-preview' },
            React.createElement('pre', { className: 'content-text' }, 
              aiAnalysis.content.substring(0, 300) + (aiAnalysis.content.length > 300 ? '...' : '')
            )
          )
        ),

        // Organization Suggestion
        aiAnalysis.organizationSuggestion && React.createElement('div', { className: 'analysis-section organization-section' },
          React.createElement('h4', null, '📂 Organization Recommendation'),
          React.createElement('div', { className: 'organization-suggestion' },
            React.createElement('div', { className: 'suggested-path' },
              React.createElement('span', { className: 'path-icon' }, '📁'),
              React.createElement('code', { className: 'path-text' }, 
                aiAnalysis.organizationSuggestion.relativePath || aiAnalysis.organizationSuggestion.fullPath
              )
            ),
            React.createElement('p', { className: 'suggestion-reasoning' },
              aiAnalysis.organizationSuggestion.reasoning || 'AI recommends this location based on file content and type.'
            ),
            React.createElement('div', { className: 'organization-benefits' },
              React.createElement('h5', null, '✨ Benefits of this organization:'),
              React.createElement('ul', null,
                React.createElement('li', null, 'Easy to find similar files'),
                React.createElement('li', null, 'Consistent folder structure'),
                React.createElement('li', null, 'Better file discoverability'),
                React.createElement('li', null, 'Automated future organization')
              )
            )
          )
        ),

        // AI Insights
        React.createElement('div', { className: 'analysis-section insights-section' },
          React.createElement('h4', null, '💡 AI Insights'),
          React.createElement('div', { className: 'insights-grid' },
            React.createElement('div', { className: 'insight-card' },
              React.createElement('h5', null, '🎯 Accuracy'),
              React.createElement('p', null, 
                aiAnalysis.confidence >= 0.8 ? 'High confidence classification - very reliable results.' :
                aiAnalysis.confidence >= 0.6 ? 'Good confidence - results are likely accurate.' :
                'Lower confidence - manual review recommended.'
              )
            ),
            React.createElement('div', { className: 'insight-card' },
              React.createElement('h5', null, '⚡ Processing'),
              React.createElement('p', null, 'File analyzed using advanced AI including content extraction, pattern recognition, and semantic understanding.')
            ),
            React.createElement('div', { className: 'insight-card' },
              React.createElement('h5', null, '🔮 Automation'),
              React.createElement('p', null, 'This analysis enables automatic organization, smart search, and intelligent file management.')
            )
          )
        )
      ) :
      // No Analysis State
      React.createElement('div', { className: 'no-analysis-state' },
        React.createElement('div', { className: 'empty-state-icon' }, '🧠'),
        React.createElement('h3', null, 'No file analyzed yet'),
        React.createElement('p', null, 'Select a file and click "Analyze Selected" to see detailed AI insights including:'),
        React.createElement('ul', { className: 'feature-list' },
          React.createElement('li', null, '🏷️ Smart classification and categorization'),
          React.createElement('li', null, '📝 Content analysis and extraction'),
          React.createElement('li', null, '🏷️ Automatic tag generation'),
          React.createElement('li', null, '📂 Organization recommendations'),
          React.createElement('li', null, '💡 AI-powered insights and suggestions')
        ),
        React.createElement('div', { className: 'getting-started' },
          React.createElement('h4', null, '🚀 Getting Started:'),
          React.createElement('ol', null,
            React.createElement('li', null, 'Go to File Browser or Demo Explorer'),
            React.createElement('li', null, 'Click on any file to select it'),
            React.createElement('li', null, 'Click "🧠 Analyze Selected" button'),
            React.createElement('li', null, 'Return here to see detailed results')
          )
        )
      )
  );
}

// Monitoring Panel Component
function MonitoringPanel({ status, organizationSuggestions }) {
  const [monitoringData, setMonitoringData] = React.useState({
    recentActivity: [],
    statistics: {
      filesProcessed: 0,
      filesAnalyzed: 0,
      filesOrganized: 0,
      errorsEncountered: 0
    },
    systemStatus: {
      watchedDirectories: [],
      isProcessing: false,
      lastActivity: null
    }
  });

  const [testMode, setTestMode] = React.useState(false);
  const [queueStatus, setQueueStatus] = React.useState({
    queueLength: 0,
    isProcessing: false,
    processedCount: 0,
    totalFiles: 0,
    currentFile: null
  });
  const [queueSimulating, setQueueSimulating] = React.useState(false);

  React.useEffect(() => {
    // Listen for monitoring events
    const { ipcRenderer } = window.require('electron');
    
    const handleMonitoringUpdate = (event, data) => {
      setMonitoringData(prev => ({
        ...prev,
        recentActivity: [
          {
            id: Date.now(),
            timestamp: new Date(),
            type: data.type,
            message: data.message,
            filePath: data.filePath,
            details: data.details
          },
          ...prev.recentActivity.slice(0, 49) // Keep last 50 events
        ],
        statistics: {
          ...prev.statistics,
          [data.statType]: (prev.statistics[data.statType] || 0) + 1
        },
        systemStatus: {
          ...prev.systemStatus,
          lastActivity: new Date()
        }
      }));
    };

    const handleSystemStatus = (event, data) => {
      setMonitoringData(prev => ({
        ...prev,
        systemStatus: {
          ...prev.systemStatus,
          ...data
        }
      }));
    };

    const handleQueueStatus = (event, data) => {
      setQueueStatus(prev => ({
        ...prev,
        ...data
      }));
    };

    ipcRenderer.on('monitoring-update', handleMonitoringUpdate);
    ipcRenderer.on('system-status', handleSystemStatus);
    ipcRenderer.on('queue-status', handleQueueStatus);

    // Request initial status
    ipcRenderer.invoke('get-monitoring-status').then(data => {
      if (data) {
        setMonitoringData(prev => ({
          ...prev,
          systemStatus: data
        }));
      }
    });

    return () => {
      ipcRenderer.removeListener('monitoring-update', handleMonitoringUpdate);
      ipcRenderer.removeListener('system-status', handleSystemStatus);
      ipcRenderer.removeListener('queue-status', handleQueueStatus);
    };
  }, []);

  const triggerTestEvent = async (eventType) => {
    const { ipcRenderer } = window.require('electron');
    await ipcRenderer.invoke('trigger-test-monitoring-event', eventType);
  };

  const startQueueSimulation = async () => {
    const { ipcRenderer } = window.require('electron');
    setQueueSimulating(true);
    try {
      const result = await ipcRenderer.invoke('start-queue-simulation');
      if (result.success) {
        console.log('Queue simulation started');
      } else {
        console.error('Failed to start queue simulation:', result.message);
        setQueueSimulating(false);
      }
    } catch (error) {
      console.error('Error starting queue simulation:', error);
      setQueueSimulating(false);
    }
  };

  const stopQueueSimulation = async () => {
    const { ipcRenderer } = window.require('electron');
    try {
      await ipcRenderer.invoke('stop-queue-simulation');
      setQueueSimulating(false);
    } catch (error) {
      console.error('Error stopping queue simulation:', error);
    }
  };

  const clearActivity = () => {
    setMonitoringData(prev => ({
      ...prev,
      recentActivity: [],
      statistics: {
        filesProcessed: 0,
        filesAnalyzed: 0,
        filesOrganized: 0,
        errorsEncountered: 0
      }
    }));
    setQueueStatus({
      queueLength: 0,
      isProcessing: false,
      processedCount: 0,
      totalFiles: 0,
      currentFile: null
    });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString();
  };

  const getEventIcon = (eventType) => {
    switch (eventType) {
      case 'file-added': return '📁';
      case 'file-analyzed': return '🧠';
      case 'file-organized': return '✨';
      case 'file-error': return '⚠️';
      case 'search-completed': return '🔍';
      case 'system-start': return '🚀';
      default: return '📊';
    }
  };

  const getEventColor = (eventType) => {
    switch (eventType) {
      case 'file-added': return '#3182ce';
      case 'file-analyzed': return '#38a169';
      case 'file-organized': return '#805ad5';
      case 'file-error': return '#e53e3e';
      case 'search-completed': return '#ed8936';
      default: return '#718096';
    }
  };

  return React.createElement('div', { className: 'monitoring-panel' },
    React.createElement('div', { className: 'monitoring-header' },
      React.createElement('h2', null, '👁️ System Monitoring'),
      React.createElement('div', { className: 'monitoring-controls' },
        React.createElement('button', {
          className: 'btn btn-secondary btn-sm',
          onClick: () => setTestMode(!testMode)
        }, testMode ? '✅ Test Mode On' : '🧪 Enable Test Mode'),
        
        React.createElement('button', {
          className: 'btn btn-outline btn-sm',
          onClick: clearActivity
        }, '🗑️ Clear Activity')
      )
    ),

    // System Status Overview
    React.createElement('div', { className: 'status-overview' },
      React.createElement('div', { className: 'status-card' },
        React.createElement('div', { className: 'status-header' },
          React.createElement('span', { className: 'status-icon' }, '⚡'),
          React.createElement('span', { className: 'status-title' }, 'System Status')
        ),
        React.createElement('div', { className: 'status-content' },
          React.createElement('div', { className: 'status-item' },
            React.createElement('span', { className: 'status-label' }, 'Queue Length:'),
            React.createElement('span', { 
              className: 'status-value',
              style: { color: queueStatus.queueLength > 0 ? '#ed8936' : '#38a169' }
            }, queueStatus.queueLength || status.queueLength || 0)
          ),
          React.createElement('div', { className: 'status-item' },
            React.createElement('span', { className: 'status-label' }, 'Processing:'),
            React.createElement('span', { 
              className: 'status-value',
              style: { color: monitoringData.systemStatus.isProcessing ? '#ed8936' : '#718096' }
            }, monitoringData.systemStatus.isProcessing ? 'Active' : 'Idle')
          ),
          React.createElement('div', { className: 'status-item' },
            React.createElement('span', { className: 'status-label' }, 'Watched Directories:'),
            React.createElement('span', { className: 'status-value' }, 
              monitoringData.systemStatus.watchedDirectories?.length || 3
            )
          ),
          React.createElement('div', { className: 'status-item' },
            React.createElement('span', { className: 'status-label' }, 'Last Activity:'),
            React.createElement('span', { className: 'status-value' }, 
              monitoringData.systemStatus.lastActivity ? 
                formatTime(monitoringData.systemStatus.lastActivity) : 'No recent activity'
            )
          )
        )
      ),

      // Statistics Card
      React.createElement('div', { className: 'status-card' },
        React.createElement('div', { className: 'status-header' },
          React.createElement('span', { className: 'status-icon' }, '📊'),
          React.createElement('span', { className: 'status-title' }, 'Session Statistics')
        ),
        React.createElement('div', { className: 'status-content' },
          React.createElement('div', { className: 'status-item' },
            React.createElement('span', { className: 'status-label' }, 'Files Processed:'),
            React.createElement('span', { className: 'status-value' }, monitoringData.statistics.filesProcessed)
          ),
          React.createElement('div', { className: 'status-item' },
            React.createElement('span', { className: 'status-label' }, 'AI Analyses:'),
            React.createElement('span', { className: 'status-value' }, monitoringData.statistics.filesAnalyzed)
          ),
          React.createElement('div', { className: 'status-item' },
            React.createElement('span', { className: 'status-label' }, 'Files Organized:'),
            React.createElement('span', { className: 'status-value' }, monitoringData.statistics.filesOrganized)
          ),
          React.createElement('div', { className: 'status-item' },
            React.createElement('span', { className: 'status-label' }, 'Errors:'),
            React.createElement('span', { 
              className: 'status-value',
              style: { color: monitoringData.statistics.errorsEncountered > 0 ? '#e53e3e' : '#38a169' }
            }, monitoringData.statistics.errorsEncountered)
          )
        )
      )
    ),

    // Queue Simulation Controls
    React.createElement('div', { className: 'queue-simulation' },
      React.createElement('h3', null, '🔄 Queue Simulation Testing'),
      React.createElement('div', { className: 'queue-info' },
        React.createElement('div', { className: 'queue-stats' },
          React.createElement('div', { className: 'queue-stat' },
            React.createElement('span', { className: 'stat-label' }, 'Files in Queue:'),
            React.createElement('span', { 
              className: 'stat-value',
              style: { 
                color: queueStatus.queueLength > 0 ? '#ed8936' : '#38a169',
                fontWeight: 'bold'
              }
            }, queueStatus.queueLength)
          ),
          queueStatus.totalFiles > 0 && React.createElement('div', { className: 'queue-stat' },
            React.createElement('span', { className: 'stat-label' }, 'Progress:'),
            React.createElement('span', { className: 'stat-value' }, 
              `${queueStatus.processedCount}/${queueStatus.totalFiles}`
            )
          ),
          queueStatus.currentFile && React.createElement('div', { className: 'queue-stat' },
            React.createElement('span', { className: 'stat-label' }, 'Current File:'),
            React.createElement('span', { className: 'stat-value current-file' }, 
              queueStatus.currentFile
            )
          )
        ),
        queueStatus.totalFiles > 0 && React.createElement('div', { className: 'queue-progress' },
          React.createElement('div', { className: 'progress-bar' },
            React.createElement('div', { 
              className: 'progress-fill',
              style: { 
                width: `${(queueStatus.processedCount / queueStatus.totalFiles) * 100}%`,
                backgroundColor: queueStatus.isProcessing ? '#ed8936' : '#38a169'
              }
            })
          ),
          React.createElement('div', { className: 'progress-text' },
            `${Math.round((queueStatus.processedCount / queueStatus.totalFiles) * 100)}% Complete`
          )
        )
      ),
      React.createElement('div', { className: 'queue-controls' },
        React.createElement('button', {
          className: queueSimulating ? 'btn btn-warning btn-sm' : 'btn btn-primary btn-sm',
          onClick: queueSimulating ? stopQueueSimulation : startQueueSimulation,
          disabled: queueStatus.isProcessing && !queueSimulating
        }, queueSimulating ? '⏹️ Stop Queue Test' : '🚀 Start Queue Test (10 files)'),
        
        React.createElement('div', { className: 'queue-description' },
          React.createElement('p', null, 
            queueSimulating ? 
              '⚡ Queue simulation is running! Watch the files get processed one by one.' :
              '🧪 This will simulate 10 files being added to the queue and processed automatically.'
          )
        )
      )
    ),

    // Test Controls (only shown in test mode)
    testMode && React.createElement('div', { className: 'test-controls' },
      React.createElement('h3', null, '🧪 Test Controls'),
      React.createElement('div', { className: 'test-buttons' },
        React.createElement('button', {
          className: 'btn btn-primary btn-sm',
          onClick: () => triggerTestEvent('file-added')
        }, '📁 Simulate File Added'),
        
        React.createElement('button', {
          className: 'btn btn-success btn-sm',
          onClick: () => triggerTestEvent('file-analyzed')
        }, '🧠 Simulate Analysis'),
        
        React.createElement('button', {
          className: 'btn btn-secondary btn-sm',
          onClick: () => triggerTestEvent('file-organized')
        }, '✨ Simulate Organization'),
        
        React.createElement('button', {
          className: 'btn btn-warning btn-sm',
          onClick: () => triggerTestEvent('file-error')
        }, '⚠️ Simulate Error'),
        
        React.createElement('button', {
          className: 'btn btn-outline btn-sm',
          onClick: () => triggerTestEvent('search-completed')
        }, '🔍 Simulate Search')
      )
    ),

    // Real-time Activity Feed
    React.createElement('div', { className: 'activity-feed' },
      React.createElement('h3', null, 
        '📡 Real-time Activity ',
        React.createElement('span', { className: 'activity-count' }, 
          `(${monitoringData.recentActivity.length})`
        )
      ),
      
      monitoringData.recentActivity.length === 0 ? 
        React.createElement('div', { className: 'no-activity' },
          React.createElement('div', { className: 'no-activity-icon' }, '😴'),
          React.createElement('p', null, 'No recent activity'),
          React.createElement('p', { className: 'activity-suggestion' }, 
            testMode ? 
              'Use the test buttons above to simulate activity!' :
              'Enable test mode to simulate activity, or perform actions in other tabs.'
          )
        ) :
        React.createElement('div', { className: 'activity-list' },
          monitoringData.recentActivity.map(activity =>
            React.createElement('div', { 
              key: activity.id, 
              className: 'activity-item',
              style: { borderLeftColor: getEventColor(activity.type) }
            },
              React.createElement('div', { className: 'activity-header' },
                React.createElement('span', { className: 'activity-icon' }, getEventIcon(activity.type)),
                React.createElement('span', { className: 'activity-time' }, formatTime(activity.timestamp)),
                React.createElement('span', { 
                  className: 'activity-type',
                  style: { color: getEventColor(activity.type) }
                }, activity.type.replace('-', ' ').toUpperCase())
              ),
              React.createElement('div', { className: 'activity-message' }, activity.message),
              activity.filePath && React.createElement('div', { className: 'activity-file' }, 
                React.createElement('code', null, activity.filePath.split('/').pop())
              ),
              activity.details && React.createElement('div', { className: 'activity-details' }, 
                activity.details
              )
            )
          )
        )
    )
  );
}

// Demo Explorer Component - Native File Manager Look
function DemoExplorer({ demoDirectory, onFileAnalyze, aiAnalysis, organizationSuggestions, organizationMethod, setOrganizationMethod, onOpenUndo }) {
  const [demoContents, setDemoContents] = React.useState([]);
  const [selectedDemoFiles, setSelectedDemoFiles] = React.useState([]);
  const [demoLoading, setDemoLoading] = React.useState(false);
  const [viewMode, setViewMode] = React.useState('list'); // 'list' or 'grid'
  const [currentDemoPath, setCurrentDemoPath] = React.useState('');
  const [demoNavigationHistory, setDemoNavigationHistory] = React.useState([]);

  React.useEffect(() => {
    if (demoDirectory) {
      setCurrentDemoPath(demoDirectory);
      loadDemoContents(demoDirectory);
    }
  }, [demoDirectory]);

  const loadDemoContents = async (targetPath = null) => {
    const pathToLoad = targetPath || currentDemoPath;
    setDemoLoading(true);
    try {
      const contents = await ipcRenderer.invoke('get-directory-contents', pathToLoad);
      setDemoContents(contents);
      if (targetPath) {
        setCurrentDemoPath(targetPath);
      }
    } catch (error) {
      console.error('Failed to load demo contents:', error);
    } finally {
      setDemoLoading(false);
    }
  };

  const handleDemoDirectoryClick = (dirPath) => {
    // Add to navigation history
    setDemoNavigationHistory(prev => [...prev, currentDemoPath]);
    loadDemoContents(dirPath);
  };

  const goBackInDemo = () => {
    if (demoNavigationHistory.length > 0) {
      const previousPath = demoNavigationHistory[demoNavigationHistory.length - 1];
      setDemoNavigationHistory(prev => prev.slice(0, -1));
      loadDemoContents(previousPath);
    }
  };

  const goToRootDemo = () => {
    setDemoNavigationHistory([]);
    loadDemoContents(demoDirectory);
  };

  const handleDemoFileSelect = (filePath) => {
    setSelectedDemoFiles(prev => {
      if (prev.includes(filePath)) {
        return prev.filter(f => f !== filePath);
      } else {
        return [...prev, filePath];
      }
    });
  };

  const organizeDemoFiles = async (organizeAll = false) => {
    const filesToOrganize = organizeAll ? 
      demoContents.filter(item => !item.isDirectory).map(item => item.path) :
      selectedDemoFiles;
    
    if (filesToOrganize.length === 0) return;
    
    // Get organization method description
    const getMethodDescription = (method) => {
      const descriptions = {
        'ai-smart': 'AI-suggested locations based on content analysis',
        'by-type': 'folders grouped by file type (Documents, Images, Media, etc.)',
        'by-date': 'folders organized by creation date (Today, This Week, etc.)',
        'by-modified': 'folders organized by last modified date',
        'by-size': 'folders grouped by file size (Small, Medium, Large)',
        'by-project': 'AI-detected project categories (Work, Personal, Creative)',
        'alphabetical': 'A-Z folders by first letter of filename',
        'by-source': 'folders based on typical file sources (Downloads, Screenshots, etc.)'
      };
      return descriptions[method] || 'AI-suggested organization';
    };
    
    // Ask for confirmation
    const confirmed = confirm(
      `${organizeAll ? 'Organize all demo files' : 'Organize selected demo files'}?\n\n` +
      `Organization method: ${getMethodDescription(organizationMethod)}\n` +
      `This will demonstrate FlowGenius organization with ${filesToOrganize.length} file${filesToOrganize.length !== 1 ? 's' : ''}.`
    );
    if (!confirmed) return;
    
    setDemoLoading(true);
    try {
      const result = await ipcRenderer.invoke('organize-files', {
        files: filesToOrganize,
        organizationMethod: organizationMethod,
        sourceDirectory: demoDirectory, // Always use base demo directory for detection
        organizeAll: organizeAll
      });
      
      if (result.success) {
        const message = result.isDemoMode ? 
          `🎉 Demo organization completed!\n\n` +
          `✅ Organized ${result.successCount} files using ${getMethodDescription(organizationMethod)}\n` +
          `📁 Files are now sorted in the "Organized" directory\n\n` +
          `This demonstrates how FlowGenius would organize your real files.` :
          `🎉 Organization completed! Organized ${result.successCount} files successfully.`;
        
        alert(message);
        
        // Refresh demo contents to show organized folders
        await loadDemoContents(currentDemoPath);
        setSelectedDemoFiles([]);
      }
    } catch (error) {
      console.error('Failed to organize demo files:', error);
    } finally {
      setDemoLoading(false);
    }
  };

  const getFileIcon = (item) => {
    if (item.isDirectory) return '📁';
    
    const ext = item.name.split('.').pop()?.toLowerCase();
    const iconMap = {
      'pdf': '📄', 'doc': '📝', 'docx': '📝', 'txt': '📃', 'md': '📃',
      'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
      'mp4': '🎬', 'avi': '🎬', 'mov': '🎬',
      'mp3': '🎵', 'wav': '🎵', 'flac': '🎵',
      'zip': '📦', 'rar': '📦', '7z': '📦',
      'js': '💻', 'py': '💻', 'java': '💻', 'cpp': '💻',
      'html': '🌐', 'css': '🎨', 'json': '📋'
    };
    
    return iconMap[ext] || '📄';
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString();
  };

  return React.createElement('div', { className: 'demo-explorer' },
    // Demo Explorer Header
    React.createElement('div', { className: 'demo-explorer-header' },
      React.createElement('div', { className: 'demo-header-left' },
        React.createElement('div', { className: 'demo-title-section' },
          React.createElement('h2', { className: 'demo-title' },
            React.createElement('span', { className: 'demo-icon' }, '🎭'),
            'Demo Explorer',
            React.createElement('span', { className: 'demo-subtitle' }, 'Safe Testing Environment')
          ),
          React.createElement('div', { className: 'demo-current-path' },
            currentDemoPath ? currentDemoPath.replace(demoDirectory, 'Demo') : 'Demo'
          )
        )
      ),
      
      React.createElement('div', { className: 'demo-header-controls' },
        React.createElement('div', { className: 'demo-navigation' },
          React.createElement('button', {
            className: 'demo-nav-btn',
            onClick: goBackInDemo,
            disabled: demoNavigationHistory.length === 0,
            title: 'Go Back'
          }, '⬅️'),
          
          React.createElement('button', {
            className: 'demo-nav-btn',
            onClick: goToRootDemo,
            disabled: currentDemoPath === demoDirectory,
            title: 'Go to Demo Root'
          }, '🏠')
        ),
        
        React.createElement('div', { className: 'view-controls' },
          React.createElement('button', {
            className: `view-btn ${viewMode === 'list' ? 'active' : ''}`,
            onClick: () => setViewMode('list'),
            title: 'List View'
          }, '📋'),
          React.createElement('button', {
            className: `view-btn ${viewMode === 'grid' ? 'active' : ''}`,
            onClick: () => setViewMode('grid'),
            title: 'Grid View'
          }, '⚏')
        ),
        
        React.createElement('button', {
          className: 'refresh-btn',
          onClick: () => loadDemoContents(currentDemoPath),
          disabled: demoLoading,
          title: 'Refresh'
        }, '🔄')
      )
    ),

    // Demo Actions Bar
    React.createElement('div', { className: 'demo-actions-bar' },
      React.createElement('div', { className: 'demo-stats' },
        React.createElement('span', { className: 'file-count' },
          `${demoContents.length} items • ${demoContents.filter(item => !item.isDirectory).length} files`
        ),
        selectedDemoFiles.length > 0 && React.createElement('span', { className: 'selected-count' },
          ` • ${selectedDemoFiles.length} selected`
        )
      ),
      
      React.createElement('div', { className: 'demo-action-buttons' },
        React.createElement('button', {
          className: 'demo-action-btn analyze',
          onClick: () => selectedDemoFiles.length > 0 && onFileAnalyze(selectedDemoFiles.length === 1 ? selectedDemoFiles[0] : selectedDemoFiles),
          disabled: selectedDemoFiles.length === 0 || demoLoading
        }, selectedDemoFiles.length === 1 ? '🧠 Analyze Selected' : selectedDemoFiles.length > 1 ? `🧠 Analyze ${selectedDemoFiles.length} Files` : '🧠 Analyze Selected'),
        
        React.createElement('div', { className: 'demo-organization-controls' },
          React.createElement('div', { className: 'demo-method-selector' },
            React.createElement('label', { className: 'demo-method-label' }, '📋 Method:'),
            React.createElement('select', {
              className: 'demo-method-select',
              value: organizationMethod,
              onChange: (e) => setOrganizationMethod(e.target.value),
              disabled: demoLoading
            },
              React.createElement('option', { value: 'ai-smart' }, '🧠 AI Smart'),
              React.createElement('option', { value: 'by-type' }, '📁 By Type'),
              React.createElement('option', { value: 'by-date' }, '📅 By Date Created'),
              React.createElement('option', { value: 'by-modified' }, '🕒 By Modified'),
              React.createElement('option', { value: 'by-size' }, '📏 By Size'),
              React.createElement('option', { value: 'by-project' }, '🎯 By Project'),
              React.createElement('option', { value: 'alphabetical' }, '🔤 A-Z'),
              React.createElement('option', { value: 'by-source' }, '📍 By Source')
            )
          ),
          
          React.createElement('div', { className: 'demo-organize-buttons' },
            React.createElement('button', {
              className: 'demo-action-btn organize-selected',
              onClick: () => organizeDemoFiles(false),
              disabled: selectedDemoFiles.length === 0 || demoLoading
            }, `✨ Organize Selected (${selectedDemoFiles.length})`),
            
            React.createElement('button', {
              className: 'demo-action-btn organize-all',
              onClick: () => organizeDemoFiles(true),
              disabled: demoContents.filter(item => !item.isDirectory).length === 0 || demoLoading
            }, `🗂️ Organize All (${demoContents.filter(item => !item.isDirectory).length})`),
            
            React.createElement('button', {
              className: 'demo-action-btn undo-btn',
              onClick: onOpenUndo,
              disabled: demoLoading,
              title: 'Undo recent file organization'
            }, '↩️ Undo')
          )
        )
      )
    ),

    // Demo File Display
    React.createElement('div', { className: 'demo-file-area' },
      demoLoading ? 
        React.createElement('div', { className: 'demo-loading' },
          React.createElement('div', { className: 'spinner' }),
          React.createElement('span', null, 'Loading demo files...')
        ) :
        viewMode === 'list' ?
          // List View
          React.createElement('div', { className: 'demo-list-view' },
            React.createElement('table', { className: 'demo-file-table' },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement('th', { className: 'col-icon' }, ''),
                  React.createElement('th', { className: 'col-name' }, 'Name'),
                  React.createElement('th', { className: 'col-size' }, 'Size'),
                  React.createElement('th', { className: 'col-date' }, 'Modified'),
                  React.createElement('th', { className: 'col-type' }, 'Type')
                )
              ),
              React.createElement('tbody', null,
                demoContents.map((item, index) =>
                  React.createElement('tr', {
                    key: index,
                    className: `demo-file-row ${selectedDemoFiles.includes(item.path) ? 'selected' : ''}`,
                    onClick: () => {
                      if (item.isDirectory) {
                        handleDemoDirectoryClick(item.path);
                      } else {
                        handleDemoFileSelect(item.path);
                      }
                    },
                    onDoubleClick: () => !item.isDirectory && onFileAnalyze(item.path)
                  },
                    React.createElement('td', { className: 'file-icon' }, getFileIcon(item)),
                    React.createElement('td', { className: 'file-name' }, item.name),
                    React.createElement('td', { className: 'file-size' }, 
                      item.isDirectory ? '—' : formatFileSize(item.size)
                    ),
                    React.createElement('td', { className: 'file-date' }, formatDate(item.modified)),
                    React.createElement('td', { className: 'file-type' }, 
                      item.isDirectory ? 'Folder' : 'Demo File'
                    )
                  )
                )
              )
            )
          ) :
          // Grid View
          React.createElement('div', { className: 'demo-grid-view' },
            demoContents.map((item, index) =>
              React.createElement('div', {
                key: index,
                className: `demo-file-card ${selectedDemoFiles.includes(item.path) ? 'selected' : ''}`,
                onClick: () => {
                  if (item.isDirectory) {
                    handleDemoDirectoryClick(item.path);
                  } else {
                    handleDemoFileSelect(item.path);
                  }
                },
                onDoubleClick: () => !item.isDirectory && onFileAnalyze(item.path)
              },
                React.createElement('div', { className: 'card-icon' }, getFileIcon(item)),
                React.createElement('div', { className: 'card-name' }, item.name),
                React.createElement('div', { className: 'card-info' },
                  item.isDirectory ? 'Folder' : formatFileSize(item.size)
                )
              )
            )
          )
    ),

    // Demo Results Panel (if analysis available)
    aiAnalysis && React.createElement('div', { className: 'demo-results-panel' },
      React.createElement('h3', null, '🧠 AI Analysis Results'),
      React.createElement('div', { className: 'analysis-content' },
        React.createElement('p', null, `File: ${aiAnalysis.fileName}`),
        React.createElement('p', null, `Classification: ${aiAnalysis.classification}`),
        aiAnalysis.tags && React.createElement('p', null, 
          `Tags: ${aiAnalysis.tags.join(', ')}`
        ),
        aiAnalysis.organizationSuggestion && React.createElement('p', null,
          `Suggested location: ${aiAnalysis.organizationSuggestion.relativePath}`
        )
      )
    )
  );
}

// Settings Panel Component
function SettingsPanel({ settings, setSettings, demoMode, setDemoMode, demoDirectory, onDirectoryChange }) {
  const [demoLoading, setDemoLoading] = React.useState(false);

  const generateDemoFiles = async () => {
    setDemoLoading(true);
    try {
      const result = await ipcRenderer.invoke('demo-generate-files');
      if (result.success) {
        setDemoMode(true);
        // Navigate to demo directory
        await onDirectoryChange(result.demoDirectory);
        alert('🎉 Demo files generated successfully! You can now explore all FlowGenius features with realistic sample files.');
      } else {
        alert('Failed to generate demo files: ' + result.error);
      }
    } catch (error) {
      console.error('Failed to generate demo files:', error);
      alert('Failed to generate demo files. Please try again.');
    } finally {
      setDemoLoading(false);
    }
  };

  const clearDemoFiles = async () => {
    const confirmed = confirm('Are you sure you want to clear all demo files? This action cannot be undone.');
    if (!confirmed) return;

    setDemoLoading(true);
    try {
      const result = await ipcRenderer.invoke('demo-clear-files');
      if (result.success) {
        setDemoMode(false);
        // Navigate to home directory
        const userDirs = await ipcRenderer.invoke('get-user-directories');
        await onDirectoryChange(userDirs.home);
        alert('Demo files cleared successfully.');
      } else {
        alert('Failed to clear demo files: ' + result.error);
      }
    } catch (error) {
      console.error('Failed to clear demo files:', error);
      alert('Failed to clear demo files. Please try again.');
    } finally {
      setDemoLoading(false);
    }
  };

  const navigateToDemo = async () => {
    if (demoDirectory) {
      await onDirectoryChange(demoDirectory);
    }
  };

  return React.createElement('div', { className: 'settings-panel' },
    React.createElement('h2', null, '⚙️ Settings'),
    
    // Demo Mode Section
    React.createElement('div', { className: 'settings-section' },
      React.createElement('h3', null, '🎭 Demo Mode'),
      React.createElement('p', { className: 'settings-description' },
        'Try FlowGenius with realistic sample files before using it on your own data. Demo mode includes documents, code files, photos, financial records, and more.'
      ),
      
      React.createElement('div', { className: 'demo-status' },
        React.createElement('span', { 
          className: `demo-indicator ${demoMode ? 'active' : 'inactive'}` 
        }, demoMode ? '🟢 Active' : '🔴 Inactive'),
        demoMode && React.createElement('span', { className: 'demo-path' }, 
          ` • ${demoDirectory}`
        )
      ),
      
      React.createElement('div', { className: 'demo-actions' },
        !demoMode ? 
          React.createElement('button', {
            className: 'btn btn-primary demo-btn',
            onClick: generateDemoFiles,
            disabled: demoLoading
          }, demoLoading ? '⏳ Generating...' : '🎯 Generate Demo Files') :
          React.createElement('div', { className: 'demo-active-controls' },
            React.createElement('button', {
              className: 'btn btn-secondary demo-btn',
              onClick: navigateToDemo
            }, '📁 Go to Demo Files'),
            
            React.createElement('button', {
              className: 'btn btn-warning demo-btn',
              onClick: clearDemoFiles,
              disabled: demoLoading
            }, demoLoading ? '⏳ Clearing...' : '🗑️ Clear Demo Files')
          )
      ),
      
      demoMode && React.createElement('div', { className: 'demo-features' },
        React.createElement('h4', null, '✨ What you can test:'),
        React.createElement('ul', null,
          React.createElement('li', null, '🧠 AI Analysis - Click any file and hit "Analyze Selected"'),
          React.createElement('li', null, '✨ Auto Organization - Use "Organize Selected" or "Organize All Files"'),
          React.createElement('li', null, '👁️ File Monitoring - Check the Monitoring tab for activity'),
          React.createElement('li', null, '🔍 File Classification - See how AI categorizes different file types'),
          React.createElement('li', null, '📝 Smart Tagging - View automatically generated tags'),
          React.createElement('li', null, '📂 Organization Suggestions - Get AI-powered folder recommendations')
        )
      )
    ),
    
    // General Settings Section
    React.createElement('div', { className: 'settings-section' },
      React.createElement('h3', null, '⚙️ General Settings'),
      React.createElement('label', { className: 'settings-checkbox' },
        React.createElement('input', {
          type: 'checkbox',
          checked: settings.autoOrganize,
          onChange: (e) => setSettings(prev => ({ ...prev, autoOrganize: e.target.checked }))
        }),
        ' Auto-organize files with high confidence scores'
      ),
      
      React.createElement('div', { className: 'settings-group' },
        React.createElement('label', { className: 'settings-label' }, 'AI Confidence Threshold'),
        React.createElement('input', {
          type: 'range',
          min: '0.1',
          max: '1.0',
          step: '0.1',
          value: settings.confidenceThreshold,
          onChange: (e) => setSettings(prev => ({ ...prev, confidenceThreshold: parseFloat(e.target.value) })),
          className: 'settings-slider'
        }),
        React.createElement('span', { className: 'settings-value' }, 
          `${Math.round(settings.confidenceThreshold * 100)}%`
        )
      )
    )
  );
}

// CSS Styles
const styles = `
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  color: #1a202c;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  backdrop-filter: blur(10px);
  position: relative;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-title {
  display: flex;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
  color: #1a202c;
  letter-spacing: -0.3px;
}

.app-icon {
  margin-right: 6px;
  font-size: 18px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));
}

.demo-badge {
  margin-left: 6px;
  padding: 2px 6px;
  background: linear-gradient(135deg, #ff6b6b, #ffa500);
  color: white;
  border-radius: 8px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-shadow: 0 1px 2px rgba(0,0,0,0.2);
  animation: demoPulse 2s ease-in-out infinite;
}

@keyframes demoPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.tab-nav {
  display: flex;
  gap: 6px;
  align-items: center;
  background: rgba(255, 255, 255, 0.8);
  padding: 4px 8px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid #e2e8f0;
}

.tab-button {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  color: #4a5568;
  border: 1px solid transparent;
  min-width: fit-content;
  white-space: nowrap;
}

.tab-button:hover {
  background: #f7fafc;
  color: #2d3748;
  border-color: #e2e8f0;
  transform: translateY(-0.5px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.tab-button.active {
  background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%);
  color: white;
  border-color: #2c5aa0;
  box-shadow: 0 2px 8px rgba(66, 153, 225, 0.3);
}

.tab-button.active:hover {
  background: linear-gradient(135deg, #3182ce 0%, #2c5aa0 100%);
}

.tab-icon {
  margin-right: 6px;
  font-size: 14px;
  transition: transform 0.2s;
}

.tab-button:hover .tab-icon {
  transform: scale(1.05);
}

.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #e53e3e;
  color: white;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 10px;
  min-width: 16px;
  text-align: center;
}

.main-content {
  flex: 1;
  overflow: hidden;
}

.file-browser {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.browser-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 24px;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  flex-wrap: wrap;
}

.navigation-controls {
  display: flex;
  gap: 4px;
}

.nav-btn {
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  color: #2d3748;
}

.nav-btn:hover:not(:disabled) {
  background: #f7fafc;
  border-color: #cbd5e0;
}

.nav-btn:disabled, .nav-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: #f7fafc;
}

.breadcrumb-nav {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  font-size: 14px;
  overflow: hidden;
}

.breadcrumb-container {
  display: flex;
  align-items: center;
  min-width: 0;
}

.breadcrumb {
  background: none;
  border: none;
  color: #3182ce;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
  transition: background-color 0.2s;
}

.breadcrumb:hover:not(:disabled) {
  background: #ebf8ff;
}

.breadcrumb:disabled, .breadcrumb.current {
  color: #2d3748;
  cursor: default;
  font-weight: 600;
}

.breadcrumb.current {
  background: #f1f5f9;
}

.breadcrumb-separator {
  margin: 0 6px;
  color: #a0aec0;
  font-weight: 300;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #3182ce;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2c5aa0;
}

.btn-success {
  background: #38a169;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #2f855a;
}

.btn-secondary {
  background: #718096;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #4a5568;
}

.file-list {
  flex: 1;
  overflow: auto;
  background: white;
}

.file-table {
  width: 100%;
  border-collapse: collapse;
}

.file-table th {
  text-align: left;
  padding: 12px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  color: #1a202c;
}

.file-row {
  cursor: pointer;
  transition: background 0.2s;
}

.file-row:hover {
  background: #f8fafc;
}

.file-row.selected {
  background: #ebf8ff;
}

.file-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
  color: #1a202c;
}

.file-icon {
  width: 40px;
  text-align: center;
  font-size: 16px;
}

.file-name {
  font-weight: 500;
  color: #1a202c;
}

.file-size, .file-date, .file-type {
  color: #2d3748;
  font-size: 13px;
}

.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 24px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  font-size: 12px;
  color: #718096;
}

.status-left, .status-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-text {
  font-weight: 500;
}

.status-separator {
  color: #cbd5e0;
  font-weight: 300;
}

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 48px;
  gap: 12px;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e2e8f0;
  border-top: 2px solid #4299e1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.analysis-panel, .monitoring-panel, .settings-panel {
  height: 100%;
  overflow: auto;
  background: #f8fafc;
  padding: 24px;
  color: #1a202c;
}

.analysis-panel h2, .settings-panel h2 {
  color: #1a202c;
  margin-bottom: 24px;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 8px;
}

.analysis-panel p, .monitoring-panel p, .settings-panel p {
  color: #1a202c;
}

.analysis-panel label, .monitoring-panel label, .settings-panel label {
  color: #1a202c;
}

/* Enhanced Monitoring Panel Styles */
.monitoring-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid #e2e8f0;
}

.monitoring-header h2 {
  margin: 0;
  color: #1a202c;
}

.monitoring-controls {
  display: flex;
  gap: 12px;
}

.status-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.status-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.status-header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  border-bottom: 1px solid #e2e8f0;
}

.status-icon {
  font-size: 20px;
  margin-right: 12px;
}

.status-title {
  font-weight: 600;
  color: #2d3748;
  font-size: 16px;
}

.status-content {
  padding: 20px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
}

.status-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.status-label {
  font-weight: 500;
  color: #4a5568;
}

.status-value {
  font-weight: 600;
  color: #1a202c;
  font-family: monospace;
}

.test-controls {
  background: linear-gradient(135deg, #fff5d1 0%, #fed7aa 100%);
  border: 2px solid #fbbf24;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
}

.test-controls h3 {
  margin: 0 0 16px 0;
  color: #92400e;
  font-size: 16px;
}

.test-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 6px;
}

.activity-feed {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.activity-feed h3 {
  margin: 0;
  padding: 16px 20px;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  border-bottom: 1px solid #e2e8f0;
  color: #2d3748;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.activity-count {
  font-size: 14px;
  color: #718096;
  font-weight: 400;
}

.no-activity {
  text-align: center;
  padding: 48px 20px;
  color: #718096;
}

.no-activity-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.7;
}

.no-activity p {
  margin: 8px 0;
  font-size: 16px;
}

.activity-suggestion {
  font-size: 14px !important;
  color: #4a5568 !important;
  font-style: italic;
}

.activity-list {
  max-height: 400px;
  overflow-y: auto;
  padding: 20px;
}

.activity-item {
  border-left: 4px solid #e2e8f0;
  padding: 16px;
  margin-bottom: 16px;
  background: #f8fafc;
  border-radius: 0 8px 8px 0;
  transition: all 0.2s;
}

.activity-item:hover {
  background: #f1f5f9;
  transform: translateX(2px);
}

.activity-item:last-child {
  margin-bottom: 0;
}

.activity-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.activity-icon {
  font-size: 16px;
}

.activity-time {
  font-size: 12px;
  color: #718096;
  font-family: monospace;
}

.activity-type {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  color: inherit;
}

.activity-message {
  font-size: 14px;
  color: #2d3748;
  margin-bottom: 8px;
  font-weight: 500;
}

.activity-file {
  font-size: 12px;
  color: #4a5568;
  margin-bottom: 4px;
}

.activity-file code {
  background: #e2e8f0;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
}

.activity-details {
  font-size: 12px;
  color: #718096;
  font-style: italic;
  line-height: 1.4;
}

/* Settings Panel Styles */
.settings-section {
  margin-bottom: 32px;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.settings-section h3 {
  margin: 0 0 16px 0;
  color: #2d3748;
  font-size: 18px;
  font-weight: 600;
}

.settings-description {
  color: #4a5568;
  margin-bottom: 16px;
  line-height: 1.5;
}

.demo-status {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px;
  background: #f7fafc;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.demo-indicator {
  font-weight: 600;
}

.demo-indicator.active {
  color: #38a169;
}

.demo-indicator.inactive {
  color: #e53e3e;
}

.demo-path {
  color: #4a5568;
  font-size: 13px;
  font-family: monospace;
}

.demo-actions {
  margin-bottom: 20px;
}

.demo-active-controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.demo-btn {
  margin-right: 12px;
  margin-bottom: 8px;
}

.btn-warning {
  background: #ed8936;
  color: white;
}

.btn-warning:hover:not(:disabled) {
  background: #dd6b20;
}

.demo-features {
  background: #f0f9ff;
  border: 1px solid #7dd3fc;
  border-radius: 6px;
  padding: 16px;
}

.demo-features h4 {
  margin: 0 0 12px 0;
  color: #0369a1;
  font-size: 14px;
  font-weight: 600;
}

.demo-features ul {
  margin: 0;
  padding-left: 20px;
  color: #1e40af;
}

.demo-features li {
  margin-bottom: 4px;
  font-size: 13px;
  line-height: 1.4;
}

.settings-checkbox {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  cursor: pointer;
}

.settings-checkbox input {
  margin-right: 8px;
  transform: scale(1.2);
}

.settings-group {
  margin-bottom: 16px;
}

.settings-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #2d3748;
}

.settings-slider {
  width: 200px;
  margin-right: 12px;
}

.settings-value {
  font-weight: 600;
  color: #3182ce;
  background: #ebf8ff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
}

/* Demo Tab Styling */
.demo-tab {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  color: white !important;
  border: 2px solid #5a67d8 !important;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.demo-tab:hover {
  background: linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%) !important;
  transform: translateY(-1px);
}

.demo-tab.active {
  background: linear-gradient(135deg, #4c51bf 0%, #553c9a 100%) !important;
}

.demo-tab-badge {
  margin-left: 6px;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

/* Search Tab Styling */
.search-tab {
  background: linear-gradient(135deg, #48bb78 0%, #38a169 100%) !important;
  color: white !important;
  border: 2px solid #38a169 !important;
  box-shadow: 0 4px 12px rgba(72, 187, 120, 0.3);
}

.search-tab:hover {
  background: linear-gradient(135deg, #38a169 0%, #2f855a 100%) !important;
  transform: translateY(-1px);
}

.search-tab.active {
  background: linear-gradient(135deg, #2f855a 0%, #276749 100%) !important;
}

.search-tab-badge {
  margin-left: 6px;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

/* Demo Explorer Styles */
.demo-explorer {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  overflow: hidden;
}

.demo-explorer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-bottom: 3px solid #5a67d8;
}

.demo-header-left {
  flex: 1;
}

.demo-title-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.demo-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 12px;
}

.demo-current-path {
  font-size: 12px;
  opacity: 0.8;
  font-family: monospace;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-icon {
  font-size: 24px;
}

.demo-subtitle {
  font-size: 12px;
  font-weight: 400;
  opacity: 0.9;
  background: rgba(255, 255, 255, 0.1);
  padding: 4px 8px;
  border-radius: 12px;
  margin-left: 12px;
}

.demo-header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.demo-navigation {
  display: flex;
  gap: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 4px;
}

.demo-nav-btn {
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.demo-nav-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.demo-nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.view-controls {
  display: flex;
  gap: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 4px;
}

.view-btn {
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.view-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.view-btn.active {
  background: rgba(255, 255, 255, 0.3);
  font-weight: 600;
}

.refresh-btn {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.demo-actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: white;
  border-bottom: 2px solid #e2e8f0;
}

.demo-stats {
  font-size: 13px;
  color: #4a5568;
  font-weight: 500;
}

.file-count {
  color: #2d3748;
}

.selected-count {
  color: #3182ce;
  font-weight: 600;
}

.demo-action-buttons {
  display: flex;
  gap: 8px;
}

.demo-action-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.demo-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.demo-action-btn.analyze {
  background: #3182ce;
  color: white;
}

.demo-action-btn.analyze:hover:not(:disabled) {
  background: #2c5aa0;
}

.demo-action-btn.organize-selected {
  background: #38a169;
  color: white;
}

.demo-action-btn.organize-selected:hover:not(:disabled) {
  background: #2f855a;
}

.demo-action-btn.organize-all {
  background: #ed8936;
  color: white;
}

.demo-action-btn.organize-all:hover:not(:disabled) {
  background: #dd6b20;
}

.demo-file-area {
  flex: 1;
  overflow: auto;
  background: white;
}

.demo-loading {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  height: 200px;
  gap: 16px;
  color: #4a5568;
}

/* List View Styles */
.demo-list-view {
  height: 100%;
  overflow: auto;
}

.demo-file-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
}

.demo-file-table th {
  text-align: left;
  padding: 12px 16px;
  background: #f7fafc;
  border-bottom: 2px solid #e2e8f0;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  color: #2d3748;
  position: sticky;
  top: 0;
  z-index: 10;
}

.col-icon { width: 50px; }
.col-name { width: auto; min-width: 200px; }
.col-size { width: 100px; }
.col-date { width: 120px; }
.col-type { width: 100px; }

.demo-file-row {
  cursor: pointer;
  transition: all 0.15s;
  border-bottom: 1px solid #f1f5f9;
}

.demo-file-row:hover {
  background: #f7fafc;
}

.demo-file-row.selected {
  background: #ebf8ff;
  border-color: #3182ce;
}

.demo-file-table td {
  padding: 10px 16px;
  color: #2d3748;
  font-size: 14px;
}

.demo-file-table .file-icon {
  text-align: center;
  font-size: 16px;
}

.demo-file-table .file-name {
  font-weight: 500;
  color: #1a202c;
}

/* Grid View Styles */
.demo-grid-view {
  padding: 24px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
  overflow: auto;
}

.demo-file-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 12px;
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.demo-file-card:hover {
  border-color: #cbd5e0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transform: translateY(-2px);
}

.demo-file-card.selected {
  border-color: #3182ce;
  background: #ebf8ff;
  box-shadow: 0 4px 12px rgba(49, 130, 206, 0.2);
}

.card-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.card-name {
  font-size: 12px;
  font-weight: 500;
  color: #2d3748;
  word-break: break-word;
  line-height: 1.3;
  margin-bottom: 4px;
}

.card-info {
  font-size: 10px;
  color: #718096;
  margin-top: auto;
}

/* Demo Results Panel */
.demo-results-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: white;
  border-top: 3px solid #3182ce;
  padding: 16px 24px;
  max-height: 200px;
  overflow: auto;
  box-shadow: 0 -4px 12px rgba(0,0,0,0.1);
}

.demo-results-panel h3 {
  margin: 0 0 12px 0;
  color: #2d3748;
  font-size: 16px;
}

.analysis-content {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.analysis-content p {
  margin: 0;
  padding: 8px 12px;
  background: #f7fafc;
  border-radius: 6px;
  font-size: 13px;
  color: #4a5568;
  border-left: 3px solid #3182ce;
}

/* Authentication Styles */
.auth-screen {
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.auth-container {
  background: white;
  padding: 40px;
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  width: 100%;
  max-width: 400px;
  margin: 20px;
}

.auth-header {
  text-align: center;
  margin-bottom: 32px;
}

.auth-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.auth-logo-icon {
  font-size: 32px;
  margin-right: 12px;
}

.auth-logo-text {
  font-size: 28px;
  font-weight: 700;
  color: #1a202c;
  margin: 0;
}

.auth-subtitle {
  color: #4a5568;
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
}

.auth-message {
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
}

.auth-message.error {
  background: #fed7d7;
  color: #c53030;
  border: 1px solid #feb2b2;
}

.auth-message.success {
  background: #c6f6d5;
  color: #2f855a;
  border: 1px solid #9ae6b4;
}

.auth-form {
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: #2d3748;
  font-size: 14px;
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #3182ce;
  box-shadow: 0 0 0 3px rgba(49, 130, 206, 0.1);
}

.auth-submit-btn {
  width: 100%;
  padding: 12px 16px;
  background: #3182ce;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.auth-submit-btn:hover:not(:disabled) {
  background: #2c5aa0;
}

.auth-submit-btn:disabled {
  background: #a0aec0;
  cursor: not-allowed;
}

.auth-submit-btn.loading {
  background: #a0aec0;
}

.auth-divider {
  text-align: center;
  margin: 20px 0;
  position: relative;
  color: #718096;
  font-size: 14px;
}

.auth-divider::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: #e2e8f0;
  z-index: 1;
}

.auth-divider span {
  background: white;
  padding: 0 16px;
  position: relative;
  z-index: 2;
}

.google-signin-btn {
  width: 100%;
  padding: 12px 16px;
  background: white;
  color: #2d3748;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
}

.google-signin-btn:hover:not(:disabled) {
  background: #f7fafc;
  border-color: #cbd5e0;
}

.google-signin-btn:disabled {
  background: #f7fafc;
  color: #a0aec0;
  cursor: not-allowed;
}

.google-icon {
  margin-right: 8px;
  font-size: 16px;
}

.auth-switch {
  text-align: center;
  font-size: 14px;
  color: #4a5568;
}

.auth-link {
  color: #3182ce;
  background: none;
  border: none;
  text-decoration: underline;
  cursor: pointer;
  font-size: 14px;
}

.auth-link:hover {
  color: #2c5aa0;
}

/* Header User Info Styles */
.header {
  justify-content: space-between;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(10px);
}

.user-icon {
  font-size: 14px;
  padding: 3px;
  background: linear-gradient(135deg, #4299e1, #3182ce);
  color: white;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-name {
  color: #2d3748;
  font-weight: 500;
  letter-spacing: -0.1px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sign-out-btn {
  padding: 6px 10px;
  background: linear-gradient(135deg, #e53e3e, #c53030);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 4px rgba(229, 62, 62, 0.3);
  border: 1px solid transparent;
}

.sign-out-btn:hover {
  background: linear-gradient(135deg, #c53030, #9c2121);
  transform: translateY(-0.5px);
  box-shadow: 0 2px 8px rgba(229, 62, 62, 0.4);
}

/* Loading Screen */
.app-loading {
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #f8fafc;
}

/* Search Panel Styles */
.search-panel {
  height: 100%;
  overflow: auto;
  background: #f8fafc;
  padding: 24px;
}

.search-header {
  text-align: center;
  margin-bottom: 32px;
}

.search-header h2 {
  color: #1a202c;
  margin-bottom: 8px;
}

.search-description {
  color: #4a5568;
  font-size: 14px;
  line-height: 1.5;
}

.main-search-section {
  margin-bottom: 24px;
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
}

.main-search-form {
  margin-bottom: 16px;
}

.main-search-container {
  display: flex;
  gap: 12px;
  align-items: center;
}

.main-search-input {
  flex: 1;
  padding: 16px 20px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 0.2s;
}

.main-search-input:focus {
  outline: none;
  border-color: #3182ce;
  box-shadow: 0 0 0 3px rgba(49, 130, 206, 0.1);
}

.main-search-btn {
  padding: 16px 24px;
  background: #3182ce;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.main-search-btn:hover:not(:disabled) {
  background: #2c5aa0;
}

.main-search-btn:disabled {
  background: #a0aec0;
  cursor: not-allowed;
}

.search-progress-section {
  margin-top: 16px;
  padding: 16px;
  background: #f7fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
  color: #4a5568;
}

.current-dir {
  font-family: monospace;
  font-size: 12px;
  color: #718096;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3182ce, #2c5aa0);
  transition: width 0.3s ease;
}

.progress-text {
  text-align: center;
  font-size: 12px;
  color: #718096;
  font-weight: 500;
}

.search-controls {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  margin-bottom: 24px;
}

.search-control-row {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.search-type-selector,
.search-scope-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 250px;
}

.search-type-selector label,
.search-scope-selector label {
  font-weight: 600;
  color: #2d3748;
  font-size: 14px;
}

.search-type-select,
.search-scope-select {
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  color: #2d3748;
  cursor: pointer;
  transition: border-color 0.2s;
}

.search-type-select:focus,
.search-scope-select:focus {
  outline: none;
  border-color: #3182ce;
  box-shadow: 0 0 0 3px rgba(49, 130, 206, 0.1);
}

.search-action-buttons {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.btn-outline {
  background: transparent;
  color: #e53e3e;
  border: 1px solid #e53e3e;
}

.btn-outline:hover:not(:disabled) {
  background: #e53e3e;
  color: white;
}

.search-advanced {
  background: #f0f9ff;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #bfdbfe;
  margin-bottom: 24px;
}

.advanced-options h4 {
  margin: 0 0 16px 0;
  color: #1e40af;
  font-size: 16px;
}

.option-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #1e40af;
}

.checkbox-label input {
  transform: scale(1.1);
}

.search-history {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  margin-bottom: 24px;
}

.search-history h4 {
  margin: 0 0 12px 0;
  color: #2d3748;
  font-size: 16px;
}

.history-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.history-tag {
  padding: 6px 12px;
  background: #e2e8f0;
  border: none;
  border-radius: 16px;
  font-size: 13px;
  color: #4a5568;
  cursor: pointer;
  transition: all 0.2s;
}

.history-tag:hover {
  background: #cbd5e0;
  color: #2d3748;
}

.search-results {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  overflow: hidden;
}

.search-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  gap: 16px;
}

.loading-detail {
  font-size: 14px;
  color: #718096;
  text-align: center;
  max-width: 400px;
}

.results-container {
  padding: 24px;
}

.results-header h3 {
  margin: 0 0 24px 0;
  color: #1a202c;
  font-size: 20px;
}

.results-count {
  color: #718096;
  font-weight: 400;
}

.no-results {
  text-align: center;
  padding: 48px 24px;
}

.no-results-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.no-results h4 {
  margin: 0 0 8px 0;
  color: #4a5568;
  font-size: 18px;
}

.no-results p {
  color: #718096;
  margin-bottom: 24px;
}

.search-suggestions {
  background: #f7fafc;
  padding: 20px;
  border-radius: 8px;
  text-align: left;
  max-width: 500px;
  margin: 0 auto;
}

.search-suggestions h5 {
  margin: 0 0 12px 0;
  color: #2d3748;
  font-size: 14px;
}

.search-suggestions ul {
  margin: 0;
  padding-left: 20px;
}

.search-suggestions li {
  color: #4a5568;
  font-size: 13px;
  margin-bottom: 4px;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.search-result-item {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 20px;
  transition: border-color 0.2s;
}

.search-result-item:hover {
  border-color: #cbd5e0;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.result-file-info {
  display: flex;
  gap: 12px;
  flex: 1;
}

.file-details {
  flex: 1;
}

.file-name {
  margin: 0 0 6px 0;
  color: #1a202c;
  font-size: 16px;
  font-weight: 600;
}

.file-path {
  margin: 0 0 8px 0;
  color: #718096;
  font-size: 12px;
  font-family: monospace;
}

.file-metadata {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #4a5568;
  flex-wrap: wrap;
}

.match-type {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}

.match-icon {
  font-size: 14px;
}

.result-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.match-context {
  background: #f7fafc;
  border-left: 3px solid #3182ce;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 12px;
}

.match-context h5 {
  margin: 0 0 8px 0;
  color: #2d3748;
  font-size: 13px;
}

.context-preview pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 12px;
  color: #4a5568;
  line-height: 1.4;
}

.search-highlight {
  background: #fef08a;
  padding: 1px 2px;
  border-radius: 2px;
  font-weight: 600;
}

.ai-preview {
  background: #f0f9ff;
  border-left: 3px solid #0ea5e9;
  padding: 12px;
  border-radius: 4px;
}

.ai-preview h5 {
  margin: 0 0 8px 0;
  color: #0369a1;
  font-size: 13px;
}

.analysis-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.classification-tag,
.analysis-tag {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  color: white;
}

.analysis-tag {
  background: #6b7280;
}

.confidence-indicator {
  font-size: 12px;
  color: #0369a1;
  font-weight: 500;
}

.search-welcome {
  text-align: center;
  padding: 48px 24px;
}

.welcome-icon {
  font-size: 64px;
  margin-bottom: 24px;
}

.search-welcome h3 {
  margin: 0 0 16px 0;
  color: #1a202c;
  font-size: 24px;
}

.search-welcome p {
  color: #4a5568;
  font-size: 16px;
  line-height: 1.6;
  margin-bottom: 32px;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.search-features,
.search-examples {
  background: #f7fafc;
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 24px;
  text-align: left;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.search-features h4,
.search-examples h4 {
  margin: 0 0 16px 0;
  color: #2d3748;
  font-size: 16px;
}

.search-features ul {
  margin: 0;
  padding-left: 20px;
}

.search-features li {
  color: #4a5568;
  font-size: 14px;
  margin-bottom: 8px;
  line-height: 1.4;
}

.example-queries {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.example-query {
  padding: 8px 16px;
  background: #3182ce;
  color: white;
  border: none;
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.example-query:hover {
  background: #2c5aa0;
}

/* Filter and Sort Controls */
.filter-sort-section {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  margin-bottom: 24px;
  overflow: hidden;
}

.filter-sort-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.filter-sort-header h4 {
  margin: 0;
  color: #1a202c;
  font-size: 16px;
  font-weight: 600;
}

.filter-sort-controls {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.sort-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.sort-controls label {
  font-size: 14px;
  color: #4a5568;
  font-weight: 500;
}

.sort-select {
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  color: #2d3748;
  cursor: pointer;
  min-width: 140px;
}

.sort-order-btn {
  padding: 6px 10px;
  background: #f7fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s;
}

.sort-order-btn:hover {
  background: #edf2f7;
  border-color: #cbd5e0;
}

.filters-panel {
  padding: 20px;
  background: #fafbfc;
  border-top: 1px solid #e2e8f0;
}

.filter-row {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 150px;
  flex: 1;
}

.filter-group label {
  font-size: 13px;
  color: #2d3748;
  font-weight: 600;
}

.filter-select {
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
  background: white;
  color: #2d3748;
  cursor: pointer;
}

.filter-select:focus {
  outline: none;
  border-color: #3182ce;
  box-shadow: 0 0 0 3px rgba(49, 130, 206, 0.1);
}

.filter-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.active-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-tag {
  padding: 4px 10px;
  background: #e2e8f0;
  color: #4a5568;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

/* Enhanced results display */
.search-result-item {
  position: relative;
}

.search-result-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: #e2e8f0;
  border-radius: 2px;
}

.search-result-item:hover::before {
  background: #3182ce;
}

.file-metadata {
  display: flex;
  gap: 16px;
  align-items: center;
}

.file-metadata > span {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #718096;
}

.file-metadata .match-type {
  background: #f0f9ff;
  color: #0369a1;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
}

/* Responsive design for filters */
@media (max-width: 768px) {
  .filter-sort-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .filter-sort-controls {
    width: 100%;
    justify-content: space-between;
  }
  
  .filter-row {
    flex-direction: column;
    gap: 12px;
  }
  
  .filter-group {
    min-width: auto;
  }
  
  .filter-actions {
    flex-direction: column;
    align-items: flex-start;
  }
}
`;

// Add styles to document
const styleSheet = document.createElement('style');
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

// Search Panel Component
function SearchPanel({ 
  searchQuery, 
  searchResults, 
  searchLoading, 
  searchHistory, 
  onSearch, 
  onClearSearch, 
  onFileAnalyze, 
  onFileSelect 
}) {
  const [searchType, setSearchType] = React.useState('all');
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [localSearchInput, setLocalSearchInput] = React.useState('');
  const [searchProgress, setSearchProgress] = React.useState(0);
  const [currentDirectory, setCurrentDirectory] = React.useState('');
  const [searchScope, setSearchScope] = React.useState('real'); // 'real', 'demo', 'both'
  
  // New filter and sort states
  const [sortBy, setSortBy] = React.useState('relevance');
  const [sortOrder, setSortOrder] = React.useState('desc');
  const [fileTypeFilter, setFileTypeFilter] = React.useState('all');
  const [dateFilter, setDateFilter] = React.useState('all');
  const [sizeFilter, setSizeFilter] = React.useState('all');
  const [showFilters, setShowFilters] = React.useState(false);

  React.useEffect(() => {
    // Listen for search progress updates
    const handleSearchProgress = (event, data) => {
      setSearchProgress(data.progress);
      setCurrentDirectory(data.currentDirectory || '');
    };

    const { ipcRenderer } = window.require('electron');
    ipcRenderer.on('search-progress', handleSearchProgress);

    // Cleanup listener
    return () => {
      ipcRenderer.removeListener('search-progress', handleSearchProgress);
    };
  }, []);

  // Reset progress when search completes
  React.useEffect(() => {
    if (!searchLoading && searchProgress > 0) {
      const timer = setTimeout(() => {
        setSearchProgress(0);
        setCurrentDirectory('');
      }, 1000); // Reset after 1 second

      return () => clearTimeout(timer);
    }
  }, [searchLoading, searchProgress]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (localSearchInput.trim()) {
      setSearchProgress(0);
      setCurrentDirectory('');
      onSearch(localSearchInput.trim(), searchType, searchScope);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString();
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const iconMap = {
      'pdf': '📄', 'doc': '📝', 'docx': '📝', 'txt': '📃', 'md': '📃',
      'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
      'mp4': '🎬', 'avi': '🎬', 'mov': '🎬',
      'mp3': '🎵', 'wav': '🎵', 'flac': '🎵',
      'zip': '📦', 'rar': '📦', '7z': '📦',
      'js': '💻', 'py': '💻', 'java': '💻', 'cpp': '💻',
      'html': '🌐', 'css': '🎨', 'json': '📋'
    };
    return iconMap[ext] || '📄';
  };

  const highlightText = (text, query) => {
    if (!query || !text) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? 
        React.createElement('mark', { key: index, className: 'search-highlight' }, part) :
        part
    );
  };

  const getMatchTypeIcon = (matchType) => {
    switch (matchType) {
      case 'filename': return '📛';
      case 'content': return '📝';
      case 'ai_semantic': return '🧠';
      default: return '🔍';
    }
  };

  const getMatchTypeLabel = (matchType) => {
    switch (matchType) {
      case 'filename': return 'Filename Match';
      case 'content': return 'Content Match';
      case 'ai_semantic': return 'AI Semantic Match';
      default: return 'Match';
    }
  };

  // Filter and sort functions
  const getFileType = (fileName) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'].includes(ext)) return 'document';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'].includes(ext)) return 'image';
    if (['mp4', 'avi', 'mov', 'mkv', 'mp3', 'wav', 'flac'].includes(ext)) return 'media';
    if (['js', 'py', 'java', 'cpp', 'html', 'css', 'json'].includes(ext)) return 'code';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
    return 'other';
  };

  const filterByDate = (fileDate, filter) => {
    if (filter === 'all') return true;
    const now = new Date();
    const fileTime = new Date(fileDate);
    const daysDiff = (now - fileTime) / (1000 * 60 * 60 * 24);
    
    switch (filter) {
      case 'today': return daysDiff < 1;
      case 'week': return daysDiff < 7;
      case 'month': return daysDiff < 30;
      case 'year': return daysDiff < 365;
      default: return true;
    }
  };

  const filterBySize = (fileSize, filter) => {
    if (filter === 'all') return true;
    const sizeInMB = fileSize / (1024 * 1024);
    
    switch (filter) {
      case 'small': return sizeInMB < 1;
      case 'medium': return sizeInMB >= 1 && sizeInMB < 10;
      case 'large': return sizeInMB >= 10;
      default: return true;
    }
  };

  const applyFiltersAndSort = (results) => {
    if (!results || results.length === 0) return results;

    // Apply filters
    let filteredResults = results.filter(result => {
      // File type filter
      if (fileTypeFilter !== 'all') {
        const fileType = getFileType(result.fileName);
        if (fileType !== fileTypeFilter) return false;
      }

      // Date filter
      if (!filterByDate(result.modified, dateFilter)) return false;

      // Size filter
      if (!filterBySize(result.fileSize || 0, sizeFilter)) return false;

      return true;
    });

    // Apply sorting
    filteredResults.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'relevance':
          comparison = (b.relevanceScore || 0) - (a.relevanceScore || 0);
          break;
        case 'name':
          comparison = a.fileName.localeCompare(b.fileName);
          break;
        case 'modified':
          comparison = new Date(b.modified || 0) - new Date(a.modified || 0);
          break;
        case 'size':
          comparison = (b.fileSize || 0) - (a.fileSize || 0);
          break;
        case 'type':
          const aType = getFileType(a.fileName);
          const bType = getFileType(b.fileName);
          comparison = aType.localeCompare(bType);
          break;
        default:
          comparison = 0;
      }

      return sortOrder === 'desc' ? comparison : -comparison;
    });

    return filteredResults;
  };

  // Get filtered and sorted results
  const processedResults = applyFiltersAndSort(searchResults);

  return React.createElement('div', { className: 'search-panel' },
    React.createElement('div', { className: 'search-header' },
      React.createElement('h2', null, '🔍 AI-Powered File Search'),
      React.createElement('p', { className: 'search-description' },
        'Search through file names and content using advanced AI analysis. The AI will analyze every file to find matches.'
      )
    ),

    // Main Search Input
    React.createElement('div', { className: 'main-search-section' },
      React.createElement('form', { 
        className: 'main-search-form',
        onSubmit: handleSearchSubmit
      },
        React.createElement('div', { className: 'main-search-container' },
          React.createElement('input', {
            type: 'text',
            className: 'main-search-input',
            placeholder: 'Enter search term (e.g. "resume", "invoice", "python code")...',
            value: localSearchInput,
            onChange: (e) => setLocalSearchInput(e.target.value),
            disabled: searchLoading
          }),
          React.createElement('button', {
            type: 'submit',
            className: 'main-search-btn',
            disabled: searchLoading || !localSearchInput.trim()
          }, searchLoading ? '⏳ Searching...' : '🔍 Search All Files')
        )
      ),
      
      // Search Progress Bar
      searchLoading && React.createElement('div', { className: 'search-progress-section' },
        React.createElement('div', { className: 'progress-info' },
          React.createElement('span', null, 'AI is analyzing files...'),
          currentDirectory && React.createElement('span', { className: 'current-dir' }, 
            `Scanning: ${currentDirectory.replace(require('os').homedir(), '~')}`
          )
        ),
        React.createElement('div', { className: 'progress-bar' },
          React.createElement('div', { 
            className: 'progress-fill',
            style: { width: `${searchProgress}%` }
          })
        ),
        React.createElement('div', { className: 'progress-text' },
          `${Math.round(searchProgress)}% Complete`
        )
      )
    ),

    // Search Controls
    React.createElement('div', { className: 'search-controls' },
      React.createElement('div', { className: 'search-control-row' },
        React.createElement('div', { className: 'search-type-selector' },
          React.createElement('label', null, 'Search In:'),
          React.createElement('select', {
            value: searchType,
            onChange: (e) => setSearchType(e.target.value),
            className: 'search-type-select'
          },
            React.createElement('option', { value: 'all' }, 'File Names & Content (Recommended)'),
            React.createElement('option', { value: 'filename' }, 'File Names Only'),
            React.createElement('option', { value: 'content' }, 'File Content Only')
          )
        ),

        React.createElement('div', { className: 'search-scope-selector' },
          React.createElement('label', null, 'Search Location:'),
          React.createElement('select', {
            value: searchScope,
            onChange: (e) => setSearchScope(e.target.value),
            className: 'search-scope-select'
          },
            React.createElement('option', { value: 'real' }, '🏠 Your Real Files (Documents, Downloads, Desktop)'),
            React.createElement('option', { value: 'demo' }, '🎭 Demo Files Only'),
            React.createElement('option', { value: 'both' }, '🌐 Both Real & Demo Files')
          )
        )
      ),

      React.createElement('div', { className: 'search-action-buttons' },
        React.createElement('button', {
          className: 'btn btn-secondary',
          onClick: () => setShowAdvanced(!showAdvanced)
        }, showAdvanced ? '▼ Hide Advanced' : '▶ Show Advanced'),

        searchQuery && React.createElement('button', {
          className: 'btn btn-outline',
          onClick: onClearSearch
        }, '✖ Clear Search')
      )
    ),

    // Filter and Sort Controls
    searchResults.length > 0 && React.createElement('div', { className: 'filter-sort-section' },
      React.createElement('div', { className: 'filter-sort-header' },
        React.createElement('h4', null, 
          `📊 Results (${processedResults.length} of ${searchResults.length})`
        ),
        React.createElement('div', { className: 'filter-sort-controls' },
          React.createElement('button', {
            className: 'btn btn-secondary btn-sm',
            onClick: () => setShowFilters(!showFilters)
          }, showFilters ? '📊 Hide Filters' : '🔧 Show Filters'),
          
          React.createElement('div', { className: 'sort-controls' },
            React.createElement('label', null, 'Sort by:'),
            React.createElement('select', {
              value: sortBy,
              onChange: (e) => setSortBy(e.target.value),
              className: 'sort-select'
            },
              React.createElement('option', { value: 'relevance' }, '🎯 Relevance'),
              React.createElement('option', { value: 'modified' }, '📅 Date Modified'),
              React.createElement('option', { value: 'name' }, '📝 File Name'),
              React.createElement('option', { value: 'size' }, '📊 File Size'),
              React.createElement('option', { value: 'type' }, '📂 File Type')
            ),
            React.createElement('button', {
              className: 'sort-order-btn',
              onClick: () => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'),
              title: sortOrder === 'desc' ? 'Switch to Ascending' : 'Switch to Descending'
            }, sortOrder === 'desc' ? '⬇️' : '⬆️')
          )
        )
      ),

      showFilters && React.createElement('div', { className: 'filters-panel' },
        React.createElement('div', { className: 'filter-row' },
          React.createElement('div', { className: 'filter-group' },
            React.createElement('label', null, '📂 File Type:'),
            React.createElement('select', {
              value: fileTypeFilter,
              onChange: (e) => setFileTypeFilter(e.target.value),
              className: 'filter-select'
            },
              React.createElement('option', { value: 'all' }, 'All Types'),
              React.createElement('option', { value: 'document' }, '📄 Documents'),
              React.createElement('option', { value: 'image' }, '🖼️ Images'),
              React.createElement('option', { value: 'media' }, '🎬 Media'),
              React.createElement('option', { value: 'code' }, '💻 Code'),
              React.createElement('option', { value: 'archive' }, '📦 Archives'),
              React.createElement('option', { value: 'other' }, '📁 Other')
            )
          ),

          React.createElement('div', { className: 'filter-group' },
            React.createElement('label', null, '📅 Modified:'),
            React.createElement('select', {
              value: dateFilter,
              onChange: (e) => setDateFilter(e.target.value),
              className: 'filter-select'
            },
              React.createElement('option', { value: 'all' }, 'All Time'),
              React.createElement('option', { value: 'today' }, '🌟 Today'),
              React.createElement('option', { value: 'week' }, '📅 This Week'),
              React.createElement('option', { value: 'month' }, '📆 This Month'),
              React.createElement('option', { value: 'year' }, '🗓️ This Year')
            )
          ),

          React.createElement('div', { className: 'filter-group' },
            React.createElement('label', null, '📊 File Size:'),
            React.createElement('select', {
              value: sizeFilter,
              onChange: (e) => setSizeFilter(e.target.value),
              className: 'filter-select'
            },
              React.createElement('option', { value: 'all' }, 'All Sizes'),
              React.createElement('option', { value: 'small' }, '🔸 Small (<1MB)'),
              React.createElement('option', { value: 'medium' }, '🔹 Medium (1-10MB)'),
              React.createElement('option', { value: 'large' }, '🔷 Large (>10MB)')
            )
          )
        ),

        React.createElement('div', { className: 'filter-actions' },
          React.createElement('button', {
            className: 'btn btn-outline btn-sm',
            onClick: () => {
              setFileTypeFilter('all');
              setDateFilter('all');
              setSizeFilter('all');
              setSortBy('relevance');
              setSortOrder('desc');
            }
          }, '🔄 Reset Filters'),
          React.createElement('div', { className: 'active-filters' },
            fileTypeFilter !== 'all' && React.createElement('span', { className: 'filter-tag' }, 
              `Type: ${fileTypeFilter}`
            ),
            dateFilter !== 'all' && React.createElement('span', { className: 'filter-tag' }, 
              `Date: ${dateFilter}`
            ),
            sizeFilter !== 'all' && React.createElement('span', { className: 'filter-tag' }, 
              `Size: ${sizeFilter}`
            )
          )
        )
      )
    ),

    // Advanced Options
    showAdvanced && React.createElement('div', { className: 'search-advanced' },
      React.createElement('div', { className: 'advanced-options' },
        React.createElement('h4', null, '🎛️ Advanced Search Options'),
        React.createElement('div', { className: 'option-grid' },
          React.createElement('label', { className: 'checkbox-label' },
            React.createElement('input', { type: 'checkbox', defaultChecked: true }),
            'Include AI semantic analysis'
          ),
          React.createElement('label', { className: 'checkbox-label' },
            React.createElement('input', { type: 'checkbox', defaultChecked: true }),
            'Search file metadata'
          ),
          React.createElement('label', { className: 'checkbox-label' },
            React.createElement('input', { type: 'checkbox', defaultChecked: false }),
            'Case sensitive search'
          ),
          React.createElement('label', { className: 'checkbox-label' },
            React.createElement('input', { type: 'checkbox', defaultChecked: true }),
            'Deep scan all subdirectories'
          )
        )
      )
    ),

    // Search History
    searchHistory.length > 0 && React.createElement('div', { className: 'search-history' },
      React.createElement('h4', null, '🕒 Recent Searches'),
      React.createElement('div', { className: 'history-tags' },
        searchHistory.slice(0, 5).map((historyQuery, index) =>
          React.createElement('button', {
            key: index,
            className: 'history-tag',
            onClick: () => {
              setLocalSearchInput(historyQuery);
              onSearch(historyQuery);
            }
          }, historyQuery)
        )
      )
    ),

    // Search Results
    React.createElement('div', { className: 'search-results' },
      searchLoading ? 
        React.createElement('div', { className: 'search-loading' },
          React.createElement('div', { className: 'spinner' }),
          React.createElement('p', null, `Searching for "${localSearchInput || searchQuery}"...`),
          React.createElement('p', { className: 'loading-detail' }, 'AI is analyzing every file to find matches. This may take a moment for large directories.')
        ) :
        searchQuery && React.createElement('div', { className: 'results-container' },
          React.createElement('div', { className: 'results-header' },
            React.createElement('h3', null, 
              `Search Results for "${searchQuery}"`,
              React.createElement('span', { className: 'results-count' }, 
                processedResults.length !== searchResults.length ? 
                  ` (${processedResults.length} shown of ${searchResults.length} found)` :
                  ` (${searchResults.length} found)`
              )
            )
          ),

          processedResults.length === 0 ? 
            React.createElement('div', { className: 'no-results' },
              React.createElement('div', { className: 'no-results-icon' }, '🔍'),
              React.createElement('h4', null, 
                searchResults.length === 0 ? 'No files found' : 'No files match current filters'
              ),
              React.createElement('p', null, 
                searchResults.length === 0 ? 
                  `No files match your search for "${searchQuery}"` :
                  `${searchResults.length} files found, but none match your current filters`
              ),
              React.createElement('div', { className: 'search-suggestions' },
                React.createElement('h5', null, '💡 Search Tips:'),
                React.createElement('ul', null,
                  React.createElement('li', null, 'Try different keywords or phrases'),
                  React.createElement('li', null, 'Use broader terms (e.g., "document" instead of "report")'),
                  React.createElement('li', null, 'Make sure demo files are generated (go to Settings tab)'),
                  React.createElement('li', null, 'AI search works best with descriptive content'),
                  React.createElement('li', null, 'Check console (F12) for detailed search debugging info')
                )
              )
            ) :
            React.createElement('div', { className: 'results-list' },
              processedResults.map((result, index) =>
                React.createElement('div', { key: index, className: 'search-result-item' },
                  React.createElement('div', { className: 'result-header' },
                    React.createElement('div', { className: 'result-file-info' },
                      React.createElement('span', { className: 'file-icon' }, getFileIcon(result.fileName)),
                      React.createElement('div', { className: 'file-details' },
                        React.createElement('h4', { className: 'file-name' },
                          highlightText(result.fileName, searchQuery)
                        ),
                        React.createElement('p', { className: 'file-path' }, result.filePath),
                        React.createElement('div', { className: 'file-metadata' },
                          React.createElement('span', null, formatFileSize(result.fileSize || 0)),
                          React.createElement('span', null, formatDate(result.modified || new Date())),
                          React.createElement('span', { className: 'match-type' },
                            React.createElement('span', { className: 'match-icon' }, getMatchTypeIcon(result.matchType)),
                            getMatchTypeLabel(result.matchType)
                          )
                        )
                      )
                    ),
                    React.createElement('div', { className: 'result-actions' },
                      React.createElement('button', {
                        className: 'btn btn-primary btn-sm',
                        onClick: () => onFileAnalyze(result.filePath)
                      }, '🧠 Analyze'),
                      React.createElement('button', {
                        className: 'btn btn-secondary btn-sm',
                        onClick: () => onFileSelect(result.filePath)
                      }, '📁 Open Location')
                    )
                  ),

                  // Match Context
                  result.matchContext && React.createElement('div', { className: 'match-context' },
                    React.createElement('h5', null, '📝 Match Context:'),
                    React.createElement('div', { className: 'context-preview' },
                      React.createElement('pre', null, highlightText(result.matchContext, searchQuery))
                    )
                  ),

                  // AI Analysis Preview
                  result.aiAnalysis && React.createElement('div', { className: 'ai-preview' },
                    React.createElement('h5', null, '🧠 AI Analysis:'),
                    React.createElement('div', { className: 'analysis-tags' },
                      React.createElement('span', { 
                        className: 'classification-tag',
                        style: { backgroundColor: '#667eea' }
                      }, result.aiAnalysis.classification || 'unknown'),
                      result.aiAnalysis.tags && result.aiAnalysis.tags.slice(0, 3).map((tag, tagIndex) =>
                        React.createElement('span', { 
                          key: tagIndex, 
                          className: 'analysis-tag' 
                        }, tag)
                      )
                    ),
                    result.aiAnalysis.confidence && React.createElement('div', { className: 'confidence-indicator' },
                      `Confidence: ${Math.round(result.aiAnalysis.confidence * 100)}%`
                    )
                  )
                )
              )
            )
        ),

      !searchQuery && !searchLoading && React.createElement('div', { className: 'search-welcome' },
        React.createElement('div', { className: 'welcome-icon' }, '🔍'),
        React.createElement('h3', null, 'AI-Powered File Search'),
        React.createElement('p', null, 'Enter a search term above to find files by name or content. The AI will analyze every file to find matches.'),
        React.createElement('div', { className: 'search-features' },
          React.createElement('h4', null, '✨ Search Features:'),
          React.createElement('ul', null,
            React.createElement('li', null, '🔤 File name matching with highlighting'),
            React.createElement('li', null, '📝 Full content text search'),
            React.createElement('li', null, '🧠 AI semantic understanding'),
            React.createElement('li', null, '🏷️ Smart classification and tagging'),
            React.createElement('li', null, '📊 Relevance scoring and ranking'),
            React.createElement('li', null, '📁 Deep directory scanning')
          )
        ),
        React.createElement('div', { className: 'search-examples' },
          React.createElement('h4', null, '💡 Example Searches:'),
          React.createElement('div', { className: 'example-queries' },
            ['resume', 'invoice', 'python code', 'vacation photos', 'meeting notes', 'financial documents'].map((example, index) =>
              React.createElement('button', {
                key: index,
                className: 'example-query',
                onClick: () => {
                  setLocalSearchInput(example);
                  onSearch(example);
                }
              }, `"${example}"`)
            )
          )
        )
      )
    )
  );
}

// Undo Modal Component
function UndoModal({ backupRecords, onClose, onUndo, onRefresh }) {
  const [undoingRecords, setUndoingRecords] = React.useState(new Set());
  const [undoingAll, setUndoingAll] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const handleUndo = async (backupId) => {
    setUndoingRecords(prev => new Set([...prev, backupId]));
    try {
      const result = await onUndo(backupId);
      if (result.success) {
        // Show success notification
        showNotification(`✅ Successfully restored ${result.fileName}!`, 'success');
        
        // Refresh the backup records to update the UI
        await onRefresh();
        
        // Force re-render
        setRefreshKey(prev => prev + 1);
        
        // Remove loading state
        setUndoingRecords(prev => {
          const newSet = new Set(prev);
          newSet.delete(backupId);
          return newSet;
        });
        return;
      }
    } catch (error) {
      showNotification(`❌ Failed to undo: ${error.message}`, 'error');
    }
    
    // Always remove the loading state
    setUndoingRecords(prev => {
      const newSet = new Set(prev);
      newSet.delete(backupId);
      return newSet;
    });
  };

  const handleUndoAll = async () => {
    if (backupRecords.length === 0) return;
    
    const confirmed = confirm(
      `Are you sure you want to undo ALL ${backupRecords.length} file organization${backupRecords.length !== 1 ? 's' : ''}? ` +
      'This will restore all files to their original locations.'
    );
    
    if (!confirmed) return;

    setUndoingAll(true);
    try {
      // Call the batch undo operation
      const backupIds = backupRecords.map(record => record.id);
      const result = await ipcRenderer.invoke('undo-multiple-organizations', backupIds);
      
      if (result.success) {
        showNotification(
          `✅ Successfully restored ${result.successCount} file${result.successCount !== 1 ? 's' : ''}!` +
          (result.failureCount > 0 ? ` (${result.failureCount} failed)` : ''),
          'success'
        );
        await onRefresh();
        setRefreshKey(prev => prev + 1);
      } else {
        showNotification(`❌ Batch undo failed: ${result.error || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      showNotification(`❌ Failed to undo all: ${error.message}`, 'error');
    } finally {
      setUndoingAll(false);
    }
  };

  const showNotification = (message, type) => {
    // Create a temporary notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? '#48bb78' : '#f56565'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-weight: 500;
      font-size: 14px;
      max-width: 400px;
      word-wrap: break-word;
      animation: slideInRight 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 4 seconds
    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease-out';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 4000);
  };

  const getMethodIcon = (method) => {
    const icons = {
      'ai-smart': '🧠',
      'by-type': '📁',
      'by-date': '📅',
      'by-modified': '🕒',
      'by-size': '📏',
      'by-project': '🎯',
      'alphabetical': '🔤',
      'by-source': '📍'
    };
    return icons[method] || '📋';
  };

  const getMethodName = (method) => {
    const names = {
      'ai-smart': 'AI Smart',
      'by-type': 'By Type',
      'by-date': 'By Date',
      'by-modified': 'By Modified',
      'by-size': 'By Size',
      'by-project': 'By Project',
      'alphabetical': 'A-Z',
      'by-source': 'By Source'
    };
    return names[method] || method;
  };

  return React.createElement('div', { className: 'modal-overlay' },
    React.createElement('div', { className: 'undo-modal' },
      React.createElement('div', { className: 'modal-header' },
        React.createElement('h2', null, '↩️ Undo File Organization'),
        React.createElement('button', {
          className: 'modal-close-btn',
          onClick: onClose
        }, '✕')
      ),
      
      React.createElement('div', { className: 'modal-content' },
        backupRecords.length === 0 ? 
          React.createElement('div', { className: 'no-undo-records' },
            React.createElement('div', { className: 'no-undo-icon' }, '📂'),
            React.createElement('h3', null, 'No recent organizations'),
            React.createElement('p', null, 'No files have been organized recently that can be undone.')
          ) :
          React.createElement('div', { className: 'undo-records' },
            React.createElement('div', { className: 'undo-instructions' },
              React.createElement('p', null, 
                `Found ${backupRecords.length} recent organization${backupRecords.length !== 1 ? 's' : ''} that can be undone. ` +
                'Click "Undo" to restore a file to its original location.'
              )
            ),
            
            React.createElement('div', { 
              className: 'records-list',
              key: `records-${refreshKey}` 
            },
              backupRecords.map(record =>
                React.createElement('div', { 
                  key: `${record.id}-${refreshKey}`, 
                  className: 'undo-record-card' 
                },
                  React.createElement('div', { className: 'card-header' },
                    React.createElement('div', { className: 'file-info' },
                      React.createElement('div', { className: 'file-icon-name' },
                        React.createElement('span', { className: 'file-icon' }, '📄'),
                        React.createElement('span', { className: 'file-name' }, record.fileName)
                      ),
                      React.createElement('span', { className: 'time-badge' }, record.timeAgo)
                    ),
                    React.createElement('div', { className: 'method-info' },
                      React.createElement('span', { className: 'method-badge' },
                        getMethodIcon(record.organizationMethod),
                        ' ',
                        getMethodName(record.organizationMethod)
                      )
                    )
                  ),
                  React.createElement('div', { className: 'path-details' },
                    React.createElement('div', { className: 'path-row' },
                      React.createElement('span', { className: 'path-label from' }, '📂 From:'),
                      React.createElement('code', { className: 'path-value' }, 
                        record.originalPath.replace('/Users/bennyyang/FlowGenius-Demo/', '')
                      )
                    ),
                    React.createElement('div', { className: 'path-arrow-center' }, '↓'),
                    React.createElement('div', { className: 'path-row' },
                      React.createElement('span', { className: 'path-label to' }, '📁 To:'),
                      React.createElement('code', { className: 'path-value' }, 
                        record.newPath.replace('/Users/bennyyang/FlowGenius-Demo/', '')
                      )
                    )
                  ),
                  React.createElement('div', { className: 'card-actions' },
                    React.createElement('button', {
                      className: 'undo-btn',
                      onClick: () => handleUndo(record.id),
                      disabled: undoingRecords.has(record.id),
                      title: `Restore ${record.fileName} to its original location`
                    }, undoingRecords.has(record.id) ? 
                      React.createElement('span', null, '⏳ Undoing...') :
                      React.createElement('span', null, '↩️ Undo')
                    )
                  )
                )
              )
            )
          )
      ),
      
      React.createElement('div', { className: 'modal-footer' },
        React.createElement('div', { className: 'modal-footer-left' },
          React.createElement('button', {
            className: 'btn btn-outline btn-sm',
            onClick: async () => {
              await onRefresh();
              setRefreshKey(prev => prev + 1);
            },
            disabled: undoingAll
          }, '🔄 Refresh')
        ),
        React.createElement('div', { className: 'modal-footer-right' },
          backupRecords.length > 0 && React.createElement('button', {
            className: 'btn-danger-outline',
            onClick: handleUndoAll,
            disabled: undoingAll || backupRecords.length === 0
          }, undoingAll ? '⏳ Undoing All...' : `↩️ Undo All (${backupRecords.length})`),
          React.createElement('button', {
            className: 'btn btn-secondary',
            onClick: onClose,
            disabled: undoingAll
          }, 'Close')
        )
      )
    )
  );
}

// Render the app
ReactDOM.render(React.createElement(App), document.getElementById('root')); 