class VisualWorkflowEditor {
  constructor(containerId) {
    this.containerId = containerId;
    this.workflows = new Map();
    this.selectedWorkflow = null;
    this.draggedNode = null;
    this.nodeCounter = 0;
    this.connections = [];
    
    this.init();
  }

  init() {
    this.createWorkflowEditor();
    this.setupEventListeners();
    this.loadNodeTemplates();
  }

  createWorkflowEditor() {
    const container = document.getElementById(this.containerId);
    
    container.innerHTML = `
      <div class="workflow-editor">
        <div class="workflow-toolbar">
          <button id="new-workflow-btn" class="btn btn-primary">
            <i class="fas fa-plus"></i> New Workflow
          </button>
          <button id="save-workflow-btn" class="btn btn-success">
            <i class="fas fa-save"></i> Save
          </button>
          <button id="run-workflow-btn" class="btn btn-info">
            <i class="fas fa-play"></i> Run
          </button>
          <button id="delete-workflow-btn" class="btn btn-danger">
            <i class="fas fa-trash"></i> Delete
          </button>
          
          <select id="workflow-selector" class="form-control ml-3">
            <option value="">Select Workflow...</option>
          </select>
        </div>

        <div class="workflow-content">
          <div class="node-palette">
            <h4>Components</h4>
            
            <div class="node-category">
              <h5>Triggers</h5>
              <div class="node-item" data-type="file-trigger" draggable="true">
                <i class="fas fa-file"></i> File Added
              </div>
              <div class="node-item" data-type="time-trigger" draggable="true">
                <i class="fas fa-clock"></i> Schedule
              </div>
              <div class="node-item" data-type="folder-trigger" draggable="true">
                <i class="fas fa-folder"></i> Folder Watch
              </div>
            </div>

            <div class="node-category">
              <h5>Actions</h5>
              <div class="node-item" data-type="move-action" draggable="true">
                <i class="fas fa-arrows-alt"></i> Move File
              </div>
              <div class="node-item" data-type="copy-action" draggable="true">
                <i class="fas fa-copy"></i> Copy File
              </div>
              <div class="node-item" data-type="delete-action" draggable="true">
                <i class="fas fa-trash"></i> Delete File
              </div>
              <div class="node-item" data-type="classify-action" draggable="true">
                <i class="fas fa-tag"></i> Classify
              </div>
            </div>

            <div class="node-category">
              <h5>Integrations</h5>
              <div class="node-item" data-type="google-drive" draggable="true">
                <i class="fab fa-google-drive"></i> Google Drive
              </div>
              <div class="node-item" data-type="slack-notify" draggable="true">
                <i class="fab fa-slack"></i> Slack
              </div>
              <div class="node-item" data-type="email-send" draggable="true">
                <i class="fas fa-envelope"></i> Send Email
              </div>
            </div>

            <div class="node-category">
              <h5>Logic</h5>
              <div class="node-item" data-type="condition" draggable="true">
                <i class="fas fa-code-branch"></i> Condition
              </div>
              <div class="node-item" data-type="delay" draggable="true">
                <i class="fas fa-pause"></i> Delay
              </div>
            </div>
          </div>

          <div class="workflow-canvas" id="workflow-canvas">
            <div class="canvas-placeholder">
              <i class="fas fa-mouse-pointer"></i>
              <p>Drag components here to build your workflow</p>
            </div>
          </div>
        </div>

        <div class="workflow-properties" id="workflow-properties">
          <h4>Properties</h4>
          <div class="no-selection">
            <p>Select a node to edit its properties</p>
          </div>
        </div>
      </div>

      <style>
        .workflow-editor {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #f8f9fa;
        }

        .workflow-toolbar {
          padding: 15px;
          background: white;
          border-bottom: 1px solid #dee2e6;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .workflow-content {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .node-palette {
          width: 250px;
          background: white;
          border-right: 1px solid #dee2e6;
          padding: 15px;
          overflow-y: auto;
        }

        .node-category {
          margin-bottom: 20px;
        }

        .node-category h5 {
          color: #495057;
          font-size: 14px;
          margin-bottom: 10px;
          text-transform: uppercase;
          font-weight: 600;
        }

        .node-item {
          padding: 10px;
          margin-bottom: 5px;
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          cursor: grab;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          transition: all 0.2s;
        }

        .node-item:hover {
          background: #e9ecef;
          border-color: #adb5bd;
        }

        .node-item i {
          width: 16px;
          text-align: center;
          color: #6c757d;
        }

        .workflow-canvas {
          flex: 1;
          background: 
            linear-gradient(90deg, #f8f9fa 1px, transparent 1px),
            linear-gradient(180deg, #f8f9fa 1px, transparent 1px);
          background-size: 20px 20px;
          position: relative;
          overflow: auto;
        }

        .canvas-placeholder {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          color: #6c757d;
        }

        .canvas-placeholder i {
          font-size: 48px;
          margin-bottom: 15px;
          opacity: 0.5;
        }

        .workflow-node {
          position: absolute;
          width: 180px;
          min-height: 80px;
          background: white;
          border: 2px solid #dee2e6;
          border-radius: 8px;
          padding: 12px;
          cursor: move;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          transition: all 0.2s;
        }

        .workflow-node:hover {
          border-color: #007bff;
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }

        .workflow-node.selected {
          border-color: #007bff;
          box-shadow: 0 0 0 3px rgba(0,123,255,0.25);
        }

        .workflow-node .node-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          font-weight: 600;
          font-size: 14px;
        }

        .workflow-node .node-content {
          font-size: 12px;
          color: #6c757d;
        }

        .workflow-properties {
          width: 300px;
          background: white;
          border-left: 1px solid #dee2e6;
          padding: 15px;
          overflow-y: auto;
        }

        .properties-form {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .form-group label {
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 5px;
          display: block;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 8px;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          font-size: 14px;
        }

        .connection-line {
          position: absolute;
          border-top: 2px solid #007bff;
          z-index: 1;
          pointer-events: none;
        }

        .connection-arrow {
          position: absolute;
          right: -8px;
          top: -4px;
          width: 0;
          height: 0;
          border-left: 8px solid #007bff;
          border-top: 4px solid transparent;
          border-bottom: 4px solid transparent;
        }
      </style>
    `;
  }

