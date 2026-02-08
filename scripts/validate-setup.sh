#!/bin/bash
# jinyang Setup Validation Script
# Run this before starting the server to ensure everything is configured correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track overall status
ALL_PASS=true
WARNINGS=0

print_header() {
    echo -e "\n${BLUE}════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
}

print_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

print_fail() {
    echo -e "${RED}✗${NC} $1"
    ALL_PASS=false
}

print_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

# Check 1: Node.js version
print_header "1. Node.js Version"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    
    if [ "$NODE_MAJOR" -ge 22 ]; then
        print_pass "Node.js $NODE_VERSION (>= 22 required)"
    else
        print_fail "Node.js $NODE_VERSION (>= 22 required)"
    fi
else
    print_fail "Node.js not found"
fi

# Check 2: npm
print_header "2. Package Manager"
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    print_pass "npm $NPM_VERSION"
else
    print_fail "npm not found"
fi

# Check 3: Git
print_header "3. Git Installation"
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version | cut -d' ' -f3)
    print_pass "Git $GIT_VERSION"
else
    print_fail "Git not found (required for worktree operations)"
fi

# Check 4: Environment variables
print_header "4. Environment Configuration"

if [ -f .env ]; then
    print_pass ".env file exists"
    source .env 2>/dev/null || true
else
    print_warn ".env file not found (using environment directly)"
fi

REQUIRED_VARS=("LINEAR_WEBHOOK_SECRET")
OPTIONAL_VARS=("OPENCODE_API_KEY" "KIMI_API_KEY" "CLAUDE_CODE_ACCESS_TOKEN" "CLAUDE_CODE_API_KEY")

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        print_fail "$var not set (REQUIRED)"
    else
        print_pass "$var is set"
    fi
done

for var in "${OPTIONAL_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        print_warn "$var not set (optional)"
    else
        print_pass "$var is set"
    fi
done

# Check 5: Directory structure
print_header "5. Directory Structure"

JINYANG_DIR="$HOME/.jinyang"
WORKTREE_DIR="$JINYANG_DIR/worktrees"
LOGS_DIR="$JINYANG_DIR/logs"
SESSIONS_DIR="$JINYANG_DIR/sessions"

if [ -d "$JINYANG_DIR" ]; then
    print_pass "~/.jinyang directory exists"
else
    print_warn "~/.jinyang directory does not exist (will be created on startup)"
fi

if [ -d "$WORKTREE_DIR" ]; then
    print_pass "Worktree directory exists"
else
    print_warn "Worktree directory does not exist (will be created on startup)"
fi

if [ -d "$LOGS_DIR" ]; then
    print_pass "Logs directory exists"
else
    print_warn "Logs directory does not exist (will be created on startup)"
fi

if [ -d "$SESSIONS_DIR" ]; then
    print_pass "Sessions directory exists"
else
    print_warn "Sessions directory does not exist (will be created on startup)"
fi

# Check 6: Dependencies
print_header "6. Dependencies"

if [ -d "node_modules" ]; then
    print_pass "node_modules exists"
else
    print_fail "node_modules not found - run 'npm install'"
fi

# Check TypeScript compilation
echo "  Checking TypeScript compilation..."
if npm run typecheck > /tmp/tsc-check.log 2>&1; then
    print_pass "TypeScript compiles without errors"
else
    print_fail "TypeScript compilation errors found"
    echo "  Run 'npm run typecheck' for details"
fi

# Check 7: Configuration files
print_header "7. Configuration Files"

if [ -f "config/default.json" ]; then
    REPO_COUNT=$(grep -c '"id"' config/default.json 2>/dev/null || echo "0")
    print_pass "config/default.json exists ($REPO_COUNT repositories)"
else
    print_warn "config/default.json not found - routing will use defaults"
fi

if [ -f "tsconfig.json" ]; then
    print_pass "tsconfig.json exists"
else
    print_warn "tsconfig.json not found"
fi

# Check 8: Test suite
print_header "8. Test Suite"

echo "  Running test suite..."
if npm test > /tmp/test-run.log 2>&1; then
    TEST_COUNT=$(grep -oP '\d+ passing' /tmp/test-run.log | grep -oP '\d+' || echo "0")
    print_pass "All tests passing ($TEST_COUNT tests)"
else
    print_fail "Some tests failed"
    echo "  Run 'npm test' for details"
fi

# Check 9: Linting
print_header "9. Code Quality"

echo "  Running linter..."
if npm run lint > /tmp/lint-check.log 2>&1; then
    print_pass "No lint errors"
else
    WARN_COUNT=$(grep -oP '\d+ warnings' /tmp/lint-check.log | grep -oP '\d+' || echo "0")
    ERR_COUNT=$(grep -oP '\d+ errors' /tmp/lint-check.log | grep -oP '\d+' || echo "0")
    
    if [ "$ERR_COUNT" -gt 0 ]; then
        print_fail "$ERR_COUNT lint errors found"
    elif [ "$WARN_COUNT" -gt 0 ]; then
        print_warn "$WARN_COUNT lint warnings found"
    else
        print_pass "No lint issues"
    fi
fi

# Check 10: Provider status
print_header "10. Provider Configuration"

# Check if at least one provider is configured
if [ -n "$OPENCODE_API_KEY" ] || [ -n "$KIMI_API_KEY" ] || [ -n "$CLAUDE_CODE_ACCESS_TOKEN" ] || [ -n "$CLAUDE_CODE_API_KEY" ]; then
    print_pass "At least one AI provider is configured"
    
    [ -n "$OPENCODE_API_KEY" ] && print_pass "OpenCode GLM-4.7 configured"
    [ -n "$KIMI_API_KEY" ] && print_pass "Kimi K2.5 API configured"
    [ -n "$CLAUDE_CODE_ACCESS_TOKEN" ] && print_pass "Claude Code configured"
    [ -n "$CLAUDE_CODE_API_KEY" ] && print_pass "Claude Code API configured"
else
    print_fail "No AI providers configured - server will not be able to process tasks"
fi

# Summary
print_header "Validation Summary"

if $ALL_PASS; then
    echo -e "${GREEN}✓ All critical checks passed${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠ $WARNINGS warnings (non-critical)${NC}"
    fi
    echo -e "\n${GREEN}System is ready to start!${NC}"
    echo -e "Run: ${BLUE}npm start${NC}"
    exit 0
else
    echo -e "${RED}✗ Some checks failed${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠ $WARNINGS warnings${NC}"
    fi
    echo -e "\n${RED}Please fix the errors above before starting the server.${NC}"
    exit 1
fi
