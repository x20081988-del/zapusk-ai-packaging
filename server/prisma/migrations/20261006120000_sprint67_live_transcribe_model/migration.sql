-- Sprint 67 (2026-10-06): live transcription moves to gpt-live-transcribe.
-- The realtime_transcription template could pin one of the old segment-based
-- models from the Sprint 62 presets; clear those once so the env/default
-- applies. Any other explicit model stays untouched.
UPDATE "PromptTemplate"
SET "model" = NULL
WHERE "key" = 'realtime_transcription'
  AND "model" IN ('gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1', 'gpt-realtime-whisper');
