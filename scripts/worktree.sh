#!/usr/bin/env bash
# HAN-61: task worktrees share one npm install per package-lock.json instead of ~1.1 GB each.
# See docs/worktrees.md. Usage:
#   scripts/worktree.sh new HAN-NN <branch> [base]  create <worktrees dir>/han-NN on a new branch (base: origin/main) and link deps
#   scripts/worktree.sh deps [dir]                  point dir/node_modules at the shared install for its lockfile (installs it once)
#   scripts/worktree.sh done HAN-NN|dir             delete the worktree's node_modules, and the worktree if it has no uncommitted work
#   scripts/worktree.sh sweep [--offline]           dedupe stray installs, prune unused shared installs; online also runs `done`
#                                                   for every han-NN checkout whose Paperclip task is done or cancelled
# Shared installs live in ~/.local/share/stashtag-deps/<lockfile hash>/node_modules (override: STASHTAG_DEPS_DIR), and
# every linked checkout is recorded in its links/ folder, so checkouts from any clone or agent share and protect them.
set -euo pipefail

DEPS=${STASHTAG_DEPS_DIR:-$(getent passwd "$(id -un)" | cut -d: -f6)/.local/share/stashtag-deps}
PRUNE_AFTER_DAYS=${STASHTAG_DEPS_PRUNE_DAYS:-2}
mkdir -p "$DEPS/links"

log() { echo "worktree.sh: $*" >&2; }
die() { log "$*"; exit 1; }

lock_hash() { sha256sum "$1/package-lock.json" | cut -c1-16; }

