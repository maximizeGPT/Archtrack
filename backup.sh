#!/bin/bash
# Backup script for ArchTrack

ARCHTRACK_DIR="/Users/mohlt/.openclaw/workspace/arch-firm-dashboard"
BACKUP_DIR="$ARCHTRACK_DIR/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="archtrack-backup-$DATE.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "Creating backup: $BACKUP_FILE"

cd "$ARCHTRACK_DIR"
tar -czf "$BACKUP_DIR/$BACKUP_FILE" \
    data/ \
    admin/data/ \
    logs/ \
    2>/dev/null || true

echo "Backup created: $BACKUP_DIR/$BACKUP_FILE"

# Keep only last 10 backups
ls -t "$BACKUP_DIR"/archtrack-backup-*.tar.gz | tail -n +11 | xargs rm -f 2>/dev/null || true

echo "Backup complete"
