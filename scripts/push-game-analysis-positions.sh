#!/bin/zsh

set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"

set -a
source .env.local
set +a

exec npx --yes tsx scripts/push-game-analysis-positions.ts "$@"
