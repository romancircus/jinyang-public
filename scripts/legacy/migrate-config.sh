#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CYRUS_CONFIG="$HOME/.cyrus/config.json"
LOCAL_CONFIG="$PROJECT_ROOT/config/default.json"

echo "📥 Migrating Cyrus config to jinyang..."

if [ ! -f "$CYRUS_CONFIG" ]; then
    echo "❌ Cyrus config not found at $CYRUS_CONFIG"
    echo "   Make sure Cyrus is installed first."
    exit 1
fi

echo "📋 Reading Cyrus config..."
cp "$CYRUS_CONFIG" "$LOCAL_CONFIG"

echo "✅ Config migrated to $LOCAL_CONFIG"
echo ""
echo "⚠️  Review the migrated config and ensure:"
echo "   - All repository paths are correct"
echo "   - Linear workspace IDs are valid"
echo "   - Routing labels match your project structure"
echo ""
