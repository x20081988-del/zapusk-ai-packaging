# Disaster Recovery — Zapusk AI Packaging

> Use this when prod is broken, data is at risk, or a deploy went sideways.

The platform has three independent failure surfaces:

1. **The SQLite database** (`/var/data/prod.db` on Render).
2. **The running Render deploy** (the container serving traffic).
3. **The git branch** (what new deploys will pick up).

Each has its own recovery procedure below. The order in an incident is almost always: stop the bleeding (roll back the deploy), inspect, then decide whether DB rollback is needed.

---

## 1. SQLite backup & restore

### 1.1 Where the database lives

| Environment | Path |
|---|---|
| Render production | `/var/data/prod.db` (Render persistent disk) |
| Local dev | `server/dev.db` |

`DATABASE_URL=file:/var/data/prod.db` is set in Render env.

Pre-deploy snapshots are written automatically by `server/src/scripts/preDeploySnapshot.ts` to `/var/data/snapshots/prod-YYYY-MM-DDTHH-MM-SS.db` (last 7 retained). Manual hot backups can be taken any time.

### 1.1.1 Known on-disk backup files

| File | Created | Size | Source |
|---|---|---|---|
| `/var/data/prod.backup-20260516-0828.db` | 2026-05-16 08:28 UTC | 32 272 384 bytes | Manual hot backup via Render Shell, taken before the autonomous-stabilization run. Use this as the rollback target if anything done after commit `d54c398` corrupted data. |

**Restore warning:** restoring this backup means replacing the live DB file. **The app must be stopped first** (Render Settings → Suspend), otherwise SQLite WAL pages from the running process can race the `cp` and leave the restored file inconsistent. See §1.4 for the exact procedure.

### 1.2 Create an on-demand hot backup (no downtime)

Open the service in Render dashboard → **Shell** tab and paste:

```bash
DEST="/var/data/prod.backup-$(date -u +%Y%m%d-%H%M).db"
sqlite3 /var/data/prod.db ".backup '$DEST'"
ls -la /var/data/prod.db "$DEST"
sha256sum /var/data/prod.db "$DEST"
```

**Why `sqlite3 .backup` and not `cp`:** `.backup` uses SQLite's Online Backup API, which produces a consistent snapshot even with the app still writing. Plain `cp` of a live SQLite file can capture a torn page if a write lands mid-copy.

**Verify:**
- `ls -la` shows both files. Backup size should be roughly equal to or slightly smaller than the source (online backup omits unused pages).
- `sha256sum` of source and backup will differ — expected, the backup is a logical snapshot, not a byte copy.
- A non-zero file size proves SQLite finished the copy. A zero-byte backup means the command failed silently — re-run and read the error.

**Do not** run `VACUUM`, `REINDEX`, or `prisma migrate reset` on prod. Those rewrite the file in place and have no undo.

### 1.3 Download a backup off-server

From your laptop, as SUPER_ADMIN:

```bash
PROD=https://zapusk-ai.onrender.com
read -s -p "Owner password: " PW; echo
SA=$(curl -s -X POST "$PROD/api/auth/login" -H "Content-Type: application/json" \
  -d "$(jq -n --arg p "$PW" '{email:"grigory@zapusk.tech",password:$p}')" | jq -r .token); unset PW
curl -s -X POST "$PROD/api/admin/backup" -H "Authorization: Bearer $SA" \
  -o "zapusk-backup-$(date -u +%Y%m%d-%H%M).tar.gz"
unset SA
```

The tar.gz contains `db/prod.db`, `uploads/`, and `snapshots/` — a full off-site backup.

### 1.4 Restore a backup (planned downtime)

Restoring SQLite means replacing the live file. The app cannot be writing while the file is swapped — Render's Shell session keeps the app running, so you must stop traffic first.

