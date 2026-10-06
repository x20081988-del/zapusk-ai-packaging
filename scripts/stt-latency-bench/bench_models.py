import asyncio, base64, json, re, time, wave, sys
import websockets

key = None
for line in open('/Users/luquid/Projects/zapusk-ai-packaging/server/.env', encoding='utf-8'):
    m = re.match(r'^OPENAI_API_KEY=(.*)$', line.strip())
    if m: key = m.group(1).strip().strip('"').strip("'")

import os
with wave.open(os.environ.get('STT_BENCH_AUDIO', '/tmp/stt_bench/ru_24k.wav'),'rb') as w:
    pcm = w.readframes(w.getnframes())
RATE=24000; CHUNK_MS=100; CHUNK=RATE*2*CHUNK_MS//1000
SIL=b'\x00'*CHUNK
SPEECH_SEC=len(pcm)/(RATE*2)
PROMPT='Разговор менеджера инвестиционной платформы Запуск (Zapusk) с инвестором о Pre-IPO сделке и инвестиционном предложении.'
KW=['Zapusk','Запуск','Pre-IPO','инвестиционное предложение','краудинвестинг']
VAD={'type':'server_vad','threshold':0.45,'prefix_padding_ms':300,'silence_duration_ms':900}
CONFIGS=[
 ('gpt-4o-transcribe [ПРОД]', {'model':'gpt-4o-transcribe','language':'ru','prompt':PROMPT}, True),
 ('gpt-4o-mini-transcribe', {'model':'gpt-4o-mini-transcribe','language':'ru','prompt':PROMPT}, True),
 ('gpt-4o-mini-transcribe-2025-12-15', {'model':'gpt-4o-mini-transcribe-2025-12-15','language':'ru','prompt':PROMPT}, True),
 ('gpt-transcribe', {'model':'gpt-transcribe','language':'ru','prompt':PROMPT}, True),
 ('whisper-1', {'model':'whisper-1','language':'ru','prompt':PROMPT}, True),
 ('gpt-live-transcribe delay=minimal', {'model':'gpt-live-transcribe','languages':['ru'],'prompt':PROMPT,'keywords':KW,'delay':'minimal'}, False),
 ('gpt-live-transcribe delay=low', {'model':'gpt-live-transcribe','languages':['ru'],'prompt':PROMPT,'keywords':KW,'delay':'low'}, False),
 ('gpt-live-transcribe delay=medium', {'model':'gpt-live-transcribe','languages':['ru'],'prompt':PROMPT,'keywords':KW,'delay':'medium'}, False),
 ('gpt-realtime-whisper', {'model':'gpt-realtime-whisper','language':'ru'}, False),
]

async def run(idx, label, tr, vad):
    inp={'format':{'type':'audio/pcm','rate':RATE},'transcription':tr}
    inp['turn_detection']=VAD if vad else None
    upd={'type':'session.update','session':{'type':'transcription','audio':{'input':inp}}}
    log=[]; T={}
    deltas=[]; completed=[]; errors=[]
    # mint ephemeral secret with full session config, exactly like the app does
    import urllib.request
    body=json.dumps({'session':{'type':'transcription','audio':{'input':inp}}}).encode()
    req=urllib.request.Request('https://api.openai.com/v1/realtime/client_secrets', data=body, headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'}, method='POST')
    tm=time.monotonic()
    with urllib.request.urlopen(req, timeout=20) as r: secret=json.load(r)['value']
    T['mint_ms']=round((time.monotonic()-tm)*1000)
    async with websockets.connect('wss://api.openai.com/v1/realtime', additional_headers={'Authorization':'Bearer '+secret}, max_size=None, open_timeout=20) as ws:
        # wait for session.created
        while True:
            m=json.loads(await asyncio.wait_for(ws.recv(), timeout=15))
            if m.get('type') in ('session.created','session.updated','transcription_session.created'): break
            if m.get('type')=='error': print(label,'SESSION ERROR',m.get('error')); return None
        t0=time.monotonic(); T['start']=t0
        async def sender():
            off=0; nxt=t0
            while off<len(pcm):
                await ws.send(json.dumps({'type':'input_audio_buffer.append','audio':base64.b64encode(pcm[off:off+CHUNK]).decode()})); off+=CHUNK
                nxt+=CHUNK_MS/1000; await asyncio.sleep(max(0,nxt-time.monotonic()))
            T['speech_end']=time.monotonic()
            for _ in range(20):
                await ws.send(json.dumps({'type':'input_audio_buffer.append','audio':base64.b64encode(SIL).decode()}))
                nxt+=CHUNK_MS/1000; await asyncio.sleep(max(0,nxt-time.monotonic()))
            if not vad:
                await ws.send(json.dumps({'type':'input_audio_buffer.commit'})); T['commit']=time.monotonic()
        async def receiver():
            deadline=t0+SPEECH_SEC+2+12
            while time.monotonic()<deadline:
                try: raw=await asyncio.wait_for(ws.recv(), timeout=max(0.05,deadline-time.monotonic()))
                except asyncio.TimeoutError: break
                m=json.loads(raw); t=time.monotonic()-t0; typ=m.get('type'); log.append((round(t,3),typ,(m.get('delta') or m.get('transcript') or (m.get('error') or {}).get('message') or '')[:120]))
                if typ=='conversation.item.input_audio_transcription.delta': deltas.append((t,m.get('delta','')))
                elif typ=='conversation.item.input_audio_transcription.completed':
                    completed.append((t,m.get('transcript','')))
                    if 'speech_end' in T and (t0+t)>T['speech_end']+0.3 and ((vad) or ('commit' in T)): 
                        # give a moment for trailing events then stop
                        await asyncio.sleep(0.4); break
                elif typ=='error': errors.append(m.get('error'))
        await asyncio.gather(sender(), receiver())
    se=T.get('speech_end',t0)-t0
    json.dump({'label':label,'config':tr,'vad':vad,'speech_sec':SPEECH_SEC,'speech_end':se,'log':log}, open(f'/tmp/stt_bench/events_{idx}.json','w'), ensure_ascii=False, indent=0)
    first_delta=deltas[0][0] if deltas else None
    during=sum(1 for t,_ in deltas if t<se)
    final_t=completed[-1][0] if completed else None
    text=' '.join(c for _,c in completed).strip() or ''.join(d for _,d in deltas)
    print(f'\n=== {label} === (mint {T.get("mint_ms")} ms)')
    print(f'  первый delta: {"+%.2f c от начала речи" % first_delta if first_delta is not None else "нет"} | delta всего {len(deltas)}, во время речи {during}')
    print(f'  completed: {len(completed)} | последний final: {"+%.2f c после конца речи" % (final_t-se) if final_t is not None else "нет"} (речь {se:.1f} c)')
    if errors: print('  ошибки:', errors[:2])
    print('  текст:', text[:260].replace('\n',' '))

async def main():
    for i,(label,tr,vad) in enumerate(CONFIGS):
        try: await run(i,label,tr,vad)
        except Exception as e: print(f'\n=== {label} === EXC {type(e).__name__}: {str(e)[:200]}')
        await asyncio.sleep(0.5)
asyncio.run(main())
