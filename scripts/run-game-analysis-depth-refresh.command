#!/bin/zsh

set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local in $repo_dir." >&2
  exit 1
fi

set -a
source .env.local
set +a

printf '\033]0;Game analysis depth refresh\007'
echo "Game analysis depth refresh"
echo "Resuming from the last saved checkpoint. Press Ctrl+C to stop."
echo

exec caffeinate -i npx --yes tsx scripts/refresh-game-analysis-depths.ts --apply
