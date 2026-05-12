import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { Button } from './Button';
function getSpeechRecognition() {
    const speechWindow = window;
    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}
export function VoiceInputButton({ onTranscript, label = 'Надиктовать комментарий', className }) {
    const recognitionRef = useRef(null);
    const [listening, setListening] = useState(false);
    const [message, setMessage] = useState(null);
    function start() {
        const SpeechRecognition = getSpeechRecognition();
        if (!SpeechRecognition) {
            setMessage('Голосовой ввод не поддерживается в этом браузере. Введите комментарий текстом');
            return;
        }
        if (listening) {
            recognitionRef.current?.stop();
            setListening(false);
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = 'ru-RU';
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .flatMap((result) => Array.from(result))
                .map((result) => result.transcript)
                .join(' ')
                .trim();
            if (transcript)
                onTranscript(transcript);
            setMessage(null);
        };
        recognition.onerror = () => {
            setMessage('Не удалось распознать речь. Введите комментарий текстом');
        };
        recognition.onend = () => setListening(false);
        recognitionRef.current = recognition;
        setMessage(null);
        setListening(true);
        recognition.start();
    }
    return (_jsxs("div", { className: className, children: [_jsx(Button, { type: "button", size: "sm", variant: listening ? 'secondary' : 'ghost', iconLeft: listening ? _jsx(Square, { size: 12 }) : _jsx(Mic, { size: 12 }), onClick: start, children: listening ? 'Остановить запись' : label }), message && _jsx("p", { className: "mt-1.5 text-[11px] text-warning", children: message })] }));
}
