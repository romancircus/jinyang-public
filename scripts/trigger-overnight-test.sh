#!/bin/bash
#
# Overnight Batch Test - Trigger 5 jinyang issues in sequence
# Usage: ./scripts/trigger-overnight-test.sh
#

set -e

JINYANG_URL="http://localhost:3000/webhooks/test"
ISSUES=("ROM-324" "ROM-325" "ROM-326" "ROM-327" "ROM-328")

echo "========================================"
echo "Jinyang Overnight Batch Test"
echo "========================================"
echo "Issues: ${#ISSUES[@]}"
echo "Estimated time: $((${#ISSUES[@]} * 5)) minutes"
echo "========================================"
echo ""

for issue in "${ISSUES[@]}"; do
    echo "Triggering $issue..."
    
    curl -s -X POST "$JINYANG_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"data\": {
                \"identifier\": \"$issue\",
                \"title\": \"Overnight Test: $issue\",
                \"description\": \"Overnight batch test execution for $issue\",
                \"labels\": { \"nodes\": [{ \"name\": \"jinyang\" }, { \"name\": \"repo:jinyang\" }] }
            }
        }" > /dev/null
    
    if [ $? -eq 0 ]; then
        echo "  ✓ $issue triggered successfully"
    else
        echo "  ✗ $issue failed to trigger"
    fi
    
    # Small delay between triggers
    sleep 2
done

echo ""
echo "========================================"
echo "All issues triggered!"
echo "Monitor with: journalctl --user-unit=jinyang -f"
echo "Check Linear for real-time status"
echo "========================================"
