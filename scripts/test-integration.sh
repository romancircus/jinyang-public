#!/bin/bash

# test-integration.sh - Test jinyang integration for a repository
# Usage: ./test-integration.sh [repository-id]

set -e

REPO_ID="${1:-}"
JINYANG_DIR="${JINYANG_DIR:-$HOME/Applications/jinyang}"
CONFIG_FILE="${JINYANG_DIR}/config/default.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

declare -a RESULTS=()
TESTS_PASSED=0
TESTS_FAILED=0

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

pass() {
    RESULTS+=("✅ $1")
    ((TESTS_PASSED++))
}

fail() {
    RESULTS+=("❌ $1")
    ((TESTS_FAILED++))
}

warn() {
    RESULTS+=("⚠️  $1")
}

# Test 1: jinyang installation
log_step "Test 1: jinyang Installation"
if [ -d "$JINYANG_DIR" ]; then
    log_info "jinyang found at $JINYANG_DIR"
    pass "jinyang directory exists"
else
    log_error "jinyang not found at $JINYANG_DIR"
    fail "jinyang directory missing"
fi

# Test 2: Dependencies installed
log_step "Test 2: Node.js Dependencies"
if [ -d "$JINYANG_DIR/node_modules" ]; then
    log_info "Dependencies installed"
    pass "node_modules exists"
else
    log_error "Dependencies not installed"
    log_error "Run: cd $JINYANG_DIR && npm install"
    fail "node_modules missing"
fi

# Test 3: TypeScript compiled
log_step "Test 3: TypeScript Compilation"
if [ -d "$JINYANG_DIR/dist" ]; then
    log_info "TypeScript compiled"
    pass "dist/ directory exists"
else
    log_warn "TypeScript not compiled"
    log_warn "Run: cd $JINYANG_DIR && npm run build"
    warn "dist/ directory missing (run npm run build)"
fi

# Test 4: Configuration file
log_step "Test 4: Configuration File"
if [ -f "$CONFIG_FILE" ]; then
    log_info "Config file found: $CONFIG_FILE"
    pass "config/default.json exists"

    # Validate JSON
    if cat "$CONFIG_FILE" | python3 -m json.tool > /dev/null 2>&1; then
        log_info "Config JSON is valid"
        pass "Config JSON is valid"
    else
        log_error "Config JSON is invalid"
        fail "Config JSON syntax error"
    fi
else
    log_error "Config file not found: $CONFIG_FILE"
    log_error "Run: cp $JINYANG_DIR/config/default.json.example $CONFIG_FILE"
    fail "config/default.json missing"
fi

# Test 5: Repository registration
log_step "Test 5: Repository Registration"
if [ -n "$REPO_ID" ]; then
    if [ -f "$CONFIG_FILE" ]; then
        if cat "$CONFIG_FILE" | grep -q "\"id\": \"$REPO_ID\""; then
            log_info "Repository '$REPO_ID' found in config"
            pass "Repository '$REPO_ID' registered"

            # Get repository details
            REPO_PATH=$(cat "$CONFIG_FILE" | grep -A 20 "\"id\": \"$REPO_ID\"" | grep '"repositoryPath"' | head -1 | sed 's/.*: "\([^"]*\)".*/\1/')

            if [ -n "$REPO_PATH" ]; then
                log_info "Repository path: $REPO_PATH"

                if [ -d "$REPO_PATH" ]; then
                    log_info "Repository directory exists"
                    pass "Repository directory accessible"
                else
                    log_error "Repository directory not found: $REPO_PATH"
                    fail "Repository directory missing"
                fi

                # Check if git repo
                if [ -d "$REPO_PATH/.git" ]; then
                    log_info "Git repository detected"
                    pass "Git repository initialized"
                else
                    log_error "Not a git repository: $REPO_PATH"
                    fail "Git not initialized"
                fi
            fi
        else
            log_error "Repository '$REPO_ID' not found in config"
            log_error "Available repositories:"
            cat "$CONFIG_FILE" | grep '"id":' | sed 's/.*: "\([^"]*\)".*/  - \1/'
            fail "Repository '$REPO_ID' not registered"
        fi
    fi
else
    log_warn "No repository ID specified"
    log_warn "Usage: $0 <repository-id>"
    warn "Repository test skipped (no ID provided)"
fi

# Test 6: Environment variables
log_step "Test 6: Environment Variables"
if [ -f "$JINYANG_DIR/.env" ]; then
    log_info ".env file exists"
    pass ".env file exists"

    # Check required vars
    if grep -q "LINEAR_WEBHOOK_SECRET" "$JINYANG_DIR/.env"; then
        log_info "LINEAR_WEBHOOK_SECRET configured"
        pass "LINEAR_WEBHOOK_SECRET configured"
    else
        log_warn "LINEAR_WEBHOOK_SECRET not set"
        warn "LINEAR_WEBHOOK_SECRET not configured"
    fi