1. **Suspend the service.** Render dashboard → Settings → Suspend. Wait for the container to stop.
2. **Open Shell**, copy the desired backup into place:
   ```bash
   # Pick which backup to restore — list available:
   ls -la /var/data/prod.backup-*.db /var/data/snapshots/prod-*.db 2>/dev/null

   # Take an immediate insurance copy of the corrupted current file:
   mv /var/data/prod.db /var/data/prod.broken-$(date -u +%Y%m%d-%H%M).db

   # Restore the chosen backup (replace SOURCE with the path you picked):
   cp /var/data/prod.backup-YYYYMMDD-HHMM.db /var/data/prod.db
   sqlite3 /var/data/prod.db "PRAGMA integrity_check;"
   ```
3. **Resume the service.** Render dashboard → Resume. App will run migrations against the restored DB on boot — Prisma's `migrate deploy` is idempotent.
4. **Smoke** `/health` returns 200 and one read query (e.g., `GET /api/projects` as a known user) returns expected data.

If `PRAGMA integrity_check;` reports anything other than `ok`, do **not** resume — try the next-older backup or escalate.

### 1.5 Restore a pre-deploy snapshot

Same as 1.4 but the source is `/var/data/snapshots/prod-…db`. These are written automatically before every `prisma migrate deploy` and are the most appropriate rollback when a migration corrupted data.

---

## 2. Render deploy rollback

When the latest deploy is broken (5xx, crash loop, broken auth, etc.) and you need to get prod working *right now*.

### 2.1 Roll back via Render dashboard

1. Open the service in Render → **Deploys** tab.
2. Find the last commit hash that was green (look for ✓ Deploy live with old `Active` badge before the failing one).
3. Click the three-dot menu on that deploy → **Rollback**.
4. Render redeploys that exact image. Takes 1–3 minutes (no fresh build — it serves the prior image directly).

This **does not** revert the git branch. The next push to `main` will deploy whatever is in `main`, so you also need 2.3 if you want to keep main matching what's live.

### 2.2 Roll back via git push (slower, full rebuild)

If the dashboard is unavailable or you want a hard `main` reset:

```bash
git fetch origin
git log --oneline -10           # find the last known-good commit hash
git reset --hard <good-sha>     # only on a freshly fetched local main
git push --force-with-lease origin main
```

Render will pick up the new `main` HEAD and do a full build + deploy (~3–6 min). `--force-with-lease` aborts the push if someone else committed since your last fetch — safer than `--force`.

**Never force-push without explicit approval.** Always confirm the target SHA with the owner first.

### 2.3 Verify the rollback

```bash
# /health responds 200 and ts increments
curl -s https://zapusk-ai.onrender.com/health | jq '{ok,ts,env}'

# Bundle hash changed — confirms new container is serving
curl -s https://zapusk-ai.onrender.com/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js'

# Critical routes alive (expect 401 unauth)
for path in api/auth/me api/projects api/sales-assistant/analyze api/realtime/transcription-session; do
  printf "%s = %s\n" "$path" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "https://zapusk-ai.onrender.com/$path")"
done
```

Render serves the *previous* instance until the new one passes its healthcheck, then swaps. A 502 window of ~30–60 s during cutover is normal and self-resolves.

---

## 3. Git branch rollback

