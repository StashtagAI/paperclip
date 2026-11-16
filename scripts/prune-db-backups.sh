#!/usr/bin/env bash
# HAN-61: retention for Paperclip's hourly DB dumps. Keeps the newest 24 plus the newest dump of each of the last 30 days.
# Paperclip's own pruning (Instance Settings > General > Backup retention) keeps every dump for at least 3 days, so this
# runs from cron on top of it. See docs/worktrees.md.
# Usage: scripts/prune-db-backups.sh [--dry-run] [backup dir]
# Only touches files named paperclip-YYYYMMDD-HHMMSS.sql.gz; anything else in the folder is left alone.
set -euo pipefail

dry=0
[ "${1:-}" = --dry-run ] && { dry=1; shift; }
dir=${1:-/home/hoid/.paperclip/instances/default/data/backups}
keep_hourly=${KEEP_HOURLY:-24}
keep_days=${KEEP_DAYS:-30}
cutoff=$(date -d "-$keep_days days" +%Y%m%d)

declare -A seen_day
n=0 deleted=0
# Names sort by time, so newest first is a reverse name sort.
while read -r f; do
  name=$(basename "$f")
  day=${name:10:8}
  n=$((n + 1))
  if [ $n -le "$keep_hourly" ]; then seen_day[$day]=1; continue; fi
  if [[ $day > $cutoff || $day == "$cutoff" ]] && [ -z "${seen_day[$day]:-}" ]; then seen_day[$day]=1; continue; fi
  deleted=$((deleted + 1))
  if [ $dry = 1 ]; then echo "would delete $name"; else rm -f "$f"; fi
done < <(find "$dir" -maxdepth 1 -type f -regextype posix-extended -regex '.*/paperclip-[0-9]{8}-[0-9]{6}\.sql\.gz' | sort -r)

echo "prune-db-backups: $n dumps, $([ $dry = 1 ] && echo 'would delete' || echo deleted) $deleted, kept $((n - deleted))"