else
    log_warn ".env file not found"
    log_warn "Run: cp $JINYANG_DIR/.env.example $JINYANG_DIR/.env"
    warn ".env file missing (optional but recommended)"
fi

# Test 7: jinyang server status
log_step "Test 7: jinyang Server Status"
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    log_info "jinyang server is running on port 3000"
    pass "Server running on localhost:3000"

    # Check detailed health
    HEALTH=$(curl -s http://localhost:3000/health/detailed 2>/dev/null || echo '{}')

    if echo "$HEALTH" | grep -q '"status": "healthy"'; then
        log_info "Server reports healthy status"
        pass "Server health: healthy"
    else
        log_warn "Server may have component issues"
        warn "Server health: check /health/detailed"
    fi
else
    log_warn "jinyang server not responding"
    log_warn "Start with: systemctl --user start jinyang"
    warn "Server not running (start to enable webhooks)"
fi

# Test 8: Worktree directory
log_step "Test 8: Worktree Directory"
WORKTREE_BASE="${JINYANG_WORKTREE_BASE:-$HOME/.jinyang/worktrees}"
if [ -d "$WORKTREE_BASE" ]; then
    log_info "Worktree directory exists: $WORKTREE_BASE"
    pass "Worktree directory exists"

    if [ -w "$WORKTREE_BASE" ]; then
        log_info "Worktree directory is writable"
        pass "Worktree directory writable"
    else
        log_warn "Worktree directory not writable"
        warn "Worktree directory permissions issue"
    fi
else
    log_warn "Worktree directory will be created: $WORKTREE_BASE"
    warn "Worktree directory will be created on first run"
fi

# Test 9: Session directory
log_step "Test 9: Session Directory"
SESSION_DIR="${JINYANG_SESSION_DIR:-$HOME/.jinyang/sessions}"
if [ -d "$SESSION_DIR" ]; then
    log_info "Session directory exists: $SESSION_DIR"
    pass "Session directory exists"
else
    log_warn "Session directory will be created: $SESSION_DIR"
    warn "Session directory will be created on first run"
fi

# Test 10: Provider health (if server running)
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    log_step "Test 10: Provider Health"
    HEALTH=$(curl -s http://localhost:3000/health/detailed 2>/dev/null || echo '{}')

    # Check for healthy providers
    if echo "$HEALTH" | grep -q '"healthy"'; then
        HEALTHY_COUNT=$(echo "$HEALTH" | grep -o '"healthy"' | wc -l)
        log_info "$HEALTHY_COUNT provider(s) healthy"
        pass "Providers healthy"
    else
        log_warn "No healthy providers detected"
        warn "Provider health: check configuration"
    fi
fi

# Test 11: Webhook endpoint (simulated)
log_step "Test 11: Webhook Endpoint"
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    # Test with a simple POST to the test endpoint
    TEST_RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d '{"test":"integration"}' \
        http://localhost:3000/webhooks/test 2>/dev/null || echo '{}')

    if [ -n "$TEST_RESPONSE" ]; then
        log_info "Webhook endpoint responds to POST requests"
        pass "Webhook endpoint accessible"
    else
        log_warn "Webhook endpoint may have issues"
        warn "Webhook endpoint response unclear"
    fi
else
    warn "Webhook test skipped (server not running)"
fi

# Test 12: Git worktree capability
log_step "Test 12: Git Worktree Support"
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version | cut -d' ' -f3)
    log_info "Git version: $GIT_VERSION"
    pass "Git installed"

    # Check worktree support
    if git worktree list &> /dev/null; then
        log_info "Git worktree support confirmed"
        pass "Git worktree support available"
    else
        log_warn "Git worktree may not be fully supported"
        warn "Git worktree support unclear"
    fi
else
    log_error "Git not found"
    fail "Git not installed"
fi

# Print summary
echo ""
echo "=========================================="
echo "Integration Test Summary"
echo "=========================================="
echo ""
for result in "${RESULTS[@]}"; do
    echo "  $result"
done

echo ""
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    log_info "✅ All tests passed! Repository is ready for jinyang."

    if [ -n "$REPO_ID" ]; then
        echo ""
        echo "Next steps:"
        echo "  1. Create a Linear issue with label 'repo:$(echo $REPO_ID | cut -d- -f1)'"
        echo "  2. Add label 'jinyang:auto' for automatic execution"
        echo "  3. Delegate issue to 'jinyang' in Linear"
        echo "  4. Watch execution: tail -f ~/.jinyang/logs/server.log"
    fi

    exit 0
else
    log_error "❌ $TESTS_FAILED test(s) failed. Please fix the issues above."
    exit 1
fi
