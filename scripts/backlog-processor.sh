#!/usr/bin/env bash
# backlog-processor.sh
# Timer-based queue runner for recovering stalled/zombie sessions
# Runs every 15 minutes via systemd timer

set -euo pipefail

# === Configuration ===
REPO_ROOT="${HOME}/Applications/jinyang"
SESSION_DIR="${HOME}/.jinyang/sessions"
LOG_FILE="/var/log/jinyang-backlog.log"
MAX_CONCURRENT=27
SESSION_TIMEOUT_HOURS=2

# Ensure session directory exists
mkdir -p "${SESSION_DIR}"

# === Logging ===
log() {
    local level="$1"
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] $*" | tee -a "${LOG_FILE}"
}

# === Session State Checks ===
is_process_running() {
    local pid="$1"
    ps -p "${pid}" -o pid= >/dev/null 2>&1
}

is_zombie() {
    local pid="$1"
    local state
    state=$(ps -p "${pid}" -o state= 2>/dev/null || echo "")
    [[ "${state}" == "Z" ]]
}

session_age_hours() {
    local session_id="$1"
    local session_file="${SESSION_DIR}/${session_id}.json"

    if [[ ! -f "${session_file}" ]]; then
        echo 999
        return
    fi

    local created_at
    created_at=$(jq -r '.createdAt // empty' "${session_file}")

    if [[ -z "${created_at}" ]]; then
        echo 999
        return
    fi

    local created_sec
    created_sec=$(date -d "${created_at}" +%s 2>/dev/null || echo "0")

    if [[ "${created_sec}" == "0" ]]; then
        echo 999
        return
    fi

    local now_sec
    now_sec=$(date +%s)

    local age_sec=$((now_sec - created_sec))
    # Bash arithmetic: age in seconds / 3600 = hours
    if ((age_sec < 0)); then
        echo 999
        return
    fi

    local age_hours=$((age_sec / 3600))
    echo "${age_hours}"
}

# === Session Recovery ===
restart_session() {
    local session_id="$1"
    local session_file="${SESSION_DIR}/${session_id}.json"

    log "INFO" "Restarting session: ${session_id}"

    local linear_issue_id repository worktree_path
    linear_issue_id=$(jq -r '.linearIssueId // empty' "${session_file}")
    repository=$(jq -r '.repository // empty' "${session_file}")
    worktree_path=$(jq -r '.worktreePath // empty' "${session_file}")

    if [[ -z "${linear_issue_id}" || -z "${repository}" || -z "${worktree_path}" ]]; then
        log "ERROR" "Cannot restart ${session_id}: missing required fields"
        return 1
    fi

    # Update session state to pending for restart
    jq '.state = "pending" | .updatedAt = "'"$(date -Iseconds)"'"' "${session_file}" > "${session_file}.tmp"
    mv "${session_file}.tmp" "${session_file}"

    # Call scheduler to retry
    if [[ -x "${REPO_ROOT}/node_modules/.bin/ts-node" ]] && [[ -f "${REPO_ROOT}/src/session/scheduler.ts" ]]; then
        cd "${REPO_ROOT}"
        node -e "
            const scheduler = require('./dist/session/scheduler.js');
            async function main() {
                try {
                    await scheduler.retrySession('${session_id}');
                    console.log('Queued session for retry');
                } catch (error) {
                    console.error('Failed to queue session:', error.message);
                    process.exit(1);
                }
            }
            main();
            " >> "${LOG_FILE}" 2>&1
    else
        log "WARN" "Scheduler not available, marking session as pending"
    fi

    log "INFO" "Session ${session_id} queued for retry"
}

cleanup_dead_session() {
    local session_id="$1"
    local session_file="${SESSION_DIR}/${session_id}.json"
    local completion_reason="$2"

    log "INFO" "Cleaning up dead session: ${session_id} (${completion_reason})"

    # Archive session metadata
    local archive_dir="${SESSION_DIR}/archived"
    mkdir -p "${archive_dir}"

    jq "
        .state = \"ERROR\" |
        .completionReason = \"${completion_reason}\" |
        .completedAt = \"$(date -Iseconds)\" |
        .updatedAt = \"$(date -Iseconds)\"
    " "${session_file}" > "${archive_dir}/${session_id}.json"

    rm -f "${session_file}"
}

# === Main Processing Loop ===
main() {
    log "INFO" "Backlog processor started"

    # Count active sessions
    local active_count=0
    local stalled_count=0
    local zombie_count=0
    local completed_count=0

    for session_file in "${SESSION_DIR}"/*.json; do
        [[ -f "${session_file}" ]] || continue

        local session_id session_state pid linear_issue_id
        session_id=$(basename "${session_file}" .json)
        session_state=$(jq -r '.state // "unknown"' "${session_file}")
        pid=$(jq -r '.pid // empty' "${session_file}")
        linear_issue_id=$(jq -r '.linearIssueId // empty' "${session_file}")

        log "DEBUG" "Checking session: ${session_id} (state=${session_state})"

        case "${session_state}" in
            "in_progress"|"started")
                ((active_count++))

                if [[ -n "${pid}" ]] && [[ "${pid}" != "null" ]]; then
                    if is_process_running "${pid}"; then
                        # Check for zombie
                        if is_zombie "${pid}"; then
                            log "WARN" "Zombie process detected: pid=${pid}, session=${session_id}"
                            ((zombie_count++))
                            cleanup_dead_session "${session_id}" "zombie_process"
                        else
                            # Check if session is too old (stalled)
                            local age
                            age=$(session_age_hours "${session_id}")
                            if (( age > SESSION_TIMEOUT_HOURS )); then
                                log "WARN" "Stalled session detected: age=${age}h, session=${session_id}"
                                ((stalled_count++))
                                restart_session "${session_id}"
                            fi
                        fi
                    else
                        # Process dead but session still in_progress
                        log "WARN" "Dead process detected: pid=${pid}, session=${session_id}"
                        cleanup_dead_session "${session_id}" "process_died"
                    fi
                fi
                ;;

            "done")
                ((completed_count++))
                ;;

            "error")
                # Attempt to retry error sessions
                local age
                age=$(session_age_hours "${session_id}")
                if (( age < 1 )); then
                    # Only retry if less than 1 hour old
                    restart_session "${session_id}"
                fi
                ;;

            "pending")
                # Check if we have capacity to start
                if ((active_count < MAX_CONCURRENT)); then
                    log "INFO" "Starting pending session: ${session_id}"
                    # Scheduler will pick this up on next poll
                    ((active_count++))
                fi
                ;;
        esac
    done

    log "INFO" "Backlog processor completed: active=${active_count}, stalled=${stalled_count}, zombie=${zombie_count}, completed=${completed_count}"
}

# Check if another instance is running
if [[ -f "/tmp/.backlog-processor.lock" ]]; then
    lock_age=$(($(date +%s) - $(stat -c %Y /tmp/.backlog-processor.lock 2>/dev/null || echo "0")))
    if (( lock_age > 600 )); then # Remove stale lock after 10 minutes
        rm -f /tmp/.backlog-processor.lock
    else
        log "WARN" "Backlog processor already running (lock file exists)"
        exit 0
    fi
fi

# Create lock file
touch /tmp/.backlog-processor.lock

# Run main logic and cleanup
trap 'rm -f /tmp/.backlog-processor.lock' EXIT
main
