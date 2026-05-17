# Investor Qualification Desk

> Sprint 51–53 — second mode of the AI Assistant for first-touch outbound managers.

## What it is

A second "desk" on top of `/sales-assistant`. Tab switcher (top of page) toggles between:

| Mode | Goal | Typical duration |
|---|---|---|
| `meeting` (default) | Full investor meeting, deep discovery + close steps | 30–60 min |
| `qualification` | First-touch outbound call from lead list. Book the Zoom with the expert + capture chequebook, timeline, decision criteria. | 5–10 min |

## Mode isolation

- `deskMode` state is independent of `sessionState` and `meetingState`. Starting / stopping the live capture does NOT change `deskMode` (Sprint 51 hotfix P0.2).
- `aria-pressed` on each tab + distinct `bg-grad-ai shadow-ai-glow` styling for active vs `text-secondary` for inactive.
- During active mic capture (`isMicCapturing = listening || meetingState === 'listening'`), tabs are `disabled` + `opacity-50 cursor-not-allowed` to prevent accidental switch mid-call.
- After Stop with empty transcript, tabs re-enable. After Stop with a transcript, layout flips back to Start/Hint but `liveSessionStarted` stays true so "Получить подсказку" remains the CTA (Sprint 51 hotfix P0.1).

## Wording (every visible string flips by deskMode)

| Meeting wording | Qualification wording |
|---|---|
| Живая встреча | Живой звонок |
| Начать прослушивание | Начать звонок |
| Завершить встречу | Завершить звонок |
| Подготовиться ко встрече | Подготовиться к звонку |
| Вставить контекст встречи | Вставить контекст звонка |
| Контекст встречи добавлен | Контекст звонка добавлен |
| План встречи | План звонка |
| Слушаю встречу | Слушаю звонок |
| Проект для этой встречи | Проект для звонка |
| Итог встречи | Итог звонка |
| Встреча сохранена | Звонок сохранён |

All exposed via a single `labels` object derived from `deskMode` (Sprint 51 hotfix P0.3). Adding a new wording slot = add one key to two flat objects.

## Scripts catalog

7 named playbooks seed `qualification.<key>` PromptTemplate rows:

| Script key | Lead source | Pitch focus |
|---|---|---|
| `dlfy_vamlyam` | Avito / ВамЛям cold | DLFY trading AI; x5–x9 + dividends |
| `dlfy_base` | Zapusk warm база | DLFY second-touch — they've seen Zapusk before |
| `glavsnab` | Any DB / Avito for ГлавСнаб project | Stroymats marketplace; 12mo dividends |
| `zapusk_base` | Zapusk warm база, no specific project | Open-ended; let them pick from platform |
| `zapusk_after_vamlyam` | Lead spoke to ВамЛям's Дмитрий first | Continuation call (manager must already know prior context) |
| `funnel_return` | Dead lead from past funnel | Sell platform breadth, not a single project |
| `generic` | Anything else | Universal — relies on manually-pasted context |

Each script body is auto-generated from `QUALIFICATION_SCRIPTS` catalog in `server/src/ai/qualificationPrompts.ts` via `formatQualificationContextBlock(key)`. It contains:

- 60–90 sec pitch
- 3 qualifying questions (chequebook, timeline, criteria)
- Zoom-close phrase
- 5 shared objection responses (`send_info`, `not_interesting`, `think`, `bad_reviews`, `bad_project`)

Backend resolves at request time via `resolveQualificationScriptBody(scriptKey)`:
1. Look up `PromptTemplate { key: 'qualification.<key>' }`.
2. If row exists, active, body > 80 chars → use DB body (admin can edit without redeploy).
3. Else fall back to `formatQualificationContextBlock(key)` hardcoded.

Logs: `[sales-assistant] qualification.<key> source=db|fallback templateId=...`.

## Frontend selector

`GET /api/sales-assistant/qualification-scripts` returns metadata only (no body — body is server-only IP):

```json
{
  "scripts": [
    { "scriptKey": "dlfy_vamlyam", "templateKey": "qualification.dlfy_vamlyam", "name": "Qualification · DLFY — ВамЛям", "description": "..." },
    ...
  ]
}
```

Not admin-protected — any non-investor authenticated user can read names. UI dropdown maps `name` → label. On API fail, falls back to hardcoded `QUALIFICATION_SCRIPTS` catalog in `web/src/pages/SalesAssistant.tsx`.

## Prompt overlay (system layer)

When `mode === 'qualification'`, the AI client receives:

```
<sales_gpt system prompt — same as meeting>

🧷 РЕЖИМ: КВАЛИФИКАЦИЯ ИНВЕСТОРА (первичный звонок 5–10 минут).
ВАЖНО: ты сейчас НЕ помогаешь продать сделку целиком. Ты помогаешь менеджеру первичного обзвона довести инвестора до короткой Zoom-встречи с экспертом по инвестициям.
...
🎯 ЦЕЛЬ ЗВОНКА (единственная)
Назначить Zoom 15 минут с экспертом + узнать: чек, срок готовности, критерии выбора.

📞 STAGES первичного обзвона
opening → permission_to_talk → short_pitch → qualification_check → objection_handling → meeting_close → followup_channel → summary
...
🛑 ЧТО НЕЛЬЗЯ ДЕЛАТЬ
1. Не презентовать проект 5+ минут.
2. Не объяснять все гарантии по телефону — это эксперт на Zoom.
3. Не соглашаться на «скиньте материалы» без зафиксированного слота.
4. Не отпускать в открытое «перезвоните когда-нибудь».
5. Не сливать лида при «не интересно» — переводи в подбор.
```

Schema of the JSON response stays identical to meeting mode. Internal field `spinStage` is reused as a reporting marker (S=opening/permission/pitch, P=qualification, I=objection, N=meeting_close).

## User prompt body

Order:
1. Mode header (`first-touch call` vs `live co-pilot`)
2. Qualification context block (script-specific pitch + questions + objections)
3. Memory block (recent NegotiationMemory entries for this investor / project)
4. Project context (single or multi-project)
5. Knowledge Base block (if retrieval found matches)
6. SPIN history + previous advice + recent context
7. Full transcript so far
8. Task instructions

## Mobile-first considerations

- Tab labels shrink: «Проведение встречи» → «Встреча»; «Квалификация инвестора» → «Квалификация» at `<sm`
- Script select drops the desktop "Сценарий:" label, keeps just the `<select>` itself
- Sticky bottom action bar (Start/Hint) — works identically in both desk modes
- Outcome form 2-column grid on mobile, 4-column on desktop

## Critical invariants

1. **Meeting mode never regresses**. Default `deskMode='meeting'`. If frontend sends no `mode` field, backend defaults to meeting.
2. **`mode` value never reaches user-visible strings**. Wording flips locally; user never sees "mode=qualification" anywhere.
3. **Script body is server-only**. Frontend bundle never contains script content — only key/name/description.
4. **Outcome `unknown` is the default**, never undefined. Sessions complete without manager classification get `outcome='unknown'`; later editing via PATCH is supported.

## See also

- `docs/ai-assistant-architecture.md` — broader assistant overview
- `docs/memory-layer.md` — NegotiationMemory specifics
- `docs/sprint-53-backlog.md` — what's next
