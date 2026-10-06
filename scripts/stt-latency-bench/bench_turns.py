import asyncio, base64, json, re, time, wave, urllib.request
import websockets
key=None
for line in open('/Users/luquid/Projects/zapusk-ai-packaging/server/.env', encoding='utf-8'):
    m=re.match(r'^OPENAI_API_KEY=(.*)$', line.strip())
    if m: key=m.group(1).strip().strip('"').strip("'")
with wave.open('/tmp/stt_bench/ru_24k.wav','rb') as w: pcm=w.readframes(w.getnframes())
RATE=24000; CHUNK=RATE*2*100//1000; SIL=b'\x00'*CHUNK
half=len(pcm)//2; half-=half%2
A=pcm[:half]; B=pcm[half:]
PROMPT='Разговор менеджера инвестиционной платформы Запуск с инвестором о Pre-IPO сделке.'
KW=['Zapusk','Запуск','Pre-IPO','инвестиционное предложение']
async def run(delay):
    inp={'format':{'type':'audio/pcm','rate':RATE},'transcription':{'model':'gpt-live-transcribe','languages':['ru'],'prompt':PROMPT,'keywords':KW,'delay':delay},'turn_detection':None}
    body=json.dumps({'session':{'type':'transcription','audio':{'input':inp}}}).encode()
    req=urllib.request.Request('https://api.openai.com/v1/realtime/client_secrets', data=body, headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=20) as r: secret=json.load(r)['value']
    log=[]; T={}
    async with websockets.connect('wss://api.openai.com/v1/realtime', additional_headers={'Authorization':'Bearer '+secret}, max_size=None, open_timeout=20) as ws:
        while True:
            m=json.loads(await asyncio.wait_for(ws.recv(), timeout=15))
            if m.get('type') in ('session.created','session.updated'): break
        t0=time.monotonic()
        async def send_pcm(buf, nxt):
            off=0
            while off<len(buf):
                await ws.send(json.dumps({'type':'input_audio_buffer.append','audio':base64.b64encode(buf[off:off+CHUNK]).decode()})); off+=CHUNK
                nxt+=0.1; await asyncio.sleep(max(0,nxt-time.monotonic()))
            return nxt
        async def sender():
            nxt=t0
            nxt=await send_pcm(A,nxt); T['A_end']=time.monotonic()-t0
            nxt=await send_pcm(SIL*7,nxt)   # 0.7 s silence like client-side VAD
            await ws.send(json.dumps({'type':'input_audio_buffer.commit'})); T['commit1']=time.monotonic()-t0
            nxt=await send_pcm(B,nxt); T['B_end']=time.monotonic()-t0
            nxt=await send_pcm(SIL*7,nxt)
            await ws.send(json.dumps({'type':'input_audio_buffer.commit'})); T['commit2']=time.monotonic()-t0
        async def receiver():
            deadline=t0+len(pcm)/48000+1.4+10; n_completed=0
            while time.monotonic()<deadline:
                try: raw=await asyncio.wait_for(ws.recv(), timeout=max(0.05,deadline-time.monotonic()))
                except asyncio.TimeoutError: break
                m=json.loads(raw); t=round(time.monotonic()-t0,2); typ=m.get('type')
                log.append((t,typ,(m.get('delta') or m.get('transcript') or json.dumps(m.get('error'),ensure_ascii=False) or '')))
                if typ.endswith('.completed'):
                    n_completed+=1
                    if n_completed>=2: await asyncio.sleep(0.5); break
        await asyncio.gather(sender(),receiver())
    print(f'\n=== gpt-live-transcribe delay={delay} ===  marks:', {k:round(v,2) for k,v in T.items()})
    comps=[(t,x) for t,typ,x in log if typ.endswith('.completed')]
    for i,(t,x) in enumerate(comps): print(f'  completed#{i+1} at {t} ({"+%.2f после commit%d" % (t-T.get(f"commit{i+1}",0), i+1)}): {x[:200]}')
    deltas=[(t,x) for t,typ,x in log if typ.endswith('.delta')]
    # deltas arriving after commit1 but before B audio produced text
    print('  deltas:',len(deltas),'| first after commit1:', next(((t,x) for t,x in deltas if t>T.get('commit1',1e9)), None))
    print('  other events:', [(t,typ,x[:60]) for t,typ,x in log if not typ.endswith('.delta') and not typ.endswith('.completed')][:8])
    full=''.join(x for _,x in deltas); print('  весь delta-поток:', full[:300])
async def main():
    for d in ('minimal','low'):
        try: await run(d)
        except Exception as e: print('EXC',type(e).__name__,str(e)[:200])
asyncio.run(main())
