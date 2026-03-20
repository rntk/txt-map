#!/bin/bash
# Helper script to run frontend tests directly in-container when possible,
# otherwise in Docker with fast one-shot defaults.
# Usage:
#   ./frontend-test.sh                           # Run all frontend tests once
#   ./frontend-test.sh src/App.test.jsx          # Run a specific test target
#   ./frontend-test.sh --coverage
#   ./frontend-test.sh --rebuild src/utils/test

set -euo pipefail

usage() {
    cat <<'EOF'
Usage: ./frontend-test.sh [--coverage] [--rebuild] [test-target...]

Options:
  --coverage  Run with coverage enabled.
  --rebuild   Rebuild the frontend test image and refresh cached dependencies.

Examples:
  ./frontend-test.sh
  ./frontend-test.sh src/App.test.jsx
  ./frontend-test.sh --coverage
  ./frontend-test.sh --rebuild src/components
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
FRONTEND_DIR="$PROJECT_DIR/frontend"
IMAGE_NAME="frontend-tests"
NODE_MODULES_VOLUME="frontend-test-node_modules"

REBUILD=false
COVERAGE=false
TARGETS=()

for arg in "$@"; do
    case "$arg" in
        --rebuild)
            REBUILD=true
            ;;
        --coverage)
            COVERAGE=true
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

TEST_ARGS=(--watchAll=false)
if $COVERAGE; then
    TEST_ARGS+=(--coverage)
fi
if [ ${#TARGETS[@]} -gt 0 ]; then
    TEST_ARGS+=("${TARGETS[@]}")
fi

run_direct=false
if command -v npm >/dev/null 2>&1; then
    if [ -f "/.dockerenv" ]; then
        run_direct=true
    elif ! command -v docker >/dev/null 2>&1; then
        run_direct=true
    fi
fi

if $run_direct; then
    if $REBUILD; then
        echo "--rebuild is ignored in direct mode." >&2
    fi
    if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        echo "Installing frontend dependencies..."
        (cd "$FRONTEND_DIR" && npm ci)
    fi
    (cd "$FRONTEND_DIR" && npm test -- "${TEST_ARGS[@]}")
    exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "Neither direct npm nor Docker is available to run frontend tests." >&2
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
    npm test -- "${TEST_ARGS[@]}"
