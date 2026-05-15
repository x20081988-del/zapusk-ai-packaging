# Production E2E QA Checklist

## Meetings outcomes

1. Login as `MANAGER` or `ADMIN`.
2. Open `/meetings`.
3. Open DevTools Network and filter by `assistant-outcomes`.
4. Confirm outcomes are requested with `salesSessionIds=...`, not as an unfiltered full list.
5. Confirm each visible meeting shows only its linked outcomes.
6. Click `Изменить` on an outcome, change probability or investor name, save.
7. Confirm the edited value appears without a full page reload.
8. Click `Архивировать` on the same outcome.
9. Confirm the outcome disappears from the meeting card.
10. Open `/admin/learning`, confirm archived outcomes are not counted in dashboard totals.

## Production smoke script

Run with a real SUPER_ADMIN JWT:

```bash
ZAPUSK_SUPER_ADMIN_TOKEN="..." \
server/node_modules/.bin/tsx scripts/prod-smoke-auth.ts
```

Optional full expiry check waits about 65 seconds:

```bash
ZAPUSK_SUPER_ADMIN_TOKEN="..." \
ZAPUSK_SMOKE_WAIT_EXPIRED=true \
server/node_modules/.bin/tsx scripts/prod-smoke-auth.ts
```
