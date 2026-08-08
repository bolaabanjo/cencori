import type { ExtractedWebDocument } from './types';

export interface WebDocumentSignals {
    authorityScore: number;
    qualityScore: number;
    spamScore: number;
}

export interface HybridSearchCandidate {
    id: string;
    title: string;
    url: string;
    canonicalUrl: string;
    host: string;
    snippet: string;
    contentHash: string;
    retrievedAt: string;
    publishedAt: string | null;
    modifiedAt: string | null;
    lexicalScore: number;
    semanticScore: number;
    authorityScore: number;
    qualityScore: number;
    spamScore: number;
}

export interface RankedSearchCandidate extends HybridSearchCandidate {
    score: number;
}

function clamp(value: number): number {
    return Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 1);
}

function tokenRepetitionScore(text: string): number {
    const tokens = text.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
    if (tokens.length < 40) return 0;
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
    return clamp(Math.max(...counts.values()) / tokens.length * 4);
}

export function deriveWebDocumentSignals(
    document: ExtractedWebDocument,
    configuredAuthority = 0.5,
): WebDocumentSignals {
    const words = document.content.match(/\S+/g)?.length || 0;
    const contentLength = document.content.length;
    const linkDensity = document.links.length / Math.max(words, 1);
    const repetition = tokenRepetitionScore(document.content.slice(0, 100_000));
    const path = new URL(document.canonicalUrl).pathname.toLowerCase();
    const suspiciousPath = /\b(casino|betting|payday|viagra|coupon|crypto-airdrop|adult)\b/.test(path) ? 0.45 : 0;
    const titlePenalty = document.title.length < 4 || document.title.length > 220 ? 0.15 : 0;
    const thinPenalty = contentLength < 500 ? 0.35 : contentLength < 1_200 ? 0.12 : 0;
    const spamScore = clamp(repetition * 0.5 + Math.max(linkDensity - 0.18, 0) * 1.5 + suspiciousPath + titlePenalty);
    const completeness = clamp(Math.log10(Math.max(contentLength, 10)) / 5);
    const metadataQuality = (document.description ? 0.08 : 0) + (document.language ? 0.05 : 0)
        + (document.publishedAt || document.modifiedAt ? 0.07 : 0);
    const qualityScore = clamp(0.25 + completeness * 0.65 + metadataQuality - thinPenalty - spamScore * 0.45);
    return {
        authorityScore: clamp(configuredAuthority),
        qualityScore,
        spamScore,
    };
}

function normalizedScores(values: number[]): number[] {
    if (values.length === 0) return [];
    const max = Math.max(...values);
    if (max <= 0) return values.map(() => 0);
    return values.map(value => clamp(value / max));
}

function freshnessScore(candidate: HybridSearchCandidate, now: number): number {
    const timestamp = candidate.modifiedAt || candidate.publishedAt || candidate.retrievedAt;
    const parsed = Date.parse(timestamp);
    if (!Number.isFinite(parsed)) return 0.5;
    const ageDays = Math.max(0, now - parsed) / 86_400_000;
    return 0.55 + 0.45 * Math.exp(-ageDays / 180);
}

export function rerankWebCandidates(
    candidates: HybridSearchCandidate[],
    limit: number,
    options: { domainConstrained?: boolean; now?: number } = {},
): RankedSearchCandidate[] {
    const lexical = normalizedScores(candidates.map(candidate => candidate.lexicalScore));
    const semantic = candidates.map(candidate => clamp(candidate.semanticScore));
    const now = options.now ?? Date.now();
    const scored = candidates.map((candidate, index) => ({
        ...candidate,
        score: clamp(
            (0.44 * lexical[index]
                + 0.30 * semantic[index]
                + 0.10 * clamp(candidate.authorityScore)
                + 0.08 * freshnessScore(candidate, now)
                + 0.08 * clamp(candidate.qualityScore))
            * (1 - 0.82 * clamp(candidate.spamScore)),
        ),
    })).sort((a, b) => b.score - a.score || b.authorityScore - a.authorityScore);

    const selected: RankedSearchCandidate[] = [];
    const hostCounts = new Map<string, number>();
    const seenTitles = new Set<string>();
    while (scored.length > 0 && selected.length < limit) {
        let bestIndex = 0;
        let bestDiverseScore = Number.NEGATIVE_INFINITY;
        for (let index = 0; index < scored.length; index += 1) {
            const candidate = scored[index];
            const titleKey = candidate.title.toLowerCase().replace(/\W+/g, ' ').trim();
            const hostPenalty = options.domainConstrained ? 0 : Math.min((hostCounts.get(candidate.host) || 0) * 0.11, 0.33);
            const duplicatePenalty = seenTitles.has(titleKey) ? 0.28 : 0;
            const diverseScore = candidate.score - hostPenalty - duplicatePenalty;
            if (diverseScore > bestDiverseScore) {
                bestDiverseScore = diverseScore;
                bestIndex = index;
            }
        }
        const [chosen] = scored.splice(bestIndex, 1);
        selected.push(chosen);
        hostCounts.set(chosen.host, (hostCounts.get(chosen.host) || 0) + 1);
        seenTitles.add(chosen.title.toLowerCase().replace(/\W+/g, ' ').trim());
    }
    return selected;
}
