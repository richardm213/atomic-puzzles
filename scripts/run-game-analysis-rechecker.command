#!/bin/zsh
set -euo pipefail

cd -- "$(dirname -- "$0")/.."

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local in $(pwd)." >&2
  exit 1
fi

set -a
source .env.local
set +a

exec npx --yes tsx scripts/recheck-overdue-game-analyses.ts "$@"
