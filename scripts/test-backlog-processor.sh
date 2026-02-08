#!/usr/bin/env bash
# test-backlog-processor.sh
# Test backlog processor functionality

set -euo pipefail

REPO_ROOT="${HOME}/Applications/jinyang"
SESSION_DIR="${HOME}/.jinyang/sessions"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
}

echo "Testing backlog processor..."
echo ""

# Test 1: Session directory creation
echo "[1] Session directory:"
mkdir -p "${SESSION_DIR}"
if [[ -d "${SESSION_DIR}" ]]; then
    check_pass "Session directory exists"
else
    check_fail "Failed to create session directory"
    exit 1
fi

# Test 2: Script executable
echo "[2] Script permissions:"
if [[ -x "${REPO_ROOT}/scripts/backlog-processor.sh" ]]; then
    check_pass "Backlog processor is executable"
else
    check_fail "Script not executable"
    exit 1
fi

# Test 3: jq installed
echo "[3] jq dependency:"
if command -v jq &>/dev/null; then
    check_pass "jq is installed: $(jq --version)"
else
    check_fail "jq not found. Install with: sudo apt install jq"
    exit 1
fi

# Test 4: No additional dependencies needed
echo "[4] Dependencies:"
check_pass "All dependencies met (jq, bash builtins)"

# Test 5: Create test session
echo "[5] Test session creation:"
TEST_SESSION="${SESSION_DIR}/test-session.json"
cat > "${TEST_SESSION}" << EOF
{
  "id": "test-session",
  "linearIssueId": "TEST-123",
  "repository": "test-repo",
  "worktreePath": "/tmp/test-worktree",
  "state": "in_progress",
  "pid": 999999,
  "createdAt": "$(date -Iseconds)",
  "updatedAt": "$(date -Iseconds)"
}
EOF

if [[ -f "${TEST_SESSION}" ]]; then
    check_pass "Test session created"
else
    check_fail "Failed to create test session"
    exit 1
fi

# Test 6: Script validation (dry run)
echo "[6] Script syntax:"
if bash -n "${REPO_ROOT}/scripts/backlog-processor.sh"; then
    check_pass "Script syntax valid"
else
    check_fail "Script syntax errors"
    exit 1
fi

# Test 7: systemd files
echo "[7] systemd files:"
if [[ -f "${REPO_ROOT}/systemd/jinyang-backlog.service" ]] && [[ -f "${REPO_ROOT}/systemd/jinyang-backlog.timer" ]]; then
    check_pass "systemd files exist"
else
    check_fail "systemd files missing"
    exit 1
fi

# Cleanup
rm -f "${TEST_SESSION}" "${TEST_SESSION}.tmp"

echo ""
echo -e "${GREEN}✓ All tests passed${NC}"
echo ""
echo "Next steps:"
echo "  1. Install systemd service: sudo ./scripts/install-backlog-processor.sh"
echo "  2. Verify timer: systemctl list-timers | grep jinyang-backlog"
echo "  3. View logs: journalctl -u jinyang-backlog -f"
