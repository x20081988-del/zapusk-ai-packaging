# Замер задержки живой транскрипции (Sprint 67, 2026-10-06)

Скрипты, которыми выбирали модель для «Живой встречи». Ключ берут из `server/.env`
(OPENAI_API_KEY), ходят в OpenAI Realtime по WebSocket, нужен Python 3.9+ и `websockets`
(в telegram-agent: `~/telegram-agent/.venv/bin/python3`).

Аудио готовится так (русский TTS, PCM16 24 кГц моно):

```bash
mkdir -p /tmp/stt_bench && cd /tmp/stt_bench
say -v Milena -o ru.aiff "Добрый день, Григорий. Я посмотрел инвестиционное предложение на платформе Запуск. ..."
afconvert -f WAVE -d LEI16@24000 -c 1 ru.aiff ru_24k.wav
```

- `bench_models.py` - одно аудио через все модели: когда приходит первый delta, сколько
  delta во время речи, когда финал. Итог 06.10.2026: gpt-4o-transcribe с server_vad
  отдает первый delta через 17,6 с от начала речи 15,7 с (0 delta во время речи),
  gpt-live-transcribe через 0,5 с (delay=minimal) / 0,8 с (low).
- `bench_turns.py` - gpt-live-transcribe на двух репликах с `input_audio_buffer.commit`
  между ними: финал через ~0,7 с после commit, дублей нет.
- `bench_e2e_local.py` - сквозной прогон через локальный сервер (`PORT=4101 npm run dev`
  в `server/`): сессия выдается нашим эндпоинтом с реальным словарем, клиентский
  детектор тишины эмулируется на PCM (`mic`) или по затишью в delta (`idle`).
  Файл `/tmp/stt_bench/pauses_24k.wav` - три фразы с паузами 1,6 с и 1,0 с.

Сырые логи событий пишутся в `/tmp/stt_bench/events_<n>.json`.
