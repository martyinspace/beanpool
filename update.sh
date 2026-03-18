#!/bin/bash
# BeanPool Node Self-Update Script
# Pulls latest image from GHCR and restarts the container.
# This runs on the HOST, triggered by a signal file from the container.
# Usage: Place in cron or systemd timer to watch for /data/.update-requested

set -e

BEANPOOL_DIR="${BEANPOOL_DIR:-/home/azureuser/BeanPool}"
DATA_DIR="${BEANPOOL_DIR}/data"
SIGNAL_FILE="${DATA_DIR}/.update-requested"
LOG_FILE="${DATA_DIR}/update.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check if update was requested
if [ ! -f "$SIGNAL_FILE" ]; then
    exit 0
fi

log "Update signal detected. Starting update..."

# Safety: Check disk space (abort if >= 95% full)
DISK_USAGE=$(df --output=pcent / | tail -1 | tr -d ' %')
if [ "$DISK_USAGE" -ge 95 ]; then
    log "ERROR: Disk usage is ${DISK_USAGE}%. Aborting update to prevent bricking."
    log "Free up disk space and try again."
    rm -f "$SIGNAL_FILE"
    exit 1
fi

log "Disk usage: ${DISK_USAGE}% (safe to proceed)"

# Remove signal file so we don't loop
rm -f "$SIGNAL_FILE"

# Pull latest image from GHCR and restart
cd "$BEANPOOL_DIR"
log "Pulling latest image from GHCR..."
docker compose -p beanpool pull 2>&1 | tee -a "$LOG_FILE"

log "Restarting container..."
docker compose -p beanpool up -d 2>&1 | tee -a "$LOG_FILE"

log "Update complete!"