# Linked worktrees of the current clone (not its primary checkout), plus every checkout that was ever linked.
checkouts() {
  {
    git worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p' | tail -n +2
    for l in "$DEPS"/links/*; do [ -L "$l" ] && readlink "$l"; done
  } | awk '!seen[$0]++' | while read -r d; do [ -d "$d" ] && echo "$d"; done
}

# Exit 0 if dir/node_modules was installed from dir/package-lock.json (npm's hidden lockfile matches).
node_modules_matches_lock() {
  node -e '
    const fs = require("fs");
    const [lockPath, hiddenPath] = process.argv.slice(1);
    if (!fs.existsSync(hiddenPath)) process.exit(1);
    const want = JSON.parse(fs.readFileSync(lockPath, "utf8")).packages || {};
    const have = JSON.parse(fs.readFileSync(hiddenPath, "utf8")).packages || {};
    for (const [k, v] of Object.entries(have)) if (!want[k] || want[k].version !== v.version) process.exit(1);
    for (const [k, v] of Object.entries(want)) if (k && !v.optional && !v.link && !have[k]) process.exit(1);
  ' "$1/package-lock.json" "$1/node_modules/.package-lock.json"
}

# deps <dir> [--no-install]
cmd_deps() {
  local dir install=1
  dir=$(cd "${1:-.}" && pwd)
  [ "${2:-}" = --no-install ] && install=0
  [ -f "$dir/package-lock.json" ] || die "$dir has no package-lock.json"
  local hash target
  hash=$(lock_hash "$dir")
  target=$DEPS/$hash
  (
    flock 9
    # Someone ran `npm install` through a symlink: the shared copy no longer matches its lockfile, so rebuild it.
    if [ -f "$target/.ready" ] && ! node_modules_matches_lock "$target"; then
      log "shared install $hash was modified in place; rebuilding it"
      rm -f "$target/.ready"
    fi
    if [ ! -f "$target/.ready" ]; then
      rm -rf "$target.tmp"
      mkdir -p "$target.tmp"
      cp "$dir/package.json" "$dir/package-lock.json" "$target.tmp/"
      if [ -d "$dir/node_modules" ] && [ ! -L "$dir/node_modules" ] && node_modules_matches_lock "$dir"; then
        log "adopting $dir/node_modules as shared install $hash"
        mv "$dir/node_modules" "$target.tmp/node_modules"
      elif [ $install = 1 ]; then
        log "installing shared deps $hash (once per lockfile)"
        (cd "$target.tmp" && npm ci --no-audit --no-fund)
      else
        rm -rf "$target.tmp"
        log "skipped $dir: no shared install for its lockfile"
        exit 0
      fi
      rm -rf "$target"
      mv "$target.tmp" "$target"
      touch "$target/.ready"
    fi
    if [ -d "$dir/node_modules" ] && [ ! -L "$dir/node_modules" ]; then
      log "replacing $dir/node_modules with the shared install"
      rm -rf "$dir/node_modules"
    fi
    ln -sfn "$target/node_modules" "$dir/node_modules"
    ln -sfn "$dir" "$DEPS/links/$(printf %s "$dir" | sha256sum | cut -c1-16)"
    touch "$target"
    log "$dir/node_modules -> $target/node_modules"
  ) 9>"$DEPS/$hash.lock"
}

resolve_checkout() {
  local arg=$1 d
  if [[ $arg =~ ^[Hh][Aa][Nn]-[0-9]+$ ]]; then
    while read -r d; do
      [ "$(basename "$d")" = "${arg,,}" ] && { echo "$d"; return; }
    done < <(checkouts)
    die "no checkout named ${arg,,}"
  fi
  (cd "$arg" && pwd)
}

cmd_done() {
  local dir err
  dir=$(resolve_checkout "${1:?usage: worktree.sh done HAN-NN|dir}")
  if [ -L "$dir/node_modules" ]; then rm "$dir/node_modules"; elif [ -d "$dir/node_modules" ]; then rm -rf "$dir/node_modules"; fi
  log "removed $dir/node_modules"
  # Only linked worktrees (.git is a file) are deleted; a standalone clone or primary checkout keeps its source.
  if [ ! -f "$dir/.git" ]; then
    log "kept $dir: it is a full clone, not a worktree"
    return
  fi
  # Without --force git refuses if anything is modified or untracked, so no work is lost. Branches stay in the clone.
  if err=$(git -C "$dir" worktree remove "$dir" 2>&1); then
    log "removed worktree $dir"
  else
    log "kept $dir (source only, a few MB): $err"
  fi
}

cmd_new() {
  local task=${1:?usage: worktree.sh new HAN-NN <branch> [base]} branch=${2:?branch required} base=${3:-origin/main}
  local primary
  primary=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
  local dir=${STASHTAG_WORKTREES_DIR:-${PAPERCLIP_WORKSPACE_CWD:-$(dirname "$primary")}}/${task,,}
  [ -e "$dir" ] && die "$dir already exists"
  git fetch -q origin
  git worktree add -b "$branch" "$dir" "$base"
  cmd_deps "$dir"
  echo "$dir"
}

prune_shared() {
  local refs="" l d hash
  for l in "$DEPS"/links/*; do
    [ -L "$l" ] || continue
    d=$(readlink "$l")
    if [ -L "$d/node_modules" ]; then refs+=" $(readlink "$d/node_modules")"; else rm "$l"; fi
  done
  for d in "$DEPS"/*/; do
    d=${d%/}
    hash=$(basename "$d")
    [ "$hash" = links ] && continue
    [[ " $refs " == *" $d/node_modules "* ]] && continue
    [ -n "$(find "$d" -maxdepth 0 -mtime -"$PRUNE_AFTER_DAYS")" ] && continue
    (
      flock -n 9 || exit 0
      # deps touches the install while holding this lock, so a fresh mtime here means it was just linked.
      [ -n "$(find "$d" -maxdepth 0 -mtime -"$PRUNE_AFTER_DAYS")" ] && exit 0
      rm -rf "$d"
      log "pruned unused shared install $hash"
    ) 9>"$DEPS/$hash.lock"
    [ -d "$d" ] || rm -f "$DEPS/$hash.lock"
  done
}

cmd_sweep() {
  local offline=0 d name status base
  [ "${1:-}" = --offline ] && offline=1
  git worktree prune 2>/dev/null || true
  if [ $offline = 0 ] && [ -n "${PAPERCLIP_API_KEY:-}" ] && [ -n "${PAPERCLIP_API_URL:-}" ]; then
    base=${PAPERCLIP_API_URL%/}
    base=${base%/api}
    for d in $(checkouts); do
      name=$(basename "$d")
      [[ $name =~ ^han-[0-9]+$ ]] || continue
      status=$(curl -sf -H "Authorization: Bearer $PAPERCLIP_API_KEY" "$base/api/issues/${name^^}" |
        node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).status||"")}catch{}})' || true)
      case $status in done | cancelled) log "${name^^} is $status"; cmd_done "$d" ;; esac
    done
  fi
  for d in $(checkouts); do
    [ -d "$d/node_modules" ] && [ ! -L "$d/node_modules" ] && cmd_deps "$d" --no-install
  done
  # Older hand-made links (e.g. ../han-27/node_modules) may point at another lockfile's install, or nowhere.
  for d in $(checkouts); do
    [ -L "$d/node_modules" ] && [[ $(readlink "$d/node_modules") != "$DEPS"/* ]] && cmd_deps "$d" --no-install
  done
  prune_shared
}

case ${1:-} in
  new | deps | done | sweep) c=$1; shift; "cmd_$c" "$@" ;;
  *) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
