const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';

interface TensorLike {
    tolist(): unknown;
}

interface FeatureExtractor {
    (text: string, options: { pooling: 'mean'; normalize: true }): Promise<TensorLike>;
    dispose?: () => Promise<void> | void;
}

let extractorPromise: Promise<FeatureExtractor> | null = null;

export function webSemanticSearchEnabled(): boolean {
    const configured = process.env.CENCORI_WEB_SEMANTIC_ENABLED;
    if (configured === 'false' || configured === '0') return false;
    if (configured === 'true' || configured === '1') return true;
    return false;
}

export function webEmbeddingModel(): string {
    return DEFAULT_MODEL;
}

async function createExtractor(): Promise<FeatureExtractor> {
    const transformers = await import('@huggingface/transformers');
    if (process.env.CENCORI_WEB_MODEL_CACHE) {
        transformers.env.cacheDir = process.env.CENCORI_WEB_MODEL_CACHE;
    }
    transformers.env.localModelPath = process.env.CENCORI_WEB_LOCAL_MODELS || '.cencori-web/models/';
    transformers.env.allowRemoteModels = process.env.CENCORI_WEB_ALLOW_REMOTE_MODELS === 'true';
    const model = process.env.CENCORI_WEB_EMBEDDING_MODEL || DEFAULT_MODEL;
    return transformers.pipeline('feature-extraction', model, {
        dtype: 'q8',
    }) as unknown as FeatureExtractor;
}

async function getExtractor(): Promise<FeatureExtractor> {
    extractorPromise ||= createExtractor();
    return extractorPromise;
}

function flattenEmbedding(value: unknown): number[] {
    const row = Array.isArray(value) && Array.isArray(value[0]) ? value[0] : value;
    if (!Array.isArray(row)) throw new Error('Embedding model returned an invalid tensor');
    const embedding = row.map(Number);
    if (embedding.length === 0 || embedding.some(number => !Number.isFinite(number))) {
        throw new Error('Embedding model returned invalid values');
    }
    return embedding;
}

export async function embedWebText(text: string): Promise<number[] | null> {
    if (!webSemanticSearchEnabled()) return null;
    const normalized = text.replace(/\s+/g, ' ').trim().slice(0, 12_000);
    if (!normalized) return null;
    const output = await (await getExtractor())(normalized, { pooling: 'mean', normalize: true });
    return flattenEmbedding(output.tolist());
}

export async function embedWebDocument(title: string, content: string): Promise<number[] | null> {
    return embedWebText(`${title}\n\n${content.slice(0, 10_000)}`);
}

export async function disposeWebEmbeddingPipeline(): Promise<void> {
    const pending = extractorPromise;
    extractorPromise = null;
    if (!pending) return;
    const extractor = await pending.catch(() => null);
    await extractor?.dispose?.();
}
