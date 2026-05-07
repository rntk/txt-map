#!/bin/bash
# Helper script to run strict frontend quality checks directly in-container when
# possible, otherwise in Docker with the same cached dependency volume as tests.
# Usage:
#   ./frontend-quality.sh
#   ./frontend-quality.sh --lint-only
#   ./frontend-quality.sh --mutation-only
#   ./frontend-quality.sh --rebuild

set -euo pipefail

usage() {
    cat <<'EOF'
Usage: ./frontend-quality.sh [--lint-only|--mutation-only] [--rebuild]

Options:
  --lint-only      Run the strict frontend ESLint quality profile only.
  --mutation-only  Run Stryker mutation testing only.
  --rebuild        Rebuild the frontend test image and refresh cached dependencies.

Examples:
  ./frontend-quality.sh
  ./frontend-quality.sh --lint-only
  ./frontend-quality.sh --mutation-only
  ./frontend-quality.sh --rebuild
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
FRONTEND_DIR="$PROJECT_DIR/frontend"
IMAGE_NAME="frontend-tests"
NODE_MODULES_VOLUME="frontend-test-node_modules"

export npm_config_cache="${npm_config_cache:-/tmp/frontend-quality-npm-cache}"

REBUILD=false
RUN_LINT=true
RUN_MUTATION=true

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
            echo "Unknown argument: $arg" >&2
            usage >&2
            exit 2
            ;;
    esac
done

run_direct=false
if command -v npm >/dev/null 2>&1; then
    if [ -f "/.dockerenv" ]; then
        run_direct=true
    elif ! command -v docker >/dev/null 2>&1; then
        run_direct=true
    fi
fi

run_quality() {
    if $RUN_LINT; then
        npm run quality:lint
    fi

    if $RUN_MUTATION; then
        if ! command -v ps >/dev/null 2>&1; then
            echo "Stryker requires the ps command. Install procps or run with Docker via --rebuild." >&2
            exit 1
        fi
        npm run quality:mutation
    fi
}

if $run_direct; then
    if $REBUILD; then
        echo "--rebuild is ignored in direct mode." >&2
    fi
    if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        echo "Installing frontend dependencies..."
        (cd "$FRONTEND_DIR" && npm ci)
    fi
    (cd "$FRONTEND_DIR" && run_quality)
    exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "Neither direct npm nor Docker is available to run frontend quality checks." >&2
    exit 1
fi

if $REBUILD || ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo "Building frontend test image..."
    docker build -f "$FRONTEND_DIR/Dockerfile.test" -t "$IMAGE_NAME" "$PROJECT_DIR"
fi

if $REBUILD && docker volume inspect "$NODE_MODULES_VOLUME" >/dev/null 2>&1; then
    docker volume rm -f "$NODE_MODULES_VOLUME" >/dev/null
fi

if ! docker volume inspect "$NODE_MODULES_VOLUME" >/dev/null 2>&1; then
    docker volume create "$NODE_MODULES_VOLUME" >/dev/null
    echo "Bootstrapping frontend dependencies..."
    docker run --rm \
        -v "$FRONTEND_DIR:/app/frontend" \
        -v "$NODE_MODULES_VOLUME:/app/frontend/node_modules" \
        -w /app/frontend \
        "$IMAGE_NAME" \
        npm ci
fi

docker run --rm \
    -v "$FRONTEND_DIR:/app/frontend" \
    -v "$NODE_MODULES_VOLUME:/app/frontend/node_modules" \
    -w /app/frontend \
    "$IMAGE_NAME" \
    sh -lc "$(declare -f run_quality); RUN_LINT=$RUN_LINT RUN_MUTATION=$RUN_MUTATION run_quality"
