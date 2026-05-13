import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import { api } from '../lib/api';
import { defaultRouteForRole, setAuth } from '../lib/auth';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Logo } from '../components/ui/Logo';
export default function Login() {
    const [email, setEmail] = useState('founder@zapusk.tech');
    const [name, setName] = useState('Zapusk Founder');
    const [role, setRole] = useState('client');
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);
    const navigate = useNavigate();
    async function submit(e) {
        e.preventDefault();
        setLoading(true);
        setErr(null);
        try {
            const res = await api.post('/api/auth/login', { email, name, role });
            const nextRole = res.user.role ?? role;
            setAuth({ email: res.user.email, name: res.user.name ?? email, role: nextRole });
            navigate(defaultRouteForRole(nextRole));
        }
        catch (e) {
            setErr(e instanceof Error ? e.message : 'login failed');
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsxs("div", { className: "min-h-screen flex items-center justify-center bg-canvas relative overflow-hidden", children: [_jsx("div", { className: "absolute inset-0 bg-dot-grid opacity-50 pointer-events-none" }), _jsx("div", { className: "absolute top-1/4 -left-32 w-96 h-96 bg-zapusk/15 rounded-full blur-3xl pointer-events-none" }), _jsx("div", { className: "absolute bottom-1/4 -right-32 w-96 h-96 bg-ai/15 rounded-full blur-3xl pointer-events-none" }), _jsxs("div", { className: "relative w-full max-w-md px-6", children: [_jsx("div", { className: "flex justify-center mb-8", children: _jsx(Logo, {}) }), _jsxs("div", { className: "bg-surface border border-line rounded-xl p-7 shadow-lifted", children: [_jsxs("div", { className: "mb-6", children: [_jsxs("div", { className: "inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-zapusk-400 font-semibold mb-2", children: [_jsx(Rocket, { size: 12 }), " \u0420\u0430\u0431\u043E\u0447\u0438\u0439 \u0441\u0442\u043E\u043B \u043F\u0440\u043E\u0435\u043A\u0442\u0430"] }), _jsx("h1", { className: "text-2xl font-bold text-primary tracking-tight", children: "\u0412\u043E\u0439\u0442\u0438 \u0432 \u0441\u0438\u0441\u0442\u0435\u043C\u0443" }), _jsx("p", { className: "text-sm text-secondary mt-1.5", children: "\u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430 ZAPUSK AI \u00B7 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u043A \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0443 \u0441 \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u043E\u043C" })] }), _jsxs("form", { onSubmit: submit, className: "space-y-4", children: [_jsx(Input, { label: "Email", type: "email", value: email, onChange: (e) => setEmail(e.target.value), required: true, placeholder: "you@company.com" }), _jsx(Input, { label: "\u0418\u043C\u044F", value: name, onChange: (e) => setName(e.target.value), placeholder: "\u041A\u0430\u043A \u043A \u0432\u0430\u043C \u043E\u0431\u0440\u0430\u0449\u0430\u0442\u044C\u0441\u044F" }), _jsx(Select, { label: "\u0420\u043E\u043B\u044C \u0434\u043B\u044F \u0434\u0435\u043C\u043E", value: role, onChange: (e) => setRole(e.target.value), options: [
                                            { value: 'client', label: 'Клиент' },
                                            { value: 'manager', label: 'Менеджер Zapusk' },
                                            { value: 'admin', label: 'Админ Zapusk' },
                                        ] }), err && _jsx("div", { className: "text-xs text-danger", children: err }), _jsx(Button, { type: "submit", loading: loading, className: "w-full", size: "lg", children: "\u0412\u043E\u0439\u0442\u0438" })] }), _jsx("div", { className: "mt-5 pt-5 border-t border-hairline text-xs text-muted text-center", children: "\u0420\u0430\u043D\u043D\u0438\u0439 \u0434\u043E\u0441\u0442\u0443\u043F. \u041E\u0434\u0438\u043D \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C = \u043E\u0434\u043D\u0430 \u0441\u0435\u0441\u0441\u0438\u044F. \u041F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0430 \u0440\u043E\u043B\u0435\u0439 \u0438 \u0435\u0434\u0438\u043D\u044B\u0439 \u0432\u0445\u043E\u0434 \u2014 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u044D\u0442\u0430\u043F." })] })] })] }));
}
