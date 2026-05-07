#!/bin/bash
# Helper script to run strict backend quality checks directly in-container when
# possible, otherwise in the compose-backed test environment.
# Usage:
#   ./backend-quality.sh
#   ./backend-quality.sh --lint-only
#   ./backend-quality.sh --mutation-only
#   ./backend-quality.sh --rebuild

set -euo pipefail

usage() {
    cat <<'EOF'
Usage: ./backend-quality.sh [--lint-only|--mutation-only] [--rebuild] [python-target...]

Options:
  --lint-only      Run the strict backend Ruff quality profile only.
  --mutation-only  Run mutmut mutation testing only.
  --rebuild        Rebuild the backend test image before running.

Examples:
  ./backend-quality.sh
  ./backend-quality.sh --lint-only
  ./backend-quality.sh --mutation-only
  ./backend-quality.sh --rebuild
  ./backend-quality.sh main.py
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.test.yml"

export PATH="$HOME/.local/bin:$PATH"

REBUILD=false
RUN_LINT=true
RUN_MUTATION=true
TARGETS=()

for arg in "$@"; do
    case "$arg" in
        --rebuild)
            REBUILD=true
            ;;
        --lint-only)
            RUN_MUTATION=false
            ;;
        --mutation-only)
            RUN_LINT=false
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            TARGETS+=("$arg")
            ;;
    esac
done

if [ ${#TARGETS[@]} -eq 0 ]; then
    TARGETS=(main.py)
fi

QUALITY_RULES=(
    E
    F
    ANN
    C901
    PLR0911
    PLR0912
    PLR0913
    PLR0915
)

run_quality() {
    if $RUN_LINT; then
        ruff check "${TARGETS[@]}" --select "$(IFS=,; echo "${QUALITY_RULES[*]}")" --preview
    fi

    if $RUN_MUTATION; then
        rm -rf mutants
        mutmut run
        MUTMUT_RESULTS="$(mutmut results)"
        rm -rf mutants
        if [ -n "$MUTMUT_RESULTS" ]; then
            echo "$MUTMUT_RESULTS"
            exit 1
        fi
    fi
}

run_direct=false
if command -v ruff >/dev/null 2>&1 && command -v mutmut >/dev/null 2>&1; then
    if [ -f "/.dockerenv" ]; then
        run_direct=true
    elif ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
        run_direct=true
    fi
fi

if $run_direct; then
    if $REBUILD; then
        echo "--rebuild is ignored in direct mode." >&2
    fi
    (cd "$PROJECT_DIR" && PYTHONPATH="$PROJECT_DIR${PYTHONPATH:+:$PYTHONPATH}" run_quality)
    exit 0
fi

if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
else
    echo "Neither direct backend quality dependencies nor Docker Compose are available." >&2
    exit 1
fi

if $REBUILD; then
    echo "Rebuilding backend test image..."
    "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" build tests
fi

"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" run --rm tests \
    sh -lc "$(declare -p RUN_LINT RUN_MUTATION TARGETS QUALITY_RULES); $(declare -f run_quality); run_quality"
