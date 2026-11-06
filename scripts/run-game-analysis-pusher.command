#!/bin/zsh

set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"

printf '\033]0;AtomicDB queue pusher\007'
echo "AtomicDB queue pusher"
echo "Keeps Gannet below the queue target and submits more positions as capacity opens."
echo "Press Ctrl+C to stop."
echo

exec caffeinate -i ./scripts/push-game-analysis-positions.sh
