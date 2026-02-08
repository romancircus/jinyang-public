#!/bin/bash
#
# execute-manual.sh - Manually trigger jinyang execution for an issue
# Usage: ./scripts/execute-manual.sh <issue-id>
# Example: ./scripts/execute-manual.sh ROM-123

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${PROJECT_DIR}/dist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -eq 0 ]; then
    echo -e "${RED}Error: Issue ID required${NC}"
    echo "Usage: $0 <issue-id>"
    echo "Example: $0 ROM-123"
    exit 1
fi

ISSUE_ID="$1"

echo -e "${YELLOW}[Manual Trigger]${NC} Executing issue: $ISSUE_ID"

# Check if built
cd "$PROJECT_DIR"

if [ ! -d "$DIST_DIR" ]; then
    echo -e "${YELLOW}Building project first...${NC}"
    npm run build
fi

# Check if compiled files exist
if [ ! -f "$DIST_DIR/src/linear/client.js" ] || [ ! -f "$DIST_DIR/src/orchestrator/index.js" ]; then
    echo -e "${YELLOW}Compiled files not found, rebuilding...${NC}"
    npm run build
fi

# Create a temporary Node.js script to execute
TEMP_SCRIPT=$(mktemp /tmp/jinyang-manual-XXXXXX.mjs)

cat > "$TEMP_SCRIPT" << 'EOF'
import { LinearClient } from './dist/src/linear/client.js';
import { createOrchestrator } from './dist/src/orchestrator/index.js';

async function executeIssue(issueId) {
  try {
    const linearClient = new LinearClient();
    const orchestrator = createOrchestrator();

    await orchestrator.initialize();

    console.log(`[Manual] Fetching issue ${issueId} from Linear...`);
    const issue = await linearClient.getIssue(issueId);

    console.log(`[Manual] Issue: ${issue.identifier} - ${issue.title}`);
    console.log(`[Manual] State: ${issue.state.name}`);
    console.log(`[Manual] Labels: ${issue.labels?.join(', ') || 'none'}`);

    console.log(`[Manual] Starting execution...`);
    const result = await orchestrator.processIssue({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      labels: issue.labels,
    });

    if (result.success) {
      console.log(`[Manual] Execution completed successfully!`);
      console.log(`[Manual] Commit: ${result.commitSha || 'none'}`);
      console.log(`[Manual] Files: ${result.filesCreated.length}`);
    } else {
      console.error(`[Manual] Execution failed: ${result.error}`);
      process.exit(1);
    }
    process.exit(0);
  } catch (error) {
    console.error(`[Manual] Execution failed:`, error);
    process.exit(1);
  }
}

const issueId = process.argv[2];
if (!issueId) {
  console.error('Error: Issue ID required');
  process.exit(1);
}

executeIssue(issueId);
EOF

# Run the script
echo -e "${YELLOW}[Manual]${NC} Loading orchestrator and fetching issue..."

cd "$PROJECT_DIR"
node "$TEMP_SCRIPT" "$ISSUE_ID" 2>&1

EXIT_CODE=$?

# Cleanup
rm -f "$TEMP_SCRIPT"

if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}[Manual]${NC} Issue $ISSUE_ID executed successfully"
else
    echo -e "${RED}[Manual]${NC} Issue $ISSUE_ID execution failed (exit code: $EXIT_CODE)"
    exit $EXIT_CODE
fi
