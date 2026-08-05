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
 *
 * Anthropic carries tool calls and their results as content blocks rather than
 * as separate message fields, so `content` widens to a block list whenever a
 * turn involves tools. Plain text turns stay plain strings.
 */
export type AnthropicContentBlock =
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    | { type: 'tool_result'; tool_use_id: string; content: string };

export interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: string | AnthropicContentBlock[];
}

/**
 * Parse the JSON-string arguments we carry on ToolCall into the object
 * Anthropic expects. Malformed arguments become an empty object rather than
 * throwing — the model gets to see the tool failed instead of the request 400ing.
 */
function parseToolArguments(args: string): Record<string, unknown> {
    if (!args || !args.trim()) return {};
    try {
        const parsed = JSON.parse(args);
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
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
 *
 * Note: Anthropic handles system messages separately. Tool turns are also
 * shaped differently from OpenAI's: an assistant tool call becomes a `tool_use`
 * block on the assistant turn, and each tool result becomes a `tool_result`
 * block on a *user* turn. Parallel results must share one user turn, so
 * consecutive tool messages are merged rather than emitted one turn each.
 */
export function toAnthropicMessages(messages: UnifiedMessage[]): {
    system?: string;
    messages: AnthropicMessage[];
} {
    // Anthropic has one top-level system slot, so every system message has to
    // fold into it. Keeping only the first would silently drop mid-conversation
    // instructions — the tool-approval resume path emits one.
    const systemMessages = messages.filter(m => m.role === 'system' && m.content);
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    const converted: AnthropicMessage[] = [];

    for (const msg of nonSystemMessages) {
        if (msg.role === 'tool') {
            const block: AnthropicContentBlock = {
                type: 'tool_result',
                tool_use_id: msg.toolCallId ?? '',
                content: msg.content ?? '',
            };
            const previous = converted[converted.length - 1];
            if (previous && previous.role === 'user' && Array.isArray(previous.content)) {
                previous.content.push(block);
            } else {
                converted.push({ role: 'user', content: [block] });
            }
            continue;
        }

        if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
            const blocks: AnthropicContentBlock[] = [];
            // Anthropic rejects empty text blocks, and a tool-calling turn
            // frequently has no prose at all.
            if (msg.content) {
                blocks.push({ type: 'text', text: msg.content });
            }
            for (const call of msg.tool_calls) {
                blocks.push({
                    type: 'tool_use',
                    id: call.id,
                    name: call.function.name,
                    input: parseToolArguments(call.function.arguments),
                });
            }
            converted.push({ role: 'assistant', content: blocks });
            continue;
        }

        converted.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content,
        });
    }

    return {
        system: systemMessages.length > 0
            ? systemMessages.map(m => m.content).join('\n\n')
            : undefined,
        messages: converted,
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
