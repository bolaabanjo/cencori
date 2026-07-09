/**
 * Provider Utility Functions
 * 
 * Helper functions for message normalization and common provider operations
 */

import { UnifiedMessage, ToolCall } from './base';

/**
 * OpenAI message format
 */
export interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_call_id?: string;
    tool_calls?: ToolCall[];
}

/**
 * Anthropic message format
 */
export interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: string;
}

/**
 * Gemini message format
 */
export interface GeminiMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
}

/**
 * Convert unified messages to OpenAI format
 */
export function toOpenAIMessages(messages: UnifiedMessage[]): OpenAIMessage[] {
    return messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        ...(msg.toolCallId ? { tool_call_id: msg.toolCallId } : {}),
        ...(msg.tool_calls && msg.tool_calls.length > 0 ? { tool_calls: msg.tool_calls } : {}),
    }));
}

/**
 * Convert unified messages to Anthropic format
 * Note: Anthropic handles system messages separately
 */
export function toAnthropicMessages(messages: UnifiedMessage[]): {
    system?: string;
    messages: AnthropicMessage[];
} {
    const systemMessage = messages.find(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    return {
        system: systemMessage?.content,
        messages: nonSystemMessages.map(msg => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content,
        })),
    };
}

/**
 * Convert unified messages to Gemini format
 */
export function toGeminiMessages(messages: UnifiedMessage[]): {
    history: GeminiMessage[];
    prompt: string;
} {
    // Gemini uses chat history + current prompt format
    // All messages except the last one go into history
    const history = messages.slice(0, -1).map(msg => ({
        role: msg.role === 'assistant' ? 'model' as const : 'user' as const,
        parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1];

    return {
        history,
        prompt: lastMessage.content,
    };
}

/**
 * Estimate token count (rough approximation)
 * Used when provider doesn't offer token counting API
 */
export function estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    // This is approximate and varies by language and tokenizer
    return Math.ceil(text.length / 4);
}

/**
 * Combine multiple messages into single text
 */
export function combineMessages(messages: UnifiedMessage[]): string {
    return messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n\n');
}

/**
 * Extract system message from messages array
 */
export function extractSystemMessage(messages: UnifiedMessage[]): string | undefined {
    return messages.find(m => m.role === 'system')?.content;
}

/**
 * Filter out system messages
 */
export function filterSystemMessages(messages: UnifiedMessage[]): UnifiedMessage[] {
    return messages.filter(m => m.role !== 'system');
}

/**
 * Validate messages array
 */
export function validateMessages(messages: UnifiedMessage[]): void {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages array must not be empty');
    }

    for (const msg of messages) {
        if (!msg.role || !msg.content) {
            throw new Error('Each message must have role and content');
        }

        if (!['system', 'user', 'assistant', 'tool'].includes(msg.role)) {
            throw new Error(`Invalid message role: ${msg.role}`);
        }
    }
}
