/**
 * Provider Router
 * 
 * Routes AI requests to the appropriate provider based on model name
 */

import { AIProvider } from './base';
import { ProviderError } from './errors';

const MODEL_ALIASES: Record<string, string> = {
    'gpt-5.4-thinking': 'gpt-5.4',
    'gpt-5.3-instant': 'gpt-5.3-chat-latest',
    'gpt-5.3': 'gpt-5.3-chat-latest',
    // Anthropic's own model IDs are hyphenated (`claude-haiku-4-5`). Our
    // catalog advertised dotted names the API has never accepted, so map them
    // rather than break every project already sending them.
    'claude-haiku-4.5': 'claude-haiku-4-5',
    'claude-sonnet-4.5': 'claude-sonnet-4-5',
    'claude-opus-4.5': 'claude-opus-4-5',
    'claude-sonnet-4.6': 'claude-sonnet-4-6',
    'claude-opus-4.6': 'claude-opus-4-6',
    'claude-opus-4.7': 'claude-opus-4-7',
    'claude-opus-4.8': 'claude-opus-4-8',
};

// Explicit model-to-provider mapping for models whose IDs would route to the wrong provider via prefix matching
const MODEL_PROVIDER_OVERRIDES: Record<string, string> = {
    // Cerebras (gpt-oss- conflicts with gpt- → openai)
    'gpt-oss-120b': 'cerebras',
    'zai-glm-4.7': 'cerebras',
    'gemma-4-31b': 'cerebras',
    // HuggingFace (deepseek- prefix → deepseek, / prefix → wrong org, llama- → groq)
    'deepseek-ai/DeepSeek-V4-Flash': 'huggingface',
    'axiveri/africlaude-7b': 'huggingface',
    'Qwen/Qwen2.5-72B-Instruct': 'huggingface',
    'mistralai/Mistral-Large-3': 'huggingface',
    'meta-llama/Llama-3.3-70B-Instruct': 'huggingface',
    'meta-llama/Llama-4-Maverick': 'huggingface',
    // Groq (conflict with openai/qwen/moonshot prefixes)
    'openai/gpt-oss-120b': 'groq',
    'openai/gpt-oss-20b': 'groq',
    'qwen/qwen3-32b': 'groq',
    'moonshotai/kimi-k2-instruct': 'groq',
    'allam-2-7b': 'groq',
    // Maximo AI (defaults to openai)
    'maximo-atlas-1.2': 'maximo',
    'maximo-atlas-1.1': 'maximo',
    // Helix (Launchverse) — autonomous engineering agent personas
    'helix-advisor': 'helix',
    // OpenRouter stealth preview (`stealth/` prefix → nonexistent stealth provider)
    'stealth/ox-alpha': 'openrouter',
};

/**
 * Provider Router Class
 * Manages provider instances and routes requests to the correct provider
 */
export class ProviderRouter {
    private providers: Map<string, AIProvider> = new Map();

    /**
     * Register a provider instance
     */
    registerProvider(name: string, provider: AIProvider): void {
        this.providers.set(name, provider);
    }

