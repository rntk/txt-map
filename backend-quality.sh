#!/bin/bash
# Helper script to run strict backend quality checks directly in-container when
# possible, otherwise in the compose-backed test environment.
# Usage:
#   ./backend-quality.sh
#   ./backend-quality.sh --lint-only
#   ./backend-quality.sh --coverage-only
#   ./backend-quality.sh --mutation-only
#   ./backend-quality.sh --no-coverage
#   ./backend-quality.sh --rebuild

set -euo pipefail

usage() {
    cat <<'EOF'
Usage: ./backend-quality.sh [--lint-only|--coverage-only|--mutation-only] [--no-coverage] [--rebuild] [python-target...]

Options:
  --lint-only      Run the strict backend Ruff quality profile only.
  --coverage-only  Run backend tests with coverage and print the total metric only.
  --mutation-only  Run mutmut mutation testing only.
  --no-coverage    Skip the backend coverage metric during the full quality run.
  --rebuild        Rebuild the backend test image before running.

Examples:
  ./backend-quality.sh
  ./backend-quality.sh --lint-only
  ./backend-quality.sh --coverage-only
  ./backend-quality.sh --mutation-only
  ./backend-quality.sh --no-coverage
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
RUN_COVERAGE=true
RUN_MUTATION=true
TARGETS=()

for arg in "$@"; do
    case "$arg" in
        --rebuild)
            REBUILD=true
            ;;
        --lint-only)
            RUN_COVERAGE=false
            RUN_MUTATION=false
            ;;
        --coverage-only)
            RUN_LINT=false
            RUN_MUTATION=false
            ;;
        --mutation-only)
            RUN_LINT=false
            RUN_COVERAGE=false
            ;;
        --no-coverage)
            RUN_COVERAGE=false
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

    if $RUN_COVERAGE; then
        COVERAGE_LOG="$(mktemp)"
        COVERAGE_JSON="$(mktemp --suffix=.json)"
        if ! pytest --tb=short --cov=. --cov-report=json:"$COVERAGE_JSON" >"$COVERAGE_LOG" 2>&1; then
            echo "Backend coverage tests failed. Relevant output:" >&2
            grep -E "FAILED|ERROR|=+.*(failed|error)|short test summary|Traceback" "$COVERAGE_LOG" >&2 || true
            tail -n 40 "$COVERAGE_LOG" >&2
            rm -f "$COVERAGE_LOG" "$COVERAGE_JSON"
            exit 1
        fi
        python - "$COVERAGE_JSON" <<'PY'
import json
import sys
from pathlib import Path

coverage_path: Path = Path(sys.argv[1])
data: dict[str, object] = json.loads(coverage_path.read_text())
totals: dict[str, float] = data["totals"]  # type: ignore[assignment]
covered_lines: int = int(totals["covered_lines"])
num_statements: int = int(totals["num_statements"])
percent_covered: float = float(totals["percent_covered"])
print(f"Backend coverage: {percent_covered:.2f}% lines ({covered_lines}/{num_statements})")
PY
        rm -f "$COVERAGE_LOG" "$COVERAGE_JSON"
    fi

    if $RUN_MUTATION; then
        MUTMUT_LOG="$(mktemp)"
        rm -rf mutants
        if ! mutmut run >"$MUTMUT_LOG" 2>&1; then
            echo "Backend mutation testing failed. Relevant output:" >&2
            grep -E "failed|error|survived|timeout|suspicious" "$MUTMUT_LOG" >&2 || true
            tail -n 40 "$MUTMUT_LOG" >&2
            rm -rf mutants
            rm -f "$MUTMUT_LOG"
            exit 1
        fi
        MUTMUT_RESULTS="$(mutmut results)"
        rm -rf mutants
        rm -f "$MUTMUT_LOG"
        if [ -n "$MUTMUT_RESULTS" ]; then
            echo "$MUTMUT_RESULTS"
            exit 1
        fi
        echo "Backend mutation: passed"
    fi
}

run_direct=false
if { ! $RUN_LINT || command -v ruff >/dev/null 2>&1; } &&
    { ! $RUN_COVERAGE || command -v pytest >/dev/null 2>&1; } &&
    { ! $RUN_MUTATION || command -v mutmut >/dev/null 2>&1; }; then
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
    sh -lc "$(declare -p RUN_LINT RUN_COVERAGE RUN_MUTATION TARGETS QUALITY_RULES); $(declare -f run_quality); run_quality"
