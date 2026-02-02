#!/bin/bash
# Build the NanoClaw agent container image

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

IMAGE_NAME="nanoclaw-agent"
TAG="${1:-latest}"

echo "Building NanoClaw agent container image..."
echo "Image: ${IMAGE_NAME}:${TAG}"

# Detect container runtime: Apple Container (macOS) or Docker (Linux)
if command -v container &> /dev/null; then
    echo "Using Apple Container..."
    container build -t "${IMAGE_NAME}:${TAG}" .
elif command -v docker &> /dev/null; then
    echo "Using Docker..."
    docker build -t "${IMAGE_NAME}:${TAG}" .
else
    echo "Error: No container runtime found (container or docker)"
    exit 1
fi

echo ""
echo "Build complete!"
echo "Image: ${IMAGE_NAME}:${TAG}"
