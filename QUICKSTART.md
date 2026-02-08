# jinyang - Quick Start

## Setup Complete

jinyang is now running with:
- **HTTP Server**: Port 3001
- **Systemd Service**: `jinyang.service` (enabled, auto-start on boot)
- **Tailscale Funnel**: HTTPS access at `https://your-server.example.com`
- **Webhook**: `/webhooks/linear` accepting Linear webhooks

## Current Status

```bash
# Check jinyang status
systemctl --user status jinyang

# Check funnel status
~/Applications/jinyang/scripts/funnel-manager.sh status

# Test health endpoint
curl https://your-server.example.com/health
```

## Funnel Management (Manual Required)

The Tailscale Funnel requires sudo, so systemd cannot auto-manage it. Use the funnel-manager script:

```bash
# Start funnel
~/Applications/jinyang/scripts/funnel-manager.sh start

# Stop funnel
~/Applications/jinyang/scripts/funnel-manager.sh stop

# Check status
~/Applications/jinyang/scripts/funnel-manager.sh status
```

**Note:** You must manually start the funnel after boot, or add `~/Applications/jinyang/scripts/funnel-manager.sh start` to your startup scripts.

## Testing Webhooks

```bash
# Run webhook test
~/Applications/jinyang/scripts/test-webhook.sh
```

## Linear Integration

1. Add webhook URL to Linear: `https://your-server.example.com/webhook`
2. Set Webhook Secret: `lin_wh_your-webhook-secret`
3. Delegate issues to `jinyang` to trigger execution

## Logs

```bash
# jinyang logs
journalctl -f --user-unit=jinyang.service

# Funnel logs
tail -f /tmp/tailscale-funnel.log
```

## Troubleshooting

**jinyang not starting:**
```bash
systemctl --user restart jinyang
systemctl --user status jinyang
```

**Funnel not working:**
```bash
sudo /usr/bin/tailscale funnel 3001
# Check for "Access denied" and ensure operator permissions
sudo tailscale set --operator=$USER
```
