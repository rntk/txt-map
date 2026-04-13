#!/bin/bash
# Helper script to run lint and format commands directly in-container when
# possible, otherwise using Docker for backend tooling when needed.
# Usage:
#   ./lint.sh                    # Run all linters
#   ./lint.sh check backend      # Run only backend lint checks
#   ./lint.sh fix frontend       # Auto-fix frontend lint issues
#   ./lint.sh format             # Format backend and frontend code

set -euo pipefail

usage() {
    cat <<'EOF'
Usage: ./lint.sh [check|fix|format] [all|backend|frontend]

Defaults:
  action: check
  scope:  all

Examples:
  ./lint.sh
  ./lint.sh check backend
  ./lint.sh fix frontend
  ./lint.sh format
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
IMAGE_NAME="rss-tests"
FRONTEND_IMAGE_NAME="frontend-tests"
NODE_MODULES_VOLUME="frontend-test-node_modules"

ACTION="check"
SCOPE="all"
ACTION_SET=false
SCOPE_SET=false

for arg in "$@"; do
    case "$arg" in
        check|fix|format)
            if $ACTION_SET; then
                echo "Only one action may be specified." >&2
                usage >&2
                exit 1
            fi
            ACTION="$arg"
            ACTION_SET=true
            ;;
        all|backend|frontend)
            if $SCOPE_SET; then
                echo "Only one scope may be specified." >&2
                usage >&2
                exit 1
            fi
            SCOPE="$arg"
            SCOPE_SET=true
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $arg" >&2
            usage >&2
            exit 1
            ;;
    esac
done

ensure_backend_image() {
    if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
        echo "Building backend tooling image..."
        docker build -f "$PROJECT_DIR/Dockerfile.tests" -t "$IMAGE_NAME" "$PROJECT_DIR"
    fi
}

run_backend() {
    echo "=== Python $ACTION ==="

    run_direct=false
    if command -v ruff >/dev/null 2>&1; then
        if [ -f "/.dockerenv" ]; then
            run_direct=true
        elif ! command -v docker >/dev/null 2>&1; then
            run_direct=true
        fi
    fi

    if $run_direct; then
        echo "Running backend tooling directly..."
        case "$ACTION" in
            check)
                ruff check "$PROJECT_DIR"
                ;;
            fix)
                ruff check --fix "$PROJECT_DIR"
                ;;
            format)
                ruff format "$PROJECT_DIR"
                ;;
        esac
        return
    fi

    if command -v ruff >/dev/null 2>&1; then
        echo "Running backend tooling directly..."
        case "$ACTION" in
            check)
                ruff check "$PROJECT_DIR"
                ;;
            fix)
                ruff check --fix "$PROJECT_DIR"
                ;;
            format)
                ruff format "$PROJECT_DIR"
                ;;
        esac
        return
    fi

    if ! command -v docker >/dev/null 2>&1; then
        echo "Neither local ruff nor Docker is available to run backend linting." >&2
        exit 1
    fi

    ensure_backend_image

    echo "Running backend tooling via Docker..."
    case "$ACTION" in
        check)
            docker run --rm -v "$PROJECT_DIR:/app" -w /app "$IMAGE_NAME" ruff check /app
            ;;
        fix)
            docker run --rm -v "$PROJECT_DIR:/app" -w /app "$IMAGE_NAME" ruff check --fix /app
            ;;
        format)
            docker run --rm -v "$PROJECT_DIR:/app" -w /app "$IMAGE_NAME" ruff format /app
            ;;
    esac
}

ensure_frontend_dependencies() {
    run_direct=false
    if command -v npm >/dev/null 2>&1; then
        if [ -f "/.dockerenv" ]; then
            run_direct=true
        elif ! command -v docker >/dev/null 2>&1; then
            run_direct=true
        fi
    fi

    if $run_direct; then
        if [ ! -d "$PROJECT_DIR/frontend/node_modules" ]; then
            echo "Installing frontend dependencies directly..."
            (cd "$PROJECT_DIR/frontend" && npm ci)
        fi
        return
    fi

    if ! command -v docker >/dev/null 2>&1; then
        echo "Neither local npm nor Docker is available to run frontend linting." >&2
        exit 1
    fi

    if ! docker image inspect "$FRONTEND_IMAGE_NAME" >/dev/null 2>&1; then
        echo "Building frontend test image..."
        docker build -f "$PROJECT_DIR/frontend/Dockerfile.test" -t "$FRONTEND_IMAGE_NAME" "$PROJECT_DIR"
    fi

    if ! docker volume inspect "$NODE_MODULES_VOLUME" >/dev/null 2>&1; then
        docker volume create "$NODE_MODULES_VOLUME" >/dev/null
        echo "Bootstrapping frontend dependencies via Docker..."
        docker run --rm \
            -v "$PROJECT_DIR/frontend:/app/frontend" \
            -v "$NODE_MODULES_VOLUME:/app/frontend/node_modules" \
            -w /app/frontend \
            "$FRONTEND_IMAGE_NAME" \
            npm ci
    fi
}

run_frontend() {
    echo "=== Frontend $ACTION ==="

    ensure_frontend_dependencies

    run_direct=false
    if command -v npm >/dev/null 2>&1; then
        if [ -f "/.dockerenv" ]; then
            run_direct=true
        elif ! command -v docker >/dev/null 2>&1; then
            run_direct=true
        fi
    fi

    if $run_direct; then
        echo "Running frontend tooling directly..."
        case "$ACTION" in
            check)
                (cd "$PROJECT_DIR/frontend" && npm run lint)
                ;;
            fix)
                (cd "$PROJECT_DIR/frontend" && npm run lint:fix)
                ;;
            format)
                (cd "$PROJECT_DIR/frontend" && npm run format)
                ;;
        esac
    else
        echo "Running frontend tooling via Docker..."
        case "$ACTION" in
            check)
                docker run --rm \
                    -v "$PROJECT_DIR/frontend:/app/frontend" \
                    -v "$NODE_MODULES_VOLUME:/app/frontend/node_modules" \
                    -w /app/frontend \
                    "$FRONTEND_IMAGE_NAME" \
                    npm run lint
                ;;
            fix)
                docker run --rm \
                    -v "$PROJECT_DIR/frontend:/app/frontend" \
                    -v "$NODE_MODULES_VOLUME:/app/frontend/node_modules" \
                    -w /app/frontend \
                    "$FRONTEND_IMAGE_NAME" \
                    npm run lint:fix
                ;;
            format)
                docker run --rm \
                    -v "$PROJECT_DIR/frontend:/app/frontend" \
                    -v "$NODE_MODULES_VOLUME:/app/frontend/node_modules" \
                    -w /app/frontend \
                    "$FRONTEND_IMAGE_NAME" \
                    npm run format
                ;;
        esac
    fi
}

echo "Running tooling..."

if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "backend" ]; then
    run_backend
fi

if [ "$SCOPE" = "all" ] || [ "$SCOPE" = "frontend" ]; then
    if [ "$SCOPE" = "all" ]; then
        echo ""
    fi
    run_frontend
fi

echo ""
echo "Tooling complete!"
