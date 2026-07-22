#!/usr/bin/env bash
# NEXUS OS — Recovery script (run after a z.ai sandbox reset)
# Usage: GH_TOKEN=your_github_pat bash scripts/recover.sh
# (or put the PAT in /home/z/my-project/.gh-token)
set -e
cd /home/z/my-project
echo "━━━ NEXUS OS RECOVERY ━━━"

# 1. Re-add git remote if missing (no hardcoded tokens)
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "[1/5] Adding git remote..."
  GH_TOKEN="${GH_TOKEN:-}"
  [ -z "$GH_TOKEN" ] && [ -f .gh-token ] && GH_TOKEN=$(cat .gh-token)
  if [ -n "$GH_TOKEN" ]; then
    git remote add origin "https://x-access-token:${GH_TOKEN}@github.com/specimba/NEXUS_FALLOUT_OS.git"
  else
    git remote add origin "https://github.com/specimba/NEXUS_FALLOUT_OS.git"
  fi
else
  echo "[1/5] Git remote OK."
fi

# 2. Fetch latest
echo "[2/5] Fetching from GitHub..."
git fetch origin --tags --force 2>&1 | tail -2

# 3. Reset to latest tag
LATEST=$(git tag -l | sort -V | tail -1)
echo "[3/5] Resetting to $LATEST..."
git reset --hard "$LATEST" 2>&1 | tail -1

# 4. .env (gitignored — orchestrator restores keys separately)
echo "[4/5] .env check..."
if [ -f .env ] && [ $(grep -c "_KEY=" .env 2>/dev/null) -gt 5 ]; then
  echo "  .env OK."
elif [ -f .env.backup ]; then
  cp .env.backup .env && echo "  Restored from .env.backup"
else
  echo "  .env needs manual restore (keys are gitignored)."
fi

# 5. Install dependencies (node_modules is wiped on sandbox reset)
echo "[5/6] Installing dependencies..."
if [ ! -d node_modules/socket.io-client ]; then
  bun install 2>&1 | tail -3
else
  echo "  node_modules OK."
fi

# 6. Start dev server
echo "[6/6] Starting dev server..."
pkill -f "next dev" 2>/dev/null || true
pkill -f "bun run dev" 2>/dev/null || true
rm -rf .next  # clear stale cache that causes compile hangs
sleep 2
nohup setsid bun run dev </dev/null >>/tmp/nexus-dev.log 2>&1 &
disown

echo "  Waiting..."
for i in $(seq 1 30); do
  sleep 2
  if curl -sS -m 5 http://localhost:3000/api/ai/models 2>/dev/null | grep -q '"count"'; then
    echo ""
    echo "━━━ RECOVERY COMPLETE ━━━"
    curl -sS -m 5 http://localhost:3000/api/ai/models 2>&1 | grep -oE '"count":[0-9]+,"available":[0-9]+,"default":"[^"]*"'
    echo "Latest tag: $LATEST"
    exit 0
  fi
done
echo "WARNING: server didn't respond in 60s. Check /tmp/nexus-dev.log"
exit 1
