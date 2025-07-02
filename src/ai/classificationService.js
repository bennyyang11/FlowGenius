const { StateGraph, START, END } = require('@langchain/langgraph');
const { ChatOpenAI } = require('@langchain/openai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
// Dynamic import for file-type (ES module)
let fileTypeFromFile;

class AIClassificationService {
  constructor() {
    this.llm = null;
    this.openai = null;
    this.analysisGraph = null;
    this.organizationGraph = null;
    this.fileCache = new Map();
  }

  async initialize() {
    // Load configuration
    try {
      const configPath = path.join(process.cwd(), 'config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      const apiKey = config.api?.openai?.apiKey || process.env.OPENAI_API_KEY;
      
      if (!apiKey || apiKey.includes('your_')) {
        console.warn('⚠️  OpenAI API key not configured. AI features will be limited.');
        this.llm = null;
        this.openai = null;
      } else {
        // Initialize LangChain LLM for LangGraph
        this.llm = new ChatOpenAI({
          apiKey: apiKey,
          model: 'gpt-3.5-turbo',
          temperature: 0.1
        });
        
        // Initialize OpenAI client for backward compatibility
        this.openai = new OpenAI({
          apiKey: apiKey
        });
      }

      // Initialize LangGraph workflows
      this.analysisGraph = this.buildAnalysisGraph();
      this.organizationGraph = this.buildOrganizationGraph();

      // Dynamically import file-type (ES module)
      try {
        const fileType = await import('file-type');
        fileTypeFromFile = fileType.fileTypeFromFile;
      } catch (error) {
        console.warn('⚠️  File-type module not available. File type detection will be limited.');
      }

      console.log('🔗 LangGraph AI Classification Service initialized');
    } catch (error) {
      console.error('Failed to initialize AI service:', error);
      // Continue without AI features
    }
  }

  buildAnalysisGraph() {
    const workflow = new StateGraph({
      channels: {
        filePath: null,
        fileName: null,
        fileExtension: null,
        fileSize: null,
        content: null,
        fileType: null,
        classification: null,
        confidence: null,
        tags: null,
        organizationSuggestion: null,
        metadata: null,
        errors: null,
        processingSteps: null
      }
    });

    // Define nodes
    workflow.addNode('extractMetadata', this.extractMetadataNode.bind(this));
    workflow.addNode('extractContent', this.extractContentNode.bind(this));
    workflow.addNode('classifyFile', this.classifyFileNode.bind(this));
    workflow.addNode('generateTags', this.generateTagsNode.bind(this));
    workflow.addNode('suggestOrganization', this.suggestOrganizationNode.bind(this));
    workflow.addNode('fallbackAnalysis', this.fallbackAnalysisNode.bind(this));

    // Define workflow edges
    workflow.addEdge(START, 'extractMetadata');
    workflow.addEdge('extractMetadata', 'extractContent');
    
    // Conditional edge: use AI or fallback
    workflow.addConditionalEdges(
      'extractContent',
      this.shouldUseAI.bind(this),
      {
        ai: 'classifyFile',
        fallback: 'fallbackAnalysis'
      }
    );
    
    workflow.addEdge('classifyFile', 'generateTags');
    workflow.addEdge('generateTags', 'suggestOrganization');
    workflow.addEdge('suggestOrganization', END);
    workflow.addEdge('fallbackAnalysis', END);

    return workflow.compile();
  }

  buildOrganizationGraph() {
    const workflow = new StateGraph({
      channels: {
        files: null,
        statistics: null,
        groupedFiles: null,
        folderStructure: null,
        organizationPlan: null,
        recommendations: null,
        errors: null,
        processingSteps: null
      }
    });

    workflow.addNode('analyzeCollection', this.analyzeCollectionNode.bind(this));
    workflow.addNode('groupFiles', this.groupFilesNode.bind(this));
    workflow.addNode('designStructure', this.designStructureNode.bind(this));
    workflow.addNode('createPlan', this.createPlanNode.bind(this));
    workflow.addNode('fallbackOrganization', this.fallbackOrganizationNode.bind(this));

    workflow.addEdge(START, 'analyzeCollection');
    workflow.addEdge('analyzeCollection', 'groupFiles');
    
    workflow.addConditionalEdges(
      'groupFiles',
      this.shouldUseAIOrganization.bind(this),
      {
        ai: 'designStructure',
        fallback: 'fallbackOrganization'
      }
    );
    
    workflow.addEdge('designStructure', 'createPlan');
    workflow.addEdge('createPlan', END);
    workflow.addEdge('fallbackOrganization', END);

    return workflow.compile();
  }

  // LangGraph Node Functions
  async extractMetadataNode(state) {
    try {
      const stats = await fs.stat(state.filePath);
      const fileName = path.basename(state.filePath);
      const fileExtension = path.extname(state.filePath).toLowerCase();
      
      return {
        ...state,
        fileName,
        fileExtension,
        fileSize: stats.size,
        metadata: {
          modified: stats.mtime,
          created: stats.birthtime
        },
        processingSteps: [...(state.processingSteps || []), 'metadata_extracted']
      };
    } catch (error) {
      return {
        ...state,
        errors: [...(state.errors || []), `Metadata extraction failed: ${error.message}`]
      };
    }
  }

  async extractContentNode(state) {
    try {
      const contentData = await this.extractContent(state.filePath, state.fileExtension);
      return {
        ...state,
        content: contentData.content,
        fileType: contentData.fileType,
        processingSteps: [...(state.processingSteps || []), 'content_extracted']
      };
    } catch (error) {
      return {
        ...state,
        content: `File: ${state.fileName}`,
        fileType: 'error',
        errors: [...(state.errors || []), `Content extraction failed: ${error.message}`]
      };
    }
  }

  async classifyFileNode(state) {
    if (!this.llm) {
      return this.fallbackClassificationNode(state);
    }

    const prompt = `
Analyze this file in detail and provide a comprehensive classification:

File: ${state.fileName}
Extension: ${state.fileExtension}
Size: ${state.fileSize} bytes
Content Preview: ${state.content ? state.content.substring(0, 800) : 'No content available'}

Please provide a detailed analysis in this exact JSON format:
{
  "primaryCategory": "one of: document, code, media, archive, personal, work, financial, educational, temporary, misc",
  "subCategory": "more specific type (e.g., invoice, report, photo, script, etc.)",
  "confidence": 0.85,
  "summary": "brief 1-2 sentence summary of what this file contains",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "documentType": "specific document type (e.g., bank statement, meeting notes, code file, etc.)",
  "importance": "high/medium/low - how important this file likely is",
  "entities": {
    "dates": ["any dates found"],
    "amounts": ["any monetary amounts"],
    "names": ["any person/company names"],
    "keywords": ["important keywords"]
  },
  "purpose": "what this file is likely used for",
  "urgency": "urgent/normal/archive - how time-sensitive this file is"
}

Respond with ONLY the JSON object, no other text.
`;

    try {
      const response = await this.llm.invoke([
        { role: 'system', content: 'You are an expert file analyst. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ]);

      let analysisData;
      try {
        // Clean the response to ensure it's valid JSON
        const cleanResponse = response.content.trim().replace(/```json\n?|\n?```/g, '');
        analysisData = JSON.parse(cleanResponse);
      } catch (parseError) {
        console.warn('Failed to parse AI analysis JSON, using fallback');
        return this.fallbackClassificationNode(state);
      }

      return {
        ...state,
        classification: analysisData.primaryCategory || 'misc',
        subCategory: analysisData.subCategory,
        confidence: analysisData.confidence || 0.5,
        summary: analysisData.summary,
        keyTopics: analysisData.keyTopics || [],
        documentType: analysisData.documentType,
        importance: analysisData.importance,
        entities: analysisData.entities || {},
        purpose: analysisData.purpose,
        urgency: analysisData.urgency,
        processingSteps: [...(state.processingSteps || []), 'ai_detailed_classification']
      };
    } catch (error) {
      return this.fallbackClassificationNode({
        ...state,
        errors: [...(state.errors || []), `AI classification failed: ${error.message}`]
      });
    }
  }

  async generateTagsNode(state) {
    if (!this.llm) {
      return {
        ...state,
        tags: this.getBasicTags(state.fileName, state.classification)
      };
    }

    const prompt = `
Generate intelligent tags for this file based on the detailed analysis:

File: ${state.fileName}
Category: ${state.classification}
Sub-category: ${state.subCategory || 'N/A'}
Document Type: ${state.documentType || 'N/A'}
Key Topics: ${state.keyTopics ? state.keyTopics.join(', ') : 'N/A'}
Purpose: ${state.purpose || 'N/A'}
Importance: ${state.importance || 'N/A'}
Content Preview: ${state.content ? state.content.substring(0, 400) : 'No content'}

Generate 5-8 specific, useful tags that would help with:
1. Finding this file later
2. Organizing similar files
3. Understanding the content
4. Prioritizing by importance

Include a mix of:
- Content-based tags (what it's about)
- Type/format tags (what kind of document)
- Functional tags (what it's used for)
- Context tags (when/why it matters)

Return only tags separated by commas. Make tags specific and meaningful.
`;

    try {
      const response = await this.llm.invoke([
        { role: 'system', content: 'Generate specific, useful file organization tags that help with search and organization.' },
        { role: 'user', content: prompt }
      ]);

      const tags = response.content
        .split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0 && tag.length < 25) // Reasonable tag length
        .slice(0, 8);

      return {
        ...state,
        tags,
        processingSteps: [...(state.processingSteps || []), 'ai_enhanced_tagging']
      };
    } catch (error) {
      return {
        ...state,
        tags: this.getBasicTags(state.fileName, state.classification),
        errors: [...(state.errors || []), `Tag generation failed: ${error.message}`]
      };
    }
  }

  async suggestOrganizationNode(state) {
    const homeDir = require('os').homedir();

    if (!this.llm) {
      const fallbackPath = this.getFallbackOrganization(state.classification);
      return {
        ...state,
        organizationSuggestion: {
          relativePath: fallbackPath,
          fullPath: path.join(homeDir, fallbackPath),
          reasoning: 'Basic categorization'
        }
      };
    }

    const prompt = `
Suggest folder organization for this file:

File: ${state.fileName}
Category: ${state.classification}
Tags: ${state.tags ? state.tags.join(', ') : 'none'}

Suggest a folder path relative to home directory.
Format: folder/subfolder
`;

    try {
      const response = await this.llm.invoke([
        { role: 'system', content: 'Suggest logical file organization.' },
        { role: 'user', content: prompt }
      ]);

      const suggestedPath = response.content.trim();
      
      return {
        ...state,
        organizationSuggestion: {
          relativePath: suggestedPath,
          fullPath: path.join(homeDir, suggestedPath),
          reasoning: `AI suggestion based on ${state.classification} category`
        },
        processingSteps: [...(state.processingSteps || []), 'ai_organization']
      };
    } catch (error) {
      const fallbackPath = this.getFallbackOrganization(state.classification);
      return {
        ...state,
        organizationSuggestion: {
          relativePath: fallbackPath,
          fullPath: path.join(homeDir, fallbackPath),
          reasoning: 'Fallback organization'
        },
        errors: [...(state.errors || []), `Organization suggestion failed: ${error.message}`]
      };
    }
  }

  async fallbackAnalysisNode(state) {
    const basic = this.getBasicClassification(state.fileName, state.fileExtension);
    const homeDir = require('os').homedir();
    const fallbackPath = this.getFallbackOrganization(basic.classification);
    
    return {
      ...state,
      classification: basic.classification,
      confidence: basic.confidence,
      tags: this.getBasicTags(state.fileName, basic.classification),
      organizationSuggestion: {
        relativePath: fallbackPath,
        fullPath: path.join(homeDir, fallbackPath),
        reasoning: 'Basic fallback organization'
      },
      processingSteps: [...(state.processingSteps || []), 'fallback_analysis']
    };
  }

  // Organization Graph Nodes
  async analyzeCollectionNode(state) {
    const files = state.files || [];
    const statistics = {
      totalFiles: files.length,
      totalSize: files.reduce((sum, file) => sum + (file.fileSize || 0), 0),
      categories: {},
      confidenceDistribution: { high: 0, medium: 0, low: 0 }
    };

    files.forEach(file => {
      const category = file.classification || 'misc';
      statistics.categories[category] = (statistics.categories[category] || 0) + 1;

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
  }

  async groupFilesNode(state) {
    const files = state.files || [];
    const groupedFiles = { byCategory: {}, byConfidence: { high: [], medium: [], low: [] } };

    files.forEach(file => {
      const category = file.classification || 'misc';
      if (!groupedFiles.byCategory[category]) {
        groupedFiles.byCategory[category] = [];
      }
      groupedFiles.byCategory[category].push(file);

      const confidence = file.confidence || 0;
      if (confidence >= 0.8) {
        groupedFiles.byConfidence.high.push(file);
      } else if (confidence >= 0.5) {
        groupedFiles.byConfidence.medium.push(file);
      } else {
        groupedFiles.byConfidence.low.push(file);
      }
    });

    return {
      ...state,
      groupedFiles,
      processingSteps: [...(state.processingSteps || []), 'files_grouped']
    };
  }

  async designStructureNode(state) {
    if (!this.llm) {
      return this.fallbackOrganizationNode(state);
    }

    const prompt = `
Design folder structure for ${state.statistics.totalFiles} files:

Categories: ${Object.entries(state.statistics.categories).map(([cat, count]) => `${cat}: ${count}`).join(', ')}

Suggest logical folder hierarchy. Format:
STRUCTURE:
- folder1/
- folder2/

REASONING: Brief explanation
`;

    try {
      const response = await this.llm.invoke([
        { role: 'system', content: 'Design file organization structures.' },
        { role: 'user', content: prompt }
      ]);

      return {
        ...state,
        folderStructure: {
          structure: response.content,
          reasoning: 'AI-designed structure',
          isAIGenerated: true
        },
        processingSteps: [...(state.processingSteps || []), 'ai_structure']
      };
    } catch (error) {
      return this.fallbackOrganizationNode({
        ...state,
        errors: [...(state.errors || []), `Structure design failed: ${error.message}`]
      });
    }
  }

  async createPlanNode(state) {
    const recommendations = [
      `Organize ${state.statistics.confidenceDistribution.high} high-confidence files first`,
      'Review low-confidence files manually',
      'Create backup before organizing'
    ];

    return {
      ...state,
      organizationPlan: {
        steps: ['1. Create folders', '2. Move high-confidence files', '3. Review remaining files'],
        priorities: 'High-confidence files first'
      },
      recommendations,
      processingSteps: [...(state.processingSteps || []), 'plan_created']
    };
  }

  async fallbackOrganizationNode(state) {
    const categories = Object.keys(state.statistics.categories);
    const structure = categories.map(cat => `- Documents/${cat.charAt(0).toUpperCase() + cat.slice(1)}/`).join('\n');

    return {
      ...state,
      folderStructure: {
        structure,
        reasoning: 'Basic category-based structure',
        isAIGenerated: false
      },
      organizationPlan: {
        steps: ['1. Create category folders', '2. Move files by type'],
        priorities: 'Group by category'
      },
      recommendations: ['Use basic categorization'],
      processingSteps: [...(state.processingSteps || []), 'fallback_organization']
    };
  }

  // Conditional Functions
  shouldUseAI(state) {
    const errorCount = state.errors ? state.errors.length : 0;
    if (!this.llm || errorCount > 2) {
      return 'fallback';
    }
    return 'ai';
  }

  shouldUseAIOrganization(state) {
    if (!this.llm || (state.errors && state.errors.length > 2)) {
      return 'fallback';
    }
    return 'ai';
  }

  fallbackClassificationNode(state) {
    const basic = this.getBasicClassification(state.fileName, state.fileExtension);
    return {
      ...state,
      classification: basic.classification,
      confidence: basic.confidence,
      processingSteps: [...(state.processingSteps || []), 'basic_classification']
    };
  }

  async extractMetadata(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const fileName = path.basename(filePath);
      const fileExtension = path.extname(filePath).toLowerCase();
      
      return {
        fileName,
        fileExtension,
        fileSize: stats.size,
        modified: stats.mtime,
        created: stats.birthtime
      };
    } catch (error) {
      console.error('Error extracting metadata:', error);
      return {
        fileName: path.basename(filePath),
        fileExtension: path.extname(filePath).toLowerCase(),
        fileSize: 0,
        modified: new Date(),
        created: new Date()
      };
    }
  }

  async extractContent(filePath, fileExtension) {
    let content = '';
    let fileType = 'unknown';

    try {
      // Detect file type
      try {
        if (fileTypeFromFile) {
          const typeResult = await fileTypeFromFile(filePath);
          if (typeResult) {
            fileType = typeResult.mime;
          }
        }
      } catch (err) {
        // File type detection failed, continue with extension-based detection
      }

      // Extract content based on file type
      switch (fileExtension) {
        case '.txt':
        case '.md':
        case '.js':
        case '.ts':
        case '.py':
        case '.java':
        case '.cpp':
        case '.css':
        case '.html':
        case '.json':
        case '.xml':
          content = await fs.readFile(filePath, 'utf-8');
          break;
        
        case '.pdf':
          try {
            const pdfBuffer = await fs.readFile(filePath);
            const pdfData = await pdfParse(pdfBuffer);
            content = pdfData.text;
          } catch (err) {
            content = `PDF file: ${path.basename(filePath)}`;
          }
          break;
        
        case '.docx':
          try {
            const docxResult = await mammoth.extractRawText({ path: filePath });
            content = docxResult.value;
          } catch (err) {
            content = `Word document: ${path.basename(filePath)}`;
          }
          break;
        
        default:
          // For other file types, just use filename
          content = `File: ${path.basename(filePath)}`;
          break;
      }

      return {
        content: content.substring(0, 4000), // Limit content size for AI processing
        fileType
      };
    } catch (error) {
      console.error('Error extracting content:', error);
      return {
        content: `File: ${path.basename(filePath)}`,
        fileType
      };
    }
  }

  async classifyFile(fileName, fileExtension, content, fileSize) {
    if (!this.openai) {
      // Return basic classification without AI
      return this.getBasicClassification(fileName, fileExtension);
    }

    const classificationPrompt = `
      Analyze this file and classify it into one of these categories:
      - document (PDFs, Word docs, text files with important content)
      - code (source code files, scripts, configuration)
      - media (images, videos, audio files)
      - archive (zip, rar, compressed files)
      - temporary (cache, logs, temporary files)
      - personal (personal documents, photos, letters)
      - work (work-related documents, presentations, spreadsheets)
      - financial (invoices, receipts, financial documents)
      - educational (study materials, research papers, courses)
      - misc (everything else)

      File: ${fileName}
      Extension: ${fileExtension}
      Size: ${fileSize} bytes
      Content preview: ${content.substring(0, 500)}

      Respond with just the category name and a confidence score (0-1).
      Format: category|confidence
    `;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a file classification expert. Analyze files and classify them accurately.' },
          { role: 'user', content: classificationPrompt }
        ],
        temperature: 0.1,
        max_tokens: 50
      });

      const result = response.choices[0].message.content.trim().split('|');
      const classification = result[0] || 'misc';
      const confidence = parseFloat(result[1]) || 0.5;

      return { classification, confidence };
    } catch (error) {
      console.error('Error classifying file:', error);
      return this.getBasicClassification(fileName, fileExtension);
    }
  }

  getBasicClassification(fileName, fileExtension) {
    const ext = fileExtension.toLowerCase();
    
    // Basic classification based on file extension
    const extMap = {
      // Code files
      '.js': 'code', '.ts': 'code', '.py': 'code', '.java': 'code',
      '.cpp': 'code', '.c': 'code', '.html': 'code', '.css': 'code',
      '.json': 'code', '.xml': 'code', '.yml': 'code', '.yaml': 'code',
      
      // Documents
      '.pdf': 'document', '.doc': 'document', '.docx': 'document',
      '.txt': 'document', '.md': 'document', '.rtf': 'document',
      
      // Media
      '.jpg': 'media', '.jpeg': 'media', '.png': 'media', '.gif': 'media',
      '.mp4': 'media', '.avi': 'media', '.mov': 'media', '.mp3': 'media',
      '.wav': 'media', '.flac': 'media',
      
      // Archives
      '.zip': 'archive', '.rar': 'archive', '.7z': 'archive', '.tar': 'archive',
      
      // Temporary
      '.tmp': 'temporary', '.temp': 'temporary', '.log': 'temporary', '.cache': 'temporary'
    };
    
    const classification = extMap[ext] || 'misc';
    return { classification, confidence: 0.6 };
  }

  async generateTags(fileName, content, classification) {
    if (!this.openai) {
      return this.getBasicTags(fileName, classification);
    }

    const tagsPrompt = `
      Generate 3-5 relevant tags for this file to help with organization and search.
      
      File: ${fileName}
      Category: ${classification}
      Content: ${content.substring(0, 300)}

      Generate tags that would be useful for:
      1. Quick identification
      2. Searching and filtering
      3. Organization purposes

      Return only the tags separated by commas, no explanations.
    `;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Generate concise, relevant tags for file organization.' },
          { role: 'user', content: tagsPrompt }
        ],
        temperature: 0.3,
        max_tokens: 100
      });

      const tags = response.choices[0].message.content
        .split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0)
        .slice(0, 5);

      return tags;
    } catch (error) {
      console.error('Error generating tags:', error);
      return this.getBasicTags(fileName, classification);
    }
  }

  getBasicTags(fileName, classification) {
    const tags = [classification];
    const ext = path.extname(fileName).toLowerCase();
    
    if (ext) {
      tags.push(ext.substring(1)); // Remove the dot
    }
    
    // Add common tags based on filename patterns
    const name = fileName.toLowerCase();
    if (name.includes('invoice')) tags.push('invoice');
    if (name.includes('receipt')) tags.push('receipt');
    if (name.includes('report')) tags.push('report');
    if (name.includes('photo')) tags.push('photo');
    if (name.includes('image')) tags.push('image');
    
    return tags.slice(0, 5);
  }

  async suggestOrganization(fileName, classification, tags) {
    const homeDir = require('os').homedir();

    if (!this.openai) {
      const fallbackPath = this.getFallbackOrganization(classification);
      return {
        relativePath: fallbackPath,
        fullPath: path.join(homeDir, fallbackPath),
        reasoning: 'Basic organization based on file category'
      };
    }

    const organizationPrompt = `
      Suggest the best folder structure and location for organizing this file:
      
      File: ${fileName}
      Category: ${classification}
      Tags: ${tags.join(', ')}

      Consider common folder structures like:
      - Documents/Work, Documents/Personal
      - Projects/[ProjectName]
      - Media/Photos, Media/Videos
      - Archives/[Year]
      - etc.

      Suggest a folder path relative to the user's home directory.
      Format: folder/subfolder
    `;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Suggest logical folder organization for files.' },
          { role: 'user', content: organizationPrompt }
        ],
        temperature: 0.2,
        max_tokens: 100
      });

      const suggestion = response.choices[0].message.content.trim();
      const fullPath = path.join(homeDir, suggestion);

      return {
        relativePath: suggestion,
        fullPath: fullPath,
        reasoning: `Based on file type (${classification}) and content analysis`
      };
    } catch (error) {
      console.error('Error suggesting organization:', error);
      
      // Fallback organization based on classification
      const fallbackPath = this.getFallbackOrganization(classification);
      
      return {
        relativePath: fallbackPath,
        fullPath: path.join(homeDir, fallbackPath),
        reasoning: 'Fallback organization based on file category'
      };
    }
  }

  getFallbackOrganization(classification) {
    const organizationMap = {
      'document': 'Documents/General',
      'code': 'Projects/Code',
      'media': 'Media/Files',
      'archive': 'Archives',
      'personal': 'Documents/Personal',
      'work': 'Documents/Work',
      'financial': 'Documents/Financial',
      'educational': 'Documents/Education',
      'temporary': 'Temp',
      'misc': 'Documents/Misc'
    };

    return organizationMap[classification] || 'Documents/Misc';
  }

  async analyzeFile(filePath) {
    // Check cache first
    if (this.fileCache.has(filePath)) {
      const cached = this.fileCache.get(filePath);
      // Cache for 1 hour
      if (Date.now() - cached.timestamp < 3600000) {
        return cached.result;
      }
    }

    try {
      console.log(`🔗 Starting LangGraph analysis for: ${path.basename(filePath)}`);
      
      // Use LangGraph workflow for analysis
      if (this.analysisGraph) {
        const initialState = {
          filePath,
          processingSteps: [],
          errors: []
        };

        const result = await this.analysisGraph.invoke(initialState);
        
        const analysisResult = {
          filePath: result.filePath,
          fileName: result.fileName,
          fileExtension: result.fileExtension,
          fileSize: result.fileSize,
          content: result.content ? result.content.substring(0, 500) : '',
          fileType: result.fileType,
          classification: result.classification,
          confidence: result.confidence,
          tags: result.tags,
          organizationSuggestion: result.organizationSuggestion,
          processingSteps: result.processingSteps,
          errors: result.errors,
          timestamp: new Date()
        };

        // Cache the result
        this.fileCache.set(filePath, {
          timestamp: Date.now(),
          result: analysisResult
        });

        console.log(`✅ LangGraph analysis completed for: ${result.fileName}`);
        return analysisResult;
      } else {
        // Fallback to original method if LangGraph isn't available
        return this.analyzeLegacy(filePath);
      }
    } catch (error) {
      console.error('LangGraph analysis failed:', error);
      // Fallback to legacy method
      return this.analyzeLegacy(filePath);
    }
  }

  async analyzeLegacy(filePath) {
    try {
      // Step 1: Extract metadata
      const metadata = await this.extractMetadata(filePath);
      
      // Step 2: Extract content
      const contentData = await this.extractContent(filePath, metadata.fileExtension);
      
      // Step 3: Classify file
      const { classification, confidence } = await this.classifyFile(
        metadata.fileName, 
        metadata.fileExtension, 
        contentData.content, 
        metadata.fileSize
      );
      
      // Step 4: Generate tags
      const tags = await this.generateTags(metadata.fileName, contentData.content, classification);
      
      // Step 5: Suggest organization
      const organizationSuggestion = await this.suggestOrganization(metadata.fileName, classification, tags);

      const result = {
        filePath,
        fileName: metadata.fileName,
        fileExtension: metadata.fileExtension,
        fileSize: metadata.fileSize,
        content: contentData.content.substring(0, 500), // Truncated for display
        fileType: contentData.fileType,
        classification,
        confidence,
        tags,
        organizationSuggestion,
        timestamp: new Date()
      };

      // Cache the result
      this.fileCache.set(filePath, {
        timestamp: Date.now(),
        result
      });

      return result;
    } catch (error) {
      console.error('Error analyzing file:', error);
      return {
        filePath,
        fileName: path.basename(filePath),
        classification: 'misc',
        tags: [],
        confidence: 0,
        organizationSuggestion: null,
        timestamp: new Date()
      };
    }
  }

  async getOrganizationSuggestions(filePath) {
    const analysis = await this.analyzeFile(filePath);
    return analysis.organizationSuggestion;
  }

  async organizeFiles(files) {
    try {
      console.log(`🗂️ Starting LangGraph organization for ${files.length} files`);
      
      if (this.organizationGraph) {
        const initialState = {
          files,
          processingSteps: [],
          errors: []
        };

        const result = await this.organizationGraph.invoke(initialState);
        
        console.log(`✅ LangGraph organization plan completed`);
        return {
          success: true,
          statistics: result.statistics,
          groupedFiles: result.groupedFiles,
          folderStructure: result.folderStructure,
          organizationPlan: result.organizationPlan,
          recommendations: result.recommendations,
          processingSteps: result.processingSteps,
          errors: result.errors
        };
      } else {
        // Basic fallback organization
        return this.organizeFallback(files);
      }
    } catch (error) {
      console.error('LangGraph organization failed:', error);
      return this.organizeFallback(files);
    }
  }

  organizeFallback(files) {
    const categories = {};
    files.forEach(file => {
      const category = file.classification || 'misc';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(file);
    });

    return {
      success: true,
      statistics: {
        totalFiles: files.length,
        categories: Object.keys(categories).reduce((acc, key) => {
          acc[key] = categories[key].length;
          return acc;
        }, {})
      },
      folderStructure: {
        structure: Object.keys(categories).map(cat => 
          `- Documents/${cat.charAt(0).toUpperCase() + cat.slice(1)}/`
        ).join('\n'),
        reasoning: 'Basic categorization',
        isAIGenerated: false
      },
      organizationPlan: {
        steps: ['1. Create category folders', '2. Move files by category'],
        priorities: 'Group by category'
      },
      recommendations: ['Use basic file categorization', 'Review manually'],
      errors: []
    };
  }

  clearCache() {
    this.fileCache.clear();
  }
}

module.exports = { AIClassificationService }; 