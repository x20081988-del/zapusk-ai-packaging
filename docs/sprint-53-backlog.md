# Sprint 53 Backlog

> Status after Sprint 52 deploy + Sprint 53 stabilization commits.

## What landed in Sprint 53 stabilization

| Commit | Task | Notes |
|---|---|---|
| `044d787` | A — Hide internal SPIN/SS labels in AI assistant | Stage badge, self-sale block, conversation score page, system prompt — all user-visible methodology replaced with human language. AdminLearning intentionally retains internal terms (SUPER_ADMIN-only). |
| `21fad66` | F — Meeting outcome + memory UX polish | Modal title, success copy, outcome form header / placeholders / hints adapt to deskMode. |
| `fb6070f` | G — Mobile polish + tsconfig `noEmit` | Textarea + transcript heights mobile-friendly; tsconfig fix stops `tsc -b` from emitting stale `.js` shadow files that broke HMR (recurring issue from Sprint 50). |
| `ebb2117` | D — Qualification script titles polish | Em-dash separator + «Универсальный сценарий» replacement (both backend catalog and frontend fallback). |
| `9551d97` | H — Realtime mic error UX | No more raw OpenAI/WebRTC error text in user UI. Classified into 5 friendly messages; raw still logged to console for ops. |

5 commits, no destructive operations, all type-checked + built clean.

## Recommended Sprint 53 (next) priorities

### P0 — Production correctness

1. **Deploy current Sprint 53 stabilization batch (5 commits)**.
   - Migration-free. Only TS code + docs.
   - Same backup/push/health/regression pattern as Sprint 52.
   - Bundle hash will change because of `dist/assets/index-Db7aHH1_.js` (build verified locally).

2. **Authenticated browser smoke runbook** (manual or scripted).
   Steps to verify after deploy:
   - Open `/sales-assistant`. Default = «Проведение встречи».
   - Toggle to «Квалификация инвестора». Verify titles: "DLFY — ВамЛям", "Универсальный сценарий" etc.
   - Paste context, start call, get hint. Verify advice card stage badge reads "Этап · Понимаем контекст" (no С/П/У/Р).
   - Finalize. Modal title: «AI сохранил контекст звонка». Outcome form header: «Итог звонка». Notes placeholder mentions DLFY pitch / возражения.
   - Switch to mobile 390px. No horizontal scroll. Tabs labeled "Встреча" / "Квалификация".
   - Open Super Admin → Templates → click a qualification.* template → see "Контекстные файлы" section with Upload button.

### P1 — High value, low risk

3. **AdminLearning re-labeling**.
   AdminLearning still shows "Воронка по этапам СПИН" and stage letters С/П/У/Р. Spec is strict («никаких слов SPIN/SS»), even for super-admin views. Rename to "Воронка этапов разговора" with the same numeric/human map as AdviceCard. Estimated 15 min.

4. **Dynamic qualification script catalog refresh on backend**.
   Right now backend re-seeds names only on create-if-missing. If admin renames a script in Templates UI, the change is reflected. But if seed runs first and admin never touches it, original spec'd names (em-dash, «Универсальный сценарий») show on `/api/sales-assistant/qualification-scripts`. There's a tiny drift risk if production rows still have `·` separators from Sprint 52 first deploy. One-shot backfill: if `name` matches legacy `Qualification · DLFY · ВамЛям` pattern and no version > 1, update to new label. ~30 min.

5. **Memory retrieval observability**.
   Add a small `[sales-assistant/memory] count=N investorName=... projectId=...` log when `buildMemoryBlock` runs. Currently silent on hits/misses; ops can't tell if memory injection is actually firing in production. ~5 min.

### P1 — Bigger UX investments

6. **Tone / Engagement / Control / Confidence — human language audit**.
   AdviceCard still shows "Контроль · низкий/средний/высокий", "Инвестор · активен/пассивен/потерян", "Тон · мягкий/контроль/закрытие". These are mostly fine but the word "контроль" near a confidence number sometimes reads as Russian "контроль качества" (quality control). Consider replacing «контроль» tone with «уверенный».

7. **Outcome editing in MeetingCard standalone view** (`/meetings/:id`).
   Right now outcome can only be set in the finalize modal. Add the same OutcomeForm component to the existing meeting card detail page for late edits. Reuse `updateMeetingOutcome` helper. ~30 min.

8. **Negotiation memory browser for super-admin**.
   New page `/admin/memory` listing recent `NegotiationMemory` rows with filters (investorName, outcome, projectId). Read-only view of the training dataset. Helps spot bad data before it gets fed into fine-tuning. ~2 h.

### P2 — Foundation only, no implementation

9. **Embeddings + vector retrieval for NegotiationMemory**.
   Add `embedding BLOB` column to model. Compute on insert via OpenAI `text-embedding-3-small`. Switch `getRecentMemories` to cosine similarity instead of exact `investorName` match. Requires:
   - New env: `OPENAI_EMBEDDING_MODEL`
   - Cost guardrail (cheap, but still)
   - Migration with backfill option (don't auto-embed historical rows on deploy)

10. **Fine-tuning pipeline** (`listMemoriesByOutcome` → OpenAI fine-tuning dataset upload).
    Already have the data structure; need export helper + admin UI to trigger uploads.

11. **AdminLearning + memory cross-link**.
    Show "X recent memories with successful outcome → Y of those triggered Zoom in <24h" — closes the loop on whether qualification calls actually convert.

12. **Playwright smoke tests**.
    Documented intent but not implemented (would have required new npm dep — flagged as user-confirmation per CLAUDE.md rule). Tests to add when greenlit:
    - `/sales-assistant` loads with no console errors
    - Tab toggle works, aria-pressed state correct
    - Paste flow → save → context badge shows
    - Mobile 390 viewport has no overflow
    - Finalize button shape exists

## What remains risky

- **Local dev DB drift** (cumulative from Sprint 50–52). Out-of-band fix needed: `npx prisma migrate reset && npm run db:seed`. Not blocking production.
- **No live authenticated browser smoke ran during Sprint 53** — sandbox blocks production credential use, and local Vite dev server hit a transient cache pathology after `.js` shadow cleanup. Source-level verification (tsc + build + bundle-content grep) is the substitute. Confirmed all Sprint 53 strings made it into production build artefact.
- **AdminLearning still surfaces SPIN funnel** — internal-only, but spec wording was strict. Item P1.3 above.
