#!/bin/bash
set -e

echo "=== Phase 3: Atomic Cutover ==="

# Step 1: Verify jinyang is configured for port 3456
echo "Verifying JINYANG_PORT..."
if grep -q "JINYANG_PORT=3456" ~/Applications/jinyang/.env; then
    echo "  JINYANG_PORT=3456 confirmed"
else
    echo "  ERROR: JINYANG_PORT is not 3456 in .env"
    exit 1
fi

# Step 2: Stop cyrus
echo "Stopping cyrus services..."
sudo systemctl stop cyrus-backlog.timer 2>/dev/null || echo "  cyrus-backlog.timer not found/running"
sudo systemctl stop cyrus.service 2>/dev/null || echo "  cyrus.service not found/running"
echo "  cyrus stopped"

# Step 3: Wait for port to free
echo "Waiting for port 3456 to free..."
for i in {1..10}; do
    if ! ss -tlnp | grep -q ":3456 "; then
        echo "  Port 3456 is free"
        break
    fi
    if [ "$i" -eq 10 ]; then
        echo "  TIMEOUT: Port 3456 still in use after 10s — rolling back"
        sudo systemctl start cyrus.service
        sudo systemctl start cyrus-backlog.timer
        exit 1
    fi
    sleep 1
done

# Step 4: Start jinyang on port 3456
echo "Starting jinyang..."
sudo systemctl start jinyang.service

# Step 5: Verify health
echo "Waiting for jinyang to start..."
sleep 5
if curl -sf http://localhost:3456/health > /dev/null 2>&1; then
    echo "  jinyang is healthy on port 3456"
else
    echo "  WARNING: /health not responding (may use different path)"
    # Check if process is running at all
    if systemctl is-active --quiet jinyang.service; then
        echo "  jinyang.service IS active (process running)"
    else
        echo "  FAILED — jinyang.service is not active, rolling back to cyrus"
        sudo systemctl start cyrus.service
        sudo systemctl start cyrus-backlog.timer 2>/dev/null || true
        exit 1
    fi
fi

# Step 6: Disable cyrus permanently
echo "Disabling cyrus services..."
sudo systemctl disable cyrus.service 2>/dev/null || true
sudo systemctl disable cyrus-backlog.timer 2>/dev/null || true

# Step 7: Enable jinyang
echo "Enabling jinyang services..."
sudo systemctl enable jinyang.service
sudo systemctl enable jinyang-backlog.timer

# Step 8: Start backlog timer
sudo systemctl start jinyang-backlog.timer

echo ""
echo "=== CUTOVER COMPLETE ==="
echo "jinyang is now the active agent on port 3456"
echo "cyrus services are disabled"
