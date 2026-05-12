import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import { Rocket, FolderPlus, UploadCloud, Wand2, Package, FileCheck2, Sparkles, MessageSquare, ChevronRight, BookOpen } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
// Internal user guide for the Zapusk team. Static content — kept in code rather
// than CMS to keep MVP simple; will move to editable Templates table when needed.
const STEPS = [
    {
        n: 1,
        icon: _jsx(FolderPlus, { size: 16 }),
        title: 'Создать проект',
        text: 'Рабочий стол → «Новый проект». Заполните базовые поля: название, отрасль, стадия, сумма привлечения, доля, мин. чек, тип инвестора. ИНН можно оставить пустым, если юрлицо еще не создано.',
        cta: { label: 'Создать проект', to: '/projects/new' },
    },
    {
        n: 2,
        icon: _jsx(UploadCloud, { size: 16 }),
        title: 'Загрузить материалы',
        text: 'На странице проекта загрузите презентации, финансовые модели, описания, изображения или добавьте ссылки на рабочие материалы. Содержимое файлов автоматически попадает в контекст проекта.',
    },
    {
        n: 3,
        icon: _jsx(Wand2, { size: 16 }),
        title: 'Сформировать полный комплект материалов',
        text: 'За один клик система готовит бриф, «бизнес на салфетке» и 10 заданий для инвестиционных материалов с подстановкой данных проекта.',
    },
    {
        n: 4,
        icon: _jsx(Package, { size: 16 }),
        title: 'Скачать комплект',
        text: 'Кнопка в шапке проекта скачивает все подготовленные текстовые файлы для команды: бриф, одностраничник, задания для презентации, посадочной страницы, финансовой модели, калькулятора и ответов на вопросы инвестора.',
    },
    {
        n: 5,
        icon: _jsx(Sparkles, { size: 16 }),
        title: 'Передать материалы в работу',
        text: 'Используйте задания из комплекта для создания инвестиционной посадочной страницы, PDF-презентации, финансовой модели, инвестиционного калькулятора и материалов для встречи с инвестором.',
    },
    {
        n: 6,
        icon: _jsx(FileCheck2, { size: 16 }),
        title: 'Поставить оценки',
        text: 'На карточке каждого материала — рейтинг 1-5, комментарий, чекбоксы «годится» / «доработать». На странице проверки видно, какие материалы уже готовы, а какие требуют внимания.',
        cta: { label: 'Открыть проверку', to: '/dashboard' },
    },
    {
        n: 7,
        icon: _jsx(MessageSquare, { size: 16 }),
        title: 'Доработка по замечаниям',
        text: 'На любой карточке материала откройте задание, напишите комментарий и отправьте на доработку. Система создаст новую версию задания с учётом замечаний.',
    },
];
const PRINCIPLES = [
    {
        title: 'Продаём ДЕНЬГИ инвестора, не продукт',
        text: 'Любые материалы идут через формулу: «сколько вложу — сколько заработаю — когда получу». Это базовый принцип методологии Zapusk.',
    },
    {
        title: 'Калькулятор > PnL',
        text: 'Главный элемент финансовой модели — инвестиционный калькулятор на лендинге. PnL — это база, калькулятор — это точка принятия решения.',
    },
    {
        title: 'Трекшн = главный актив',
        text: 'Не статичные цифры, а история роста: «выросли с N до M за период за счёт [канал]». Если динамики нет — это сигнал добавить уточнение в бриф.',
    },
    {
        title: 'Материалы под тип инвестора',
        text: 'Частный → доход за срок. Фонд → рост и exit. Стратег → синергии. Грант → социальный/научный эффект.',
    },
    {
        title: 'Система не заменяет вас',
        text: 'Система ускоряет, структурирует и масштабирует работу. Но качество материалов = ваше понимание бизнеса + проверка командой.',
    },
];
export default function Guide() {
    return (_jsx(AppLayout, { title: "\u0413\u0430\u0439\u0434 \u043A\u043E\u043C\u0430\u043D\u0434\u044B", action: _jsx("a", { href: "https://zapusk.tech", target: "_blank", rel: "noreferrer", children: _jsx(Button, { variant: "ghost", size: "sm", iconLeft: _jsx(BookOpen, { size: 14 }), children: "\u0411\u0430\u0437\u0430 \u0437\u043D\u0430\u043D\u0438\u0439 Zapusk" }) }), children: _jsxs("div", { className: "max-w-readable mx-auto", children: [_jsxs("div", { className: "mb-8", children: [_jsxs("div", { className: "inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-zapusk-400 font-semibold mb-2", children: [_jsx(Rocket, { size: 12 }), " \u0420\u0430\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0446\u0435\u0441\u0441"] }), _jsx("h1", { className: "text-3xl font-bold text-primary tracking-tight", children: "\u041A\u0430\u043A \u043A\u043E\u043C\u0430\u043D\u0434\u0430 Zapusk \u0443\u043F\u0430\u043A\u043E\u0432\u044B\u0432\u0430\u0435\u0442 \u043F\u0440\u043E\u0435\u043A\u0442" }), _jsx("p", { className: "text-sm text-secondary mt-2 leading-relaxed", children: "\u042D\u0442\u043E\u0442 \u0433\u0430\u0439\u0434 \u043E\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u0442 \u043F\u0443\u0442\u044C \u043E\u0442 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432 \u0434\u043E \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u0433\u043E\u0442\u043E\u0432\u044B\u0445 \u0437\u0430\u0434\u0430\u043D\u0438\u0439 \u043A\u043E\u043C\u0430\u043D\u0434\u0435. 7 \u0448\u0430\u0433\u043E\u0432 \u0438 5 \u043F\u0440\u0438\u043D\u0446\u0438\u043F\u043E\u0432." })] }), _jsxs(Card, { padded: true, className: "mb-6", children: [_jsx(CardHeader, { title: "7 \u0448\u0430\u0433\u043E\u0432 \u0440\u0430\u0431\u043E\u0442\u044B \u0441 \u0441\u0435\u0440\u0432\u0438\u0441\u043E\u043C", subtitle: "\u041E\u0442 \u043F\u0443\u0441\u0442\u043E\u0433\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0434\u043E \u043F\u0430\u043A\u0435\u0442\u0430 \u0443 \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u0430 \u0437\u0430 \u043E\u0434\u0438\u043D-\u0434\u0432\u0430 \u0434\u043D\u044F" }), _jsx("ol", { className: "space-y-3", children: STEPS.map((s) => (_jsx("li", { className: "rounded-md border border-hairline bg-canvas/40 p-4", children: _jsxs("div", { className: "flex items-start gap-4", children: [_jsxs("div", { className: "flex flex-col items-center gap-1 shrink-0", children: [_jsx("div", { className: "w-9 h-9 rounded-md bg-grad-zapusk text-canvas font-bold flex items-center justify-center shadow-glow text-sm", children: s.n }), _jsx("div", { className: "text-muted", children: s.icon })] }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("h3", { className: "text-sm font-semibold text-primary mb-1", children: s.title }), _jsx("p", { className: "text-[13px] text-secondary leading-relaxed", children: s.text }), s.cta && (_jsx(Link, { to: s.cta.to, className: "inline-block mt-2.5", children: _jsx(Button, { size: "sm", variant: "ghost", iconRight: _jsx(ChevronRight, { size: 12 }), children: s.cta.label }) }))] })] }) }, s.n))) })] }), _jsxs(Card, { padded: true, accent: "zapusk", children: [_jsx(CardHeader, { title: "5 \u043F\u0440\u0438\u043D\u0446\u0438\u043F\u043E\u0432 \u043C\u0435\u0442\u043E\u0434\u043E\u043B\u043E\u0433\u0438\u0438 Zapusk", subtitle: "\u042D\u0442\u0438 \u043F\u0440\u0438\u043D\u0446\u0438\u043F\u044B \u0437\u0430\u0448\u0438\u0442\u044B \u0432 \u0448\u0430\u0431\u043B\u043E\u043D\u044B \u0437\u0430\u0434\u0430\u043D\u0438\u0439" }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: PRINCIPLES.map((p, i) => (_jsxs("div", { className: "rounded-md border border-hairline bg-canvas/40 p-4", children: [_jsx("h4", { className: "text-sm font-semibold text-primary mb-1.5", children: p.title }), _jsx("p", { className: "text-[12.5px] text-secondary leading-relaxed", children: p.text })] }, i))) })] })] }) }));
}
