#!/bin/bash
# Quick reference for Tailscale funnel setup

PORT=3000
SERVICE_NAME="jinyang"

echo "🌐 Setting up Tailscale funnel for webhook access..."
echo ""

# Check if Tailscale is installed
if ! command -v tailscale &> /dev/null; then
    echo "❌ Tailscale not installed. Install first:"
    echo "   curl -fsSL https://tailscale.com/install.sh | sh"
    exit 1
fi

# Start Tailscale funnel
echo "▶️  Starting Tailscale funnel on port $PORT..."
tailscale funnel $PORT

echo ""
echo "✅ Tailscale funnel running!"
echo "📋 Webhook URL: https://<your-tailscale-node>.ts.net:<webhook-path>"
echo ""
echo "🔧 To run this automatically, add to your ~/.config/systemd/user/tailscale-funnel.service:"
echo ""
cat << 'EOF'
[Unit]
Description=Tailscale Funnel
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/tailscale funnel 3000
Restart=always

[Install]
WantedBy=default.target
EOF