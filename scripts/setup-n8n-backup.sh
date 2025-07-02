#!/bin/bash

# FlowGenius N8n Backup Integration Setup Script
# This script automates the setup of n8n backup integration

set -e

echo "🚀 FlowGenius N8n Backup Integration Setup"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check Node.js
    if command_exists node; then
        NODE_VERSION=$(node --version)
        print_success "Node.js found: $NODE_VERSION"
    else
        print_error "Node.js is required but not installed. Please install Node.js first."
        exit 1
    fi
    
    # Check npm
    if command_exists npm; then
        NPM_VERSION=$(npm --version)
        print_success "npm found: $NPM_VERSION"
    else
        print_error "npm is required but not installed."
        exit 1
    fi
    
    # Check PostgreSQL
    if command_exists psql; then
        PSQL_VERSION=$(psql --version | head -n1)
        print_success "PostgreSQL found: $PSQL_VERSION"
    else
        print_warning "PostgreSQL not found. You'll need to install it manually."
        echo "  macOS: brew install postgresql"
        echo "  Ubuntu: sudo apt-get install postgresql postgresql-contrib"
        echo "  Windows: Download from https://www.postgresql.org/download/windows/"
    fi
}

# Install n8n
install_n8n() {
    print_info "Installing n8n..."
    
    if command_exists n8n; then
        print_success "n8n is already installed"
        N8N_VERSION=$(n8n --version 2>/dev/null || echo "unknown")
        print_info "Version: $N8N_VERSION"
    else
        print_info "Installing n8n globally..."
        npm install -g n8n
        if [ $? -eq 0 ]; then
            print_success "n8n installed successfully"
        else
            print_error "Failed to install n8n. You may need to run with sudo or check npm permissions."
            exit 1
        fi
    fi
}

# Setup database
setup_database() {
    print_info "Setting up PostgreSQL database..."
    
    # Check if PostgreSQL is running
    if ! pgrep -x "postgres" > /dev/null; then
        print_warning "PostgreSQL is not running. Attempting to start it..."
        
        # Try different methods to start PostgreSQL
        if command_exists brew; then
            brew services start postgresql || true
        elif command_exists systemctl; then
            sudo systemctl start postgresql || true
        elif command_exists service; then
            sudo service postgresql start || true
        fi
        
        sleep 3
        
        if ! pgrep -x "postgres" > /dev/null; then
            print_warning "Could not automatically start PostgreSQL. Please start it manually."
            return 1
        fi
    fi
    
    print_success "PostgreSQL is running"
    
    # Create database
    print_info "Creating database 'flowgenius_backups'..."
    
    if createdb flowgenius_backups 2>/dev/null; then
        print_success "Database created successfully"
    else
        print_warning "Database may already exist or creation failed"
    fi
    
    # Import schema
    if [ -f "database/schema.sql" ]; then
        print_info "Importing database schema..."
        if psql flowgenius_backups < database/schema.sql; then
            print_success "Schema imported successfully"
        else
            print_error "Failed to import schema"
            return 1
        fi
    else
        print_error "Schema file not found: database/schema.sql"
        print_info "Please ensure you're running this script from the FlowGenius root directory"
        return 1
    fi
}

# Create backup directories
create_directories() {
    print_info "Creating backup directories..."
    
    mkdir -p backups
    mkdir -p logs/n8n
    
    print_success "Directories created"
}

# Generate configuration
generate_config() {
    print_info "Generating n8n configuration..."
    
    cat > n8n-config.env << EOF
# N8n Configuration for FlowGenius
N8N_HOST=localhost
N8N_PORT=5678
N8N_PROTOCOL=http

# Database Configuration
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=localhost
DB_POSTGRESDB_PORT=5432
DB_POSTGRESDB_DATABASE=flowgenius_backups
DB_POSTGRESDB_USER=\${USER}
DB_POSTGRESDB_PASSWORD=

# Security (optional)
N8N_BASIC_AUTH_ACTIVE=false
N8N_BASIC_AUTH_USER=
N8N_BASIC_AUTH_PASSWORD=

# Logging
N8N_LOG_LEVEL=info
N8N_LOG_OUTPUT=console,file
N8N_LOG_FILE_LOCATION=logs/n8n/

# Webhook settings
WEBHOOK_URL=http://localhost:5678/webhook
EOF
    
    print_success "Configuration file created: n8n-config.env"
}

