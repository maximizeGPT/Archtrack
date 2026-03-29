#!/bin/bash
#
# ArchTrack Backup Script
# Automated backup for ArchTrack database and configuration
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Function to create backup
create_backup() {
    echo -e "${YELLOW}💾 Creating backup...${NC}"
    
    BACKUP_FILE="$BACKUP_DIR/archtrack_backup_$TIMESTAMP.tar.gz"
    
    # Create temporary directory for backup files
    TEMP_DIR=$(mktemp -d)
    
    # Backup database from Docker volume
    if docker ps | grep -q archtrack-admin; then
        echo -e "${YELLOW}📦 Backing up database...${NC}"
        docker run --rm -v archtrack_archtrack-data:/data -v "$TEMP_DIR:/backup" alpine \
            cp /data/archtrack.db /backup/ 2>/dev/null || true
    fi
    
    # Backup configuration files
    echo -e "${YELLOW}⚙️  Backing up configuration...${NC}"
    cp .env "$TEMP_DIR/" 2>/dev/null || true
    cp -r deployment "$TEMP_DIR/" 2>/dev/null || true
    
    # Create archive
    tar -czf "$BACKUP_FILE" -C "$TEMP_DIR" .
    
    # Cleanup temp directory
    rm -rf "$TEMP_DIR"
    
    echo -e "${GREEN}✅ Backup created: $BACKUP_FILE${NC}"
    
    # Show backup size
    ls -lh "$BACKUP_FILE"
}

# Function to restore backup
restore_backup() {
    local BACKUP_FILE="$1"
    
    if [ -z "$BACKUP_FILE" ]; then
        echo -e "${RED}❌ Please specify backup file to restore${NC}"
        echo "Usage: $0 --restore <backup-file>"
        exit 1
    fi
    
    if [ ! -f "$BACKUP_FILE" ]; then
        echo -e "${RED}❌ Backup file not found: $BACKUP_FILE${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}⚠️  Restoring from backup: $BACKUP_FILE${NC}"
    echo -e "${RED}⚠️  This will overwrite current data!${NC}"
    read -p "Are you sure? (yes/no): " CONFIRM
    
    if [ "$CONFIRM" != "yes" ]; then
        echo -e "${YELLOW}❌ Restore cancelled${NC}"
        exit 0
    fi
    
    # Create temporary directory
    TEMP_DIR=$(mktemp -d)
    
    # Extract backup
    echo -e "${YELLOW}📦 Extracting backup...${NC}"
    tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"
    
    # Stop services
    echo -e "${YELLOW}🛑 Stopping services...${NC}"
    docker-compose -f deployment/docker-compose.yml down 2>/dev/null || true
    
    # Restore database
    if [ -f "$TEMP_DIR/archtrack.db" ]; then
        echo -e "${YELLOW}💾 Restoring database...${NC}"
        docker run --rm -v archtrack_archtrack-data:/data -v "$TEMP_DIR:/backup" alpine \
            cp /backup/archtrack.db /data/
    fi
    
    # Restore configuration
    if [ -f "$TEMP_DIR/.env" ]; then
        echo -e "${YELLOW}⚙️  Restoring configuration...${NC}"
        cp "$TEMP_DIR/.env" ./
    fi
    
    # Cleanup
    rm -rf "$TEMP_DIR"
    
    # Restart services
    echo -e "${YELLOW}🚀 Restarting services...${NC}"
    docker-compose -f deployment/docker-compose.yml up -d
    
    echo -e "${GREEN}✅ Restore complete!${NC}"
}

# Function to list backups
list_backups() {
    echo -e "${YELLOW}📋 Available backups:${NC}"
    ls -lht "$BACKUP_DIR"/archtrack_backup_*.tar.gz 2>/dev/null || echo "No backups found"
}

# Function to cleanup old backups
cleanup_backups() {
    echo -e "${YELLOW}🧹 Cleaning up backups older than $RETENTION_DAYS days...${NC}"
    find "$BACKUP_DIR" -name "archtrack_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete
    echo -e "${GREEN}✅ Cleanup complete${NC}"
}

# Main
main() {
    case "${1:-}" in
        --restore)
            restore_backup "$2"
            ;;
        --list)
            list_backups
            ;;
        --cleanup)
            cleanup_backups
            ;;
        *)
            create_backup
            ;;
    esac
}

main "$@"
