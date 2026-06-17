#!/bin/bash

# Run the integration tests on a production and a test container

# Usage:
# ./run-integration-tests.sh [OPTIONS]
# Options:
#   --production-image IMAGE    Use specific production image
#   --test-image IMAGE          Use specific test runner image
#   --local                     Use local images instead of pulling from registry
#   --debug                     Keep containers running on failure for manual inspection
#   --help                      Show this help message
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$SCRIPT_DIR/../compose/integration"
LOCAL=false
DEBUG=false

# Default values
PRODUCTION_IMAGE="trampolin:latest-production"
TEST_IMAGE="trampolin:latest-integration"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --production-image)
            PRODUCTION_IMAGE="$2"
            shift 2
            ;;
        --test-image)
            TEST_IMAGE="$2"
            shift 2
            ;;
        --local)
            LOCAL=true
            shift
            ;;
        --debug)
            DEBUG=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --production-image IMAGE   Use specific production image"
            echo "  --test-image IMAGE        Use specific test runner image"
            echo "  --local                   Use local images instead of pulling from registry"
            echo "  --debug                   Keep containers running on failure for manual inspection"
            echo "  --help                    Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Pull the images if not using local images
if [ "$LOCAL" = false ]; then
    docker pull "$PRODUCTION_IMAGE"
    docker pull "$TEST_IMAGE"
fi

cd "$COMPOSE_DIR"
export PRODUCTION_IMAGE
export TEST_IMAGE

cleanup() {
    local exit_code=${1:-$?}
    
    # If tests failed and not in debug mode, capture logs for inspection
    if [ "$exit_code" -ne 0 ] && [ "$DEBUG" = false ]; then
        echo ""
        echo "=== Integration test failed (exit code: $exit_code) ==="
        echo "Capturing logs from failed containers..."
        echo ""
        
        echo "--- Backend logs ---"
        docker compose logs app 2>/dev/null || true
        echo ""
        
        echo "--- Integration tests logs ---"
        docker compose logs test-runner 2>/dev/null || true
        echo ""
    fi
    
    # Only tear down if not in debug mode
    if [ "$DEBUG" = false ]; then
        docker compose down --remove-orphans || true
    else
        echo "DEBUG mode: Containers left running. Clean up manually with: cd $COMPOSE_DIR && docker compose down --remove-orphans"
    fi
    
    exit "$exit_code"
}

# Always clean up containers (success, failure, or interruption).
trap cleanup EXIT

# Stop any existing containers+
docker compose down -v --remove-orphans 2>/dev/null || true

# Start the app and wait for its healthcheck to pass
echo "Starting app..."
docker compose up -d --wait app
echo "App is ready!"

# Run the integration tests
echo "Running integration tests..."
docker compose run --rm test-runner
TEST_EXIT_CODE=$?

if [ "$TEST_EXIT_CODE" -ne 0 ]; then
    echo "Integration tests failed with exit code $TEST_EXIT_CODE."
else
    echo "Integration tests passed successfully!"
fi

exit "$TEST_EXIT_CODE"