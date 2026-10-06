# End-to-end: local server mints the session (real template -> keywords/prompt),
# browser-like client streams audio with pauses and commits by delta idleness.
import asyncio, base64, json, time, wave, urllib.request, sys, audioop
import websockets
import os
BASE=os.environ.get('BASE','http://localhost:4101')
MODE=sys.argv[1] if len(sys.argv)>1 else 'mic'
SIL_MS=700
IDLE_MS=1400
MAX_TURN_MS=20000
req=urllib.request.Request(BASE+'/api/realtime/transcription-session', data=b'{}', headers={'Content-Type':'application/json','x-user-email':'founder@zapusk.tech'}, method='POST')
with urllib.request.urlopen(req, timeout=30) as r: sess=json.load(r)
secret=sess.pop('clientSecret'); print('session:', json.dumps(sess, ensure_ascii=False))
with wave.open('/tmp/stt_bench/pauses_24k.wav','rb') as w: pcm=w.readframes(w.getnframes())
CHUNK=24000*2*100//1000
async def main():
    log=[]; interim=''; last_delta=0; turn_started=0; commit_sent=0; commits=[]; completed=[]; last_speech=0; speech_since_commit=False
    async with websockets.connect('wss://api.openai.com/v1/realtime', additional_headers={'Authorization':'Bearer '+secret}, max_size=None, open_timeout=20) as ws:
        while True:
            m=json.loads(await asyncio.wait_for(ws.recv(), timeout=15))
            if m.get('type') in ('session.created','session.updated'): print('session.created ok; model', m['session']['audio']['input']['transcription'].get('model'), 'delay', m['session']['audio']['input']['transcription'].get('delay'), 'keywords', len(m['session']['audio']['input']['transcription'].get('keywords') or [])); break
            if m.get('type')=='error': print('ERR', m); return
        t0=time.monotonic(); now=lambda: time.monotonic()-t0
        async def sender():
            nonlocal last_speech, speech_since_commit
            off=0; nxt=t0
            while off<len(pcm):
                chunk=pcm[off:off+CHUNK]
                await ws.send(json.dumps({'type':'input_audio_buffer.append','audio':base64.b64encode(chunk).decode()})); off+=CHUNK
                rms=audioop.rms(chunk,2)/32768.0
                if rms>0.012: last_speech=now(); speech_since_commit=True
                nxt+=0.1; await asyncio.sleep(max(0,nxt-time.monotonic()))
        async def endpointer():
            nonlocal commit_sent, speech_since_commit
            while now()<len(pcm)/48000+4:
                await asyncio.sleep(0.1)
                if not interim.strip(): continue
                t=now()
                if commit_sent and t-commit_sent<3: continue
                if MODE=='mic':
                    if speech_since_commit and last_speech and t-last_speech>=SIL_MS/1000: reason='silence'; speech_since_commit=False
                    else: continue
                else:
                    if last_delta and t-last_delta>=IDLE_MS/1000: reason='idle'
                    else: continue
                await ws.send(json.dumps({'type':'input_audio_buffer.commit'})); commit_sent=t; commits.append((round(t,2),reason,len(interim)))
        async def receiver():
            nonlocal interim,last_delta,turn_started,commit_sent
            deadline=t0+len(pcm)/48000+4
            while time.monotonic()<deadline:
                try: raw=await asyncio.wait_for(ws.recv(), timeout=max(0.05,deadline-time.monotonic()))
                except asyncio.TimeoutError: break
                m=json.loads(raw); t=now(); typ=m.get('type')
                if typ.endswith('.delta'):
                    interim+=m.get('delta',''); last_delta=t
                    if not turn_started: turn_started=t
                elif typ.endswith('.completed'):
                    completed.append((round(t,2), m.get('transcript',''))); interim=''; last_delta=0; turn_started=0; commit_sent=0
                elif typ=='error': print('ERR', m.get('error'))
        await asyncio.gather(sender(), endpointer(), receiver())
    print('audio: a 0-5.66 | pause 1.6 | b 7.26-11.44 | pause 1.0 | c 12.44-17.47')
    print('commits:', commits)
    for t,x in completed: print(f'  final at {t}: {x}')
    print('leftover interim:', repr(interim[:80]))
asyncio.run(main())