When `main` has bad code but prod is still serving the previous deploy (i.e., the bad commit isn't live yet because a deploy is still building / failed).

### 3.1 Soft revert (preserves history — preferred)

Creates a *new* commit that undoes the bad one. Safer because everyone else's clones don't get rewritten.

```bash
git fetch origin
git log --oneline -10            # find the bad SHA
git revert <bad-sha>             # makes a new "Revert X" commit
git push origin main
```

If the bad commit was a merge, add `-m 1` to specify the parent.

### 3.2 Hard reset (rewrites history — use sparingly)

Only when the bad commit must literally vanish from `main` (e.g., it leaked a secret). Requires explicit approval.

```bash
git fetch origin
git reset --hard <good-sha>
git push --force-with-lease origin main
```

Notify anyone else who pulled `main` after the bad commit — they need to `git fetch origin && git reset --hard origin/main` to stay in sync.

### 3.3 Backup branches

Before any long autonomous run, multi-step refactor, or risky migration, freeze the current stable state as a named branch. Then `main` can move freely and you can always diff/cherry-pick back from the frozen branch.

```bash
# Confirm you're on a clean main at the SHA you want to freeze.
git checkout main
git pull --ff-only

# Create the backup branch from current HEAD and push it.
git checkout -b backup/<short-description>
git push -u origin backup/<short-description>

# Return to main for ongoing work.
git checkout main
```

Naming convention: `backup/<reason>-<YYYYMMDD>` (e.g., `backup/pre-autonomous-stabilization-20260516`). Don't delete backup branches — they're cheap, and one day you'll be glad to find one.

To recover from a backup branch:

```bash
git fetch origin
# Inspect what changed since the freeze:
git log --oneline backup/<name>..main
git diff backup/<name>..main -- <files-of-interest>

# Restore one file from the backup branch:
git checkout backup/<name> -- path/to/file.ts
git commit -m "restore path/to/file.ts from backup/<name>"

# Or hard-reset main back to the backup point (requires explicit approval):
git reset --hard backup/<name>
git push --force-with-lease origin main
```

### 3.4 Reverting a single file without touching others

When only one file needs to go back to a prior version:

```bash
git checkout <good-sha> -- path/to/file.ts
git commit -m "revert path/to/file.ts to <good-sha-short>"
git push origin main
```

### 3.5 Active backup branches

| Branch | Frozen at | Reason |
|---|---|---|
| `backup/pre-autonomous-stabilization` | `d54c398` (Sprint 49 hotfix 10) — meeting lifecycle finalize flow | Snapshot taken on 2026-05-16 before the autonomous-stabilization work began. Paired with on-disk DB backup `/var/data/prod.backup-20260516-0828.db`. |

---

## 4. Combined recovery — when everything is on fire

Order of operations:

1. **Stop the bleeding.** Roll back the Render deploy (2.1) to the last green commit. Prod is now serving working code; user impact is bounded.
2. **Investigate.** Read Render logs from the failing deploy window. Look for startup crashes, migration errors, OOM, or first-hit-after-deploy errors.
3. **Decide on DB recovery.** If the migration corrupted data:
   - Take a fresh hot backup of the current (post-corruption) DB first (1.2) so you have *something* to forensic against.
   - Restore the most recent pre-deploy snapshot or manual backup (1.4 / 1.5).
4. **Fix the branch.** Either revert (3.1) or hard-reset (3.2) so `main` matches what's now running. This prevents the next deploy from reintroducing the bug.
5. **Verify** (2.3 + any product-specific smoke).
6. **Postmortem.** Write up what failed, what the gap in detection was, what the fix is. Don't skip this — same incident twice means we learned nothing.

---

## 5. Quick reference card

| Task | One-liner |
|---|---|
| Hot backup on-server | `sqlite3 /var/data/prod.db ".backup '/var/data/prod.backup-$(date -u +%Y%m%d-%H%M).db'"` |
| Download full backup | `curl -X POST $PROD/api/admin/backup -H "Authorization: Bearer $SA" -o backup.tar.gz` |
| List backups | `ls -la /var/data/prod.backup-*.db /var/data/snapshots/prod-*.db` |
| Render rollback | Dashboard → Deploys → ⋯ on last green → Rollback |
| Git soft revert | `git revert <sha> && git push origin main` |
| Verify health | `curl -s https://zapusk-ai.onrender.com/health \| jq` |

---

## 6. What to never do

- Run `prisma migrate reset` on prod (drops all data).
- Run `prisma db push --force-reset` on prod (same).
- `rm /var/data/prod.db` for any reason.
- `git push --force` to `main` without `--force-with-lease` and explicit approval.
- Skip the pre-restore insurance copy (`mv prod.db prod.broken-…`).
- Restore a backup without `PRAGMA integrity_check;` afterward.
