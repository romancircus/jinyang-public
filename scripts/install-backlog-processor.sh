#!/usr/bin/env bash
# install-backlog-processor.sh
# Install systemd service and timer for backlog processor

set -euo pipefail

REPO_ROOT="${HOME}/Applications/jinyang"
SERVICE_DIR="${REPO_ROOT}/systemd"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (use sudo)"
    exit 1
fi

# Validate files
log_info "Validating files..."

for file in "${SERVICE_DIR}/jinyang-backlog.service" "${SERVICE_DIR}/jinyang-backlog.timer"; do
    if [[ ! -f "${file}" ]]; then
        log_error "Required file not found: ${file}"
        exit 1
    fi
done

if [[ ! -x "${REPO_ROOT}/scripts/backlog-processor.sh" ]]; then
    log_error "Backlog processor script not found or not executable"
    exit 1
fi

# Copy systemd files
log_info "Installing systemd service and timer..."

cp "${SERVICE_DIR}/jinyang-backlog.service" /etc/systemd/system/
cp "${SERVICE_DIR}/jinyang-backlog.timer" /etc/systemd/system/

# Reload systemd daemon
log_info "Reloading systemd daemon..."
systemctl daemon-reload

# Enable timer
log_info "Enabling timer..."
systemctl enable jinyang-backlog.timer

# Start timer
log_info "Starting timer..."
systemctl start jinyang-backlog.timer

# Show status
log_info "Service status:"
systemctl status jinyang-backlog.service --no-pager || true

log_info "Timer status:"
systemctl list-timers --no-pager | grep jinyang-backlog || true

log_info ""
log_info "✓ Installation complete"
log_info "  - Service: /etc/systemd/system/jinyang-backlog.service"
log_info "  - Timer: /etc/systemd/system/jinyang-backlog.timer"
log_info "  - Runs: Every 15 minutes"
log_info ""
log_info "To manually run the processor:"
log_info "  sudo systemctl start jinyang-backlog.service"
log_info ""
log_info "To view logs:"
log_info "  journalctl -u jinyang-backlog -f"
