export function computeProgress(project) {
    const hasFiles = (project.files?.length ?? 0) > 0;
    const hasBrief = Boolean(project.brief);
    const promptsByKind = new Set((project.generatedPrompts ?? []).map((p) => p.kind));
    const missingQuestions = collectMissingQuestions(project.brief);
    const answeredQuestions = new Set(parseAnswers(project.brief?.interviewAnswers).map(normalizeQuestion));
    const interviewDone = hasBrief && (missingQuestions.length === 0 ||
        missingQuestions.every((q) => answeredQuestions.has(normalizeQuestion(q))));
    const steps = [
        { key: 'materials', label: 'Данные загружены', done: hasFiles },
        { key: 'napkin', label: 'Бизнес на салфетке собран', done: hasBrief },
        { key: 'interview', label: 'Вопросы заполнены', done: interviewDone },
        { key: 'landing', label: 'Задание для лендинга готово', done: promptsByKind.has('lovable_landing') },
        { key: 'pitch', label: 'Презентация готова', done: promptsByKind.has('cloud_design') || promptsByKind.has('lovable_pitch') },
        { key: 'financial', label: 'Задание для финансовой модели готово', done: promptsByKind.has('financial') },
        { key: 'sales', label: 'Материал для встречи с инвестором готов', done: promptsByKind.has('sales_gpt') },
    ];
    const done = steps.filter((s) => s.done).length;
    const percent = Math.round((done / steps.length) * 100);
    return { steps, percent };
}
function parseMissing(raw) {
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function collectMissingQuestions(brief) {
    if (!brief)
        return [];
    const byCategory = parseRecord(brief.missingByCategory);
    const categorized = Object.values(byCategory).flatMap((items) => Array.isArray(items) ? items : []);
    const questions = categorized.length > 0 ? categorized : parseMissing(brief.missingData);
    return questions.filter((q) => typeof q === 'string' && q.trim().length > 0);
}
function parseAnswers(raw) {
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed
            .map((a) => typeof a?.question === 'string' && typeof a?.answer === 'string' && a.answer.trim() ? a.question : null)
            .filter((q) => Boolean(q));
    }
    catch {
        return [];
    }
}
function parseRecord(raw) {
    if (!raw)
        return {};
    try {
        const parsed = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
}
function normalizeQuestion(question) {
    return question.trim().replace(/\s+/g, ' ').toLowerCase();
}
