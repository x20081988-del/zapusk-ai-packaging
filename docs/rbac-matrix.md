# RBAC matrix — Zapusk AI Packaging

> Sprint 50, 2026-05-16. Single source of truth: [`server/src/lib/accessPolicy.ts`](../server/src/lib/accessPolicy.ts). This document tracks the contract; if the code drifts from this matrix, the code is wrong.

## Roles

| Role | Who | Workspace status |
|---|---|---|
| `SUPER_ADMIN` | Platform owner. Schema migrations, smoke tokens, backups, impersonation, security scan. | active |
| `ADMIN` | Platform staff. Same surface as `SUPER_ADMIN` *except* SUPER_ADMIN-only ops (smoke-token, backup, impersonate-super-admin, security-scan). | active |
| `MANAGER` | Sales / customer success. Reads all founder data, manages KB, runs learning dashboards. | active |
| `FOUNDER` | End user — packs their own project, runs investor meetings. | active OR demo |
| `INVESTOR` | Read-only investor surface (Sprint 25). Not granted access to any founder data. | active |

The role-check helper at [`server/src/auth.ts:128`](../server/src/auth.ts:128) (`requireRole`) treats `SUPER_ADMIN` as a superset of `ADMIN` automatically. "Admin-like" everywhere means `{SUPER_ADMIN, ADMIN, MANAGER}` unless noted.

## Matrix — read operations

| Surface | SUPER_ADMIN | ADMIN | MANAGER | FOUNDER (active) | FOUNDER (demo) | INVESTOR |
|---|---|---|---|---|---|---|
| Own projects (list) | ✓ all | ✓ all | ✓ all | ✓ own | ✓ own | ✗ (router-level) |
| Project files download | ✓ | ✓ | ✓ | ✓ own | ✓ own | ✗ |
| Brief read | ✓ | ✓ | ✓ | ✓ own | ✓ own | ✗ |
| Prompt template history | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Sales sessions (list + detail) | ✓ all | ✓ all | ✓ all | ✓ own project OR own orphan | ✓ own | ✗ |
| Conversation analyses (list + detail) | ✓ all | ✓ all | ✓ all | ✓ own project OR own orphan | ✓ own | ✗ |
| Assistant outcomes (list + detail) | ✓ all | ✓ all | ✓ all | ✓ own outcome / own FK chain | ✓ own | ✗ |
| Knowledge base | ✓ | ✓ | ✓ | ✗ (consumes via retrieval only) | ✗ | ✗ |
| `/api/admin/dashboard` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/api/admin/users` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `/api/admin/health/details` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `/api/admin/security-scan` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `/api/admin/smoke-token` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `/api/admin/backup` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `/api/assistant-learning/*` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `/api/ai-reliability/dashboard` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Public `/health` | ✓ (4 fields) | ✓ | ✓ | ✓ | ✓ | ✓ |

## Matrix — write operations

| Operation | SUPER_ADMIN | ADMIN | MANAGER | FOUNDER (active) | FOUNDER (demo) | INVESTOR |
|---|---|---|---|---|---|---|
| Create project | ✓ | ✓ | ✓ | ✓ | ✗ (`workspace_readonly`) | ✗ |
| Upload project file | ✓ | ✓ | ✓ | ✓ own | ✗ | ✗ |
| Brief generate / regenerate | ✓ | ✓ | ✓ | ✓ own | ✗ | ✗ |
| Prompt template create / update | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Sales session finalize (orphan-safe) | ✓ | ✓ | ✓ | ✓ own | ✓ own (no project) | ✗ |
| Conversation analysis ingest | ✓ | ✓ | ✓ | ✓ own | ✓ own (no project) | ✗ |
| Outcome create | ✓ | ✓ | ✓ | ✓ own FK chain | ✓ own | ✗ |
| Outcome edit / archive | ✓ | ✓ | ✓ | ✓ own (createdById fast-path) | ✓ own | ✗ |
| Knowledge source upsert | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Invite create / revoke | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| User status change | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Promote to SUPER_ADMIN | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Impersonate | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Impersonate SUPER_ADMIN | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Trigger DB backup | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

## Ownership rules (current behaviour, Sprint 49 hotfix 10–12)

For records that have an optional `projectId` AND a `createdById`:

```
allowed = isAdminLike(role)
       OR record.createdById === me.id
       OR (record.projectId && project.userId === me.id)
```

Cross-tenant access returns **404** to avoid existence leakage.

This rule is encapsulated in [`actorCanReadSalesSession`](../server/src/lib/accessPolicy.ts), [`actorCanReadConversationAnalysis`](../server/src/lib/accessPolicy.ts), [`actorCanReadAssistantOutcome`](../server/src/lib/accessPolicy.ts).

## Demo workspace specifics

`workspaceStatus = 'demo'` users:
- Get read access to **legacy demo projects** (those with `isDemo=true`) plus their own.
- Cannot create new real projects (returns `workspace_readonly`).
- Cannot generate brief / prompts / packaging on real projects.
- *Can* run AI assistant orphan flow (transcription + analyze + finalize without project).
- The middleware enforcing this is in [`middleware/workspaceAccess.ts`](../server/src/middleware/workspaceAccess.ts).

## 4. Known gap — manager team assignment

Today `MANAGER === ADMIN` for read paths. The product intent is "Manager Анна manages founders X, Y, Z; doesn't see W". This needs:

1. A `manager_user` join table (`managerId`, `founderUserId`).
2. The `actorCanRead*` predicates branch on role: if `MANAGER` and not admin-like, scope by manager assignments.
3. Manager-facing list endpoints filter by the assignment.

Targeted for Sprint 51. The shape is already designed — [`assistantLearningService.ts`](../server/src/services/assistantLearningService.ts) takes an `actorId` filter that's not yet exposed.

## 5. Verifying RBAC

```bash
# scripts/prod-smoke-auth.ts covers most matrix cells. Run with:
ZAPUSK_SUPER_ADMIN_TOKEN=… ZAPUSK_ADMIN_TOKEN=… ZAPUSK_MANAGER_TOKEN=… \
ZAPUSK_FOUNDER_TOKEN=… ZAPUSK_INVESTOR_TOKEN=… \
npx tsx scripts/prod-smoke-auth.ts
```

What's NOT yet smoked:
- Cross-tenant founder probe (founder A's token reading founder B's project — needs two founder fixtures).
- Manager assignment narrowing (because §4 isn't implemented yet).
- Idempotency replay (Sprint 50 P0.1) — add to smoke in Sprint 51.
