#!/bin/bash

# validate-issue.sh - Validate a Linear issue is ready for jinyang execution
# Usage: ./validate-issue.sh ROM-XXX

set -e

ISSUE_ID="${1:-}"
JINYANG_DIR="${JINYANG_DIR:-$HOME/Applications/jinyang}"
CONFIG_FILE="${JINYANG_DIR}/config/default.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validation checks
declare -a CHECKS=()
declare -a ERRORS=()

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check 1: Issue ID provided
if [ -z "$ISSUE_ID" ]; then
    log_error "Usage: $0 ROM-XXX"
    echo "Example: $0 ROM-123"
    exit 1
fi

# Check 2: Issue ID format
if [[ ! $ISSUE_ID =~ ^ROM-[0-9]+$ ]]; then
    log_error "Invalid issue ID format: $ISSUE_ID"
    log_error "Expected format: ROM-XXX (e.g., ROM-123)"
    exit 1
fi

log_info "Validating issue $ISSUE_ID for jinyang execution..."

# Check 3: jinyang installed
if [ ! -d "$JINYANG_DIR" ]; then
    log_error "jinyang not found at $JINYANG_DIR"
    log_error "Please install jinyang first"
    exit 1
fi

# Check 4: Config exists
if [ ! -f "$CONFIG_FILE" ]; then
    log_error "Config file not found: $CONFIG_FILE"
    log_error "Run: cp config/default.json.example config/default.json"
    exit 1
fi

# Check 5: jinyang server running
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
    log_warn "jinyang server not responding on localhost:3000"
    log_warn "Make sure jinyang is running: systemctl --user status jinyang"
    CHECKS+=("⚠️  Server status: Not running (optional)")
else
    log_info "jinyang server is running"
    CHECKS+=("✅ Server status: Running")
fi

# Check 6: Issue exists in Linear (requires LINEAR_API_TOKEN)
if [ -n "$LINEAR_API_TOKEN" ]; then
    log_info "Checking Linear for issue $ISSUE_ID..."

    # GraphQL query to fetch issue
    QUERY='{"query": "query { issues(filter: { identifier: { eq: \"'$ISSUE_ID'\" } }) { nodes { id identifier title state { name } labels { nodes { name } } } } }"}'

    RESPONSE=$(curl -s -X POST \
        -H "Authorization: $LINEAR_API_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$QUERY" \
        https://api.linear.app/graphql 2>/dev/null || echo '{}')

    if echo "$RESPONSE" | grep -q "$ISSUE_ID"; then
        log_info "Issue $ISSUE_ID found in Linear"

        # Check for jinyang label
        if echo "$RESPONSE" | grep -q "jinyang"; then
            log_info "✅ Issue has jinyang label/delegate"
            CHECKS+=("✅ Linear issue: Found with jinyang label")
        else
            log_warn "Issue found but no jinyang label detected"
            log_warn "Add label: jinyang:auto (for auto-execution) or jinyang:manual (for manual)"
            CHECKS+=("⚠️  Linear issue: Found but missing jinyang label")
        fi

        # Check for routing label
        REPO_LABELS=$(cat "$CONFIG_FILE" | grep -o '"routingLabels":\s*\[[^]]*\]' | grep -o '"repo:[^"]*"' | sed 's/"//g' | sort -u)

        HAS_REPO_LABEL=false
        for LABEL in $REPO_LABELS; do
            if echo "$RESPONSE" | grep -q "$LABEL"; then
                log_info "✅ Issue has routing label: $LABEL"
                HAS_REPO_LABEL=true
                CHECKS+=("✅ Routing label: $LABEL")
                break
            fi
        done

        if [ "$HAS_REPO_LABEL" = false ]; then
            log_warn "Issue missing routing label (repo:XXX)"
            log_warn "Available labels in config:"
            echo "$REPO_LABELS" | while read -r label; do
                log_warn "  - $label"
            done
            CHECKS+=("⚠️  Routing label: Missing (optional but recommended)")
        fi

    else
        log_error "Issue $ISSUE_ID not found in Linear"
        log_error "Make sure the issue exists and LINEAR_API_TOKEN is set"
        exit 1
    fi
else
    log_warn "LINEAR_API_TOKEN not set - skipping Linear API validation"
    log_warn "To enable Linear validation, set: export LINEAR_API_TOKEN=lin_api_..."
    CHECKS+=("⏭️  Linear check: Skipped (no API token)")
fi

# Check 7: Worktree directory exists and is writable
WORKTREE_BASE="${JINYANG_WORKTREE_BASE:-$HOME/.jinyang/worktrees}"
if [ -d "$WORKTREE_BASE" ]; then
    if [ -w "$WORKTREE_BASE" ]; then
        log_info "Worktree directory is ready: $WORKTREE_BASE"
        CHECKS+=("✅ Worktree directory: Writable")
    else
        log_error "Worktree directory not writable: $WORKTREE_BASE"
        log_error "Run: chmod 755 $WORKTREE_BASE"
        exit 1
    fi
else
    log_warn "Worktree directory doesn't exist, will be created: $WORKTREE_BASE"
    CHECKS+=("⚠️  Worktree directory: Will be created on first run")
fi

# Check 8: Session directory
SESSION_DIR="${JINYANG_SESSION_DIR:-$HOME/.jinyang/sessions}"
if [ -d "$SESSION_DIR" ]; then
    log_info "Session directory exists: $SESSION_DIR"
    CHECKS+=("✅ Session directory: Ready")
else
    log_warn "Session directory will be created: $SESSION_DIR"
    CHECKS+=("⚠️  Session directory: Will be created on first run")
fi

# Check 9: Provider health (if server is running)
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    log_info "Checking provider health..."
    HEALTH=$(curl -s http://localhost:3000/health/detailed 2>/dev/null || echo '{}')

    if echo "$HEALTH" | grep -q "healthy"; then
        log_info "✅ Providers are healthy"
        CHECKS+=("✅ Provider health: Healthy")
    else
        log_warn "Some providers may be unhealthy"
        CHECKS+=("⚠️  Provider health: Check /health/detailed endpoint")
    fi
fi

# Print summary
echo ""
echo "=========================================="
echo "Validation Summary for $ISSUE_ID"
echo "=========================================="
for check in "${CHECKS[@]}"; do
    echo "  $check"
done

echo ""
if [ ${#ERRORS[@]} -eq 0 ]; then
    log_info "✅ Issue $ISSUE_ID is ready for jinyang execution!"
    echo ""
    echo "Next steps:"
    echo "  1. Issue is labeled with 'jinyang:auto' or 'jinyang:manual'"
    echo "  2. Issue is delegated to 'jinyang' in Linear"
    echo "  3. Webhook will trigger automatic execution (for auto mode)"
    echo "  4. Or run manually: ./scripts/execute-manual.sh $ISSUE_ID"
    exit 0
else
    log_error "❌ Issue $ISSUE_ID has validation errors"
    for error in "${ERRORS[@]}"; do
        log_error "  - $error"
    done
    exit 1
fi
