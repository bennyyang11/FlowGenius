const fs = require('fs').promises;
const path = require('path');
const { AIClassificationService } = require('../ai/classificationService');

class SearchService {
  constructor() {
    this.aiService = new AIClassificationService();
    this.searchCache = new Map();
    this.fileIndex = new Map(); // Cached file content for faster searching
  }

  async initialize() {
    await this.aiService.initialize();
    console.log('🔍 Search Service initialized');
  }

  async searchFiles(options) {
    const {
      query,
      searchType = 'all', // 'name', 'content', 'all'
      includeAnalysis = true,
      directories = null,
      searchScope = 'real', // 'real', 'demo', 'both'
      maxResults = 50,
      caseSensitive = false,
      onProgress = null // Progress callback function
    } = options;

    console.log(`🔍 Starting search for: "${query}" in ${searchType} mode, scope: ${searchScope}`);

    try {
      let searchDirs = [];

      // Determine directories based on search scope
      if (searchScope === 'real' || searchScope === 'both') {
        // Real user directories
        const realDirs = directories || [
          require('os').homedir() + '/Downloads',
          require('os').homedir() + '/Documents', 
          require('os').homedir() + '/Desktop'
        ];
        searchDirs.push(...realDirs);
      }

      if (searchScope === 'demo' || searchScope === 'both') {
        // Demo directory
        const demoDir = require('path').join(require('os').homedir(), 'FlowGenius-Demo');
        try {
          await require('fs').promises.access(demoDir);
          searchDirs.push(demoDir);
        } catch (error) {
          console.warn('Demo directory not found:', demoDir);
        }
      }

      // If directories were explicitly provided, use those instead
      if (directories && directories.length > 0) {
        searchDirs = directories;
      }

      if (searchDirs.length === 0) {
        console.warn('No directories to search in');
        return [];
      }

      console.log('📁 Searching in directories:', searchDirs);

      const results = [];
      const processedFiles = new Set();
      let totalDirectories = 0;
      let processedDirectories = 0;

      // First pass: count total directories to search for progress tracking
      if (onProgress) {
        for (const dir of searchDirs) {
          try {
            totalDirectories += await this.countDirectories(dir);
          } catch (error) {
            // Ignore errors during counting
          }
        }
        console.log(`📊 Total directories to search: ${totalDirectories}`);
      }

      const updateProgress = () => {
        processedDirectories++;
        if (onProgress && totalDirectories > 0) {
          const progress = Math.min(100, Math.round((processedDirectories / totalDirectories) * 100));
          return progress;
        }
        return 0;
      };

      for (const dir of searchDirs) {
        try {
          console.log(`📂 Searching directory: ${dir}`);
          await this.searchInDirectory(
            dir, 
            query, 
            searchType, 
            includeAnalysis, 
            caseSensitive, 
            results, 
            processedFiles, 
            maxResults,
            onProgress,
            totalDirectories,
            updateProgress
          );
          console.log(`📊 Found ${results.length} results so far in ${dir}`);
        } catch (error) {
          console.warn(`Could not search in directory ${dir}:`, error.message);
        }
      }

      console.log(`🎯 Total search results before sorting: ${results.length}`);

      // Sort results by relevance
      const sortedResults = this.sortResultsByRelevance(results, query);
      console.log(`✅ Search completed: ${sortedResults.length} results for "${query}"`);
      console.log('Sample results:', sortedResults.slice(0, 3).map(r => ({ fileName: r.fileName, matchType: r.matchType, filePath: r.filePath })));
      
      return sortedResults;
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  async countDirectories(dirPath, depth = 0) {
    if (depth > 5) return 0; // Limit depth to prevent infinite recursion
    
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      let count = 1; // Count this directory
      
      for (const item of items) {
        if (item.name.startsWith('.') || item.name.startsWith('~')) continue;
        
        if (item.isDirectory()) {
          const fullPath = path.join(dirPath, item.name);
          count += await this.countDirectories(fullPath, depth + 1);
        }
      }
      
      return count;
    } catch (error) {
      return 1; // Count this directory even if we can't read it
    }
  }

  async searchInDirectory(dirPath, query, searchType, includeAnalysis, caseSensitive, results, processedFiles, maxResults, onProgress = null, totalDirectories = 1, updateProgress = null) {
    if (results.length >= maxResults) return;

    try {
      console.log(`📂 Scanning directory: ${dirPath}`);
      
      // Send progress update
      if (onProgress && updateProgress) {
        const progress = updateProgress();
        onProgress(progress, dirPath);
        console.log(`📈 Progress update: ${progress}% - ${dirPath}`);
      }
      
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      console.log(`📋 Found ${items.length} items in ${dirPath}`);

      for (const item of items) {
        if (results.length >= maxResults) break;

        const fullPath = path.join(dirPath, item.name);
        console.log(`🔍 Examining: ${item.name} (${item.isDirectory() ? 'directory' : 'file'})`);

        // Skip hidden files and system directories
        if (item.name.startsWith('.') || item.name.startsWith('~')) {
          console.log(`⏭️ Skipping hidden/system file: ${item.name}`);
          continue;
        }

        if (item.isDirectory()) {
          // Recursively search subdirectories (limit depth to avoid infinite loops)
          const depth = dirPath.split(path.sep).length;
          if (depth < 10) { // Max depth
            await this.searchInDirectory(fullPath, query, searchType, includeAnalysis, caseSensitive, results, processedFiles, maxResults, onProgress, totalDirectories, updateProgress);
          }
        } else {
          // Skip if we've already processed this file
          if (processedFiles.has(fullPath)) continue;
          processedFiles.add(fullPath);

          console.log(`🔎 Searching in file: ${item.name}`);
          // Search file
          const match = await this.searchFile(fullPath, item.name, query, searchType, includeAnalysis, caseSensitive);
          if (match) {
            console.log(`✅ MATCH FOUND: ${item.name} (${match.matchType})`);
            results.push(match);
          } else {
            console.log(`❌ No match in: ${item.name}`);
          }
        }
      }
    } catch (error) {
      // Directory access denied or doesn't exist
      console.warn(`Cannot access directory ${dirPath}:`, error.message);
    }
  }

  async searchFile(filePath, fileName, query, searchType, includeAnalysis, caseSensitive) {
    try {
      console.log(`🔍 Analyzing file: ${fileName} for query: "${query}"`);
      const stats = await fs.stat(filePath);
      
      // Skip very large files (>50MB) for performance
      if (stats.size > 50 * 1024 * 1024) {
        console.log(`⏭️ Skipping large file: ${fileName} (${stats.size} bytes)`);
        return null;
      }

      let nameMatch = false;
      let contentMatch = false;
      let matchContext = null;
      let matchType = null;

      const searchQuery = caseSensitive ? query : query.toLowerCase();
      const searchFileName = caseSensitive ? fileName : fileName.toLowerCase();

      console.log(`🔤 Comparing "${searchFileName}" with "${searchQuery}"`);

      // Check filename match
      if (searchType === 'all' || searchType === 'filename') {
        nameMatch = searchFileName.includes(searchQuery);
        console.log(`📝 Filename match for "${fileName}": ${nameMatch}`);
        if (nameMatch) {
          matchType = 'filename';
          console.log(`✅ Filename match found!`);
        }
      }

      // Check content match
      if (!nameMatch && (searchType === 'all' || searchType === 'content')) {
        console.log(`📄 Checking content in: ${fileName}`);
        const contentResult = await this.searchFileContent(filePath, searchQuery, caseSensitive);
        if (contentResult.found) {
          console.log(`✅ Content match found in: ${fileName}`);
          contentMatch = true;
          matchContext = contentResult.context;
          matchType = 'content';
        } else {
          console.log(`❌ No content match in: ${fileName}`);
        }
      }

      // AI semantic search (if AI is available and content analysis is enabled)
      let aiAnalysis = null;
      if (includeAnalysis && this.aiService.openai && (nameMatch || contentMatch)) {
        console.log(`🧠 Running AI analysis on: ${fileName}`);
        try {
          aiAnalysis = await this.aiService.analyzeFile(filePath);
          
          // Check if AI analysis provides additional semantic matches
          if (!nameMatch && !contentMatch && aiAnalysis) {
            const semanticMatch = this.checkSemanticMatch(aiAnalysis, query);
            if (semanticMatch) {
              matchType = 'ai_semantic';
              matchContext = semanticMatch.context;
              console.log(`🧠 AI semantic match found in: ${fileName}`);
            }
          }
        } catch (error) {
          // AI analysis failed, continue without it
          console.warn('AI analysis failed for', fileName, ':', error.message);
        }
      }

      // Return match if found
      if (nameMatch || contentMatch || (aiAnalysis && matchType === 'ai_semantic')) {
        console.log(`🎯 FINAL MATCH: ${fileName} - Type: ${matchType}`);
        return {
          fileName,
          filePath,
          fileSize: stats.size,
          modified: stats.mtime,
          matchType,
          matchContext,
          aiAnalysis: aiAnalysis ? {
            classification: aiAnalysis.classification,
            confidence: aiAnalysis.confidence,
            tags: aiAnalysis.tags,
            organizationSuggestion: aiAnalysis.organizationSuggestion
          } : null,
          relevanceScore: this.calculateRelevanceScore(query, fileName, matchContext, aiAnalysis, matchType)
        };
      }

      console.log(`❌ No match found in: ${fileName}`);
      return null;
    } catch (error) {
      console.warn(`Error searching file ${filePath}:`, error.message);
      return null;
    }
  }

  async searchFileContent(filePath, query, caseSensitive) {
    try {
      const fileExtension = path.extname(filePath).toLowerCase();
      
      // Only search in text-based files
      const textExtensions = ['.txt', '.md', '.js', '.ts', '.py', '.java', '.cpp', '.c', '.html', '.css', '.json', '.xml', '.yml', '.yaml', '.csv'];
      
      if (!textExtensions.includes(fileExtension)) {
        return { found: false, context: null };
      }

      // Check cache first
      const cacheKey = `${filePath}-${query}`;
      if (this.searchCache.has(cacheKey)) {
        return this.searchCache.get(cacheKey);
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const searchContent = caseSensitive ? content : content.toLowerCase();
      
      const queryIndex = searchContent.indexOf(query);
      if (queryIndex !== -1) {
        // Extract context around the match
        const contextStart = Math.max(0, queryIndex - 100);
        const contextEnd = Math.min(content.length, queryIndex + query.length + 100);
        const context = content.substring(contextStart, contextEnd);
        
        const result = { found: true, context };
        
        // Cache the result
        this.searchCache.set(cacheKey, result);
        return result;
      }

      const result = { found: false, context: null };
      this.searchCache.set(cacheKey, result);
      return result;
    } catch (error) {
      // File not readable or not text
      return { found: false, context: null };
    }
  }

  checkSemanticMatch(aiAnalysis, query) {
    if (!aiAnalysis) return null;

    const queryLower = query.toLowerCase();
    
    // Check if query matches classification
    if (aiAnalysis.classification && aiAnalysis.classification.toLowerCase().includes(queryLower)) {
      return {
        context: `File classified as: ${aiAnalysis.classification}`
      };
    }

    // Check if query matches any tags
    if (aiAnalysis.tags) {
      for (const tag of aiAnalysis.tags) {
        if (tag.toLowerCase().includes(queryLower)) {
          return {
            context: `File tagged with: ${aiAnalysis.tags.join(', ')}`
          };
        }
      }
    }

    // Check if query relates to content preview
    if (aiAnalysis.content && aiAnalysis.content.toLowerCase().includes(queryLower)) {
      const queryIndex = aiAnalysis.content.toLowerCase().indexOf(queryLower);
      const contextStart = Math.max(0, queryIndex - 50);
      const contextEnd = Math.min(aiAnalysis.content.length, queryIndex + query.length + 50);
      return {
        context: aiAnalysis.content.substring(contextStart, contextEnd)
      };
    }

    return null;
  }

  calculateRelevanceScore(query, fileName, matchContext, aiAnalysis, matchType) {
    let score = 0;

    // Base score by match type
    switch (matchType) {
      case 'filename':
        score += 100;
        // Exact filename match gets highest score
        if (fileName.toLowerCase() === query.toLowerCase()) {
          score += 50;
        }
        // Filename starts with query gets bonus
        if (fileName.toLowerCase().startsWith(query.toLowerCase())) {
          score += 25;
        }
        break;
      case 'content':
        score += 75;
        break;
      case 'ai_semantic':
        score += 50;
        break;
    }

    // AI confidence bonus
    if (aiAnalysis && aiAnalysis.confidence) {
      score += aiAnalysis.confidence * 25;
    }

    // File type bonus (prefer common document types)
    const ext = path.extname(fileName).toLowerCase();
    const preferredTypes = ['.pdf', '.docx', '.txt', '.md'];
    if (preferredTypes.includes(ext)) {
      score += 10;
    }

    // Recent file bonus
    if (aiAnalysis && aiAnalysis.timestamp) {
      const daysSinceModified = (Date.now() - new Date(aiAnalysis.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceModified < 7) {
        score += 15; // Recent files get slight bonus
      }
    }

    return score;
  }

  sortResultsByRelevance(results, query) {
    return results.sort((a, b) => {
      // First sort by relevance score
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      
      // Then by match type priority
      const typeOrder = { 'filename': 0, 'content': 1, 'ai_semantic': 2 };
      const aTypeOrder = typeOrder[a.matchType] || 3;
      const bTypeOrder = typeOrder[b.matchType] || 3;
      
      if (aTypeOrder !== bTypeOrder) {
        return aTypeOrder - bTypeOrder;
      }
      
      // Finally by file modification date (newer first)
      return new Date(b.modified) - new Date(a.modified);
    });
  }

  clearCache() {
    this.searchCache.clear();
    this.fileIndex.clear();
  }

  // Get search suggestions based on common file types and patterns
  getSearchSuggestions() {
    return [
      'invoice',
      'receipt',
      'photo',
      'document',
      'report',
      'presentation',
      'spreadsheet',
      'code',
      'javascript',
      'python',
      'meeting notes',
      'vacation',
      'financial',
      'tax',
      'resume',
      'contract'
    ];
  }
}

module.exports = { SearchService }; 