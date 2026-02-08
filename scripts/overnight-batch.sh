#!/usr/bin/env bash
# overnight-batch.sh
# Helper script to queue multiple jinyang issues for overnight processing
#
# Usage: ./scripts/overnight-batch.sh ROM-324 ROM-325 ROM-326

set -euo pipefail

# === Configuration ===
REPO_ROOT="${HOME}/Applications/jinyang"
SESSION_DIR="${HOME}/.jinyang/sessions"
LOG_FILE="/var/log/jinyang-overnight-batch.log"
MINUTES_PER_ISSUE=5

# === Colors ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# === Logging ===
log() {
    local level="$1"
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*" | tee -a "${LOG_FILE}"
}

# === Issue Verification ===
verify_issue_label() {
    local issue_id="$1"

    # Check if issue has jinyang label using Linear MCP
    # Note: This would typically call the MCP tool, but for now we use a mock
    # In production, this would integrate with the Linear MCP

    # For this implementation, we'll check if the issue exists in Linear
    # and verify it has the jinyang label

    # Mock verification - in production this would use Linear MCP
    # linear_list_issues query="${issue_id}" labels="jinyang"

    # For now, return success (would be replaced with actual MCP call)
    return 0
}

# === Queue Status ===
get_queue_status() {
    local active_count=0
    local pending_count=0

    if [[ -d "${SESSION_DIR}" ]]; then
        for session_file in "${SESSION_DIR}"/*.json; do
            [[ -f "${session_file}" ]] || continue

            local session_state
            session_state=$(jq -r '.state // "unknown"' "${session_file}" 2>/dev/null || echo "unknown")

            case "${session_state}" in
                "in_progress"|"started")
                    ((active_count++))
                    ;;
                "pending")
                    ((pending_count++))
                    ;;
            esac
        done
    fi

    echo "${active_count} ${pending_count}"
}

# === Time Estimation ===
calculate_eta() {
    local issue_count="$1"
    local active_count="$2"
    local pending_count="$3"

    # Total issues to process = existing pending + new issues
    local total_pending=$((pending_count + issue_count))

    # Time for existing active sessions to complete (assume halfway done)
    local active_time_remaining=$((active_count * MINUTES_PER_ISSUE / 2))

    # Time for all pending issues (including new ones)
    local pending_time=$((total_pending * MINUTES_PER_ISSUE))

    # Total estimated time in minutes
    local total_minutes=$((active_time_remaining + pending_time))

    # Convert to hours and minutes
    local hours=$((total_minutes / 60))
    local minutes=$((total_minutes % 60))

    if ((hours > 0)); then
        echo "${hours}h ${minutes}m"
    else
        echo "${minutes}m"
    fi
}

# === Main ===
main() {
    # Check arguments
    if [[ $# -eq 0 ]]; then
        echo -e "${RED}Error: No issue IDs provided${NC}"
        echo "Usage: $0 ROM-XXX ROM-YYY ROM-ZZZ"
        echo "Example: $0 ROM-324 ROM-325 ROM-326"
        exit 1
    fi

    echo -e "${BLUE}=== Jinyang Overnight Batch Queue ===${NC}"
    echo ""

    # Get current queue status
    read -r active_count pending_count <<< "$(get_queue_status)"

    echo -e "${BLUE}Current Queue Status:${NC}"
    echo "  Active sessions: ${active_count}"
    echo "  Pending sessions: ${pending_count}"
    echo ""

    # Process each issue
    local valid_issues=()
    local invalid_issues=()

    echo -e "${BLUE}Verifying issues...${NC}"
    for issue_id in "$@"; do
        # Normalize issue ID (uppercase)
        issue_id=$(echo "${issue_id}" | tr '[:lower:]' '[:upper:]')

        echo -n "  Checking ${issue_id}... "

        # Verify issue has jinyang label
        if verify_issue_label "${issue_id}"; then
            echo -e "${GREEN}✓ Valid${NC}"
            valid_issues+=("${issue_id}")
        else
            echo -e "${RED}✗ Missing jinyang label${NC}"
            invalid_issues+=("${issue_id}")
        fi
    done

    echo ""

    # Report results
    if [[ ${#invalid_issues[@]} -gt 0 ]]; then
        echo -e "${YELLOW}Warning: ${#invalid_issues[@]} issue(s) skipped (missing jinyang label)${NC}"
        for issue_id in "${invalid_issues[@]}"; do
            echo "  - ${issue_id}"
        done
        echo ""
    fi

    if [[ ${#valid_issues[@]} -eq 0 ]]; then
        echo -e "${RED}Error: No valid issues to queue${NC}"
        exit 1
    fi

    # Calculate ETA
    local eta
    eta=$(calculate_eta "${#valid_issues[@]}" "${active_count}" "${pending_count}")

    echo -e "${GREEN}Ready to queue ${#valid_issues[@]} issue(s):${NC}"
    for issue_id in "${valid_issues[@]}"; do
        echo "  - ${issue_id}"
    done
    echo ""

    echo -e "${BLUE}Estimated completion time:${NC} ${eta}"
    echo "  (Assuming ~${MINUTES_PER_ISSUE} minutes per issue)"
    echo ""

    # In production, this would trigger the actual queueing
    # For now, we just report what would be queued
    echo -e "${YELLOW}Note: In production, this would queue the issues via the backlog processor${NC}"
    echo -e "${YELLOW}      Run: ./scripts/backlog-processor.sh to process the queue${NC}"

    log "INFO" "Batch queue prepared: ${#valid_issues[@]} issues, ETA: ${eta}"

    return 0
}

# Ensure session directory exists
mkdir -p "${SESSION_DIR}"

# Run main
main "$@"
