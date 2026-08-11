/**
 * Supported AI Providers and Models
 * 
 * This file defines all providers supported by Cencori
 * with their available models and metadata.
 */

export interface AIModel {
    id: string;
    name: string;
    type: string | string[];
    contextWindow: number;
    description?: string;
    free?: boolean;
}

export interface AIProviderConfig {
    id: string;
    name: string;
    icon: string; // Path relative to /public/providers/
    website: string;
    docsUrl: string;
    keyPrefix: string; // Expected API key prefix (e.g., "sk-" for OpenAI)
    models: AIModel[];
}

export const SUPPORTED_PROVIDERS: AIProviderConfig[] = [
    {
        id: 'zai',
        name: 'Z.AI',
        icon: '/providers/zai.svg',
        website: 'https://z.ai',
        docsUrl: 'https://docs.z.ai/guides/llm/glm-5.2',
        keyPrefix: '',
        models: [
            { id: 'glm-5.2', name: 'GLM-5.2', type: ['chat', 'reasoning'], contextWindow: 1000000, description: 'Flagship model, 1M context, coding & agentic, reasoning effort (max/high)' },
        ],
    },
    {
        id: 'openai',
        name: 'OpenAI',
        icon: '/providers/openai.svg',
        website: 'https://openai.com',
        docsUrl: 'https://platform.openai.com/docs',
        keyPrefix: 'sk-',
        models: [
            // GPT-5.6 Series (July 2026)
            { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', type: ['chat', 'reasoning', 'code'], contextWindow: 1050000, description: 'Flagship, SOTA coding/cyber/science, max/ultra reasoning, $5/$30 per 1M' },
            { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', type: ['chat', 'reasoning', 'code'], contextWindow: 1050000, description: 'Balanced, competitive with GPT-5.5 at 2x lower cost, $2.50/$15 per 1M' },
            { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', type: ['chat', 'reasoning', 'code'], contextWindow: 1050000, description: 'Fast/affordable, outperforms GPT-5.5 peak at 25x lower cost, $1/$6 per 1M' },
            { id: 'gpt-5.5', name: 'GPT-5.5', type: ['chat'], contextWindow: 1050000, description: 'New class of intelligence for real work and agents' },
            { id: 'gpt-5.4', name: 'GPT-5.4 Thinking', type: ['chat', 'reasoning'], contextWindow: 1050000, description: 'Latest GPT-5.4 reasoning model' },
            { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', type: ['chat', 'reasoning', 'code'], contextWindow: 400000, description: 'High-volume coding and agent model' },
            { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', type: ['chat', 'reasoning'], contextWindow: 400000, description: 'Lowest-cost GPT-5.4 model' },
            { id: 'gpt-5.4-pro', name: 'GPT-5.4 Pro', type: ['chat', 'reasoning'], contextWindow: 400000, description: 'Most capable GPT-5.4 variant' },
            { id: 'gpt-5.3-chat-latest', name: 'GPT-5.3 Instant', type: ['chat'], contextWindow: 400000, description: 'Latest GPT-5.3 instant release' },
            { id: 'gpt-5.2-pro', name: 'GPT-5.2 Pro', type: ['chat'], contextWindow: 400000, description: 'Most capable GPT-5.2 variant' },
            { id: 'gpt-5.2', name: 'GPT-5.2', type: ['chat'], contextWindow: 400000, description: 'Latest GPT-5.2 flagship' },
            { id: 'gpt-5.1', name: 'GPT-5.1', type: ['chat'], contextWindow: 400000, description: 'Improved GPT-5 generation' },
            { id: 'gpt-5-pro', name: 'GPT-5 Pro', type: ['chat'], contextWindow: 400000, description: 'High-quality GPT-5 variant' },
            { id: 'gpt-5', name: 'GPT-5', type: ['chat'], contextWindow: 400000, description: 'Flagship model' },
            { id: 'gpt-5-mini', name: 'GPT-5 Mini', type: ['chat'], contextWindow: 400000, description: 'Fast and efficient' },
            { id: 'gpt-5-nano', name: 'GPT-5 Nano', type: ['chat'], contextWindow: 400000, description: 'Lowest-latency GPT-5 model' },
            // GPT-4.1 / GPT-4o Series
            { id: 'gpt-4.1', name: 'GPT-4.1', type: ['chat', 'code'], contextWindow: 1047576, description: 'Long-context GPT-4.1' },
            { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', type: ['chat'], contextWindow: 1047576, description: 'Balanced GPT-4.1 model' },
            { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', type: ['chat'], contextWindow: 1047576, description: 'Fast GPT-4.1 nano model' },
            { id: 'gpt-4o', name: 'GPT-4o', type: ['chat'], contextWindow: 128000, description: 'Omni-modal model' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', type: ['chat'], contextWindow: 128000, description: 'Fast and cost-effective' },
            // O-Series Reasoning (latest)
            { id: 'o3', name: 'o3', type: ['reasoning', 'code'], contextWindow: 200000, description: 'Advanced reasoning model' },
            { id: 'o3-mini', name: 'o3 Mini', type: ['reasoning'], contextWindow: 200000, description: 'Fast reasoning model' },
            { id: 'o4-mini', name: 'o4 Mini', type: ['reasoning'], contextWindow: 200000, description: 'Successor to o1-mini' },
            { id: 'o1', name: 'o1', type: ['reasoning'], contextWindow: 200000, description: 'Legacy reasoning model' },
            // Image Generation
            { id: 'gpt-image-2', name: 'GPT Image 2', type: ['image'], contextWindow: 0, description: 'State-of-the-art image generation model' },
            { id: 'gpt-image-1.5', name: 'GPT Image 1.5', type: ['image'], contextWindow: 0, description: 'Best text rendering' },
            { id: 'gpt-image-1', name: 'GPT Image 1', type: ['image'], contextWindow: 0, description: 'ChatGPT image generation model' },
        ],
    },
    {
        id: 'anthropic',
        name: 'Anthropic',
        icon: '/providers/anthropic.svg',
        website: 'https://anthropic.com',
        docsUrl: 'https://docs.anthropic.com',
        keyPrefix: 'sk-ant-',
        // Kept in sync with Anthropic's GET /v1/models — a model we list but
        // Anthropic has retired fails upstream no matter what we price it at.
        models: [
            // Claude 5 Series (June-July 2026)
            { id: 'claude-fable-5', name: 'Claude Fable 5', type: ['chat', 'reasoning', 'code'], contextWindow: 1000000, description: 'Most capable model, for the most demanding reasoning & long-horizon agentic work' },
            { id: 'claude-opus-5', name: 'Claude Opus 5', type: ['chat', 'reasoning', 'code'], contextWindow: 1000000, description: 'New flagship for complex agentic coding & enterprise work, succeeds Opus 4.8' },
            { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', type: ['chat', 'reasoning', 'code'], contextWindow: 1000000, description: 'Anthropic\'s most agentic Sonnet, close to Opus-tier capabilities' },
            // Claude 4 Series (2025/2026)
            { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', type: ['chat', 'reasoning', 'code'], contextWindow: 1000000, description: 'Latest flagship, dynamic workflows & effort control' },
            { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', type: ['chat', 'reasoning', 'code'], contextWindow: 1000000, description: 'Latest flagship, improved reasoning & agentic coding' },
            { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', type: ['chat', 'reasoning', 'code'], contextWindow: 1000000, description: 'Latest flagship, enhanced reasoning & coding' },
            { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', type: ['chat', 'reasoning', 'code'], contextWindow: 1000000, description: 'Latest flagship, agentic coding record-breaker' },
            { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', type: ['chat', 'reasoning', 'code'], contextWindow: 200000, description: 'Previous-generation Opus' },
            { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', type: ['chat'], contextWindow: 200000, description: 'Enhanced coding & agents' },
            { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', type: ['chat'], contextWindow: 200000, description: 'Fastest Claude model' },
        ],
    },
    {
        id: 'google',
        name: 'Google',
        icon: '/providers/google.svg',
        website: 'https://ai.google.dev',
        docsUrl: 'https://ai.google.dev/docs',
        keyPrefix: 'AIza',
        models: [
            // Gemini 3.1 Series (Feb 2026)
            { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', type: ['chat', 'reasoning'], contextWindow: 1000000, description: 'Latest flagship preview, 1M context, enhanced reasoning' },
            { id: 'gemini-3.1-pro-preview-customtools', name: 'Gemini 3.1 Pro (Custom Tools)', type: ['chat', 'reasoning', 'code'], contextWindow: 1000000, description: 'Optimized for custom tools and bash' },
            { id: 'gemini-3.1-flash-image', name: 'Gemini 3.1 Flash Image (Nano Banana 2)', type: ['image'], contextWindow: 0, description: 'Reasoning-guided image synthesis, up to 4K' },
            // Gemini 3 Series (Late 2025)
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', type: ['chat', 'reasoning'], contextWindow: 1000000, description: 'Frontier speed & intelligence preview' },
            // Gemini 2.5 Series (Mid 2025)
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', type: ['chat', 'reasoning', 'code'], contextWindow: 1000000, description: 'Enhanced reasoning & coding' },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', type: ['chat', 'reasoning'], contextWindow: 1000000, description: 'Thinking capabilities' },
            { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', type: ['chat'], contextWindow: 1000000, description: 'Speed optimized' },
            { id: 'gemini-3-pro-image', name: 'Gemini 3 Pro Image', type: ['image'], contextWindow: 0, description: 'Fast photorealism' },
            { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', type: ['chat', 'reasoning', 'code'], contextWindow: 1000000, description: 'Latest Flash model, speed + reasoning' },
        ],
    },
    {
        id: 'mistral',
        name: 'Mistral AI',
        icon: '/providers/mistral.svg',
        website: 'https://mistral.ai',
        docsUrl: 'https://docs.mistral.ai',
        keyPrefix: '',
        models: [
            // Mistral Large 3 (Dec 2025 - MoE)
            { id: 'mistral-large-latest', name: 'Mistral Large 3', type: ['chat'], contextWindow: 128000, description: '675B params, best open-weight multimodal' },
            { id: 'mistral-medium-latest', name: 'Mistral Medium 3.1', type: ['chat'], contextWindow: 128000, description: 'Frontier-class multimodal' },
            { id: 'mistral-small-latest', name: 'Mistral Small 3', type: ['chat'], contextWindow: 32000, description: '24B params, fast' },
            // Ministral (Dec 2025)
            { id: 'ministral-3b', name: 'Ministral 3B', type: ['chat'], contextWindow: 128000, description: 'Compact edge model' },
            { id: 'ministral-8b', name: 'Ministral 8B', type: ['chat'], contextWindow: 128000, description: 'Small efficient model' },
            { id: 'codestral-latest', name: 'Codestral 25.01', type: ['code', 'chat'], contextWindow: 256000, description: '2.5x faster code generation' },
            { id: 'devstral-latest', name: 'Devstral 2', type: ['code', 'chat'], contextWindow: 256000, description: 'Frontier code agents' },
            // Reasoning
            { id: 'magistral-medium', name: 'Magistral Medium', type: ['reasoning', 'chat'], contextWindow: 128000, description: 'Multimodal reasoning' },
        ],
    },
    {
        id: 'groq',
        name: 'Groq',
        icon: '/providers/groq.svg',
        website: 'https://groq.com',
        docsUrl: 'https://console.groq.com/docs',
        keyPrefix: 'gsk_',
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', type: ['chat'], contextWindow: 128000, description: 'Groq-hosted versatile Llama 3.3 model', free: true },
            { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', type: ['chat'], contextWindow: 128000, description: 'Ultra-fast inference', free: true },
            { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', type: ['chat', 'reasoning'], contextWindow: 131072, description: 'Groq production model' },
            { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', type: ['chat', 'reasoning'], contextWindow: 131072, description: 'Groq production model' },
            { id: 'groq/compound', name: 'Compound', type: ['chat'], contextWindow: 131072, description: 'Groq compound AI system', free: true },
            { id: 'groq/compound-mini', name: 'Compound Mini', type: ['chat'], contextWindow: 131072, description: 'Groq compound AI mini', free: true },
            { id: 'allam-2-7b', name: 'Allam 2 7B', type: ['chat'], contextWindow: 131072, description: 'Arabic-capable small model on Groq' },
        ],
    },
    {
        id: 'cohere',
        name: 'Cohere',
        icon: '/providers/cohere.svg',
        website: 'https://cohere.com',
        docsUrl: 'https://docs.cohere.com',
        keyPrefix: '',
        models: [
            // Command A (March 2025 - New flagship)
            // Command R+ (Aug 2024 update)
            { id: 'command-r-plus-08-2024', name: 'Command R+', type: ['chat'], contextWindow: 128000, description: 'Complex RAG and multi-step' },
            { id: 'command-light', name: 'Command Light', type: ['chat'], contextWindow: 4096, description: 'Fast and efficient' },
        ],
    },
    {
        id: 'together',
        name: 'Together AI',
        icon: '/providers/together.svg',
        website: 'https://together.ai',
        docsUrl: 'https://docs.together.ai',
        keyPrefix: '',
        models: [
            // Llama 4
            { id: 'meta-llama/Llama-4-Maverick', name: 'Llama 4 Maverick', type: ['chat'], contextWindow: 256000, description: 'Latest Llama' },
            { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', type: ['chat'], contextWindow: 128000, description: 'Fast Llama inference' },
            { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B', type: ['chat'], contextWindow: 32000, description: 'Alibaba flagship' },
            { id: 'deepseek-ai/DeepSeek-V3.1', name: 'DeepSeek V3.1', type: ['chat'], contextWindow: 128000, description: 'Hybrid reasoning' },
        ],
    },
    {
        id: 'perplexity',
        name: 'Perplexity',
        icon: '/providers/perplexity.svg',
        website: 'https://perplexity.ai',
        docsUrl: 'https://docs.perplexity.ai',
        keyPrefix: 'pplx-',
        models: [
            // Sonar Models (2025)
            { id: 'sonar-pro', name: 'Sonar Pro', type: ['search'], contextWindow: 128000, description: 'Enhanced search, richer context' },
            { id: 'sonar', name: 'Sonar', type: ['search'], contextWindow: 128000, description: 'Default web-connected' },
            { id: 'sonar-reasoning-pro', name: 'Sonar Reasoning Pro', type: ['reasoning', 'search'], contextWindow: 128000, description: 'Deep inference & research' },
            // Legacy
        ],
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        icon: '/providers/openrouter.svg',
        website: 'https://openrouter.ai',
        docsUrl: 'https://openrouter.ai/docs',
        keyPrefix: 'sk-or-',
        models: [
            { id: 'openai/gpt-5', name: 'GPT-5 (via OpenRouter)', type: ['chat'], contextWindow: 256000, description: 'Access any model' },
            { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5 (via OpenRouter)', type: ['chat'], contextWindow: 200000, description: 'Unified billing' },
            { id: 'google/gemini-3-pro', name: 'Gemini 3 Pro (via OpenRouter)', type: ['chat'], contextWindow: 2000000, description: 'Meta-provider' },
            { id: 'x-ai/grok-4.3', name: 'Grok 4.3 (via OpenRouter)', type: ['reasoning'], contextWindow: 1000000, description: 'Latest xAI reasoning model' },
            { id: 'x-ai/grok-4', name: 'Grok 4 (via OpenRouter)', type: ['chat'], contextWindow: 256000, description: 'Access xAI models' },
        ],
    },
    {
        id: 'xai',
        name: 'xAI',
        icon: '/providers/xai.svg',
        website: 'https://x.ai',
        docsUrl: 'https://docs.x.ai',
        keyPrefix: 'xai-',
        models: [
            // Grok 4.3 Series (April 2026)
            { id: 'grok-4.3', name: 'Grok 4.3', type: ['reasoning', 'chat'], contextWindow: 1000000, description: 'Latest xAI reasoning model with text and image input' },
            // Grok Voice Series
            // Grok 4 Series (July-Nov 2025)
            // Grok 3 Series
            // Code
        ],
    },
    {
        id: 'meta',
        name: 'Meta AI',
        icon: '/providers/meta.svg',
        website: 'https://llama.meta.com',
        docsUrl: 'https://llama.meta.com/docs',
        keyPrefix: '',
        models: [
            // Llama 4 (2025)
            { id: 'llama-4-maverick', name: 'Llama 4 Maverick', type: ['chat'], contextWindow: 256000, description: 'Latest multimodal flagship' },
            { id: 'llama-4-scout', name: 'Llama 4 Scout', type: ['chat'], contextWindow: 256000, description: 'Advanced reasoning' },
            // Llama 3.3
            { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', type: ['chat'], contextWindow: 128000, description: 'Latest Llama 3 model' },
            { id: 'llama-3.2-90b-vision', name: 'Llama 3.2 90B Vision', type: ['chat'], contextWindow: 128000, description: 'Multimodal understanding' },
            { id: 'llama-3.1-405b', name: 'Llama 3.1 405B', type: ['chat'], contextWindow: 128000, description: 'Largest open model' },
            { id: 'llama-3.1-70b', name: 'Llama 3.1 70B', type: ['chat'], contextWindow: 128000, description: 'Balanced performance' },
        ],
    },
    {
        id: 'qwen',
        name: 'Qwen',
        icon: '/providers/qwen.svg',
        website: 'https://qwenlm.ai',
        docsUrl: 'https://qwen.readthedocs.io',
        keyPrefix: '',
        models: [
            { id: 'qwen2.5-72b-instruct', name: 'Qwen 2.5 72B', type: ['chat'], contextWindow: 128000, description: 'Flagship model' },
            { id: 'qwen2.5-32b-instruct', name: 'Qwen 2.5 32B', type: ['chat'], contextWindow: 128000, description: 'Balanced performance' },
            { id: 'qwen2.5-coder-32b', name: 'Qwen 2.5 Coder 32B', type: ['code', 'chat'], contextWindow: 128000, description: 'Code specialized' },
            { id: 'qwq-32b-preview', name: 'QwQ 32B', type: ['reasoning'], contextWindow: 32000, description: 'Reasoning model' },
        ],
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        icon: '/providers/deepseek.svg',
        website: 'https://deepseek.com',
        docsUrl: 'https://platform.deepseek.com/docs',
        keyPrefix: 'sk-',
        models: [
            // V4 Series (April 2026)
            { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', type: ['chat', 'reasoning', 'code'], contextWindow: 1000000, description: '1.6T total / 49B active params, flagship performance' },
            { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', type: ['chat', 'reasoning', 'code'], contextWindow: 1000000, description: '284B total / 13B active params, fast & economical' },
            // V3.2 Series (Dec 2025)
            // V3.1 (Aug 2025)
            // V3 (March 2025 update)
            // Coder
        ],
    },
    {
        id: 'cerebras',
        name: 'Cerebras',
        icon: '/providers/cerebras.svg',
        website: 'https://cerebras.ai',
        docsUrl: 'https://docs.cerebras.ai',
        keyPrefix: 'csk-',
        models: [
            { id: 'gpt-oss-120b', name: 'GPT OSS 120B (Cerebras)', type: ['chat'], contextWindow: 131072, description: '120B open model, 3000 tok/s inference', free: true },
            { id: 'zai-glm-4.7', name: 'Z.AI GLM 4.7 (Cerebras)', type: ['chat'], contextWindow: 131072, description: 'Preview, 355B MoE model on Cerebras', free: true },
            { id: 'gemma-4-31b', name: 'Gemma 4 31B (Cerebras)', type: ['chat', 'vision'], contextWindow: 131072, description: 'Multimodal production model on Cerebras' },
        ],
    },
    {
        id: 'maximo',
        name: 'Maximo AI',
        icon: '/partners/max.jpeg',
        website: 'https://maximoai.co',
        docsUrl: 'https://maximoai.co/platform',
        keyPrefix: '',
        models: [
            { id: 'maximo-atlas-1.1', name: 'Maximo Atlas 1.1', type: ['chat', 'reasoning', 'code'], contextWindow: 262000, description: 'Production coding & agent model by Maximo AI, $0.20/$1.00 per 1M tokens' },
        ],
    },
    {
        id: 'helix',
        name: 'Helix',
        icon: '/providers/helix.svg',
        website: 'https://launchverse.app',
        docsUrl: 'https://launchverse.app',
        keyPrefix: 'csk_cencori_',
        models: [
            { id: 'helix-advisor', name: 'Helix Advisor', type: ['chat', 'reasoning', 'code'], contextWindow: 128000, description: 'Autonomous engineering agent (advisor mode) by Launchverse — architecture, debugging, and planning guidance. Read-only.' },
        ],
    },
    // ── Voice providers (BYOK) ──────────────────────────────────
    // Models are chosen per-call on the Voice endpoints, so these carry no
    // `models` list here — the entry exists so users can add a BYOK key and the
    // gateway (lib/audio/*) uses it. See the Voice docs for the model catalog.
    {
        id: 'deepgram',
        name: 'Deepgram',
        icon: '/providers/voice.svg',
        website: 'https://deepgram.com',
        docsUrl: 'https://developers.deepgram.com',
        keyPrefix: '',
        models: [],
    },
    {
        id: 'cartesia',
        name: 'Cartesia',
        icon: '/providers/voice.svg',
        website: 'https://cartesia.ai',
        docsUrl: 'https://docs.cartesia.ai',
        keyPrefix: 'sk_car_',
        models: [],
    },
    {
        id: 'spitch',
        name: 'Spitch',
        icon: '/providers/voice.svg',
        website: 'https://spitch.app',
        docsUrl: 'https://docs.spi-tch.com',
        keyPrefix: '',
        models: [],
    },
    {
        id: 'assemblyai',
        name: 'AssemblyAI',
        icon: '/providers/voice.svg',
        website: 'https://assemblyai.com',
        docsUrl: 'https://www.assemblyai.com/docs',
        keyPrefix: '',
        models: [],
    },
    {
        id: 'elevenlabs',
        name: 'ElevenLabs',
        icon: '/providers/voice.svg',
        website: 'https://elevenlabs.io',
        docsUrl: 'https://elevenlabs.io/docs',
        keyPrefix: '',
        models: [],
    },
];

/**
 * Get provider config by ID
 */
export function getProvider(providerId: string): AIProviderConfig | undefined {
    return SUPPORTED_PROVIDERS.find(p => p.id === providerId);
}

/**
 * Get all models for a provider
 */
export function getModelsForProvider(providerId: string): AIModel[] {
    return getProvider(providerId)?.models || [];
}

/**
 * Get chat/reasoning models for a provider (excludes image models)
 */
export function getChatModelsForProvider(providerId: string): AIModel[] {
    return getModelsForProvider(providerId).filter(m => {
        const types = Array.isArray(m.type) ? m.type : [m.type];
        return !types.includes('image');
    });
}

/**
 * Get image generation models for a provider
 */
export function getImageModelsForProvider(providerId: string): AIModel[] {
    return getModelsForProvider(providerId).filter(m => {
        const types = Array.isArray(m.type) ? m.type : [m.type];
        return types.includes('image');
    });
}

/**
 * Get model by ID across all providers
 */
export function getModel(modelId: string): AIModel | undefined {
    for (const provider of SUPPORTED_PROVIDERS) {
        const model = provider.models.find(m => m.id === modelId);
        if (model) return model;
    }
    return undefined;
}

/**
 * Detect provider from model ID
 */
export function detectProviderFromModel(modelId: string): string | undefined {
    for (const provider of SUPPORTED_PROVIDERS) {
        if (provider.models.some(m => m.id === modelId)) {
            return provider.id;
        }
    }
    // Fallback pattern detection
    if (modelId.startsWith('gpt-') || modelId.startsWith('o1') || modelId.startsWith('o3') || modelId.startsWith('o4')) return 'openai';
    if (modelId.startsWith('claude-')) return 'anthropic';
    if (modelId.startsWith('gemini-')) return 'google';
    if (modelId.startsWith('mistral-') || modelId.startsWith('codestral') || modelId.startsWith('ministral-')) return 'mistral';
    if (modelId.includes('llama')) return 'groq';
    if (modelId.startsWith('jamba')) return 'ai21';
    if (modelId.includes('bedrock')) return 'bedrock';
    if (modelId.includes('nova')) return 'nova';
    if (modelId.includes('azure')) return 'azure';
    if (modelId.includes('cerebras')) return 'cerebras';
    if (modelId.startsWith('@cf')) return 'cloudflare';
    if (modelId.includes('deepinfra')) return 'deepinfra';
    if (modelId.includes('fireworks')) return 'fireworks';
    if (modelId.includes('nvidia') || modelId.includes('nemotron')) return 'nvidia';
    if (modelId.includes('sambanova')) return 'sambanova';
    if (modelId.startsWith('solar')) return 'upstage';
    if (modelId.startsWith('abab')) return 'minimax';
    if (modelId.startsWith('moonshot')) return 'moonshot';
    if (modelId.startsWith('step-')) return 'stepfun';
    if (modelId.startsWith('ernie')) return 'baidu';
    if (modelId.startsWith('qwen-') && !modelId.includes('deepinfra')) return 'alibaba';
    return undefined;
}
