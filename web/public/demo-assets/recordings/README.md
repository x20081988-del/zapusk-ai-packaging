# Demo AI-Leads — Audio Recordings

Эта папка — **опциональный override** для локально хранимых записей AI-разговоров,
которые проигрываются на странице **/demo/ai-leads** (Демо AI-лиды).

## Текущее состояние (Sprint 62.P1 final)

**Аудио играется напрямую с внешнего CRM** — `https://aicallscloud.ru/api/process-record-url?recordUrl=<uuid>.wav`.
Эти URL публичные (без auth), отдают `content-type: audio/mpeg`, поэтому embedded
`<audio controls>` в UI работает без proxy и без локальных файлов.

В UI **имена замаскированы** до «Инвестор А./Б./В./Г./Д./Е.» и «Без имени». Телефоны
скрыты («скрыто для Демо»). Текстовые поля (summary / detail / objection / next step)
вычищены от ФИО, отчеств и идентифицирующих корпоративных названий.

⚠ **Аудиоконтент НЕ редактирован на стороне сервера.** Backend отдаёт URL —
браузер качает оригинал. Если в записи звучит реальное имя инвестора, имя
оператора, точное название компании или другие идентифицирующие реплики —
они будут слышны при проигрывании. **Перед публичной демонстрацией founder
обязан убедиться, что:**

- В аудио нет ФИО реальных людей, идентифицирующих компанию-инвестора,
  внутренних реквизитов сделок.
- Записи получены с согласия инвесторов на публичное использование, или
  аудиодорожки заранее post-production sanitized (имена вырезаны).
- Если что-то из перечисленного не выполнено — переключить источник на
  closed CDN (через `AI_LEADS_RECORDINGS_BASE_URL` env) или заменить
  конкретные записи на audio-redacted версии.

## Resolver priority cascade

Backend (`server/src/services/aiLeadsService.ts → resolveRecording`) выбирает
URL по приоритетам:

| # | Источник | Когда срабатывает |
|---|---|---|
| 1 | `process.env.AI_LEADS_RECORDINGS_BASE_URL` | Если ops задал. Файл по `<base>/<uuid>.wav`. |
| 2 | Локальный файл в этой папке | Если `<uuid>.wav`/`.mp3`/`.m4a` существует и читается. |
| 3 | `seed.audioUrl` (external aicallscloud.ru) | Текущий default для 9 кураторских записей. |
| 4 | Honest disabled state | Если ничего выше не сработало. |

**Локальный файл (#2) перекрывает external URL (#3)** — то есть положив файл
с правильным UUID именем в эту папку, ты автоматически переключишься с
aicallscloud на local после restart сервера.

## Список ожидаемых файлов

Если хочешь захостить аудио локально (override over aicallscloud), backend ищет:

| Файл | Лид (display name) | Длительность |
|---|---|---|
| `a9998a0a-ef71-4b6d-b559-70fd5c4b57ef.wav` | Инвестор А. (WAITING) | 240 сек |
| `0ed73e45-ab1e-4a1d-ae4c-435d49bd6f77.wav` | Без имени (WAITING) | 175 сек |
| `661a66bd-9c5d-4e97-8294-b9edd9af9a90.wav` | Инвестор Б. (HOT) | 168 сек |
| `11faebc3-9d1e-4256-960a-8389fc9f1e0d.wav` | Инвестор В. (HOT) | 184 сек |
| `d2a0157d-8e93-418f-87c7-a864832665b7.wav` | Инвестор Г. (HOT) | 152 сек |
| `71863075-3bcf-4ee1-9089-58fc7e2a8252.wav` | Инвестор Д. (WAITING) | 198 сек |
| `bec44e43-40ba-45cc-9003-de5401263d1d.wav` | Без имени (WAITING) | 142 сек |
| `26721cca-9aa4-49cf-9d53-b2add193934d.wav` | Без имени (WAITING) | 176 сек |
| `d06539dc-f2fd-4305-9c09-8a0c98c7d23e.wav` | Инвестор Е. (HOT) | 220 сек |

`.mp3` и `.m4a` тоже принимаются. Backend pattern-matchит по basename без чувствительности к регистру.

## Render env override (закрытый источник)

Если хочется захостить файлы на private CDN с подписанными URL'ами:

```bash
AI_LEADS_RECORDINGS_BASE_URL=https://your-cdn.example.com/zapusk-demo
```

Backend будет строить URL как `${BASE_URL}/<uuid>.wav` и считать audio всегда
доступным. После Render Save & Deploy auto-restart, локальные файлы и внешние
seed-URL'ы будут проигнорированы.

## История

- **Sprint 26** — `/demo/ai-leads` создан как hardcoded JSX showcase. Кнопки
  «Прослушать запись» — декоративные.
- **Sprint 35 P1** — Sanitization: real names → «Инвестор А./Б./В…»,
  phones → masked, aicallscloud URLs → local stubs. Локальные файлы не залили.
- **Sprint 62.P1** — `audio.available` flag, env override, `/api/ai-leads/showcase`
  endpoint, functional DemoAILeads.tsx page. UI стал honest, но без звука.
- **Sprint 62.P1 final** — Founder предоставил 9 cured aicallscloud URLs.
  Audio works 9/9. Identity-masking восстановлен по seed/text fields.
  Аудиоконтент остаётся за founder review.
