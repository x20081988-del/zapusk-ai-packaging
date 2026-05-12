export function buildReviewIndex(reviews) {
    const byKey = new Map();
    for (const r of reviews ?? []) {
        byKey.set(`${r.artefactKind}:${r.artefactKey}`, r);
    }
    return { byKey };
}
export function getReview(idx, kind, key) {
    return idx.byKey.get(`${kind}:${key}`);
}
// Packaging Quality Score = средневзвешенная оценка по 10 промптам + брифу.
// 1-5 → 20-100 (для удобной "процентной" интерпретации). Артефакты без оценки
// тянут вниз — иначе один поставленный 5 даст 100% и команда не увидит дыр.
export function computePackagingQualityScore(reviews, expectedKeys) {
    let sum = 0;
    let reviewed = 0;
    const seen = new Set();
    for (const r of reviews) {
        const compositeKey = `${r.artefactKind}:${r.artefactKey}`;
        if (seen.has(compositeKey))
            continue;
        if (!expectedKeys.includes(compositeKey))
            continue;
        seen.add(compositeKey);
        sum += r.score;
        reviewed++;
    }
    // Unreviewed artefacts count as 0 — visible gap, not invisible
    const total = expectedKeys.length;
    const pct = total ? Math.round((sum / (total * 5)) * 100) : 0;
    return { score: pct, reviewedCount: reviewed, totalCount: total };
}
