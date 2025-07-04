class WorkflowBuilder {
  constructor() {
    this.workflows = [];
    this.currentWorkflow = null;
    this.nodeCounter = 0;
  }

  render() {
    return `
      <div class="workflow-builder">
        <div class="workflow-header">
          <h3>Visual Workflow Builder</h3>
          <button id="create-workflow-btn" class="btn btn-primary">
            <i class="fas fa-plus"></i> New Workflow
          </button>
        </div>

        <div class="workflow-canvas">
          <div class="node-palette">
            <h4>Components</h4>
            <div class="node-type" data-type="trigger">
              <i class="fas fa-play"></i> File Trigger
            </div>
            <div class="node-type" data-type="action">
              <i class="fas fa-cog"></i> Move File
            </div>
            <div class="node-type" data-type="condition">
              <i class="fas fa-question"></i> Condition
            </div>
            <div class="node-type" data-type="integration">
              <i class="fas fa-cloud"></i> Cloud Sync
            </div>
          </div>

          <div class="canvas-area" id="canvas-area">
            <div class="canvas-placeholder">
              <i class="fas fa-mouse-pointer"></i>
              <p>Drag components here to build your workflow</p>
            </div>
          </div>

          <div class="workflow-properties">
            <h4>Properties</h4>
            <div id="property-panel">
              <p>Select a component to edit properties</p>
            </div>
          </div>
        </div>

        <div class="workflow-examples">
          <h4>Example Workflows</h4>
          <div class="example-item">
            <strong>Auto-organize Downloads</strong>
            <p>When file added → Classify → Move to folder</p>
          </div>
          <div class="example-item">
            <strong>Daily Cloud Backup</strong>
            <p>Daily trigger → Find important files → Upload to cloud</p>
          </div>
        </div>
      </div>

      <style>
        .workflow-builder {
          padding: 20px;
          background: #f8f9fa;
          min-height: 600px;
        }

        .workflow-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 1px solid #dee2e6;
        }

        .workflow-canvas {
          display: grid;
          grid-template-columns: 200px 1fr 250px;
          gap: 20px;
          height: 500px;
        }

        .node-palette {
          background: white;
          padding: 15px;
          border-radius: 8px;
          border: 1px solid #dee2e6;
        }

        .node-type {
          padding: 10px;
          margin-bottom: 10px;
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .node-type:hover {
          background: #e9ecef;
        }

        .canvas-area {
          background: white;
          border: 1px solid #dee2e6;
          border-radius: 8px;
          position: relative;
          background-image: 
            linear-gradient(90deg, #f8f9fa 1px, transparent 1px),
            linear-gradient(180deg, #f8f9fa 1px, transparent 1px);
          background-size: 20px 20px;
        }

        .canvas-placeholder {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          color: #6c757d;
        }

        .workflow-properties {
          background: white;
          padding: 15px;
          border-radius: 8px;
          border: 1px solid #dee2e6;
        }

        .workflow-examples {
          margin-top: 20px;
          padding: 15px;
          background: white;
          border-radius: 8px;
          border: 1px solid #dee2e6;
        }

        .example-item {
          padding: 10px;
          margin-bottom: 10px;
          background: #f8f9fa;
          border-radius: 4px;
        }

        .workflow-node {
          position: absolute;
          background: white;
          border: 2px solid #007bff;
          border-radius: 8px;
          padding: 10px;
          min-width: 120px;
          cursor: move;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
      </style>
    `;
  }

  setupEventListeners() {
    document.getElementById('create-workflow-btn').addEventListener('click', () => {
      this.createNewWorkflow();
    });

    // Add drag and drop functionality
    const nodeTypes = document.querySelectorAll('.node-type');
    nodeTypes.forEach(node => {
      node.addEventListener('click', () => {
        this.addNodeToCanvas(node.dataset.type);
      });
    });
  }

  createNewWorkflow() {
    const name = prompt('Enter workflow name:');
    if (name) {
      const workflow = {
        id: Date.now(),
        name: name,
        nodes: [],
        connections: []
      };
      
      this.workflows.push(workflow);
      this.currentWorkflow = workflow;
      console.log('Created workflow:', workflow);
    }
  }

  addNodeToCanvas(nodeType) {
    const canvas = document.getElementById('canvas-area');
    const nodeId = 'node_' + (++this.nodeCounter);
    
    const nodeElement = document.createElement('div');
    nodeElement.className = 'workflow-node';
    nodeElement.id = nodeId;
    nodeElement.style.left = '100px';
    nodeElement.style.top = (50 + this.nodeCounter * 80) + 'px';
    
    nodeElement.innerHTML = `
      <div class="node-header">
        <i class="fas fa-${this.getNodeIcon(nodeType)}"></i>
        ${this.getNodeName(nodeType)}
      </div>
    `;
    
    canvas.appendChild(nodeElement);
    this.hideCanvasPlaceholder();
  }

  getNodeIcon(type) {
    const icons = {
      trigger: 'play',
      action: 'cog',
      condition: 'question',
      integration: 'cloud'
    };
    return icons[type] || 'square';
  }

  getNodeName(type) {
    const names = {
      trigger: 'File Trigger',
      action: 'Move File',
      condition: 'Condition',
      integration: 'Cloud Sync'
    };
    return names[type] || 'Unknown';
  }

  hideCanvasPlaceholder() {
    const placeholder = document.querySelector('.canvas-placeholder');
    if (placeholder) {
      placeholder.style.display = 'none';
    }
  }

  getWorkflowExamples() {
    return [
      {
        name: 'Auto-organize Downloads',
        description: 'Automatically organize files in Downloads folder',
        nodes: ['File Trigger', 'Classify', 'Move File']
      },
      {
        name: 'Daily Backup',
        description: 'Backup important files daily',
        nodes: ['Schedule Trigger', 'Find Files', 'Cloud Sync']
      }
    ];
  }
}

window.WorkflowBuilder = WorkflowBuilder; 