#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
MSG="${2:-build: trigger apk build $(date '+%Y-%m-%d %H:%M:%S')}"

echo "==> Checking git repository..."
git rev-parse --is-inside-work-tree >/dev/null

echo "==> Current branch:"
git branch --show-current

echo "==> Fetching origin/$BRANCH..."
git fetch origin "$BRANCH"

echo "==> Switching to $BRANCH..."
git switch "$BRANCH" 2>/dev/null || git checkout "$BRANCH"

echo "==> Adding changes..."
git add -A

if git diff --cached --quiet; then
  echo "==> No local changes found. Creating empty commit to trigger build..."
  git commit --allow-empty -m "$MSG"
else
  echo "==> Creating commit..."
  git commit -m "$MSG"
fi

echo "==> Rebasing with origin/$BRANCH..."
git pull --rebase --autostash origin "$BRANCH"

echo "==> Pushing to origin/$BRANCH..."
git push origin "$BRANCH"

echo "==> Done. GitHub Actions build should start now."
