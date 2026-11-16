# Task worktrees and disk hygiene (HAN-61)

Agents work each task in its own git worktree (`workspaces/<agent>/han-NN`). A full `npm install` is ~1.1 GB, so before
HAN-61 every task cost a gigabyte and the disk filled up (HAN-59). Now:

## One shared install per lockfile

`scripts/worktree.sh` keeps one `npm ci` per distinct `package-lock.json` in
`~/.local/share/stashtag-deps/<lockfile hash>/node_modules`, and each worktree's `node_modules` is a symlink to it. Every
checkout it links is recorded in `stashtag-deps/links/`, so worktrees and standalone clones of any agent share the same
store, and an install is only pruned when nothing links to it. A new worktree adds ~3 MB.

```bash
scripts/worktree.sh new HAN-NN fullstack/han-NN-short-name   # worktree on a new branch off origin/main, deps linked
scripts/worktree.sh deps                                     # (re)link the current worktree, e.g. after a merge changed the lockfile
scripts/worktree.sh done HAN-NN                              # when the task is done (see below)
```

`new` puts the worktree in `$PAPERCLIP_WORKSPACE_CWD` (override with `STASHTAG_WORKTREES_DIR`). Branches that change
dependencies get their own shared install, keyed by the new lockfile, and other worktrees on the same lockfile reuse it.

**Changing dependencies.** Never run `npm install` / `npx expo install` through the symlink: that would change the
shared copy under every other worktree. Instead:

```bash
rm node_modules                 # drop the symlink (only the link)
npx expo install some-package   # private install, updates package.json + package-lock.json
scripts/worktree.sh deps        # adopts this install as the shared one for the new lockfile and re-links
```

If someone does install through the link anyway, the next `deps` sees the shared copy no longer matches its lockfile and
rebuilds it.

Why not pnpm: it would also fix this, but Expo/React Native needs `node-linker=hoisted`, and switching changes the
Vercel, EAS and CI installs too. Symlinks needed no change to how the app builds. Typecheck, jest, lint and
`expo export --platform web` were checked through a linked `node_modules`.

## When a task is done

Run `scripts/worktree.sh done HAN-NN` before moving the task to done. It deletes the worktree's `node_modules`, then
removes the worktree with `git worktree remove` (no `--force`), so a worktree with uncommitted or untracked files is kept
(source only, a few MB). A standalone clone (its `.git` is a folder) only loses `node_modules`. The branch stays in the
clone; reopen with `git worktree add ../han-NN <branch>` and `scripts/worktree.sh deps`.

`scripts/worktree.sh sweep` does the same for every `han-NN` checkout whose Paperclip task is `done` or `cancelled` (it
needs `PAPERCLIP_API_KEY`, so run it from a heartbeat). It also replaces any real `node_modules` folder in a task
checkout with the shared link (adopting it as the shared install when it matches the lockfile), repoints old hand-made
links, and deletes shared installs that nothing has linked for 2 days. The clone's primary checkout is not touched.

## Paperclip DB backup retention

Paperclip dumps its database hourly to `~/.paperclip/instances/default/data/backups` (~75 MB each, growing).

- **Paperclip's own pruning** is an instance setting, stored in the database: **Instance Settings > General > Backup
  retention** (`PATCH /api/instance/settings/general` `backupRetention`, board only). It keeps *every* dump for
  `dailyDays` (3, 7 or 14; default 7), then the newest per week for `weeklyWeeks` (1, 2, 4), then the newest per month
  for `monthlyMonths` (1, 3, 6). `database.backup.retentionDays` in `instances/default/config.json` is only read by the
  `paperclipai db:backup` CLI command, not by the server.
- Since the shortest built-in setting still keeps 72+ hourly dumps, **`scripts/prune-db-backups.sh`** runs from cron at :50
  every hour and keeps the newest 24 dumps plus the newest dump of each of the last 30 days. It only deletes files named
  `paperclip-YYYYMMDD-HHMMSS.sql.gz`. `--dry-run` lists what it would delete.

The two combine: past Paperclip's `dailyDays`, its weekly/monthly thinning also applies. Recommended Paperclip setting:
daily 14, weekly 4, monthly 3. Together that is the last 24 hours hourly, one a day for 14 days, one a week for 4
weeks, one a month for 3 months (about 45 files).

## Cron

`scripts/install-ops-cron.sh` installs both jobs in the user crontab (re-runnable) and copies the scripts to
`~/.local/share/stashtag-ops/`, where the logs also go:

| When | Job |
| --- | --- |
| hourly at :50 | `prune-db-backups.sh` |
| 04:30 daily | `worktree.sh sweep --offline` from the primary checkout (dedupe and prune only, no Paperclip calls) |

Re-run the installer after changing either script.
