#!/bin/bash
# Bruce Gateway Docker Entrypoint
set -e

echo "Starting Bruce Gateway..."
echo "PYTHONPATH=$PYTHONPATH"

# Check if Hermes source is accessible
if [ -d "/opt/hermes-agent/hermes_cli" ]; then
    echo "Hermes CLI found at /opt/hermes-agent/hermes_cli"
    exec python3 -m hermes_cli.main gateway run
else
    echo "ERROR: Hermes CLI not found at /opt/hermes-agent/hermes_cli"
    echo "Contents of /opt/hermes-agent:"
    ls -la /opt/hermes-agent/ 2>/dev/null || echo "Directory not mounted!"
    exit 1
fi