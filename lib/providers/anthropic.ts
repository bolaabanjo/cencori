/**
 * Anthropic Provider
 * 
 * Implements the AIProvider interface for Anthropic's Claude models
 */

import Anthropic from '@anthropic-ai/sdk';
import {
    AIProvider,
    UnifiedChatRequest,
    UnifiedChatResponse,
    StreamChunk,
    ModelPricing,
} from './base';
import { getPricingFromDB } from './pricing';
import { toAnthropicMessages } from './utils';
import { normalizeProviderError } from './errors';
import { safeProviderFetch } from '@/lib/security/outbound-url';

export class AnthropicProvider extends AIProvider {
    readonly providerName = 'anthropic';
    private client: Anthropic;
    private pricingOverride?: ModelPricing;

    constructor(apiKey?: string, options?: { baseURL?: string; pricing?: ModelPricing }) {
        super();

        const key = apiKey || process.env.ANTHROPIC_API_KEY;
        if (!key) {
            throw new Error('Anthropic API key is required - either pass it or set ANTHROPIC_API_KEY env var');
        }

        this.client = new Anthropic({
            apiKey: key,
            ...(options?.baseURL ? { baseURL: options.baseURL } : {}),
            ...(options?.baseURL ? { fetch: safeProviderFetch } : {}),
            timeout: 55_000,
            maxRetries: 0,
        });
        this.pricingOverride = options?.pricing;
    }

    async chat(request: UnifiedChatRequest): Promise<UnifiedChatResponse> {
        const startTime = Date.now();

        try {
            // Anthropic handles system messages separately
            const { system, messages } = toAnthropicMessages(request.messages);

            const response = await this.client.messages.create({
                model: request.model,
                max_tokens: request.maxTokens ?? 4096,
                temperature: request.temperature,
                system,
                messages,
            });

            const pricing = await this.getPricing(request.model);
            const providerCost = this.calculateCost(
                response.usage.input_tokens,
                response.usage.output_tokens,
                pricing
            );
            const cencoriCharge = this.applyMarkup(providerCost, pricing.cencoriMarkupPercentage)
                + (pricing.fixedFeePerRequest ?? 0);

            // Normalize Anthropic's stop_reason to our type
            const stopReason = response.stop_reason;
            const finishReason = stopReason === 'end_turn' ? 'stop' :
                stopReason === 'max_tokens' ? 'length' : undefined;

            return {
                content: response.content[0].type === 'text' ? response.content[0].text : '',
                model: response.model,
                provider: this.providerName,
                usage: {
                    promptTokens: response.usage.input_tokens,
                    completionTokens: response.usage.output_tokens,
                    totalTokens: response.usage.input_tokens + response.usage.output_tokens,
                },
                cost: {
                    providerCostUsd: providerCost,
                    cencoriChargeUsd: cencoriCharge,
                    markupPercentage: pricing.cencoriMarkupPercentage,
                },
                latencyMs: Date.now() - startTime,
                finishReason,
            };
        } catch (error) {
            throw normalizeProviderError(this.providerName, error);
        }
    }

    async *stream(request: UnifiedChatRequest): AsyncGenerator<StreamChunk> {
        try {
            const { system, messages } = toAnthropicMessages(request.messages);

            const stream = await this.client.messages.create({
                model: request.model,
                max_tokens: request.maxTokens ?? 4096,
                temperature: request.temperature,
                system,
                messages,
                stream: true,
            });

            for await (const event of stream) {
                if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                    yield {
                        delta: event.delta.text,
                    };
                }
                if (event.type === 'message_delta') {
                    const stopReason = event.delta.stop_reason;
                    const finishReason = stopReason === 'end_turn' ? 'stop' :
                        stopReason === 'max_tokens' ? 'length' : undefined;
                    yield {
                        delta: '',
                        finishReason,
                    };
                }
            }
        } catch (error) {
            throw normalizeProviderError(this.providerName, error);
        }
    }

    async countTokens(text: string, model?: string): Promise<number> {
        try {
            // Anthropic has a count_tokens beta API
            const response = await this.client.messages.countTokens({
                model: model || 'claude-3-haiku-20240307',
                messages: [{ role: 'user', content: text }],
            });
            return response.input_tokens;
        } catch (error) {
            // Fallback to estimation if API fails
            console.warn('[Anthropic] Token counting failed, using estimation:', error);
            return Math.ceil(text.length / 4);
        }
    }

    async getPricing(model: string): Promise<ModelPricing> {
        return this.pricingOverride || getPricingFromDB('anthropic', model);
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.countTokens('test', 'claude-3-haiku-20240307');
            return true;
        } catch {
            return false;
        }
    }
}