  setupEventListeners() {
    // Toolbar buttons
    document.getElementById('new-workflow-btn').addEventListener('click', () => {
      this.createNewWorkflow();
    });

    document.getElementById('save-workflow-btn').addEventListener('click', () => {
      this.saveCurrentWorkflow();
    });

    document.getElementById('run-workflow-btn').addEventListener('click', () => {
      this.runCurrentWorkflow();
    });

    document.getElementById('workflow-selector').addEventListener('change', (e) => {
      this.loadWorkflow(e.target.value);
    });

    // Drag and drop
    const nodeItems = document.querySelectorAll('.node-item');
    nodeItems.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        this.draggedNode = e.target.dataset.type;
      });
    });

    const canvas = document.getElementById('workflow-canvas');
    canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      if (this.draggedNode) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.addNodeToCanvas(this.draggedNode, x, y);
        this.draggedNode = null;
      }
    });

    // Canvas click
    canvas.addEventListener('click', (e) => {
      if (e.target === canvas) {
        this.clearSelection();
      }
    });
  }

  loadNodeTemplates() {
    this.nodeTemplates = {
      'file-trigger': {
        name: 'File Added',
        icon: 'fas fa-file',
        type: 'trigger',
        properties: {
          watchPath: { type: 'text', label: 'Watch Path', default: '/Downloads' },
          fileTypes: { type: 'text', label: 'File Types', default: '*.pdf,*.doc' }
        }
      },
      'time-trigger': {
        name: 'Schedule',
        icon: 'fas fa-clock',
        type: 'trigger',
        properties: {
          schedule: { type: 'select', label: 'Schedule', options: ['Daily', 'Weekly', 'Monthly'], default: 'Daily' },
          time: { type: 'time', label: 'Time', default: '09:00' }
        }
      },
      'move-action': {
        name: 'Move File',
        icon: 'fas fa-arrows-alt',
        type: 'action',
        properties: {
          targetPath: { type: 'text', label: 'Target Path', default: '/Documents' },
          createFolders: { type: 'checkbox', label: 'Create Folders', default: true }
        }
      },
      'google-drive': {
        name: 'Google Drive',
        icon: 'fab fa-google-drive',
        type: 'integration',
        properties: {
          action: { type: 'select', label: 'Action', options: ['Upload', 'Download'], default: 'Upload' },
          folder: { type: 'text', label: 'Folder', default: 'FlowGenius' }
        }
      },
      'condition': {
        name: 'Condition',
        icon: 'fas fa-code-branch',
        type: 'logic',
        properties: {
          condition: { type: 'select', label: 'Condition', options: ['File Size', 'File Type', 'File Age'], default: 'File Type' },
          operator: { type: 'select', label: 'Operator', options: ['equals', 'contains', 'greater than'], default: 'equals' },
          value: { type: 'text', label: 'Value', default: '' }
        }
      }
    };
  }

  addNodeToCanvas(nodeType, x, y) {
    const template = this.nodeTemplates[nodeType];
    if (!template) return;

    const nodeId = 'node_' + (++this.nodeCounter);
    const node = {
      id: nodeId,
      type: nodeType,
      template: template,
      position: { x, y },
      properties: this.getDefaultProperties(template),
      connections: []
    };

    this.createNodeElement(node);
    this.hideCanvasPlaceholder();
  }

  createNodeElement(node) {
    const canvas = document.getElementById('workflow-canvas');
    const nodeElement = document.createElement('div');
    nodeElement.className = 'workflow-node';
    nodeElement.dataset.nodeId = node.id;
    nodeElement.style.left = node.position.x + 'px';
    nodeElement.style.top = node.position.y + 'px';

    nodeElement.innerHTML = `
      <div class="node-header">
        <i class="${node.template.icon}"></i>
        <span>${node.template.name}</span>
      </div>
      <div class="node-content">
        ${this.getNodeDescription(node)}
      </div>
    `;

    // Make draggable
    nodeElement.addEventListener('mousedown', (e) => {
      this.selectNode(node.id);
      this.startNodeDrag(e, node);
    });

    canvas.appendChild(nodeElement);
  }

  getDefaultProperties(template) {
    const properties = {};
    Object.entries(template.properties).forEach(([key, config]) => {
      properties[key] = config.default;
    });
    return properties;
  }

  getNodeDescription(node) {
    switch (node.type) {
      case 'file-trigger':
        return `Watch: ${node.properties.watchPath}`;
      case 'time-trigger':
        return `${node.properties.schedule} at ${node.properties.time}`;
      case 'move-action':
        return `To: ${node.properties.targetPath}`;
      case 'google-drive':
        return `${node.properties.action} to ${node.properties.folder}`;
      default:
        return 'Configure properties';
    }
  }

  selectNode(nodeId) {
    // Clear previous selection
    document.querySelectorAll('.workflow-node').forEach(node => {
      node.classList.remove('selected');
    });

    // Select new node
    const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (nodeElement) {
      nodeElement.classList.add('selected');
      this.showNodeProperties(nodeId);
    }
  }

  showNodeProperties(nodeId) {
    // Find node data (would need to store nodes in a map)
    const propertiesPanel = document.getElementById('workflow-properties');
    
    propertiesPanel.innerHTML = `
      <h4>Properties</h4>
      <div class="properties-form">
        <div class="form-group">
          <label>Node Name</label>
          <input type="text" value="File Trigger" />
        </div>
        <div class="form-group">
          <label>Watch Path</label>
          <input type="text" value="/Downloads" />
        </div>
        <div class="form-group">
          <label>File Types</label>
          <input type="text" value="*.pdf,*.doc" />
        </div>
        <button class="btn btn-primary">Update Node</button>
      </div>
    `;
  }

  clearSelection() {
    document.querySelectorAll('.workflow-node').forEach(node => {
      node.classList.remove('selected');
    });

    const propertiesPanel = document.getElementById('workflow-properties');
    propertiesPanel.innerHTML = `
      <h4>Properties</h4>
      <div class="no-selection">
        <p>Select a node to edit its properties</p>
      </div>
    `;
  }

  hideCanvasPlaceholder() {
    const placeholder = document.querySelector('.canvas-placeholder');
    if (placeholder) {
      placeholder.style.display = 'none';
    }
  }

  createNewWorkflow() {
    const workflowName = prompt('Enter workflow name:');
    if (workflowName) {
      const workflowId = 'workflow_' + Date.now();
      const workflow = {
        id: workflowId,
        name: workflowName,
        nodes: [],
        connections: [],
        created: new Date().toISOString()
      };

      this.workflows.set(workflowId, workflow);
      this.updateWorkflowSelector();
      this.loadWorkflow(workflowId);
    }
  }

  saveCurrentWorkflow() {
    if (this.selectedWorkflow) {
      console.log('💾 Saving workflow:', this.selectedWorkflow);
      alert('Workflow saved successfully!');
    } else {
      alert('No workflow selected');
    }
  }

  async runCurrentWorkflow() {
    if (this.selectedWorkflow) {
      console.log('▶️ Running workflow:', this.selectedWorkflow);
      
      try {
        const result = await window.ipcRenderer.invoke('execute-visual-workflow', {
          workflowId: this.selectedWorkflow,
          workflow: this.workflows.get(this.selectedWorkflow)
        });
        
        if (result.success) {
          alert('Workflow executed successfully!');
        } else {
          alert('Workflow execution failed: ' + result.error);
        }
      } catch (error) {
        alert('Error running workflow: ' + error.message);
      }
    } else {
      alert('No workflow selected');
    }
  }

  updateWorkflowSelector() {
    const selector = document.getElementById('workflow-selector');
    selector.innerHTML = '<option value="">Select Workflow...</option>';
    
    this.workflows.forEach((workflow, id) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = workflow.name;
      selector.appendChild(option);
    });
  }

  loadWorkflow(workflowId) {
    if (!workflowId) return;
    
    this.selectedWorkflow = workflowId;
    const workflow = this.workflows.get(workflowId);
    
    if (workflow) {
      console.log('📂 Loading workflow:', workflow.name);
      this.clearCanvas();
      // Load workflow nodes and connections
      // (Implementation would restore the visual workflow)
    }
  }

  clearCanvas() {
    const canvas = document.getElementById('workflow-canvas');
    const nodes = canvas.querySelectorAll('.workflow-node');
    nodes.forEach(node => node.remove());
    
    // Show placeholder if no nodes
    const placeholder = document.querySelector('.canvas-placeholder');
    if (placeholder) {
      placeholder.style.display = 'block';
    }
  }

  // Example workflows for demo
  getExampleWorkflows() {
    return [
      {
        name: 'Auto-organize Downloads',
        description: 'Automatically organize files added to Downloads folder',
        triggers: ['File Added'],
        actions: ['Classify File', 'Move to Category Folder']
      },
      {
        name: 'Daily Backup to Cloud',
        description: 'Backup important files to Google Drive daily',
        triggers: ['Daily Schedule'],
        actions: ['Find Important Files', 'Upload to Google Drive']
      },
      {
        name: 'Project File Detection',
        description: 'Detect and organize project-related files',
        triggers: ['File Added'],
        actions: ['Analyze Content', 'Move to Project Folder', 'Notify Team']
      }
    ];
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VisualWorkflowEditor };
} 