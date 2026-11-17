#!/usr/bin/env bash
# Start the local learning site (mic needs localhost, not file://).
set -euo pipefail
cd "$(dirname "$0")"
exec python3 server.py "$@"
