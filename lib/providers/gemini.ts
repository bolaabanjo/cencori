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

            // Token counting
            const promptTokens = (await model.countTokens(prompt)).totalTokens;
            const completionTokens = (await model.countTokens(text)).totalTokens;

            // Get pricing and calculate costs
            const pricing = await this.getPricing(request.model);
            const providerCost = this.calculateCost(promptTokens, completionTokens, pricing);
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

            // Stream complete
            yield {
                delta: '',
                finishReason: 'stop',
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
