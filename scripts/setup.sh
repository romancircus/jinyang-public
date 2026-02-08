#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="jinyang"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
PORT=3000

echo "🔧 Setting up jinyang webhook receiver..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root (use sudo)"
    exit 1
fi

# Build TypeScript
echo "📦 Building TypeScript..."
cd "$PROJECT_ROOT"
npm install
npm run build

# Copy systemd service file
echo "📝 Installing systemd service..."
cat > "$SERVICE_FILE" << 'EOF'
[Unit]
Description=jinyang Webhook Receiver
After=network.target

[Service]
Type=simple
User=%u
WorkingDirectory=%h/Applications/jinyang
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=jinyang

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
echo "🔄 Reloading systemd daemon..."
systemctl daemon-reload

echo "🚀 Enabling service to start on boot..."
systemctl enable "$SERVICE_NAME"

echo "📊 Configuring log rotation..."
if [ ! -f "/etc/logrotate.d/$SERVICE_NAME" ]; then
    cat > "/etc/logrotate.d/$SERVICE_NAME" << EOF
/var/log/$SERVICE_NAME/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
    sharedscripts
    postrotate
        systemctl reload $SERVICE_NAME > /dev/null 2>&1 || true
    endscript
}
EOF
fi

# Start service
echo "▶️  Starting service..."
systemctl start "$SERVICE_NAME"

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Service commands:"
echo "  Start:   sudo systemctl start $SERVICE_NAME"
echo "  Stop:    sudo systemctl stop $SERVICE_NAME"
echo "  Restart: sudo systemctl restart $SERVICE_NAME"
echo "  Status:  sudo systemctl status $SERVICE_NAME"
echo "  Logs:    sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "🌐 Tailscale funnel setup (run as your user):"
echo "  tailscale funnel 3000"
echo ""
