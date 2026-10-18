#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node "$ROOT/capacitor-hooks/after-sync.cjs"

echo "Habitracker Android widgets installed into android/."