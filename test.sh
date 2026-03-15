#!/bin/bash
# Helper script to run tests in Docker
# Usage:
#   ./test.sh                    # Run all tests
#   ./test.sh -v                 # Run all tests with verbose output
#   ./test.sh tests/unit/test_submission_handler.py  # Run specific test file
#   ./test.sh --cov=.            # Run with coverage
#   ./test.sh --cov-report=html  # Generate HTML coverage report

set -e

IMAGE_NAME="rss-tests"
PROJECT_DIR="$(pwd)"

# Build the test image if it doesn't exist
if ! docker images "$IMAGE_NAME" --format '{{.Repository}}' | grep -q "$IMAGE_NAME"; then
    echo "Building test image..."
    docker build -f Dockerfile.tests -t "$IMAGE_NAME" .
fi

# Run tests with mounted volume
docker run --rm \
    -v "$PROJECT_DIR:/app" \
    -w /app \
    "$IMAGE_NAME" \
    pytest "$@"
