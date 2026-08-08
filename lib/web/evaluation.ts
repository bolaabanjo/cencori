export interface SearchEvaluationCase {
    id: string;
    query: string;
    expectedDomains?: string[];
    expectedUrls?: string[];
}

export interface SearchEvaluationResult {
    id: string;
    query: string;
    reciprocalRank: number;
    recallAtK: number;
    ndcgAtK: number;
    latencyMs: number;
    returnedDomains: string[];
}

function normalizedUrl(value: string): string {
    const parsed = new URL(value);
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
}

function relevanceKey(url: string, testCase: SearchEvaluationCase): string | null {
    const parsed = new URL(url);
    const expectedDomains = testCase.expectedDomains || [];
    const expectedUrls = (testCase.expectedUrls || []).map(normalizedUrl);
    const exactUrl = expectedUrls.find(expectedUrl => expectedUrl === normalizedUrl(url));
    if (exactUrl) return `url:${exactUrl}`;
    const domain = expectedDomains.find(expectedDomain =>
        parsed.hostname === expectedDomain || parsed.hostname.endsWith(`.${expectedDomain}`));
    return domain ? `domain:${domain}` : null;
}

export function scoreSearchEvaluationCase(
    testCase: SearchEvaluationCase,
    urls: string[],
    latencyMs: number,
): SearchEvaluationResult {
    const creditedTargets = new Set<string>();
    const relevance = urls.map(url => {
        const key = relevanceKey(url, testCase);
        if (!key || creditedTargets.has(key)) return false;
        creditedTargets.add(key);
        return true;
    });
    const firstRelevant = relevance.findIndex(Boolean);
    const relevantReturned = relevance.filter(Boolean).length;
    const expectedCount = Math.max((testCase.expectedUrls?.length || 0) + (testCase.expectedDomains?.length || 0), 1);
    const dcg = relevance.reduce((sum, relevant, index) => sum + (relevant ? 1 / Math.log2(index + 2) : 0), 0);
    const idealCount = Math.min(expectedCount, urls.length);
    const idealDcg = Array.from({ length: idealCount }, (_, index) => 1 / Math.log2(index + 2)).reduce((a, b) => a + b, 0);
    return {
        id: testCase.id,
        query: testCase.query,
        reciprocalRank: firstRelevant === -1 ? 0 : 1 / (firstRelevant + 1),
        recallAtK: Math.min(relevantReturned / expectedCount, 1),
        ndcgAtK: idealDcg > 0 ? dcg / idealDcg : 0,
        latencyMs,
        returnedDomains: [...new Set(urls.map(url => new URL(url).hostname))],
    };
}

export function summarizeSearchEvaluations(results: SearchEvaluationResult[]) {
    const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const latencies = results.map(result => result.latencyMs).sort((a, b) => a - b);
    return {
        cases: results.length,
        mrr: mean(results.map(result => result.reciprocalRank)),
        recallAtK: mean(results.map(result => result.recallAtK)),
        ndcgAtK: mean(results.map(result => result.ndcgAtK)),
        meanLatencyMs: mean(latencies),
        p95LatencyMs: latencies.length ? latencies[Math.min(Math.ceil(latencies.length * 0.95) - 1, latencies.length - 1)] : 0,
        uniqueDomains: new Set(results.flatMap(result => result.returnedDomains)).size,
    };
}
