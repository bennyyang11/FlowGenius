const { StateGraph, START, END } = require('@langchain/langgraph');
const { ChatOpenAI } = require('@langchain/openai');
const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// Define the state interface for file analysis
class FileAnalysisState {
  constructor() {
    this.filePath = '';
    this.fileName = '';
    this.fileExtension = '';
    this.fileSize = 0;
    this.content = '';
    this.fileType = '';
    this.classification = '';
    this.confidence = 0;
    this.tags = [];
    this.organizationSuggestion = null;
    this.metadata = {};
    this.errors = [];
    this.processingSteps = [];
  }
}

class FileAnalysisGraph {
  constructor() {
    this.llm = null;
    this.graph = null;
    this.fileCache = new Map();
  }

  async initialize() {
    try {
      // Load configuration
      const configPath = path.join(process.cwd(), 'config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      const apiKey = config.api?.openai?.apiKey || process.env.OPENAI_API_KEY;
      
      if (!apiKey || apiKey.includes('your_')) {
        console.warn('⚠️  OpenAI API key not configured. Using fallback analysis.');
        this.llm = null;
      } else {
        this.llm = new ChatOpenAI({
          apiKey: apiKey,
          model: 'gpt-3.5-turbo',
          temperature: 0.1
        });
      }

      // Build the analysis graph
      this.graph = this.buildAnalysisGraph();
      
      console.log('🔗 LangGraph File Analysis Service initialized');
    } catch (error) {
      console.error('Failed to initialize LangGraph AI service:', error);
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

    // Define the workflow edges
    workflow.addEdge(START, 'extractMetadata');
    workflow.addEdge('extractMetadata', 'extractContent');
    
    // Conditional edge: if content extraction fails, go to fallback
    workflow.addConditionalEdges(
      'extractContent',
      this.shouldUseFallback.bind(this),
      {
        continue: 'classifyFile',
        fallback: 'fallbackAnalysis'
      }
    );
    
    workflow.addEdge('classifyFile', 'generateTags');
    workflow.addEdge('generateTags', 'suggestOrganization');
    workflow.addEdge('suggestOrganization', END);
    workflow.addEdge('fallbackAnalysis', END);

    return workflow.compile();
  }

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
          created: stats.birthtime,
          isReadable: true
        },
        processingSteps: [...(state.processingSteps || []), 'metadata_extracted']
      };
    } catch (error) {
      console.error('Error extracting metadata:', error);
      return {
        ...state,
        errors: [...(state.errors || []), `Metadata extraction failed: ${error.message}`],
        metadata: { isReadable: false }
      };
    }
  }

  async extractContentNode(state) {
    let content = '';
    let fileType = 'unknown';

    try {
      // Extract content based on file type
      switch (state.fileExtension) {
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
          content = await fs.readFile(state.filePath, 'utf-8');
          fileType = 'text';
          break;
        
        case '.pdf':
          try {
            const pdfBuffer = await fs.readFile(state.filePath);
            const pdfData = await pdfParse(pdfBuffer);
            content = pdfData.text;
            fileType = 'pdf';
          } catch (err) {
            content = `PDF file: ${state.fileName}`;
            fileType = 'pdf_unreadable';
          }
          break;
        
        case '.docx':
          try {
            const docxResult = await mammoth.extractRawText({ path: state.filePath });
            content = docxResult.value;
            fileType = 'docx';
          } catch (err) {
            content = `Word document: ${state.fileName}`;
            fileType = 'docx_unreadable';
          }
          break;
        
        default:
          content = `File: ${state.fileName}`;
          fileType = 'binary';
          break;
      }

      return {
        ...state,
        content: content.substring(0, 4000), // Limit content size
        fileType,
        processingSteps: [...(state.processingSteps || []), 'content_extracted']
      };
    } catch (error) {
      console.error('Error extracting content:', error);
      return {
        ...state,
        errors: [...(state.errors || []), `Content extraction failed: ${error.message}`],
        content: `File: ${state.fileName}`,
        fileType: 'error'
      };
    }
  }

  async classifyFileNode(state) {
    if (!this.llm) {
      return this.getBasicClassification(state);
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

    File: ${state.fileName}
    Extension: ${state.fileExtension}
    Size: ${state.fileSize} bytes
    Type: ${state.fileType}
    Content preview: ${state.content ? state.content.substring(0, 500) : 'No content'}

    Respond with just the category name and a confidence score (0-1).
    Format: category|confidence
    `;

    try {
      const response = await this.llm.invoke([
        { role: 'system', content: 'You are a file classification expert.' },
        { role: 'user', content: classificationPrompt }
      ]);

      const result = response.content.trim().split('|');
      return {
        ...state,
        classification: result[0] || 'misc',
        confidence: parseFloat(result[1]) || 0.5,
        processingSteps: [...(state.processingSteps || []), 'ai_classification']
      };
    } catch (error) {
      console.error('Error classifying file:', error);
      return this.getBasicClassification({
        ...state,
        errors: [...(state.errors || []), `Classification failed: ${error.message}`]
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

    const tagsPrompt = `
    Generate 3-5 relevant tags for this file:
    
    File: ${state.fileName}
    Category: ${state.classification}
    Type: ${state.fileType}
    Content: ${state.content ? state.content.substring(0, 300) : 'No content'}

    Return only the tags separated by commas, no explanations.
    `;

    try {
      const response = await this.llm.invoke([
        { role: 'system', content: 'Generate concise, relevant tags for file organization.' },
        { role: 'user', content: tagsPrompt }
      ]);

      const tags = response.content
        .split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0)
        .slice(0, 5);

      return {
        ...state,
        tags,
        processingSteps: [...(state.processingSteps || []), 'ai_tagging']
      };
    } catch (error) {
      console.error('Error generating tags:', error);
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
          reasoning: 'Basic organization based on file category',
          confidence: 0.6
        }
      };
    }

    const organizationPrompt = `
    Suggest the best folder structure for this file:
    
    File: ${state.fileName}
    Category: ${state.classification}
    Tags: ${state.tags ? state.tags.join(', ') : 'none'}

    Suggest a folder path relative to the user's home directory.
    Format: FOLDER_PATH: folder/subfolder
    REASONING: Brief explanation
    `;

    try {
      const response = await this.llm.invoke([
        { role: 'system', content: 'Suggest logical folder structures for file organization.' },
        { role: 'user', content: organizationPrompt }
      ]);

      const content = response.content;
      const folderMatch = content.match(/FOLDER_PATH:\s*(.+)/);
      const reasoningMatch = content.match(/REASONING:\s*(.+)/);
      
      const suggestedPath = folderMatch ? folderMatch[1].trim() : this.getFallbackOrganization(state.classification);
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : `AI-suggested organization for ${state.classification} files`;

      return {
        ...state,
        organizationSuggestion: {
          relativePath: suggestedPath,
          fullPath: path.join(homeDir, suggestedPath),
          reasoning,
          confidence: state.confidence || 0.7
        },
        processingSteps: [...(state.processingSteps || []), 'ai_organization']
      };
    } catch (error) {
      console.error('Error suggesting organization:', error);
      const fallbackPath = this.getFallbackOrganization(state.classification);
      return {
        ...state,
        organizationSuggestion: {
          relativePath: fallbackPath,
          fullPath: path.join(homeDir, fallbackPath),
          reasoning: 'Fallback organization based on file category',
          confidence: 0.4
        },
        errors: [...(state.errors || []), `Organization suggestion failed: ${error.message}`]
      };
    }
  }

  async fallbackAnalysisNode(state) {
    console.log(`⚠️ Using fallback analysis for: ${state.fileName}`);
    
    const basicState = this.getBasicClassification(state);
    const homeDir = require('os').homedir();
    const fallbackPath = this.getFallbackOrganization(basicState.classification);
    
    return {
      ...basicState,
      tags: this.getBasicTags(state.fileName, basicState.classification),
      organizationSuggestion: {
        relativePath: fallbackPath,
        fullPath: path.join(homeDir, fallbackPath),
        reasoning: 'Fallback analysis - basic categorization',
        confidence: 0.3
      },
      processingSteps: [...(state.processingSteps || []), 'fallback_analysis']
    };
  }

  shouldUseFallback(state) {
    const errorCount = state.errors ? state.errors.length : 0;
    if (errorCount > 2 || !state.content || state.fileType === 'error') {
      return 'fallback';
    }
    return 'continue';
  }

  getBasicClassification(state) {
    const ext = state.fileExtension ? state.fileExtension.toLowerCase() : '';
    
    const extMap = {
      '.js': 'code', '.ts': 'code', '.py': 'code', '.java': 'code',
      '.cpp': 'code', '.c': 'code', '.html': 'code', '.css': 'code',
      '.pdf': 'document', '.doc': 'document', '.docx': 'document',
      '.txt': 'document', '.md': 'document',
      '.jpg': 'media', '.jpeg': 'media', '.png': 'media', '.gif': 'media',
      '.mp4': 'media', '.avi': 'media', '.mov': 'media', '.mp3': 'media',
      '.zip': 'archive', '.rar': 'archive', '.7z': 'archive'
    };
    
    return {
      ...state,
      classification: extMap[ext] || 'misc',
      confidence: 0.6,
      processingSteps: [...(state.processingSteps || []), 'basic_classification']
    };
  }

  getBasicTags(fileName, classification) {
    const tags = [classification];
    const ext = path.extname(fileName).toLowerCase();
    
    if (ext) {
      tags.push(ext.substring(1));
    }
    
    const name = fileName.toLowerCase();
    if (name.includes('invoice')) tags.push('invoice');
    if (name.includes('receipt')) tags.push('receipt');
    if (name.includes('resume')) tags.push('resume');
    
    return tags.slice(0, 5);
  }

  getFallbackOrganization(classification) {
    const organizationMap = {
      'document': 'Documents/General',
      'code': 'Projects/Code',
      'media': 'Media/Files',
      'archive': 'Archives',
      'work': 'Documents/Work',
      'financial': 'Documents/Financial',
      'misc': 'Documents/Misc'
    };

    return organizationMap[classification] || 'Documents/Misc';
  }

  async analyzeFile(filePath) {
    if (this.fileCache.has(filePath)) {
      const cached = this.fileCache.get(filePath);
      if (Date.now() - cached.timestamp < 3600000) {
        return cached.result;
      }
    }

    try {
      console.log(`🔗 Starting LangGraph analysis for: ${path.basename(filePath)}`);
      
      const initialState = {
        filePath,
        processingSteps: [],
        errors: []
      };

      const result = await this.graph.invoke(initialState);
      
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

      this.fileCache.set(filePath, {
        timestamp: Date.now(),
        result: analysisResult
      });

      console.log(`✅ LangGraph analysis completed for: ${result.fileName}`);
      return analysisResult;
    } catch (error) {
      console.error('LangGraph analysis failed:', error);
      return {
        filePath,
        fileName: path.basename(filePath),
        classification: 'misc',
        tags: [],
        confidence: 0,
        organizationSuggestion: null,
        errors: [error.message],
        timestamp: new Date()
      };
    }
  }

  clearCache() {
    this.fileCache.clear();
  }
}

module.exports = { FileAnalysisGraph }; 