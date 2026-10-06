// Node-стенд логики realtimeTranscription.ts (Sprint 67, ревью Codex F1-F3):
// fake WebRTC/микрофон/AudioContext, реальные таймеры. Сборка и запуск - см. README.
// Node stand for realtimeTranscription.ts: fake WebRTC/mic/AudioContext, real timers.
const commits = []; const finals = []; const interims = []; const logs = [];
let level = 0.0; let dc = null;
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage = globalThis.localStorage;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'node-harness', mediaDevices: { getUserMedia: async () => ({
  getAudioTracks: () => [{ label: 'fake', stop() {}, getSettings: () => ({}) }],
  getTracks: () => [{ stop() {} }] }) } } });
class FakeDC { constructor() { this.readyState = 'open'; } send(d) { commits.push({ t: Date.now(), msg: JSON.parse(d) }); } close() { this.readyState = 'closed'; } }
globalThis.RTCPeerConnection = class { constructor() { this.connectionState = 'connected'; } addTrack() {} createDataChannel() { dc = new FakeDC(); return dc; }
  async createOffer() { return { sdp: 'v=0' }; } async setLocalDescription() {} async setRemoteDescription() {} close() {} };
globalThis.fetch = async () => ({ ok: true, text: async () => 'v=0' });
globalThis.AudioContext = class { constructor() { this.state = 'running'; } createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData(buf) { buf.fill(level); } }; } async close() { this.state = 'closed'; } async resume() {} };
const origDebug = console.debug; console.debug = (...a) => { logs.push(a); };
console.warn = (...a) => { logs.push(a); };
const { startRealtimeTranscription } = await import(process.env.RT_BUNDLE ?? '/tmp/stt_bench/rt_bundle.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now(); const rel = (t) => ((t - t0) / 1000).toFixed(2);
function ev(obj) { dc.onmessage({ data: JSON.stringify(obj) }); }
function delta(item, text) { ev({ type: 'conversation.item.input_audio_transcription.delta', item_id: item, delta: text }); }
function committed(item) { ev({ type: 'input_audio_buffer.committed', item_id: item }); }
function completed(item, transcript) { ev({ type: 'conversation.item.input_audio_transcription.completed', item_id: item, transcript }); }
async function session(info) {
  globalThis.__sessionInfo = { clientSecret: 'x', model: 'gpt-live-transcribe', expiresAt: null, templateVersion: 1, traceId: 'h', ...info };
  commits.length = 0; finals.length = 0; interims.length = 0; level = 0;
  const s = await startRealtimeTranscription({
    onInterim: (t) => interims.push({ t: Date.now(), text: t }),
    onFinal: (t, id) => finals.push({ t: Date.now(), text: t, id }),
    onError: (e) => logs.push(['onError', e.message]), onClose: () => {} }, {});
  dc.onopen();
  return s;
}
const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); }

// S1 (F1): commit stays locked until completed; ack timeout synthesizes a final from deltas.
{
  const s = await session({ clientCommitRequired: true, clientSilenceMs: 700, clientIdleMs: 1400, clientMaxTurnMs: 20000 });
  level = 0.05; delta('A', ' Добрый'); await sleep(300); delta('A', ' день.'); await sleep(300);
  level = 0.002; await sleep(1200);
  check('S1 one commit after silence', commits.length === 1, `commits=${commits.length}`);
  committed('A');
  await sleep(4000);
  check('S1 no repeated commit while unacked (3s+)', commits.length === 1, `commits=${commits.length}`);
  await sleep(4500);   // past 8 s ack timeout
  check('S1 ack timeout synthesized final from deltas', finals.length === 1 && finals[0].text.includes('Добрый день'), JSON.stringify(finals.map(f => f.text)));
  level = 0.05; delta('B', ' Да.'); await sleep(300); level = 0.002; await sleep(1200);
  check('S1 commit lock released after timeout', commits.length === 2, `commits=${commits.length}`);
  completed('B', 'Да.');
  check('S1 second final delivered', finals.length === 2 && finals[1].text === 'Да.', JSON.stringify(finals.map(f => f.text)));
  s.stop();
}
// S2 (F2): completed of A must not wipe deltas of B that arrived in between.
{
  const s = await session({ clientCommitRequired: true, clientSilenceMs: 700, clientIdleMs: 1400, clientMaxTurnMs: 20000 });
  level = 0.05; delta('A', ' Первая'); await sleep(200); delta('A', ' фраза.'); await sleep(200);
  level = 0.002; await sleep(1100);
  check('S2 commit sent', commits.length === 1, `commits=${commits.length}`);
  committed('A');
  level = 0.05; delta('B', ' Вторая'); await sleep(100);
  completed('A', 'Первая фраза.');
  const lastInterim = interims[interims.length - 1].text;
  check('S2 final A delivered', finals.length === 1 && finals[0].text === 'Первая фраза.', JSON.stringify(finals.map(f => f.text)));
  check('S2 interim keeps B after completed A', lastInterim.trim() === 'Вторая', JSON.stringify(lastInterim));
  delta('B', ' фраза.'); await sleep(100); level = 0.002; await sleep(1100);
  check('S2 second commit covers B', commits.length === 2, `commits=${commits.length}`);
  completed('B', 'Вторая фраза.');
  check('S2 final B delivered', finals.length === 2 && finals[1].text === 'Вторая фраза.', JSON.stringify(finals.map(f => f.text)));
  s.stop();
}
// S3 (F3): steady speech at RMS 0.03 with continuous deltas must not be read as silence.
{
  const s = await session({ clientCommitRequired: true, clientSilenceMs: 700, clientIdleMs: 1400, clientMaxTurnMs: 20000 });
  level = 0.03; let i = 0;
  const iv = setInterval(() => { delta('C', ' слово' + (i++)); }, 300);
  await sleep(12000); clearInterval(iv);
  check('S3 no false-silence commit during 12 s steady speech', commits.length === 0, `commits=${commits.length}`);
  level = 0.002; await sleep(1100);
  check('S3 commit after real silence', commits.length === 1, `commits=${commits.length}`);
  s.stop();
}
// S4: segment-based model path unchanged (no commits, finals from completed).
{
  const s = await session({ model: 'gpt-4o-transcribe', clientCommitRequired: false, turnDetectionSupported: true });
  level = 0.05; delta('V', ' Сегмент'); await sleep(200); level = 0.002; await sleep(1500);
  completed('V', 'Сегмент');
  check('S4 VAD model: no client commit, final delivered', commits.length === 0 && finals.length === 1 && finals[0].text === 'Сегмент', `commits=${commits.length} finals=${finals.length}`);
  s.stop();
}
// S5: empty completed on live model promotes the item's own deltas.
{
  const s = await session({ clientCommitRequired: true, clientSilenceMs: 700, clientIdleMs: 1400, clientMaxTurnMs: 20000 });
  level = 0.05; delta('E', ' Пустой'); delta('E', ' финал.'); await sleep(200); level = 0.002; await sleep(1100);
  committed('E'); completed('E', '');
  check('S5 empty completed promoted from deltas', finals.length === 1 && finals[0].text === 'Пустой финал.', JSON.stringify(finals.map(f => f.text)));
  s.stop();
}
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
