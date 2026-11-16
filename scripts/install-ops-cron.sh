#!/usr/bin/env bash
# HAN-61: install the host cron jobs for disk hygiene. Safe to re-run; replaces its own block in the user's crontab.
#   :50 every hour  prune-db-backups.sh (after Paperclip's :38 backup)
#   04:30 nightly   worktree.sh sweep --offline (dedupe stray node_modules, drop unused shared installs)
# Copies the scripts to ~/.local/share/stashtag-ops so cron does not depend on any worktree still existing.
set -euo pipefail
cd "$(dirname "$0")/.."

home=$(getent passwd "$(id -un)" | cut -d: -f6)
ops=$home/.local/share/stashtag-ops
primary=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
mkdir -p "$ops"
install -m 755 scripts/worktree.sh scripts/prune-db-backups.sh "$ops/"

block="# >>> stashtag-ops (HAN-61)
50 * * * * $ops/prune-db-backups.sh >> $ops/prune-db-backups.log 2>&1
30 4 * * * cd $primary && $ops/worktree.sh sweep --offline >> $ops/worktree-sweep.log 2>&1
# <<< stashtag-ops"

{ { crontab -l 2>/dev/null || true; } | sed '/^# >>> stashtag-ops/,/^# <<< stashtag-ops/d'; echo "$block"; } | crontab -
echo "installed:"
crontab -l | sed -n '/^# >>> stashtag-ops/,/^# <<< stashtag-ops/p'
