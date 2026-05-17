# Real-Call Audio Fixture Library

> Sprint 59 P0.7 foundation.

This directory holds **gitignored** real-call audio fixtures used by the
transcript regression suite. Audio files are NOT in git (PII + size).
Only this INDEX + manifest entries describe what each fixture is for.

## Directory layout

```
server/test-fixtures/audio/
  INDEX.md                          # this file
  manifest.json                     # fixture metadata (gitignored)
  good_desktop/
    01_zapusk_intro.wav             # gitignored
    01_zapusk_intro.ground.txt      # gitignored
  poor_telephony/
    01_glavsnab_qual.wav            # gitignored
    01_glavsnab_qual.ground.txt     # gitignored
  noisy_room/
  low_volume/
  interruptions/
  overlapping_speech/
```

## Fixture categories

Each category targets a class of real-world audio quality that hits
Zapusk AI. Conditions matrix:

| Category | Audio quality | Mic | Speakers | Typical failure mode |
|---|---|---|---|---|
| `good_desktop/` | clean 16+ kHz | desktop USB | 1 | (baseline; failures here = OpenAI itself) |
| `poor_telephony/` | 8 kHz G.711 a-law | telephony bridge | 2 | brand mis-recognition, missed quiet voices |
| `noisy_room/` | clean but noisy | desktop USB | 1 | hallucinations on noise, weak RMS |
| `low_volume/` | clean but quiet | laptop built-in | 1 | weak RMS warning trigger, dropped segments |
| `interruptions/` | clean | desktop USB | 2+ | overlap → segment fragmentation |
| `overlapping_speech/` | clean | telephony | 2+ | speaker confusion, dropped tokens |

## Per-fixture metadata file format

For each `<name>.wav` add a `<name>.ground.txt` with the human-verified
ground truth transcript. Optionally `<name>.meta.json` with:

```json
{
  "label": "Григорий greeting intro",
  "conditions": {
    "audioQuality": "good",
    "mic": "desktop",
    "speakers": "single",
    "lengthSec": 8
  },
  "captureDate": "2026-05-17",
  "knownIssues": [],
  "expectedFailureModes": []
}
```

## How to add a new fixture

1. Save the .wav under the matching category folder.
2. Drop the human-verified ground truth in `<name>.ground.txt`.
3. Add a row to `manifest.json` with category + filename + label +
   notes.
4. After running it through Zapusk AI (live or `POST /:id/audio`), paste
   the resulting transcript into `scripts/real-call-regression.mjs`
   DATASETS array under `actualTranscript`.
5. Re-run `npm run regression:realcalls` to lock in the regression.

## What ships in git

ONLY this INDEX.md. No audio. No transcripts. No PII.

If a fixture file ever gets accidentally committed, treat as a security
incident: rotate any references, force-clean from history with
explicit user approval (per CLAUDE.md «no destructive git ops without
asking»).

## Why no audio in git

1. Real investor calls = legally sensitive PII.
2. `.wav` files are large (~1–10 MB each).
3. Regression suite is deterministic ON THE TRANSCRIPT level — we don't
   need the raw audio to be reproducible for CI.

For local QA, devs keep their own audio collection under this folder
and re-run `npm run regression:realcalls` against pasted transcripts.

## Linking with `npm run regression:realcalls`

The DATASETS array in `scripts/real-call-regression.mjs` references
fixtures by category + filename (informational only — the script
doesn't load the audio). The audio + ground-truth are the human-side
canonical source; the DATASETS array is the assertion contract.

## Future extensions (P1, not in this sprint)

- Automated fixture runner that loads .wav → POSTs to backend
  `/api/sales-sessions/:id/audio` → captures the resulting transcript →
  appends to DATASETS (requires test backend + API key).
- Whisper-vs-gpt-4o A/B comparison runner over the same fixture set.
- Conditions-stratified quality dashboard (per-category
  RealtimeQualityScore distribution).
