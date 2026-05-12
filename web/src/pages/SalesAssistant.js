import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Square, Headphones, AlertTriangle, Sparkles, MessageSquare, Target, Activity, ChevronRight, RefreshCw, } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Select } from '../components/ui/Input';
import { api } from '../lib/api';
import { useMode } from '../lib/mode';
import { isLegacyDemoProject } from '../lib/demoMaterials';
function getSR() {
    const w = window;
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
const STAGE_LABEL = {
    S: 'S — Situation',
    P: 'P — Problem',
    I: 'I — Implication',
    N: 'N — Need-Payoff',
};
const STAGE_HINT = {
    S: 'Раскрываем контекст инвестора',
    P: 'Ищем неудовлетворённость',
    I: 'Усиливаем — без манипуляции',
    N: 'Подводим к деньгам',
};
const TONE_TONE = {
    SOFT: 'info',
    CONTROL: 'zapusk',
    CLOSE: 'success',
};
export default function SalesAssistant() {
    const [projects, setProjects] = useState([]);
    const [mode] = useMode();
    const [projectId, setProjectId] = useState('');
    const [listening, setListening] = useState(false);
    const [permError, setPermError] = useState(null);
    const [transcript, setTranscript] = useState([]);
    const [interim, setInterim] = useState('');
    const [card, setCard] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [adviceHistory, setAdviceHistory] = useState([]);
    const [speechStatus, setSpeechStatus] = useState('idle');
    const srRef = useRef(null);
    const restartTimerRef = useRef(null);
    const shouldListenRef = useRef(false);
    const recognitionActiveRef = useRef(false);
    const analyzingRef = useRef(false);
    const transcriptLinesRef = useRef([]);
    const speechStatusRef = useRef('idle');
    const cardRef = useRef(null);
    const adviceHistoryRef = useRef([]);
    const transcriptRef = useRef(null);
    // Initial project list — agent ties advice to the active project's context.
    useEffect(() => {
        api.get('/api/projects').then((r) => {
            setProjects(r.projects);
            if (r.projects[0]?.id)
                setProjectId(r.projects[0].id);
        });
    }, []);
    useEffect(() => {
        transcriptLinesRef.current = transcript;
    }, [transcript]);
    useEffect(() => {
        speechStatusRef.current = speechStatus;
    }, [speechStatus]);
    useEffect(() => {
        cardRef.current = card;
    }, [card]);
    useEffect(() => {
        adviceHistoryRef.current = adviceHistory;
    }, [adviceHistory]);
    useEffect(() => () => {
        shouldListenRef.current = false;
        recognitionActiveRef.current = false;
        if (restartTimerRef.current)
            window.clearTimeout(restartTimerRef.current);
        try {
            srRef.current?.stop();
        }
        catch { /* ignore unmount race */ }
    }, []);
    // Auto-scroll transcript to bottom on new lines
    useEffect(() => {
        if (transcriptRef.current) {
            transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
        }
    }, [transcript, interim]);
    function fullTranscript() {
        return transcriptLinesRef.current.filter((t) => t.final).map((t) => t.text).join('\n');
    }
    function recentContext() {
        const text = fullTranscript();
        return text.length > 6_000 ? text.slice(-6_000) : text;
    }
    function toAdviceHistoryItem(next) {
        return {
            situation: next.situation,
            recommendation: next.recommendation,
            suggestedPhrase: next.suggestedPhrase,
            spinStage: next.spinStage,
            tone: next.tone,
            nextStep: next.nextStep,
        };
    }
    async function runAnalyze() {
        if (analyzingRef.current)
            return;
        const transcriptText = fullTranscript();
        if (transcriptText.trim().length < 10) {
            setPermError('Сначала начните прослушивание и скажите несколько фраз.');
            return;
        }
        analyzingRef.current = true;
        setAnalyzing(true);
        try {
            const r = await api.post('/api/sales-assistant/analyze', {
                transcript: transcriptText.slice(-32_000),
                recentContext: recentContext(),
                previousAdvice: cardRef.current,
                previousSpinStage: cardRef.current?.spinStage ?? null,
                adviceHistory: adviceHistoryRef.current.slice(-6),
                projectId: projectId || null,
            });
            setCard(r.card);
            setAdviceHistory((prev) => [...prev, toAdviceHistoryItem(r.card)].slice(-6));
            setPermError(null);
        }
        catch (err) {
            // soft-fail — transcript keeps growing
            console.warn('[sales-assistant] analyze error', err);
        }
        finally {
            analyzingRef.current = false;
            setAnalyzing(false);
        }
    }
    function startRecognition() {
        if (recognitionActiveRef.current || srRef.current)
            return;
        const SR = getSR();
        if (!SR) {
            shouldListenRef.current = false;
            setListening(false);
            setPermError('Голосовой ввод не поддерживается в этом браузере. Откройте в Chrome / Edge / Safari.');
            speechStatusRef.current = 'mic_error';
            setSpeechStatus('mic_error');
            return;
        }
        try {
            const sr = new SR();
            sr.lang = 'ru-RU';
            sr.continuous = true;
            sr.interimResults = true;
            sr.onresult = (e) => {
                let interimText = '';
                const final = [];
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    const res = e.results[i];
                    const t = (res?.[0]?.transcript ?? '').trim();
                    if (!t)
                        continue;
                    if (res.isFinal)
                        final.push({ ts: Date.now(), final: true, text: t });
                    else
                        interimText += (interimText ? ' ' : '') + t;
                }
                if (final.length)
                    setTranscript((prev) => [...prev, ...final]);
                setInterim(interimText);
            };
            sr.onerror = (e) => {
                const code = e.error ?? '';
                if (code === 'not-allowed' || code === 'service-not-allowed') {
                    shouldListenRef.current = false;
                    setListening(false);
                    recognitionActiveRef.current = false;
                    if (srRef.current === sr)
                        srRef.current = null;
                    speechStatusRef.current = 'mic_error';
                    setSpeechStatus('mic_error');
                    setPermError('Доступ к микрофону не разрешён. Разрешите доступ в настройках браузера.');
                    try {
                        sr.stop();
                    }
                    catch { /* ignore */ }
                    return;
                }
                if (code === 'audio-capture') {
                    shouldListenRef.current = false;
                    setListening(false);
                    recognitionActiveRef.current = false;
                    if (srRef.current === sr)
                        srRef.current = null;
                    speechStatusRef.current = 'mic_error';
                    setSpeechStatus('mic_error');
                    setPermError('Браузер не видит микрофон. Проверьте устройство ввода и разрешения.');
                    return;
                }
                if (shouldListenRef.current) {
                    speechStatusRef.current = 'restarting';
                    setSpeechStatus('restarting');
                    setPermError(code ? `Распознавание временно остановилось (${code}), перезапускаю автоматически.` : null);
                    return;
                }
            };
            sr.onend = () => {
                recognitionActiveRef.current = false;
                if (srRef.current === sr)
                    srRef.current = null;
                if (shouldListenRef.current) {
                    speechStatusRef.current = 'restarting';
                    setSpeechStatus('restarting');
                    if (restartTimerRef.current)
                        window.clearTimeout(restartTimerRef.current);
                    restartTimerRef.current = window.setTimeout(() => {
                        if (shouldListenRef.current)
                            startRecognition();
                    }, 350);
                }
                else if (speechStatusRef.current !== 'mic_error') {
                    const next = transcriptLinesRef.current.length ? 'stopped' : 'idle';
                    speechStatusRef.current = next;
                    setSpeechStatus(next);
                }
            };
            srRef.current = sr;
            sr.start();
            recognitionActiveRef.current = true;
            setListening(true);
            speechStatusRef.current = 'listening';
            setSpeechStatus('listening');
            setPermError(null);
        }
        catch (err) {
            shouldListenRef.current = false;
            setListening(false);
            srRef.current = null;
            recognitionActiveRef.current = false;
            speechStatusRef.current = 'mic_error';
            setSpeechStatus('mic_error');
            setPermError(err instanceof Error ? err.message : 'Не удалось включить распознавание речи');
        }
    }
    function start() {
        shouldListenRef.current = true;
        setPermError(null);
        startRecognition();
    }
    function stop() {
        shouldListenRef.current = false;
        setListening(false);
        speechStatusRef.current = 'stopped';
        setSpeechStatus('stopped');
        if (restartTimerRef.current)
            window.clearTimeout(restartTimerRef.current);
        try {
            srRef.current?.stop();
        }
        catch { /* ignore */ }
        srRef.current = null;
        recognitionActiveRef.current = false;
        setInterim('');
    }
    function reset() {
        setTranscript([]);
        setInterim('');
        setCard(null);
        setAdviceHistory([]);
        speechStatusRef.current = 'idle';
        setSpeechStatus('idle');
        setPermError(null);
    }
    const wordCount = useMemo(() => transcript.filter((t) => t.final).reduce((acc, t) => acc + t.text.split(/\s+/).length, 0), [transcript]);
    const hasFinalTranscript = transcript.some((t) => t.final);
    const visibleProjects = useMemo(() => projects.filter((p) => mode === 'team' || !isLegacyDemoProject(p)), [mode, projects]);
    const statusText = {
        idle: {
            title: 'Готов к старту',
            hint: 'Нажмите «Начать прослушивание» и разрешите доступ к микрофону.',
        },
        listening: {
            title: 'Слушает',
            hint: 'Говорите естественно. Паузы не завершают встречу, распознавание перезапускается автоматически.',
        },
        restarting: {
            title: 'Перезапуск распознавания',
            hint: 'Браузер завершил короткую speech-сессию, ассистент продолжает слушать автоматически.',
        },
        stopped: {
            title: 'Остановлено пользователем',
            hint: 'Можно продолжить встречу или сбросить текущую транскрипцию.',
        },
        mic_error: {
            title: 'Ошибка микрофона',
            hint: 'Проверьте разрешение браузера и устройство ввода.',
        },
    };
    const providerLabel = card?.fellBackToMock || card?.source === 'mock'
        ? 'Mock'
        : card?.provider === 'openai'
            ? 'OpenAI'
            : card?.provider;
    return (_jsxs(AppLayout, { title: "AI-\u0430\u0441\u0441\u0438\u0441\u0442\u0435\u043D\u0442 \u043D\u0430 \u043F\u0440\u043E\u0434\u0430\u0436\u0430\u0445", action: _jsxs("div", { className: "flex items-center gap-2", children: [visibleProjects.length > 0 && (_jsx("div", { className: "w-64", children: _jsx(Select, { value: projectId, onChange: (e) => setProjectId(e.target.value), options: [{ value: '', label: 'Без привязки к проекту' }, ...visibleProjects.map((p) => ({ value: p.id, label: p.name }))] }) })), listening
                    ? _jsx(Button, { variant: "danger", iconLeft: _jsx(Square, { size: 14 }), onClick: stop, children: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C" })
                    : _jsx(Button, { variant: "primary", iconLeft: _jsx(Mic, { size: 14 }), onClick: start, children: "\u041D\u0430\u0447\u0430\u0442\u044C \u043F\u0440\u043E\u0441\u043B\u0443\u0448\u0438\u0432\u0430\u043D\u0438\u0435" }), _jsx(Button, { variant: "ai", iconLeft: _jsx(RefreshCw, { size: 14 }), onClick: runAnalyze, loading: analyzing, disabled: !hasFinalTranscript, children: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0443" }), transcript.length > 0 && !listening && (_jsx(Button, { variant: "ghost", onClick: reset, children: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C" }))] }), children: [_jsxs(Card, { padded: true, className: "mb-6", children: [_jsxs("div", { className: "flex items-center justify-between gap-4 flex-wrap", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: `w-9 h-9 rounded-md flex items-center justify-center ${listening ? 'bg-grad-zapusk shadow-glow text-canvas' : 'bg-elevated border border-line text-secondary'}`, children: _jsx(Headphones, { size: 16 }) }), _jsxs("div", { children: [_jsx("div", { className: "text-sm font-semibold text-primary", children: statusText[speechStatus].title }), _jsx("div", { className: "text-xs text-muted", children: statusText[speechStatus].hint })] })] }), _jsxs("div", { className: "flex items-center gap-4 text-[11px] text-muted", children: [_jsxs("span", { children: [_jsx("span", { className: "text-primary font-num text-sm", children: wordCount }), " \u0441\u043B\u043E\u0432"] }), _jsxs("span", { children: [_jsx("span", { className: "text-primary font-num text-sm", children: transcript.filter((t) => t.final).length }), " \u0440\u0435\u043F\u043B\u0438\u043A"] }), speechStatus === 'listening' && _jsx(StatusBadge, { tone: "success", dot: true, children: "\u0441\u043B\u0443\u0448\u0430\u0435\u0442" }), speechStatus === 'restarting' && _jsx(StatusBadge, { tone: "warning", dot: true, children: "\u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u043A" }), speechStatus === 'stopped' && _jsx(StatusBadge, { tone: "neutral", dot: true, children: "\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E" }), speechStatus === 'mic_error' && _jsx(StatusBadge, { tone: "danger", dot: true, children: "\u043E\u0448\u0438\u0431\u043A\u0430 \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D\u0430" }), hasFinalTranscript && !analyzing && _jsx(StatusBadge, { tone: "info", dot: true, children: "\u0433\u043E\u0442\u043E\u0432 \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0443" }), analyzing && _jsx(StatusBadge, { tone: "ai", dot: true, children: "\u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0435\u043C \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0443" }), card && _jsx(StatusBadge, { tone: card.fellBackToMock || card.source === 'mock' ? 'neutral' : 'success', dot: true, children: providerLabel })] })] }), permError && (_jsxs("div", { className: "mt-3 flex items-start gap-2 px-3 py-2 rounded-md bg-warning/10 border border-warning/30 text-xs text-warning", children: [_jsx(AlertTriangle, { size: 13, className: "mt-0.5 shrink-0" }), permError] }))] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-6", children: [_jsxs(Card, { padded: true, children: [_jsx(CardHeader, { title: "\u0416\u0438\u0432\u0430\u044F \u0442\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u043F\u0446\u0438\u044F", subtitle: "\u0421\u043B\u0435\u0432\u0430 \u0440\u0430\u0441\u0442\u0451\u0442 \u0434\u0438\u0430\u043B\u043E\u0433 \u0432\u0441\u0442\u0440\u0435\u0447\u0438 \u0432 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u043C \u0432\u0440\u0435\u043C\u0435\u043D\u0438" }), _jsxs("div", { ref: transcriptRef, className: "bg-canvas border border-hairline rounded-md p-4 h-[60vh] overflow-y-auto space-y-2", children: [transcript.length === 0 && !interim && (_jsx("p", { className: "text-sm text-muted text-center py-8", children: "\u0422\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u043F\u0446\u0438\u044F \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u0437\u0434\u0435\u0441\u044C \u043F\u043E\u0441\u043B\u0435 \u0441\u0442\u0430\u0440\u0442\u0430." })), transcript.filter((t) => t.final).map((t, i) => (_jsx("p", { className: "text-[13.5px] text-primary leading-relaxed", children: t.text }, i))), interim && (_jsxs("p", { className: "text-[13.5px] text-muted italic leading-relaxed", children: [interim, "\u2026"] }))] })] }), _jsxs("div", { className: "space-y-4", children: [!card && (_jsxs(Card, { padded: true, className: "text-center py-12", children: [_jsx("div", { className: "w-12 h-12 mx-auto mb-3 rounded-full bg-ai/15 border border-ai/30 flex items-center justify-center text-ai-glow", children: _jsx(Sparkles, { size: 18 }) }), _jsx("h3", { className: "text-base font-semibold text-primary mb-1", children: "\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u0437\u0434\u0435\u0441\u044C" }), _jsx("p", { className: "text-xs text-secondary max-w-sm mx-auto", children: "\u0421\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0444\u0440\u0430\u0437, \u0437\u0430\u0442\u0435\u043C \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u00AB\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0443\u00BB \u2014 \u0430\u0441\u0441\u0438\u0441\u0442\u0435\u043D\u0442 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442 \u044D\u0442\u0430\u043F SPIN, \u0442\u043E\u043D \u0438 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0438\u0442 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0443\u044E \u0440\u0435\u043F\u043B\u0438\u043A\u0443." })] })), card && _jsx(AdviceCard, { card: card })] })] })] }));
}
function AdviceCard({ card }) {
    return (_jsxs(Card, { padded: true, accent: card.tone === 'CLOSE' ? 'zapusk' : 'ai', children: [_jsxs("div", { className: "flex items-center justify-between gap-2 mb-4 flex-wrap", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(StatusBadge, { tone: "ai", dot: true, children: STAGE_LABEL[card.spinStage] }), _jsxs(StatusBadge, { tone: TONE_TONE[card.tone], dot: true, children: ["\u0422\u043E\u043D \u00B7 ", card.tone] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "text-[10px] uppercase tracking-[0.1em] text-muted", children: "\u0423\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0441\u0442\u044C" }), _jsxs("div", { className: `text-base font-bold font-num ${card.confidence >= 60 ? 'text-success' : card.confidence >= 35 ? 'text-zapusk-400' : 'text-warning'}`, children: [card.confidence, "%"] })] })] }), _jsx("div", { className: "text-[11px] text-muted mb-4", children: STAGE_HINT[card.spinStage] }), _jsx(AdviceFields, { card: card })] }));
}
function AdviceFields({ card, compact }) {
    return (_jsxs("div", { className: `space-y-${compact ? '3' : '4'}`, children: [_jsx(Field, { icon: _jsx(Activity, { size: 14 }), label: "\u0427\u0442\u043E \u043F\u0440\u043E\u0438\u0441\u0445\u043E\u0434\u0438\u0442", children: card.situation }), card.risk && (_jsx(Field, { icon: _jsx(AlertTriangle, { size: 14, className: "text-warning" }), label: "\u0413\u0434\u0435 \u0440\u0438\u0441\u043A", tone: "warning", children: card.risk })), _jsx(Field, { icon: _jsx(Target, { size: 14, className: "text-zapusk-400" }), label: "\u0427\u0442\u043E \u0434\u0435\u043B\u0430\u0442\u044C", children: card.recommendation }), _jsxs("div", { children: [_jsxs("div", { className: "text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1.5 flex items-center gap-1.5", children: [_jsx(MessageSquare, { size: 12, className: "text-ai-glow" }), "\u0427\u0442\u043E \u0441\u043A\u0430\u0437\u0430\u0442\u044C \u0441\u0435\u0439\u0447\u0430\u0441"] }), _jsxs("blockquote", { className: "bg-canvas border border-ai/30 rounded-md px-4 py-3 text-[14.5px] leading-relaxed text-primary", children: ["\u00AB", card.suggestedPhrase, "\u00BB"] })] }), card.objection && (_jsx(Field, { icon: _jsx(AlertTriangle, { size: 14, className: "text-warning" }), label: "\u0412\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u0435", tone: "warning", children: card.objection })), card.nextStep && (_jsxs("div", { className: "flex items-start gap-2 px-3 py-2 rounded-md bg-zapusk/8 border border-zapusk/25", children: [_jsx(ChevronRight, { size: 14, className: "text-zapusk-400 mt-0.5 shrink-0" }), _jsxs("div", { children: [_jsx("div", { className: "text-[10px] uppercase tracking-[0.1em] text-zapusk-400 font-semibold mb-0.5", children: "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433" }), _jsx("div", { className: "text-sm text-primary", children: card.nextStep })] })] }))] }));
}
function Field({ icon, label, tone, children }) {
    return (_jsxs("div", { children: [_jsxs("div", { className: `text-[10px] uppercase tracking-[0.1em] font-semibold mb-1 flex items-center gap-1.5 ${tone === 'warning' ? 'text-warning' : 'text-muted'}`, children: [icon, label] }), _jsx("div", { className: "text-sm text-primary leading-relaxed", children: children })] }));
}
