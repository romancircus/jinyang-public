#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

if [ ! -f "dist/provider/health-daemon.js" ]; then
  echo "Building health daemon..."
  npm run build
fi

node dist/provider/health-daemon.js "$@"