# Start n8n and import workflows
setup_workflows() {
    print_info "Setting up n8n workflows..."
    
    print_info "Starting n8n in background..."
    
    # Start n8n with configuration
    if [ -f "n8n-config.env" ]; then
        source n8n-config.env
        export $(cut -d= -f1 n8n-config.env)
    fi
    
    # Start n8n in background
    nohup n8n start > logs/n8n/n8n.log 2>&1 &
    N8N_PID=$!
    
    print_info "Waiting for n8n to start (PID: $N8N_PID)..."
    sleep 10
    
    # Check if n8n is running
    if ! kill -0 $N8N_PID 2>/dev/null; then
        print_error "n8n failed to start. Check logs/n8n/n8n.log for details."
        return 1
    fi
    
    # Test n8n health
    for i in {1..30}; do
        if curl -s http://localhost:5678/healthz > /dev/null 2>&1; then
            print_success "n8n is running and healthy"
            break
        fi
        if [ $i -eq 30 ]; then
            print_error "n8n failed to respond after 30 seconds"
            return 1
        fi
        sleep 1
    done
    
    print_info "n8n is ready for workflow import"
    print_info "🌐 Open http://localhost:5678 to import workflows manually"
    print_info "Import these files in order:"
    print_info "  1. n8n-workflows/backup-workflow.json"
    print_info "  2. n8n-workflows/restore-workflow.json"
    print_info "  3. n8n-workflows/list-backups-workflow.json"
    
    # Save PID for later cleanup
    echo $N8N_PID > .n8n.pid
}

# Create startup script
create_startup_script() {
    print_info "Creating startup script..."
    
    cat > start-n8n.sh << 'EOF'
#!/bin/bash
# FlowGenius N8n Startup Script

if [ -f "n8n-config.env" ]; then
    source n8n-config.env
    export $(cut -d= -f1 n8n-config.env)
fi

mkdir -p logs/n8n

echo "Starting n8n for FlowGenius backup integration..."
n8n start
EOF
    
    chmod +x start-n8n.sh
    print_success "Startup script created: start-n8n.sh"
}

# Main setup function
main() {
    echo
    print_info "Starting setup process..."
    echo
    
    check_prerequisites
    echo
    
    install_n8n
    echo
    
    create_directories
    echo
    
    generate_config
    echo
    
    if setup_database; then
        echo
        setup_workflows
        echo
        create_startup_script
        echo
        
        print_success "🎉 Setup completed successfully!"
        echo
        print_info "Next steps:"
        echo "  1. Open http://localhost:5678 in your browser"
        echo "  2. Import the workflow files from n8n-workflows/ directory"
        echo "  3. Configure PostgreSQL credentials in n8n"
        echo "  4. Start FlowGenius with: npm start"
        echo
        print_info "To start n8n later: ./start-n8n.sh"
        print_info "To stop n8n: kill \$(cat .n8n.pid) (if running in background)"
        echo
    else
        print_error "Database setup failed. Please check PostgreSQL installation and try again."
        exit 1
    fi
}

# Cleanup function
cleanup() {
    if [ -f ".n8n.pid" ]; then
        N8N_PID=$(cat .n8n.pid)
        if kill -0 $N8N_PID 2>/dev/null; then
            print_info "Stopping n8n (PID: $N8N_PID)..."
            kill $N8N_PID
            rm .n8n.pid
        fi
    fi
}

# Handle script interruption
trap cleanup EXIT INT TERM

# Check if running from correct directory
if [ ! -f "package.json" ] || ! grep -q "flowgenius" package.json; then
    print_error "Please run this script from the FlowGenius project root directory"
    exit 1
fi

# Parse command line arguments
case "${1:-setup}" in
    "setup")
        main
        ;;
    "cleanup")
        cleanup
        print_success "Cleanup completed"
        ;;
    "start")
        if [ -f "start-n8n.sh" ]; then
            ./start-n8n.sh
        else
            print_error "Setup not completed. Run './setup-n8n-backup.sh setup' first"
        fi
        ;;
    *)
        echo "Usage: $0 [setup|cleanup|start]"
        echo "  setup   - Run full setup process (default)"
        echo "  cleanup - Clean up running processes"
        echo "  start   - Start n8n with saved configuration"
        exit 1
        ;;
esac 