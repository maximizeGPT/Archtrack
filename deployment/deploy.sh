#!/bin/bash
#
# ArchTrack Deployment Script
# One-command deployment for ArchTrack Employee Tracking System
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_TYPE="${1:-docker}"

echo -e "${GREEN}🚀 ArchTrack Deployment Script${NC}"
echo "================================"
echo ""

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}📋 Checking prerequisites...${NC}"
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker is not installed${NC}"
        echo "Install Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}❌ Docker Compose is not installed${NC}"
        echo "Install Docker Compose: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Prerequisites met${NC}"
    echo ""
}

# Setup environment
setup_environment() {
    echo -e "${YELLOW}⚙️  Setting up environment...${NC}"
    
    cd "$PROJECT_DIR"
    
    if [ ! -f .env ]; then
        echo -e "${YELLOW}📝 Creating .env file from template...${NC}"
        cp deployment/.env.example .env
        echo -e "${YELLOW}⚠️  Please edit .env file with your configuration${NC}"
        echo "   Then run this script again."
        exit 0
    fi
    
    # Load environment variables
    export $(grep -v '^#' .env | xargs)
    
    echo -e "${GREEN}✅ Environment configured${NC}"
    echo ""
}

# Deploy with Docker Compose
deploy_docker() {
    echo -e "${YELLOW}🐳 Deploying with Docker Compose...${NC}"
    
    cd "$PROJECT_DIR"
    
    # Build and start services
    docker-compose -f deployment/docker-compose.yml down 2>/dev/null || true
    docker-compose -f deployment/docker-compose.yml up -d --build
    
    # Wait for health check
    echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
    sleep 10
    
    # Check if service is running
    if docker ps | grep -q archtrack-admin; then
        echo -e "${GREEN}✅ ArchTrack is running!${NC}"
        echo ""
        echo -e "${GREEN}🌐 Access your dashboard:${NC}"
        echo "   Local: http://localhost:${PORT:-3000}"
        echo "   Network: http://$(hostname -I | awk '{print $1}'):${PORT:-3000}"
        echo ""
        echo -e "${GREEN}📊 Default credentials:${NC}"
        echo "   Username: ${ADMIN_USERNAME:-admin}"
        echo "   Password: ${ADMIN_PASSWORD:-changeme}"
        echo ""
        echo -e "${YELLOW}⚠️  Change default password after first login!${NC}"
    else
        echo -e "${RED}❌ Deployment failed. Check logs:${NC}"
        echo "   docker-compose -f deployment/docker-compose.yml logs"
        exit 1
    fi
}

# Deploy locally (for development)
deploy_local() {
    echo -e "${YELLOW}💻 Deploying locally...${NC}"
    
    cd "$PROJECT_DIR/admin"
    
    # Install dependencies
    npm install
    
    # Build
    npm run build
    
    # Start
    npm start &
    
    echo -e "${GREEN}✅ ArchTrack is running locally!${NC}"
    echo "   URL: http://localhost:3000"
}

# Show logs
show_logs() {
    echo -e "${YELLOW}📜 Showing logs (Ctrl+C to exit)...${NC}"
    docker-compose -f "$PROJECT_DIR/deployment/docker-compose.yml" logs -f
}

# Backup data
backup_data() {
    echo -e "${YELLOW}💾 Creating backup...${NC}"
    
    BACKUP_DIR="$PROJECT_DIR/backups"
    mkdir -p "$BACKUP_DIR"
    
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/archtrack_backup_$TIMESTAMP.tar.gz"
    
    # Backup database volume
    docker run --rm -v archtrack_archtrack-data:/data -v "$BACKUP_DIR:/backup" alpine \
        tar czf "/backup/archtrack_backup_$TIMESTAMP.tar.gz" -C /data .
    
    echo -e "${GREEN}✅ Backup created: $BACKUP_FILE${NC}"
}

# Main execution
main() {
    case "$DEPLOYMENT_TYPE" in
        docker|--docker)
            check_prerequisites
            setup_environment
            deploy_docker
            ;;
        local|--local)
            deploy_local
            ;;
        logs|--logs)
            show_logs
            ;;
        backup|--backup)
            backup_data
            ;;
        *)
            echo "Usage: $0 [docker|local|logs|backup]"
            echo ""
            echo "Options:"
            echo "  docker  - Deploy with Docker Compose (default)"
            echo "  local   - Deploy locally for development"
            echo "  logs    - Show service logs"
            echo "  backup  - Create data backup"
            exit 1
            ;;
    esac
}

main
