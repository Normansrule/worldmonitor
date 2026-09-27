#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Terra Atlas — one-time setup inside your fork of koala73/worldmonitor.
# Run from the repository root AFTER unzipping the Terra Atlas overlay:  bash tools/setup-fork.sh
set -euo pipefail
[ -f package.json ] && grep -q '"world-monitor"' package.json || { echo "Run this from the root of your worldmonitor fork."; exit 1; }

# 1. Park World Monitor's ~40 CI workflows (they need secrets and infrastructure a fork does not have).
mkdir -p .github/workflows-upstream
for f in .github/workflows/*.yml; do
  case "$(basename "$f")" in pages.yml|desktop.yml|video.yml|data.yml) ;; *) git mv -k "$f" .github/workflows-upstream/ 2>/dev/null || mv "$f" .github/workflows-upstream/ ;; esac
done
echo "Parked upstream workflows in .github/workflows-upstream/ (restore any with git mv)."

# 2. Keep the original README next to ours.
[ -f README.worldmonitor.md ] || echo "Note: README.worldmonitor.md not found — run 'git show upstream/main:README.md > README.worldmonitor.md' to keep a copy."

# 3. Sanity checks
for p in site/index.html site/app/index.html desktop/src-tauri/tauri.conf.json .github/workflows/pages.yml; do
  [ -e "$p" ] && echo "ok  $p" || { echo "MISSING $p — did the overlay unzip into the repo root?"; exit 1; }
done
echo "Done. Preview locally with:  cd site && python3 -m http.server 8080"
