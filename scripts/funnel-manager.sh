#!/bin/bash
# Funnel management script for jinyang

FUNNEL_CMD="/usr/bin/tailscale funnel 3001"

case "$1" in
  start)
    if pgrep -f "$FUNNEL_CMD" > /dev/null; then
      echo "Funnel already running"
      exit 0
    fi
    echo "Starting Tailscale funnel..."
    sudo nohup $FUNNEL_CMD > /tmp/tailscale-funnel.log 2>&1 &
    sleep 2
    if pgrep -f "$FUNNEL_CMD" > /dev/null; then
      echo "Funnel started successfully"
    else
      echo "Funnel failed to start"
      exit 1
    fi
    ;;
  stop)
    echo "Stopping Tailscale funnel..."
    pkill -f "$FUNNEL_CMD"
    ;;
  status)
    if pgrep -f "$FUNNEL_CMD" > /dev/null; then
      echo "Funnel is running"
      ps aux | grep "$FUNNEL_CMD" | grep -v grep
    else
      echo "Funnel is not running"
    fi
    ;;
  restart)
    $0 stop
    sleep 2
    $0 start
    ;;
  *)
    echo "Usage: $0 {start|stop|status|restart}"
    exit 1
    ;;
esac