    /**
     * Auto-detect provider from model name
     * Returns the provider identifier
     */
    detectProvider(modelName: string): string {
        // Check explicit model-to-provider overrides first (handles ambiguous prefixes)
        const override = MODEL_PROVIDER_OVERRIDES[modelName];
        if (override) return override;

        // OpenAI models
        if (modelName.startsWith('gpt-') ||
            modelName.startsWith('o1-') ||
            modelName.startsWith('text-') ||
            modelName.startsWith('davinci-')) {
            return 'openai';
        }

        // Anthropic models
        if (modelName.startsWith('claude-')) {
            return 'anthropic';
        }

        // Google models
        if (modelName.startsWith('gemini-')) {
            return 'google';
        }

        // Mistral models
        if (modelName.startsWith('mistral-') ||
            modelName.startsWith('codestral-') ||
            modelName.startsWith('open-mistral-') ||
            modelName.startsWith('open-mixtral-')) {
            return 'mistral';
        }

        // Groq models (Llama, Mixtral, Gemma via Groq)
        if (modelName.startsWith('llama-') ||
            modelName.startsWith('llama2-') ||
            modelName.startsWith('llama3-') ||
            modelName.includes('llama') ||
            modelName.startsWith('mixtral-')) {
            return 'groq';
        }

        // Cohere models
        if (modelName.startsWith('command-')) {
            return 'cohere';
        }

        // xAI models
        if (modelName.startsWith('grok-')) {
            return 'xai';
        }

        // Z.AI models
        if (modelName.startsWith('glm-')) {
            return 'zai';
        }

        // DeepSeek models
        if (modelName.startsWith('deepseek-')) {
            return 'deepseek';
        }

        // Perplexity models
        if (modelName.includes('sonar')) {
            return 'perplexity';
        }

        // Qwen models
        if (modelName.startsWith('qwen-') || modelName.includes('qwen')) {
            return 'qwen';
        }

        // OpenRouter's free tier. The `:free` suffix is an OpenRouter-only
        // convention — the same id without it is a different, paid listing, and
        // no other provider serves the suffixed form. Matched BEFORE the generic
        // "provider/model" split below, which would otherwise route
        // `nvidia/...:free` to a nonexistent `nvidia` provider and
        // `openai/gpt-oss-20b:free` to the paid OpenAI account.
        if (modelName.endsWith(':free')) {
            return 'openrouter';
        }

        // Explicit provider prefix format: "provider/model"
        // e.g., "openai/gpt-4", "anthropic/claude-3-opus"
        if (modelName.includes('/')) {
            const [provider] = modelName.split('/');
            return provider;
        }

        // Custom provider format: "custom-{name}"
        if (modelName.startsWith('custom-')) {
            return modelName;
        }

        throw new ProviderError(
            'router',
            `Cannot determine a provider for model '${modelName}'. Use a known model ID or an explicit provider/model prefix.`,
            undefined,
            false
        );
    }

    /**
     * Get provider instance by name
     */
    getProvider(providerName: string): AIProvider {
        const provider = this.providers.get(providerName);

        if (!provider) {
            throw new ProviderError(
                providerName,
                `Provider '${providerName}' is not registered or not available.`,
                undefined,
                false
            );
        }

        return provider;
    }

    /**
     * Get provider for a specific model
     * Automatically detects the provider from the model name
     */
    getProviderForModel(modelName: string): AIProvider {
        const providerName = this.detectProvider(modelName);
        return this.getProvider(providerName);
    }

    /**
     * Check if a provider is registered
     */
    hasProvider(providerName: string): boolean {
        return this.providers.has(providerName);
    }

    /**
     * Get list of all registered providers
     */
    getAvailableProviders(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Normalize model name
     * If model has a provider prefix and it differs from the detected provider,
     * strip the prefix (routing prefix). If it matches, keep it (namespace).
     * HuggingFace models always keep their full author/model ID.
     */
    normalizeModelName(modelName: string, detectedProvider?: string): string {
        if (modelName.includes('/')) {
            // HuggingFace model IDs use author/model format — never strip
            if (detectedProvider === 'huggingface') {
                return MODEL_ALIASES[modelName] || modelName;
            }
            // OpenRouter ids are always `vendor/model` and the vendor half is
            // part of the id it expects upstream, not a routing prefix. Stripping
            // it would send `nvidia/nemotron-...` upstream as `nemotron-...`,
            // which OpenRouter does not serve.
            if (detectedProvider === 'openrouter') {
                return MODEL_ALIASES[modelName] || modelName;
            }
            const [prefix] = modelName.split('/');
            if (detectedProvider && prefix === detectedProvider) {
                // Prefix matches provider — it's a namespace, keep the full name
                return MODEL_ALIASES[modelName] || modelName;
            }
            // Prefix differs — it's a routing prefix, strip it
            const rawModel = modelName.split('/').slice(1).join('/');
            return MODEL_ALIASES[rawModel] || rawModel;
        }
        return MODEL_ALIASES[modelName] || modelName;
    }
}

/**
 * Create a default router instance with lazy-loaded providers
 * Providers are only instantiated when first accessed
 */
export function createDefaultRouter(): ProviderRouter {
    const router = new ProviderRouter();

    // Providers will be registered lazily when needed
    // This avoids loading all provider SDKs upfront

    return router;
}
