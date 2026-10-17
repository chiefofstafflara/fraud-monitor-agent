#!/bin/bash
# Hermes Agent Docker Entrypoint (PM-aware)
# Resolves the Hermes-managed Python environment (Python 3.14 + SQLite 3.5x) when one
# has been built by `hermes pm install`, and falls back to the system interpreter.
#
# Picks the NEWEST install facts.json by mtime, because building from a writable
# source copy creates a new install key alongside any pre-existing one
# (e.g. c3po had ffad2f5543956651 before migration).
set -e

echo "Starting Hermes Agent Gateway..."
: "${HERMES_HOME:=/home/agent/.hermes}"

# Prefer the writable source tree, so the runtime's pm repo_root() matches the
# install key the managed venv was built under.
SRC="$HERMES_HOME/src"
if [ -d "$SRC/hermes_cli" ]; then
    export PYTHONPATH="$SRC"
fi
echo "PYTHONPATH=$PYTHONPATH"

if [ ! -d "/opt/hermes-agent/hermes_cli" ] && [ ! -d "$SRC/hermes_cli" ]; then
    echo "ERROR: Hermes CLI not found (checked /opt/hermes-agent and $SRC)"
    ls -la /opt/hermes-agent/ 2>/dev/null || echo "Directory not mounted!"
    exit 1
fi

# Newest-first: the most recently built environment wins.
VENV=""
FACTS=$(ls -1t "$HERMES_HOME"/installs/*/facts.json 2>/dev/null || true)
for f in $FACTS; do
    [ -f "$f" ] || continue
    v=$(python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print((d.get('packages',{}).get('venv') or {}).get('environment',''))" "$f" 2>/dev/null || true)
    if [ -n "$v" ] && [ -x "$v/bin/python" ]; then
        VENV="$v"
        echo "Selected facts: $f"
        break
    fi
done

if [ -n "$VENV" ]; then
    echo "Using managed venv: $VENV"
    export PATH="$VENV/bin:$PATH"
    exec "$VENV/bin/python" -m hermes_cli.main gateway run
fi

echo "WARN: no managed venv found; falling back to system python3"
exec python3 -m hermes_cli.main gateway run
