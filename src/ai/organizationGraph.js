const { StateGraph, START, END } = require('@langchain/langgraph');
const { ChatOpenAI } = require('@langchain/openai');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class FileOrganizationGraph {
  constructor() {
    this.llm = null;
    this.graph = null;
  }

  async initialize() {
    try {
      // Load configuration
      const configPath = path.join(process.cwd(), 'config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      const apiKey = config.api?.openai?.apiKey || process.env.OPENAI_API_KEY;
      
      if (!apiKey || apiKey.includes('your_')) {
        console.warn('⚠️  OpenAI API key not configured. Using basic organization.');
        this.llm = null;
      } else {
        this.llm = new ChatOpenAI({
          apiKey: apiKey,
          model: 'gpt-3.5-turbo',
          temperature: 0.2
        });
      }

      // Build the organization graph
      this.graph = this.buildOrganizationGraph();
      
      console.log('🗂️ LangGraph File Organization Service initialized');
    } catch (error) {
      console.error('Failed to initialize LangGraph Organization service:', error);
    }
  }

  buildOrganizationGraph() {
    const workflow = new StateGraph({
      channels: {
        files: null, // Array of file analysis results
        groupedFiles: null, // Files grouped by category/type
        folderStructure: null, // Proposed folder structure
        organizationPlan: null, // Detailed organization plan
        conflicts: null, // Any conflicts or issues
        statistics: null, // Organization statistics
        recommendations: null, // Additional recommendations
        errors: null,
        processingSteps: null
      }
    });

    // Define nodes
    workflow.addNode('analyzeFileCollection', this.analyzeFileCollectionNode.bind(this));
    workflow.addNode('groupFiles', this.groupFilesNode.bind(this));
    workflow.addNode('designFolderStructure', this.designFolderStructureNode.bind(this));
    workflow.addNode('createOrganizationPlan', this.createOrganizationPlanNode.bind(this));
    workflow.addNode('validatePlan', this.validatePlanNode.bind(this));
    workflow.addNode('generateRecommendations', this.generateRecommendationsNode.bind(this));
    workflow.addNode('fallbackOrganization', this.fallbackOrganizationNode.bind(this));

    // Define the workflow edges
    workflow.addEdge(START, 'analyzeFileCollection');
    workflow.addEdge('analyzeFileCollection', 'groupFiles');
    
    // Conditional edge: if we have AI, use smart organization; otherwise use fallback
    workflow.addConditionalEdges(
      'groupFiles',
      this.shouldUseAIOrganization.bind(this),
      {
        ai_organization: 'designFolderStructure',
        fallback: 'fallbackOrganization'
      }
    );
    
    workflow.addEdge('designFolderStructure', 'createOrganizationPlan');
    workflow.addEdge('createOrganizationPlan', 'validatePlan');
    workflow.addEdge('validatePlan', 'generateRecommendations');
    workflow.addEdge('generateRecommendations', END);
    workflow.addEdge('fallbackOrganization', END);

    return workflow.compile();
  }

  async analyzeFileCollectionNode(state) {
    try {
      const files = state.files || [];
      
      // Extract statistics about the file collection
      const statistics = {
        totalFiles: files.length,
        totalSize: files.reduce((sum, file) => sum + (file.fileSize || 0), 0),
        categories: {},
        fileTypes: {},
        confidenceDistribution: { high: 0, medium: 0, low: 0 }
      };

      // Analyze file categories and types
      files.forEach(file => {
        // Count categories
        const category = file.classification || 'misc';
        statistics.categories[category] = (statistics.categories[category] || 0) + 1;

        // Count file types
        const ext = file.fileExtension || 'unknown';
        statistics.fileTypes[ext] = (statistics.fileTypes[ext] || 0) + 1;

        // Count confidence levels
        const confidence = file.confidence || 0;
        if (confidence >= 0.8) statistics.confidenceDistribution.high++;
        else if (confidence >= 0.5) statistics.confidenceDistribution.medium++;
        else statistics.confidenceDistribution.low++;
      });

      return {
        ...state,
        statistics,
        processingSteps: [...(state.processingSteps || []), 'collection_analyzed']
      };
    } catch (error) {
      console.error('Error analyzing file collection:', error);
      return {
        ...state,
        errors: [...(state.errors || []), `Collection analysis failed: ${error.message}`]
      };
    }
  }

  async groupFilesNode(state) {
    try {
      const files = state.files || [];
      const groupedFiles = {
        byCategory: {},
        byFileType: {},
        byConfidence: { high: [], medium: [], low: [] },
        specialGroups: {
          recentFiles: [],
          largeFiles: [],
          duplicateCandidates: []
        }
      };

      const now = Date.now();
      const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

      files.forEach(file => {
        // Group by category
        const category = file.classification || 'misc';
        if (!groupedFiles.byCategory[category]) {
          groupedFiles.byCategory[category] = [];
        }
        groupedFiles.byCategory[category].push(file);

        // Group by file type
        const ext = file.fileExtension || 'unknown';
        if (!groupedFiles.byFileType[ext]) {
          groupedFiles.byFileType[ext] = [];
        }
        groupedFiles.byFileType[ext].push(file);

        // Group by confidence
        const confidence = file.confidence || 0;
        if (confidence >= 0.8) {
          groupedFiles.byConfidence.high.push(file);
        } else if (confidence >= 0.5) {
          groupedFiles.byConfidence.medium.push(file);
        } else {
          groupedFiles.byConfidence.low.push(file);
        }

        // Special groups
        const fileTime = file.timestamp ? new Date(file.timestamp).getTime() : 0;
        if (fileTime > oneWeekAgo) {
          groupedFiles.specialGroups.recentFiles.push(file);
        }

        if ((file.fileSize || 0) > 10 * 1024 * 1024) { // > 10MB
          groupedFiles.specialGroups.largeFiles.push(file);
        }
      });

      // Find potential duplicates based on filename similarity
      this.findDuplicateCandidates(files, groupedFiles.specialGroups.duplicateCandidates);

      return {
        ...state,
        groupedFiles,
        processingSteps: [...(state.processingSteps || []), 'files_grouped']
      };
    } catch (error) {
      console.error('Error grouping files:', error);
      return {
        ...state,
        errors: [...(state.errors || []), `File grouping failed: ${error.message}`]
      };
    }
  }

  async designFolderStructureNode(state) {
    if (!this.llm) {
      return this.createBasicFolderStructure(state);
    }

    try {
      const { statistics, groupedFiles } = state;
      
      const designPrompt = `
Design an optimal folder structure for organizing ${statistics.totalFiles} files.

File Statistics:
- Categories: ${Object.entries(statistics.categories).map(([cat, count]) => `${cat}: ${count}`).join(', ')}
- File Types: ${Object.entries(statistics.fileTypes).map(([type, count]) => `${type}: ${count}`).join(', ')}
- Total Size: ${Math.round(statistics.totalSize / (1024 * 1024))} MB

High-confidence files: ${statistics.confidenceDistribution.high}
Medium-confidence files: ${statistics.confidenceDistribution.medium}
Low-confidence files: ${statistics.confidenceDistribution.low}

Design principles:
1. Create logical, scalable folder hierarchy
2. Group similar files together
3. Consider future growth and organization
4. Balance depth vs. breadth
5. Use clear, descriptive folder names

Suggest a folder structure relative to the home directory.
Format your response as:
STRUCTURE:
- folder1/
  - subfolder1/
  - subfolder2/
- folder2/
  - subfolder3/

REASONING: Brief explanation of the design choices
`;

      const response = await this.llm.invoke([
        { role: 'system', content: 'You are an expert at designing file organization systems. Create logical, scalable folder structures.' },
        { role: 'user', content: designPrompt }
      ]);

      const content = response.content;
      const structureMatch = content.match(/STRUCTURE:(.*?)REASONING:/s);
      const reasoningMatch = content.match(/REASONING:\s*(.+)/s);
      
      const folderStructure = {
        structure: structureMatch ? structureMatch[1].trim() : this.getBasicStructure(statistics),
        reasoning: reasoningMatch ? reasoningMatch[1].trim() : 'AI-designed folder structure based on file analysis',
        isAIGenerated: true
      };

      return {
        ...state,
        folderStructure,
        processingSteps: [...(state.processingSteps || []), 'ai_structure_designed']
      };
    } catch (error) {
      console.error('Error designing folder structure:', error);
      return {
        ...state,
        folderStructure: this.createBasicFolderStructure(state).folderStructure,
        errors: [...(state.errors || []), `Structure design failed: ${error.message}`]
      };
    }
  }

  async createOrganizationPlanNode(state) {
    if (!this.llm) {
      return this.createBasicOrganizationPlan(state);
    }

    try {
      const { files, groupedFiles, folderStructure, statistics } = state;
      
      const planPrompt = `
Create a detailed organization plan for ${statistics.totalFiles} files using this folder structure:

${folderStructure.structure}

File categories to organize:
${Object.entries(statistics.categories).map(([cat, count]) => `- ${cat}: ${count} files`).join('\n')}

Create a step-by-step organization plan that:
1. Prioritizes high-confidence files first
2. Groups similar files together
3. Handles special cases (large files, duplicates)
4. Suggests order of operations
5. Identifies potential conflicts

Format your response as:
PLAN:
1. Step description
2. Step description
...

PRIORITIES:
- High priority actions
- Medium priority actions
- Low priority actions

WARNINGS:
- Potential issues to watch for
`;

      const response = await this.llm.invoke([
        { role: 'system', content: 'Create detailed, practical file organization plans with clear priorities and warnings.' },
        { role: 'user', content: planPrompt }
      ]);

      const content = response.content;
      const planMatch = content.match(/PLAN:(.*?)PRIORITIES:/s);
      const prioritiesMatch = content.match(/PRIORITIES:(.*?)WARNINGS:/s);
      const warningsMatch = content.match(/WARNINGS:\s*(.+)/s);
      
      const organizationPlan = {
        steps: planMatch ? planMatch[1].trim().split('\n').filter(s => s.trim()) : [],
        priorities: prioritiesMatch ? prioritiesMatch[1].trim() : 'Organize high-confidence files first',
        warnings: warningsMatch ? warningsMatch[1].trim() : 'Check for duplicate files before organizing',
        isAIGenerated: true
      };

      return {
        ...state,
        organizationPlan,
        processingSteps: [...(state.processingSteps || []), 'ai_plan_created']
      };
    } catch (error) {
      console.error('Error creating organization plan:', error);
      return {
        ...state,
        organizationPlan: this.createBasicOrganizationPlan(state).organizationPlan,
        errors: [...(state.errors || []), `Plan creation failed: ${error.message}`]
      };
    }
  }

  async validatePlanNode(state) {
    try {
      const { organizationPlan, statistics, files } = state;
      const conflicts = [];

      // Check for potential conflicts
      if (statistics.confidenceDistribution.low > statistics.totalFiles * 0.3) {
        conflicts.push('High number of low-confidence files may require manual review');
      }

      if (statistics.totalSize > 1024 * 1024 * 1024) { // > 1GB
        conflicts.push('Large total file size - ensure sufficient disk space');
      }

      // Check for files with same names
      const fileNames = new Set();
      const duplicateNames = [];
      files.forEach(file => {
        if (fileNames.has(file.fileName)) {
          duplicateNames.push(file.fileName);
        }
        fileNames.add(file.fileName);
      });

      if (duplicateNames.length > 0) {
        conflicts.push(`Duplicate file names detected: ${duplicateNames.slice(0, 3).join(', ')}${duplicateNames.length > 3 ? '...' : ''}`);
      }

      return {
        ...state,
        conflicts,
        processingSteps: [...(state.processingSteps || []), 'plan_validated']
      };
    } catch (error) {
      console.error('Error validating plan:', error);
      return {
        ...state,
        conflicts: ['Validation failed - proceed with caution'],
        errors: [...(state.errors || []), `Plan validation failed: ${error.message}`]
      };
    }
  }

  async generateRecommendationsNode(state) {
    try {
      const { statistics, conflicts, organizationPlan } = state;
      const recommendations = [];

      // Generate recommendations based on analysis
      if (statistics.confidenceDistribution.high > 0) {
        recommendations.push(`Start with ${statistics.confidenceDistribution.high} high-confidence files for quick wins`);
      }

      if (statistics.confidenceDistribution.low > 0) {
        recommendations.push(`Review ${statistics.confidenceDistribution.low} low-confidence files manually`);
      }

      if (Object.keys(statistics.categories).length > 5) {
        recommendations.push('Consider creating parent categories to simplify folder structure');
      }

      if (statistics.totalSize > 500 * 1024 * 1024) { // > 500MB
        recommendations.push('Consider archiving older files to save space');
      }

      // Add conflict-based recommendations
      if (conflicts.length > 0) {
        recommendations.push('Address conflicts before proceeding with organization');
      }

      recommendations.push('Create backup before organizing important files');
      recommendations.push('Test organization with a small subset first');

      return {
        ...state,
        recommendations,
        processingSteps: [...(state.processingSteps || []), 'recommendations_generated']
      };
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return {
        ...state,
        recommendations: ['Proceed with basic organization plan'],
        errors: [...(state.errors || []), `Recommendations failed: ${error.message}`]
      };
    }
  }

  async fallbackOrganizationNode(state) {
    console.log('🔄 Using fallback organization strategy');
    
    const basicStructure = this.getBasicStructure(state.statistics);
    const basicPlan = this.createBasicOrganizationPlan({
      ...state,
      folderStructure: { structure: basicStructure, isAIGenerated: false }
    });

    return {
      ...state,
      folderStructure: {
        structure: basicStructure,
        reasoning: 'Basic categorization-based folder structure',
        isAIGenerated: false
      },
      organizationPlan: basicPlan.organizationPlan,
      recommendations: ['Use basic file categorization', 'Review organization manually'],
      processingSteps: [...(state.processingSteps || []), 'fallback_organization']
    };
  }

  shouldUseAIOrganization(state) {
    if (!this.llm || (state.errors && state.errors.length > 2)) {
      return 'fallback';
    }
    return 'ai_organization';
  }

  findDuplicateCandidates(files, duplicatesArray) {
    const nameGroups = {};
    
    files.forEach(file => {
      const baseName = path.parse(file.fileName).name.toLowerCase();
      if (!nameGroups[baseName]) {
        nameGroups[baseName] = [];
      }
      nameGroups[baseName].push(file);
    });

    // Find groups with multiple files
    Object.values(nameGroups).forEach(group => {
      if (group.length > 1) {
        duplicatesArray.push(...group);
      }
    });
  }

  getBasicStructure(statistics) {
    const categories = Object.keys(statistics.categories);
    const structure = categories.map(category => {
      const folderMap = {
        'document': 'Documents/General',
        'code': 'Projects/Code',
        'media': 'Media',
        'archive': 'Archives',
        'work': 'Documents/Work',
        'financial': 'Documents/Financial',
        'misc': 'Documents/Misc'
      };
      return `- ${folderMap[category] || `Documents/${category.charAt(0).toUpperCase() + category.slice(1)}`}/`;
    }).join('\n');

    return structure;
  }

  createBasicFolderStructure(state) {
    return {
      ...state,
      folderStructure: {
        structure: this.getBasicStructure(state.statistics),
        reasoning: 'Basic folder structure based on file categories',
        isAIGenerated: false
      }
    };
  }

  createBasicOrganizationPlan(state) {
    return {
      ...state,
      organizationPlan: {
        steps: [
          '1. Create necessary folders',
          '2. Move high-confidence files first',
          '3. Handle remaining files by category',
          '4. Review and adjust as needed'
        ],
        priorities: 'High-confidence files, then by category',
        warnings: 'Check for duplicate files',
        isAIGenerated: false
      }
    };
  }

  async organizeFiles(files) {
    try {
      console.log(`🗂️ Starting LangGraph organization for ${files.length} files`);
      
      const initialState = {
        files,
        processingSteps: [],
        errors: []
      };

      const result = await this.graph.invoke(initialState);
      
      console.log(`✅ LangGraph organization plan completed`);
      return {
        success: true,
        statistics: result.statistics,
        groupedFiles: result.groupedFiles,
        folderStructure: result.folderStructure,
        organizationPlan: result.organizationPlan,
        conflicts: result.conflicts,
        recommendations: result.recommendations,
        processingSteps: result.processingSteps,
        errors: result.errors
      };
    } catch (error) {
      console.error('LangGraph organization failed:', error);
      return {
        success: false,
        error: error.message,
        fallback: 'Use basic file categorization'
      };
    }
  }
}

module.exports = { FileOrganizationGraph }; 