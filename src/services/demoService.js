const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class DemoService {
  constructor() {
    this.demoDirectory = path.join(os.homedir(), 'FlowGenius-Demo');
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Create demo directory if it doesn't exist
      await fs.mkdir(this.demoDirectory, { recursive: true });
      this.isInitialized = true;
      console.log('✅ Demo Service initialized');
    } catch (error) {
      console.error('Failed to initialize demo service:', error);
    }
  }

  async generateDemoFiles() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      console.log('🎭 Generating demo files...');
      
      // Clear existing demo files
      await this.clearDemoFiles();
      
      // Generate various types of files
      await this.generateDocuments();
      await this.generateCodeFiles();
      await this.generateMediaFiles();
      await this.generateFinancialFiles();
      await this.generatePersonalFiles();
      await this.generateWorkFiles();
      await this.generateEducationalFiles();
      await this.generateMiscFiles();
      
      console.log('✅ Demo files generated successfully');
      return { success: true, demoDirectory: this.demoDirectory };
    } catch (error) {
      console.error('Failed to generate demo files:', error);
      return { success: false, error: error.message };
    }
  }

  async clearDemoFiles() {
    try {
      const files = await fs.readdir(this.demoDirectory);
      for (const file of files) {
        await fs.unlink(path.join(this.demoDirectory, file));
      }
    } catch (error) {
      // Directory might not exist or be empty, that's fine
    }
  }

  async generateDocuments() {
    const documents = [
      {
        name: 'Meeting_Notes_Q4_2024.txt',
        content: `QUARTERLY MEETING NOTES - Q4 2024
Date: December 15, 2024
Attendees: Sarah Johnson, Mike Chen, Lisa Rodriguez

AGENDA:
1. Q4 Performance Review
2. 2025 Budget Planning
3. New Product Launch Strategy

KEY DISCUSSIONS:
- Revenue exceeded targets by 15%
- Customer satisfaction scores improved to 4.2/5
- Need to expand marketing team in Q1 2025
- Product development timeline on track

ACTION ITEMS:
[ ] Sarah: Prepare budget proposal by Jan 5
[ ] Mike: Schedule customer feedback sessions
[ ] Lisa: Research competitive analysis

Next meeting: January 12, 2025`
      },
      {
        name: 'Project_Proposal_AI_Integration.md',
        content: `# AI Integration Project Proposal

## Executive Summary
This proposal outlines the integration of artificial intelligence capabilities into our existing product suite to enhance user experience and operational efficiency.

## Objectives
- Improve customer service response time by 60%
- Automate routine data analysis tasks
- Enhance personalization features

## Timeline
- **Phase 1** (Q1 2025): Research and vendor selection
- **Phase 2** (Q2 2025): Pilot implementation
- **Phase 3** (Q3 2025): Full deployment

## Budget Estimate
- Development: $150,000
- Infrastructure: $75,000
- Training: $25,000
- **Total: $250,000**

## Risk Assessment
- Technical complexity: Medium
- Resource availability: High
- Market readiness: High

## Recommendation
Proceed with Phase 1 implementation beginning January 2025.`
      },
      {
        name: 'Technical_Documentation.txt',
        content: `SYSTEM ARCHITECTURE DOCUMENTATION

Version: 2.1.3
Last Updated: December 2024

OVERVIEW:
This document describes the technical architecture of our cloud-based application platform.

COMPONENTS:
1. Frontend Layer
   - React.js application
   - Redux state management
   - Material-UI components

2. Backend Services
   - Node.js API server
   - Express.js framework
   - JWT authentication

3. Database Layer
   - PostgreSQL primary database
   - Redis for caching
   - MongoDB for analytics

4. Infrastructure
   - AWS EC2 instances
   - Load balancer configuration
   - Auto-scaling groups

SECURITY MEASURES:
- SSL/TLS encryption
- OAuth 2.0 authentication
- Regular security audits
- Data encryption at rest

DEPLOYMENT:
- CI/CD pipeline using GitHub Actions
- Docker containerization
- Kubernetes orchestration`
      },
      {
        name: 'Meeting_Notes_2024.txt',
        content: 'Team meeting notes from January 2024\n\nDiscussed new project features, budget allocation, and timeline updates.\nAction items: Review design mockups, finalize technical specifications.',
        type: 'document'
      },
      {
        name: 'Invoice_12345.pdf.txt',
        content: 'INVOICE #12345\nDate: January 15, 2024\nAmount: $2,500.00\nServices: Web development and consulting',
        type: 'financial'
      },
      {
        name: 'Project_Proposal.docx.txt',
        content: 'Project Proposal: E-commerce Platform Development\n\nExecutive Summary\nWe propose to develop a modern e-commerce platform...',
        type: 'work'
      },
      {
        name: 'John_Doe_Resume.pdf.txt',
        content: 'JOHN DOE\nSoftware Engineer\n\nEXPERIENCE:\n- Senior Developer at Tech Corp (2020-2024)\n- Full-stack development with React and Node.js\n- Led team of 5 developers\n\nSKILLS:\n- JavaScript, Python, Java\n- React, Vue.js, Angular\n- AWS, Docker, Kubernetes\n\nEDUCATION:\n- B.S. Computer Science, University of Technology\n\nContact: john.doe@email.com',
        type: 'personal'
      },
      {
        name: 'Sarah_Smith_CV.txt',
        content: 'Sarah Smith - Marketing Manager\n\nProfessional Experience:\n• Marketing Director at Creative Agency (2019-2024)\n• Managed campaigns with $1M+ budgets\n• Increased brand awareness by 150%\n\nCore Competencies:\n• Digital Marketing Strategy\n• Social Media Management\n• Brand Development\n• Data Analytics\n\nEducation:\nMBA Marketing, Business School\nBA Communications, State University',
        type: 'personal'
      }
    ];

    for (const doc of documents) {
      await fs.writeFile(
        path.join(this.demoDirectory, doc.name),
        doc.content,
        'utf8'
      );
    }
  }

  async generateCodeFiles() {
    const codeFiles = [
      {
        name: 'user_authentication.py',
        content: `#!/usr/bin/env python3
"""
User Authentication Module
Handles user login, registration, and session management
"""

import hashlib
import jwt
import datetime
from flask import Flask, request, jsonify
from functools import wraps

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'

class UserAuth:
    def __init__(self):
        self.users = {}  # In production, use a proper database
    
    def hash_password(self, password):
        """Hash a password using SHA-256"""
        return hashlib.sha256(password.encode()).hexdigest()
    
    def register_user(self, username, password, email):
        """Register a new user"""
        if username in self.users:
            return {"success": False, "message": "User already exists"}
        
        hashed_pwd = self.hash_password(password)
        self.users[username] = {
            "password": hashed_pwd,
            "email": email,
            "created_at": datetime.datetime.now()
        }
        return {"success": True, "message": "User registered successfully"}
    
    def authenticate_user(self, username, password):
        """Authenticate user credentials"""
        if username not in self.users:
            return False
        
        hashed_pwd = self.hash_password(password)
        return self.users[username]["password"] == hashed_pwd

    def generate_token(self, username):
        """Generate JWT token for authenticated user"""
        payload = {
            'username': username,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }
        return jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'message': 'Token is missing'}), 401
        
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        except:
            return jsonify({'message': 'Token is invalid'}), 401
        
        return f(*args, **kwargs)
    return decorated

if __name__ == '__main__':
    auth = UserAuth()
    app.run(debug=True)`
      },
      {
        name: 'data_processor.js',
        content: `/**
 * Data Processing Utilities
 * Handles data transformation and analysis
 */

const fs = require('fs');
const path = require('path');

class DataProcessor {
    constructor() {
        this.cache = new Map();
        this.config = {
            maxCacheSize: 1000,
            defaultTimeout: 5000
        };
    }

    /**
     * Process CSV file and return structured data
     * @param {string} filePath - Path to CSV file
     * @returns {Promise<Array>} Processed data array
     */
    async processCSV(filePath) {
        try {
            const data = await fs.promises.readFile(filePath, 'utf8');
            const lines = data.split('\\n');
            const headers = lines[0].split(',');
            
            const result = [];
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    const values = lines[i].split(',');
                    const row = {};
                    headers.forEach((header, index) => {
                        row[header.trim()] = values[index]?.trim() || '';
                    });
                    result.push(row);
                }
            }
            
            return result;
        } catch (error) {
            throw new Error(\`Failed to process CSV: \${error.message}\`);
        }
    }

    /**
     * Calculate statistical metrics
     * @param {Array<number>} numbers - Array of numbers
     * @returns {Object} Statistical summary
     */
    calculateStats(numbers) {
        if (!Array.isArray(numbers) || numbers.length === 0) {
            return null;
        }

        const sorted = [...numbers].sort((a, b) => a - b);
        const sum = numbers.reduce((acc, num) => acc + num, 0);
        const mean = sum / numbers.length;
        
        return {
            count: numbers.length,
            sum: sum,
            mean: mean,
            median: sorted[Math.floor(sorted.length / 2)],
            min: Math.min(...numbers),
            max: Math.max(...numbers),
            variance: numbers.reduce((acc, num) => acc + Math.pow(num - mean, 2), 0) / numbers.length
        };
    }

    /**
     * Filter and transform data based on criteria
     * @param {Array} data - Input data array
     * @param {Object} criteria - Filter criteria
     * @returns {Array} Filtered data
     */
    filterData(data, criteria) {
        return data.filter(item => {
            return Object.keys(criteria).every(key => {
                if (typeof criteria[key] === 'function') {
                    return criteria[key](item[key]);
                }
                return item[key] === criteria[key];
            });
        });
    }
}

module.exports = DataProcessor;`
      },
      {
        name: 'config.json',
        content: `{
  "application": {
    "name": "FlowGenius Demo App",
    "version": "1.2.3",
    "environment": "development",
    "debug": true
  },
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "flowgenius_demo",
    "ssl": false,
    "pool": {
      "min": 2,
      "max": 10
    }
  },
  "api": {
    "baseUrl": "https://api.flowgenius.com",
    "timeout": 30000,
    "retries": 3,
    "rateLimit": {
      "requests": 100,
      "window": 900000
    }
  },
  "features": {
    "aiAnalysis": true,
    "fileMonitoring": true,
    "autoOrganization": true,
    "notifications": true
  },
  "ui": {
    "theme": "light",
    "language": "en",
    "animations": true,
    "compactMode": false
  },
  "logging": {
    "level": "info",
    "maxFiles": 5,
    "maxSize": "10MB"
  }
}`
      }
    ];

    for (const file of codeFiles) {
      await fs.writeFile(
        path.join(this.demoDirectory, file.name),
        file.content,
        'utf8'
      );
    }
  }

  async generateMediaFiles() {
    // Create placeholder files for media (since we can't generate actual images/videos)
    const mediaFiles = [
      {
        name: 'vacation_photo_2024.jpg.txt',
        content: `[DEMO PLACEHOLDER: This represents a JPEG image file]

Filename: vacation_photo_2024.jpg
Type: Digital photograph
Dimensions: 4032 x 3024 pixels
File Size: 2.8 MB
Date Taken: July 15, 2024
Location: Santorini, Greece
Camera: iPhone 14 Pro
Description: Sunset view over the Aegean Sea from Oia village

This would be analyzed by FlowGenius as:
- Classification: personal, media
- Tags: vacation, photo, greece, sunset, travel
- Suggested location: ~/Pictures/Travel/2024/Greece/`
      },
      {
        name: 'tutorial_video.mp4.txt',
        content: `[DEMO PLACEHOLDER: This represents an MP4 video file]

Filename: tutorial_video.mp4
Type: Video file
Duration: 15:32
Resolution: 1920x1080 (Full HD)
File Size: 145 MB
Created: November 8, 2024
Title: "How to Use FlowGenius - Complete Tutorial"

This would be analyzed by FlowGenius as:
- Classification: educational, media
- Tags: tutorial, software, training, demo
- Suggested location: ~/Documents/Education/Tutorials/`
      },
      {
        name: 'presentation_audio.mp3.txt',
        content: `[DEMO PLACEHOLDER: This represents an MP3 audio file]

Filename: presentation_audio.mp3
Type: Audio recording
Duration: 45:12
Bitrate: 320 kbps
File Size: 104 MB
Recorded: December 3, 2024
Title: "Q4 Sales Presentation Recording"

This would be analyzed by FlowGenius as:
- Classification: work, media
- Tags: presentation, sales, meeting, audio
- Suggested location: ~/Documents/Work/Presentations/2024/`
      }
    ];

    for (const file of mediaFiles) {
      await fs.writeFile(
        path.join(this.demoDirectory, file.name),
        file.content,
        'utf8'
      );
    }
  }

  async generateFinancialFiles() {
    const financialFiles = [
      {
        name: 'Invoice_INV-2024-0847.txt',
        content: `INVOICE

Invoice Number: INV-2024-0847
Date: December 10, 2024
Due Date: January 10, 2025

BILL TO:
Acme Corporation
123 Business Street
New York, NY 10001

FROM:
FlowGenius Solutions LLC
456 Tech Avenue
San Francisco, CA 94102

DESCRIPTION                    QTY    RATE      AMOUNT
Software Development Services   40    $150.00   $6,000.00
UI/UX Design Consultation      10    $200.00   $2,000.00
Technical Documentation         5    $100.00     $500.00

                              SUBTOTAL:        $8,500.00
                              TAX (8.5%):        $722.50
                              TOTAL:           $9,222.50

Payment Terms: Net 30 days
Payment Methods: Check, Wire Transfer, ACH

Thank you for your business!`
      },
      {
        name: 'Expense_Report_November_2024.txt',
        content: `MONTHLY EXPENSE REPORT
November 2024

Employee: John Smith
Department: Marketing
Manager: Sarah Johnson

TRAVEL EXPENSES:
11/05 - Flight to Chicago           $450.00
11/05 - Hotel (2 nights)           $320.00
11/07 - Meals                       $85.50
11/06-07 - Ground Transportation    $65.00

OFFICE SUPPLIES:
11/12 - Printer Paper              $35.99
11/18 - Presentation Materials     $127.50

PROFESSIONAL DEVELOPMENT:
11/22 - Conference Registration    $850.00
11/23 - Training Materials         $199.99

TOTAL EXPENSES:                  $2,133.98

All receipts attached.
Submitted: December 1, 2024
Manager Approval: Pending`
      },
      {
        name: 'Bank_Statement_Summary_Dec2024.txt',
        content: `BANK STATEMENT SUMMARY
December 2024
Account: Business Checking ****-1234

OPENING BALANCE (12/01/2024):    $15,847.32

DEPOSITS:
12/05 - Client Payment           $9,222.50
12/12 - Investment Return        $1,250.00
12/20 - Consulting Fee           $3,500.00
12/28 - Year-end Bonus           $5,000.00
Total Deposits:                 $18,972.50

WITHDRAWALS:
12/03 - Office Rent             $2,800.00
12/10 - Payroll                 $8,500.00
12/15 - Utilities                 $245.67
12/18 - Software Subscriptions    $589.99
12/22 - Equipment Purchase      $1,200.00
12/30 - Tax Payment             $3,250.00
Total Withdrawals:             $16,585.66

CLOSING BALANCE (12/31/2024):   $18,234.16

Average Daily Balance:          $16,892.45
Service Charges:                    $25.00`
      }
    ];

    for (const file of financialFiles) {
      await fs.writeFile(
        path.join(this.demoDirectory, file.name),
        file.content,
        'utf8'
      );
    }
  }

  async generatePersonalFiles() {
    const personalFiles = [
      {
        name: 'Birthday_Party_Planning.txt',
        content: `SARAH'S 30TH BIRTHDAY PARTY PLANNING

Date: January 25, 2025
Time: 7:00 PM - 11:00 PM
Venue: The Garden Restaurant
Guest Count: 25 people

TO-DO LIST:
☐ Send invitations (due: Dec 20)
☐ Order custom cake (due: Jan 15)
☐ Book photographer (due: Jan 1)
☐ Arrange decorations (due: Jan 20)
☐ Create playlist (due: Jan 22)
☐ Confirm venue setup (due: Jan 23)

GUEST LIST:
Family: Mom, Dad, Sister Emma, Uncle Mike
Friends: Jessica, David, Amanda, Carlos, Lisa
Colleagues: Rachel, Tom, Kevin

MENU PREFERENCES:
- Vegetarian options for Emma and Lisa
- Gluten-free dessert alternatives
- Signature cocktails: Mojitos and Cosmos

BUDGET:
Venue & Food: $800
Decorations: $150
Cake: $200
Photography: $300
Miscellaneous: $100
TOTAL: $1,550

PARTY THEME: Garden/Botanical`
      },
      {
        name: 'Grocery_List_Weekly.txt',
        content: `WEEKLY GROCERY LIST
Week of January 1-7, 2025

PRODUCE:
□ Bananas (2 bunches)
□ Apples (Honeycrisp, 6 count)
□ Spinach (organic, 2 bags)
□ Carrots (1 lb bag)
□ Bell peppers (red, yellow, green)
□ Avocados (4 count)
□ Lemons (3 count)

PROTEINS:
□ Chicken breast (2 lbs)
□ Salmon fillets (1 lb)
□ Greek yogurt (large container)
□ Eggs (dozen, cage-free)
□ Almonds (unsalted, 1 lb)

PANTRY:
□ Olive oil (extra virgin)
□ Quinoa (2 lb bag)
□ Brown rice (5 lb bag)
□ Pasta (whole wheat)
□ Tomato sauce (2 cans)
□ Black beans (3 cans)

HOUSEHOLD:
□ Laundry detergent
□ Toilet paper (12-pack)
□ Dish soap
□ Paper towels

ESTIMATED TOTAL: $85-95
Store: Whole Foods Market
Shopping Day: Saturday morning`
      },
      {
        name: 'Book_Reading_List_2025.txt',
        content: `READING LIST 2025
Goal: 24 books (2 per month)

CURRENTLY READING:
📖 "Atomic Habits" by James Clear
   Started: December 15, 2024
   Progress: 65%
   Notes: Great insights on habit formation

NEXT UP:
1. "The Seven Husbands of Evelyn Hugo" by Taylor Jenkins Reid
2. "Educated" by Tara Westover
3. "The Midnight Library" by Matt Haig
4. "Sapiens" by Yuval Noah Harari

WANT TO READ:
Fiction:
- "Where the Crawdads Sing" by Delia Owens
- "The Silent Patient" by Alex Michaelides
- "Normal People" by Sally Rooney
- "The Vanishing Half" by Brit Bennett

Non-Fiction:
- "Becoming" by Michelle Obama
- "Untamed" by Glennon Doyle
- "The Body Keeps the Score" by Bessel van der Kolk
- "Digital Minimalism" by Cal Newport

COMPLETED (2024):
✅ "The Alchemist" by Paulo Coelho (4/5 stars)
✅ "Dune" by Frank Herbert (5/5 stars)
✅ "The Power of Now" by Eckhart Tolle (3/5 stars)

READING CHALLENGE PROGRESS: 0/24 books
Join Goodreads challenge: Yes`
      }
    ];

    for (const file of personalFiles) {
      await fs.writeFile(
        path.join(this.demoDirectory, file.name),
        file.content,
        'utf8'
      );
    }
  }

  async generateWorkFiles() {
    const workFiles = [
      {
        name: 'Performance_Review_2024.txt',
        content: `ANNUAL PERFORMANCE REVIEW 2024

Employee: Alex Johnson
Position: Senior Software Developer
Department: Engineering
Review Period: January 1 - December 31, 2024
Reviewer: Maria Rodriguez, Engineering Manager

GOALS ACHIEVEMENT:
1. Lead mobile app development project ✓ EXCEEDED
   - Delivered 2 weeks ahead of schedule
   - App achieved 4.8-star rating in app stores
   - Led team of 5 developers successfully

2. Improve code quality metrics ✓ MET
   - Reduced bugs by 35%
   - Implemented automated testing
   - Code review participation: 95%

3. Mentor junior developers ✓ EXCEEDED
   - Mentored 3 junior developers
   - All mentees received promotions
   - Created internal training materials

STRENGTHS:
- Excellent technical leadership
- Strong problem-solving skills
- Great team collaboration
- Proactive in identifying improvements

AREAS FOR IMPROVEMENT:
- Public speaking and presentation skills
- Cross-functional communication
- Time management for multiple projects

2025 GOALS:
1. Obtain cloud architecture certification
2. Lead company-wide technical standards initiative
3. Speak at 2 industry conferences

RATING: Exceeds Expectations (4/5)
RECOMMENDED ACTIONS:
- 8% salary increase
- Promotion to Technical Lead
- Professional development budget: $3,000`
      },
      {
        name: 'Project_Status_Report_WebApp.txt',
        content: `PROJECT STATUS REPORT
E-Commerce Web Application Redesign

Project Manager: Sarah Kim
Start Date: September 1, 2024
Target Completion: February 28, 2025
Current Status: ON TRACK

PHASE COMPLETION:
Phase 1 - Discovery & Planning: ✅ COMPLETE (100%)
Phase 2 - Design & Prototyping: ✅ COMPLETE (100%)
Phase 3 - Development: 🟡 IN PROGRESS (75%)
Phase 4 - Testing & QA: ⏳ PENDING (0%)
Phase 5 - Deployment: ⏳ PENDING (0%)

RECENT ACCOMPLISHMENTS:
- User authentication system completed
- Product catalog integration finished
- Payment gateway testing successful
- Mobile responsive design implemented

CURRENT TASKS:
- Shopping cart functionality (90% complete)
- Order management system (60% complete)
- Email notification system (40% complete)
- Performance optimization (30% complete)

TEAM STATUS:
Frontend Team (3 developers): On schedule
Backend Team (2 developers): Slightly ahead
QA Team (2 testers): Ready for testing phase
DevOps (1 engineer): Infrastructure prepared

RISKS & MITIGATION:
🟡 Third-party API delays
   Mitigation: Implemented fallback solution
🟢 Resource availability
   Mitigation: Cross-training completed

BUDGET STATUS:
Allocated: $150,000
Spent: $112,500 (75%)
Remaining: $37,500
Projected Final Cost: $148,000

NEXT MILESTONES:
- January 15: Development phase completion
- January 22: QA testing begins
- February 15: User acceptance testing
- February 28: Production deployment`
      }
    ];

    for (const file of workFiles) {
      await fs.writeFile(
        path.join(this.demoDirectory, file.name),
        file.content,
        'utf8'
      );
    }
  }

  async generateEducationalFiles() {
    const educationalFiles = [
      {
        name: 'Machine_Learning_Course_Notes.txt',
        content: `MACHINE LEARNING COURSE NOTES
Stanford CS229 - Lecture 5: Neural Networks

DATE: November 15, 2024
INSTRUCTOR: Prof. Andrew Ng

KEY CONCEPTS:

1. NEURAL NETWORK ARCHITECTURE
   - Input Layer: Receives feature vectors
   - Hidden Layers: Process and transform data
   - Output Layer: Produces predictions
   - Activation Functions: ReLU, Sigmoid, Tanh

2. FORWARD PROPAGATION
   z[1] = W[1]x + b[1]
   a[1] = g(z[1])
   z[2] = W[2]a[1] + b[2]
   a[2] = g(z[2])

3. BACKPROPAGATION ALGORITHM
   - Calculate cost function: J(W,b)
   - Compute gradients using chain rule
   - Update weights: W := W - α∇W J(W,b)
   - Update biases: b := b - α∇b J(b)

4. OPTIMIZATION TECHNIQUES
   - Gradient Descent variants:
     * Batch GD: Uses entire dataset
     * Stochastic GD: Uses single example
     * Mini-batch GD: Uses subset of data
   - Learning rate scheduling
   - Momentum and Adam optimizers

PRACTICAL TIPS:
- Initialize weights randomly (Xavier/He initialization)
- Use dropout for regularization
- Batch normalization improves convergence
- Monitor validation loss to prevent overfitting

HOMEWORK 3: Due November 22
- Implement neural network from scratch
- Compare different activation functions
- Experiment with network depth and width

EXAM TOPICS:
- Mathematical foundations
- Coding implementation
- Hyperparameter tuning
- Real-world applications`
      },
      {
        name: 'Research_Paper_Summary_AI_Ethics.txt',
        content: `RESEARCH PAPER SUMMARY
"Artificial Intelligence Ethics: A Comprehensive Framework"

CITATION:
Johnson, M., & Chen, L. (2024). Artificial Intelligence Ethics: A Comprehensive Framework for Responsible Development. Journal of AI Ethics, 15(3), 245-278.

ABSTRACT SUMMARY:
This paper proposes a comprehensive ethical framework for AI development, addressing key concerns including bias, transparency, accountability, and societal impact.

KEY FINDINGS:

1. ETHICAL PRINCIPLES FOR AI
   - Beneficence: AI should benefit humanity
   - Non-maleficence: Avoid harm ("do no harm")
   - Autonomy: Respect human agency and choice
   - Justice: Ensure fair distribution of benefits
   - Explicability: AI decisions should be interpretable

2. BIAS MITIGATION STRATEGIES
   - Diverse development teams
   - Inclusive dataset collection
   - Regular algorithmic audits
   - Continuous monitoring post-deployment
   - Community feedback mechanisms

3. GOVERNANCE FRAMEWORKS
   - Multi-stakeholder oversight committees
   - Regular ethics impact assessments
   - Transparent reporting requirements
   - Public participation in AI policy
   - International cooperation standards

4. CASE STUDIES ANALYZED
   - Facial recognition in law enforcement
   - AI in hiring and recruitment
   - Healthcare diagnostic algorithms
   - Autonomous vehicle decision-making
   - Social media content moderation

IMPLICATIONS FOR PRACTICE:
- Organizations need dedicated AI ethics boards
- Technical documentation must include ethics considerations
- Regular bias testing should be standard practice
- Public engagement in AI development is crucial

RESEARCH GAPS IDENTIFIED:
- Long-term societal impact studies needed
- Cross-cultural ethical perspectives underrepresented
- Limited research on AI ethics education

PERSONAL NOTES:
- Excellent framework for our capstone project
- Consider interviewing authors for research
- Check university library for full access
- Relevant for CS Ethics course final paper

FOLLOW-UP READING:
1. "Weapons of Math Destruction" by Cathy O'Neil
2. "Race After Technology" by Ruha Benjamin
3. "The Ethical Algorithm" by Kearns & Roth`
      }
    ];

    for (const file of educationalFiles) {
      await fs.writeFile(
        path.join(this.demoDirectory, file.name),
        file.content,
        'utf8'
      );
    }
  }

  async generateMiscFiles() {
    const miscFiles = [
      {
        name: 'WiFi_Password_Info.txt',
        content: `HOME NETWORK INFORMATION

PRIMARY NETWORK:
Network Name: Johnson_Family_5G
Password: FlowGenius2024!
Security: WPA3
Channel: Auto
Frequency: 5GHz

GUEST NETWORK:
Network Name: Johnson_Guest
Password: Welcome123
Security: WPA2
Bandwidth Limit: 50 Mbps

ROUTER INFORMATION:
Model: ASUS AX6000
IP Address: 192.168.1.1
Admin Username: admin
Admin Password: [Stored in password manager]

CONNECTED DEVICES:
- Sarah's iPhone (192.168.1.101)
- John's MacBook (192.168.1.102)
- Smart TV (192.168.1.103)
- Echo Dot (192.168.1.104)
- Ring Doorbell (192.168.1.105)

TROUBLESHOOTING NOTES:
- Restart router monthly
- Check for firmware updates quarterly
- Contact ISP: Xfinity (1-800-XFINITY)
- Speed test: 500 Mbps down / 50 Mbps up

SETUP DATE: March 15, 2024
WARRANTY: Valid until March 2027`
      },
      {
        name: 'Warranty_Information.txt',
        content: `WARRANTY & RECEIPT INFORMATION

ELECTRONICS:
1. MacBook Pro 16" (2024)
   Purchase Date: August 12, 2024
   Warranty Expires: August 12, 2027
   Serial: C02Z41234567
   Store: Apple Store SoHo
   Amount: $2,499

2. Samsung 65" QLED TV
   Purchase Date: November 3, 2024
   Warranty Expires: November 3, 2026
   Model: QN65Q80C
   Store: Best Buy
   Amount: $1,299

APPLIANCES:
3. Dyson V15 Vacuum
   Purchase Date: June 20, 2024
   Warranty Expires: June 20, 2026
   Serial: DY-V15-2024-789
   Store: Amazon
   Amount: $549

4. Ninja Blender Professional
   Purchase Date: September 8, 2024
   Warranty Expires: September 8, 2025
   Model: BL610
   Store: Target
   Amount: $89

HOME & GARDEN:
5. Ring Video Doorbell Pro
   Purchase Date: April 15, 2024
   Warranty Expires: April 15, 2025
   Device ID: Ring123456
   Store: Home Depot
   Amount: $229

NOTES:
- Keep receipts in filing cabinet
- Register products online for extended warranty
- Set calendar reminders 1 month before expiration
- Check manufacturer websites for recall notices`
      },
      {
        name: 'Random_Ideas_Notes.txt',
        content: `RANDOM IDEAS & THOUGHTS

APP IDEAS:
💡 Plant care reminder app with AI plant identification
💡 Voice-to-recipe converter for cooking while hands are busy
💡 Neighborhood skill-sharing platform (borrow tools, skills)
💡 AI-powered personal finance coach
💡 Real-time language practice with native speakers

BUSINESS CONCEPTS:
🚀 Sustainable packaging subscription service
🚀 Virtual interior design consultations
🚀 Pet sitting network with live video updates
🚀 Elderly tech support service
🚀 Local produce delivery from urban farms

CREATIVE PROJECTS:
🎨 Photography series: "Urban Wildlife"
🎨 Blog about minimalist living journey
🎨 Podcast interviewing career changers over 40
🎨 YouTube channel: "5-minute life hacks"
🎨 Instagram: Daily gratitude posts with nature photos

PERSONAL GOALS:
📝 Learn Spanish by end of 2025
📝 Complete a half marathon
📝 Start a small vegetable garden
📝 Take cooking classes (Italian cuisine)
📝 Volunteer at local animal shelter monthly

RANDOM THOUGHTS:
- Why don't grocery stores have quiet hours for sensory-sensitive shoppers?
- Could we use AI to optimize traffic light timing in real-time?
- What if libraries offered "tool libraries" for home improvement?
- Mobile app for finding dog-friendly restaurants nearby
- Service to help elderly people navigate modern technology

BOOK/MOVIE RECOMMENDATIONS TO CHECK:
📚 "The Seven Moons of Maali Almeida" - Fiction
📚 "The Power of Regret" - Psychology
🎬 "Everything Everywhere All at Once" - Sci-fi
🎬 "The Banshees of Inisherin" - Drama

TRAVEL WISHLIST:
✈️ Iceland (Northern Lights)
✈️ Japan (Cherry Blossom season)
✈️ New Zealand (Hiking)
✈️ Portugal (Food and culture)
✈️ Costa Rica (Wildlife)

Note: Review these ideas monthly, some might turn into actual projects!`
      }
    ];

    for (const file of miscFiles) {
      await fs.writeFile(
        path.join(this.demoDirectory, file.name),
        file.content,
        'utf8'
      );
    }
  }

  getDemoDirectory() {
    return this.demoDirectory;
  }

  async isDemoDirectoryActive() {
    try {
      const files = await fs.readdir(this.demoDirectory);
      return files.length > 0;
    } catch (error) {
      return false;
    }
  }
}

module.exports = { DemoService }; 