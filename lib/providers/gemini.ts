/**
 * Google Gemini Provider
 * 
 * Implements the AIProvider interface for Google's Gemini models
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import {
    AIProvider,
    UnifiedChatRequest,
    UnifiedChatResponse,
    StreamChunk,
    ModelPricing,
    TokenUsage,
} from './base';
import { getPricingFromDB } from './pricing';
import { toGeminiMessages } from './utils';
import { normalizeProviderError } from './errors';
import { getGoogleApiKey } from './google-env';

export class GeminiProvider extends AIProvider {
    readonly providerName = 'google';
    private client: GoogleGenerativeAI;

    constructor(apiKey?: string) {
        super();

        const key = apiKey || getGoogleApiKey();
        if (!key) {
            throw new Error('Gemini API key is required. Set GOOGLE_GENERATIVE_AI_API_KEY, GOOGLE_AI_API_KEY, or GEMINI_API_KEY.');
        }

        this.client = new GoogleGenerativeAI(key);
    }

    async chat(request: UnifiedChatRequest): Promise<UnifiedChatResponse> {
        const startTime = Date.now();

        try {
            const model = this.client.getGenerativeModel({ model: request.model });

            // Convert unified format to Gemini format
            const { history, prompt } = toGeminiMessages(request.messages);

            const chat = model.startChat({
                history,
                generationConfig: {
                    temperature: request.temperature ?? 0.7,
                    maxOutputTokens: request.maxTokens ?? 2048,
                },
            });

            // Send the message
            const result = await chat.sendMessage(prompt);
            const response = result.response;
            const text = response.text();

            // Prefer the usage the provider actually billed. countTokens() only
            // sees the prompt string, so it misses history, system instructions
            // and tools, and has no concept of cached content — it is a fallback
            // for responses that arrive without usageMetadata, not the source of
            // truth. It also costs two extra round trips.
            const meta = response.usageMetadata;
            const cachedTokens = Math.max(0, Number(meta?.cachedContentTokenCount) || 0);
            const reportedPromptTokens = Math.max(0, Number(meta?.promptTokenCount) || 0);
            const promptTokens = meta
                ? reportedPromptTokens
                : (await model.countTokens(prompt)).totalTokens;
            const completionTokens = meta
                ? Math.max(0, Number(meta.candidatesTokenCount) || 0)
                : (await model.countTokens(text)).totalTokens;

            // Gemini counts cached content inside promptTokenCount, so bill the
            // remainder at the input rate and the cached slice at its own rate.
            const cacheReadTokens = Math.min(cachedTokens, promptTokens);
            const billablePromptTokens = promptTokens - cacheReadTokens;

            // Get pricing and calculate costs
            const pricing = await this.getPricing(request.model);
            const providerCost = this.calculateCost(
                billablePromptTokens,
                completionTokens,
                pricing,
                { cacheReadTokens }
            );
            const cencoriCharge = this.applyMarkup(providerCost, pricing.cencoriMarkupPercentage)
                + (pricing.fixedFeePerRequest ?? 0);

            return {
                content: text,
                model: request.model,
                provider: this.providerName,
                usage: {
                    promptTokens,
                    completionTokens,
                    totalTokens: promptTokens + completionTokens,
                    ...(cacheReadTokens ? { cacheReadTokens } : {}),
                },
                cost: {
                    providerCostUsd: providerCost,
                    cencoriChargeUsd: cencoriCharge,
                    markupPercentage: pricing.cencoriMarkupPercentage,
                },
                latencyMs: Date.now() - startTime,
            };
        } catch (error) {
            throw normalizeProviderError(this.providerName, error);
        }
    }

    async *stream(request: UnifiedChatRequest): AsyncGenerator<StreamChunk> {
        try {
            const model = this.client.getGenerativeModel({ model: request.model });

            const { history, prompt } = toGeminiMessages(request.messages);

            const chat = model.startChat({
                history,
                generationConfig: {
                    temperature: request.temperature ?? 0.7,
                    maxOutputTokens: request.maxTokens ?? 2048,
                },
            });

            const result = await chat.sendMessageStream(prompt);

            for await (const chunk of result.stream) {
                yield {
                    delta: chunk.text(),
                };
            }

            // The aggregated response resolves once the stream drains and is
            // the only place the billed usage appears. Never let a missing
            // figure fail a stream that already delivered its content — the
            // gateway falls back to estimating when usage is absent.
            let usage: TokenUsage | undefined;
            try {
                const meta = (await result.response).usageMetadata;
                if (meta) {
                    const promptTokens = Math.max(0, Number(meta.promptTokenCount) || 0);
                    const cacheReadTokens = Math.min(
                        Math.max(0, Number(meta.cachedContentTokenCount) || 0),
                        promptTokens,
                    );
                    usage = {
                        promptTokens: promptTokens - cacheReadTokens,
                        completionTokens: Math.max(0, Number(meta.candidatesTokenCount) || 0),
                        totalTokens: Math.max(0, Number(meta.totalTokenCount) || 0),
                        ...(cacheReadTokens ? { cacheReadTokens } : {}),
                    };
                }
            } catch {
                usage = undefined;
            }

            // Stream complete
            yield {
                delta: '',
                finishReason: 'stop',
                ...(usage ? { usage } : {}),
            };
        } catch (error) {
            throw normalizeProviderError(this.providerName, error);
        }
    }

    async countTokens(text: string, model?: string): Promise<number> {
        try {
            const genModel = this.client.getGenerativeModel({
                model: model || 'gemini-2.5-flash'
            });
            const result = await genModel.countTokens(text);
            return result.totalTokens;
        } catch (error) {
            throw normalizeProviderError(this.providerName, error);
        }
    }

    async getPricing(model: string): Promise<ModelPricing> {
        return getPricingFromDB('google', model);
    }

    async testConnection(): Promise<boolean> {
        try {
            const model = this.client.getGenerativeModel({ model: 'gemini-2.5-flash' });
            const result = await model.generateContent('test');
            return !!result.response.text();
        } catch {
            return false;
        }
    }
}
