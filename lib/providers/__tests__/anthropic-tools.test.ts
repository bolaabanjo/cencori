import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { UnifiedMessage } from '../base';
import { toAnthropicMessages, type AnthropicContentBlock } from '../utils';

const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
    default: class {
        messages = { create: createMock };
    },
}));

vi.mock('../pricing', () => ({
    getPricingFromDB: vi.fn().mockResolvedValue({
        inputPer1KTokens: 0.003,
        outputPer1KTokens: 0.015,
        cencoriMarkupPercentage: 0,
    }),
}));

const { AnthropicProvider } = await import('../anthropic');

function blocks(content: string | AnthropicContentBlock[]): AnthropicContentBlock[] {
    if (typeof content === 'string') throw new Error('expected content blocks');
    return content;
}

describe('toAnthropicMessages — tool turns', () => {
    it('converts an assistant tool call into a tool_use block with parsed input', () => {
        const messages: UnifiedMessage[] = [
            { role: 'user', content: 'weather in Lagos?' },
            {
                role: 'assistant',
                content: '',
                tool_calls: [{
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'get_weather', arguments: '{"city":"Lagos"}' },
                }],
            },
        ];

        const { messages: converted } = toAnthropicMessages(messages);

        expect(converted).toHaveLength(2);
        expect(converted[1].role).toBe('assistant');
        expect(blocks(converted[1].content)).toEqual([{
            type: 'tool_use',
            id: 'call_1',
            name: 'get_weather',
            input: { city: 'Lagos' },
        }]);
    });

    it('keeps assistant prose alongside the tool call', () => {
        const { messages: converted } = toAnthropicMessages([
            { role: 'user', content: 'hi' },
            {
                role: 'assistant',
                content: 'Let me check.',
                tool_calls: [{
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'get_weather', arguments: '{}' },
                }],
            },
        ]);

        expect(blocks(converted[1].content)[0]).toEqual({ type: 'text', text: 'Let me check.' });
        expect(blocks(converted[1].content)[1].type).toBe('tool_use');
    });

    it('puts a tool result on a user turn keyed by tool_use_id', () => {
        const { messages: converted } = toAnthropicMessages([
            { role: 'user', content: 'weather?' },
            {
                role: 'assistant',
                content: '',
                tool_calls: [{
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'get_weather', arguments: '{}' },
                }],
            },
            { role: 'tool', content: '32C', toolCallId: 'call_1' },
        ]);

        expect(converted).toHaveLength(3);
        expect(converted[2].role).toBe('user');
        expect(blocks(converted[2].content)).toEqual([{
            type: 'tool_result',
            tool_use_id: 'call_1',
            content: '32C',
        }]);
    });

    it('merges parallel tool results into a single user turn', () => {
        const { messages: converted } = toAnthropicMessages([
            { role: 'user', content: 'weather in both?' },
            {
                role: 'assistant',
                content: '',
                tool_calls: [
                    { id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Lagos"}' } },
                    { id: 'call_2', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Abuja"}' } },
                ],
            },
            { role: 'tool', content: '32C', toolCallId: 'call_1' },
            { role: 'tool', content: '28C', toolCallId: 'call_2' },
        ]);

        // Anthropic rejects a second consecutive user turn carrying results.
        expect(converted).toHaveLength(3);
        expect(blocks(converted[2].content)).toHaveLength(2);
        expect(blocks(converted[2].content).map(b => (b as { tool_use_id: string }).tool_use_id))
            .toEqual(['call_1', 'call_2']);
    });

    it('falls back to an empty object for malformed tool arguments', () => {
        const { messages: converted } = toAnthropicMessages([
            { role: 'user', content: 'hi' },
            {
                role: 'assistant',
                content: '',
                tool_calls: [{
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'get_weather', arguments: 'not json' },
                }],
            },
        ]);

        expect((blocks(converted[1].content)[0] as { input: unknown }).input).toEqual({});
    });

    it('leaves plain conversations as string content', () => {
        const { system, messages: converted } = toAnthropicMessages([
            { role: 'system', content: 'be brief' },
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'hello' },
        ]);

        expect(system).toBe('be brief');
        expect(converted).toEqual([
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'hello' },
        ]);
    });
});

describe('AnthropicProvider tool calling', () => {
    beforeEach(() => {
        createMock.mockReset();
    });

    it('declares tool support so the gateway stops rejecting requests', () => {
        expect(new AnthropicProvider('test-key').supportsTools).toBe(true);
    });

    it('sends tools as input_schema and maps tool_use blocks back to tool calls', async () => {
        createMock.mockResolvedValue({
            model: 'claude-opus-5',
            stop_reason: 'tool_use',
            usage: { input_tokens: 10, output_tokens: 5 },
            content: [
                { type: 'text', text: 'Checking.' },
                { type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: { city: 'Lagos' } },
            ],
        });

        const provider = new AnthropicProvider('test-key');
        const response = await provider.chat({
            model: 'claude-opus-5',
            messages: [{ role: 'user', content: 'weather?' }],
            tools: [{
                type: 'function',
                function: {
                    name: 'get_weather',
                    description: 'Get weather',
                    parameters: { type: 'object', properties: { city: { type: 'string' } } },
                },
            }],
            toolChoice: 'auto',
        });

        const sent = createMock.mock.calls[0][0];
        expect(sent.tools).toEqual([{
            name: 'get_weather',
            description: 'Get weather',
            input_schema: { type: 'object', properties: { city: { type: 'string' } } },
        }]);
        expect(sent.tool_choice).toEqual({ type: 'auto' });

        expect(response.content).toBe('Checking.');
        expect(response.finishReason).toBe('tool_calls');
        expect(response.toolCalls).toEqual([{
            id: 'toolu_1',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Lagos"}' },
        }]);
    });

    it('maps required/none/specific tool choice and parallel opt-out', async () => {
        createMock.mockResolvedValue({
            model: 'claude-opus-5',
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [{ type: 'text', text: 'ok' }],
        });

        const provider = new AnthropicProvider('test-key');
        const base = {
            model: 'claude-opus-5',
            messages: [{ role: 'user' as const, content: 'hi' }],
            tools: [{
                type: 'function' as const,
                function: { name: 'get_weather', description: 'w', parameters: {} },
            }],
        };

        await provider.chat({ ...base, toolChoice: 'required' });
        expect(createMock.mock.calls[0][0].tool_choice).toEqual({ type: 'any' });

        await provider.chat({ ...base, toolChoice: 'none' });
        expect(createMock.mock.calls[1][0].tool_choice).toEqual({ type: 'none' });

        await provider.chat({
            ...base,
            toolChoice: { type: 'function', function: { name: 'get_weather' } },
        });
        expect(createMock.mock.calls[2][0].tool_choice).toEqual({ type: 'tool', name: 'get_weather' });

        await provider.chat({ ...base, toolChoice: 'auto', parallelToolCalls: false });
        expect(createMock.mock.calls[3][0].tool_choice).toEqual({
            type: 'auto',
            disable_parallel_tool_use: true,
        });
    });

    it('omits tool fields entirely when no tools are passed', async () => {
        createMock.mockResolvedValue({
            model: 'claude-opus-5',
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [{ type: 'text', text: 'hello' }],
        });

        const provider = new AnthropicProvider('test-key');
        await provider.chat({ model: 'claude-opus-5', messages: [{ role: 'user', content: 'hi' }] });

        const sent = createMock.mock.calls[0][0];
        expect(sent).not.toHaveProperty('tools');
        expect(sent).not.toHaveProperty('tool_choice');
    });

    it('assembles streamed tool arguments from partial JSON deltas', async () => {
        createMock.mockResolvedValue({
            async *[Symbol.asyncIterator]() {
                yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
                yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Checking.' } };
                yield {
                    type: 'content_block_start',
                    index: 1,
                    content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_weather' },
                };
                yield { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"city":' } };
                yield { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"Lagos"}' } };
                yield { type: 'message_delta', delta: { stop_reason: 'tool_use' } };
            },
        });

        const provider = new AnthropicProvider('test-key');
        const chunks = [];
        for await (const chunk of provider.stream({
            model: 'claude-opus-5',
            messages: [{ role: 'user', content: 'weather?' }],
            tools: [{
                type: 'function',
                function: { name: 'get_weather', description: 'w', parameters: {} },
            }],
        })) {
            chunks.push(chunk);
        }

        expect(chunks[0].delta).toBe('Checking.');

        const final = chunks[chunks.length - 1];
        expect(final.finishReason).toBe('tool_calls');
        expect(final.toolCalls).toEqual([{
            id: 'toolu_1',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Lagos"}' },
        }]);
    });

    it('emits {} arguments for a streamed tool that takes no input', async () => {
        createMock.mockResolvedValue({
            async *[Symbol.asyncIterator]() {
                yield {
                    type: 'content_block_start',
                    index: 0,
                    content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_time' },
                };
                yield { type: 'message_delta', delta: { stop_reason: 'tool_use' } };
            },
        });

        const provider = new AnthropicProvider('test-key');
        const chunks = [];
        for await (const chunk of provider.stream({
            model: 'claude-opus-5',
            messages: [{ role: 'user', content: 'time?' }],
        })) {
            chunks.push(chunk);
        }

        expect(chunks[chunks.length - 1].toolCalls?.[0].function.arguments).toBe('{}');
    });

    it('maps stop_reason variants onto unified finish reasons', async () => {
        const cases: Array<[string, string | undefined]> = [
            ['end_turn', 'stop'],
            ['stop_sequence', 'stop'],
            ['max_tokens', 'length'],
            ['tool_use', 'tool_calls'],
            ['refusal', 'content_filter'],
            ['pause_turn', undefined],
        ];

        const provider = new AnthropicProvider('test-key');
        for (const [stopReason, expected] of cases) {
            createMock.mockResolvedValue({
                model: 'claude-opus-5',
                stop_reason: stopReason,
                usage: { input_tokens: 1, output_tokens: 1 },
                content: [{ type: 'text', text: 'ok' }],
            });
            const response = await provider.chat({
                model: 'claude-opus-5',
                messages: [{ role: 'user', content: 'hi' }],
            });
            expect(response.finishReason).toBe(expected);
        }
    });
});

describe('AnthropicProvider parallel tool opt-out without an explicit choice', () => {
    beforeEach(() => {
        createMock.mockReset();
        createMock.mockResolvedValue({
            model: 'claude-opus-5',
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [{ type: 'text', text: 'ok' }],
        });
    });

    it('sends auto + disable_parallel_tool_use when only parallelToolCalls is set', async () => {
        const provider = new AnthropicProvider('test-key');
        await provider.chat({
            model: 'claude-opus-5',
            messages: [{ role: 'user', content: 'hi' }],
            tools: [{
                type: 'function',
                function: { name: 'get_weather', description: 'w', parameters: {} },
            }],
            parallelToolCalls: false,
        });

        expect(createMock.mock.calls[0][0].tool_choice).toEqual({
            type: 'auto',
            disable_parallel_tool_use: true,
        });
    });

    it('stays silent when there are no tools to parallelise', async () => {
        const provider = new AnthropicProvider('test-key');
        await provider.chat({
            model: 'claude-opus-5',
            messages: [{ role: 'user', content: 'hi' }],
            parallelToolCalls: false,
        });

        expect(createMock.mock.calls[0][0]).not.toHaveProperty('tool_choice');
    });
});

describe('toAnthropicMessages — system messages', () => {
    it('folds a mid-conversation system message into the system prompt', () => {
        const { system, messages: converted } = toAnthropicMessages([
            { role: 'system', content: 'be brief' },
            { role: 'user', content: 'hi' },
            { role: 'system', content: 'the approved tools have now run' },
            { role: 'assistant', content: 'ok' },
        ]);

        expect(system).toBe('be brief\n\nthe approved tools have now run');
        expect(converted).toHaveLength(2);
    });

    it('leaves system undefined when there are none', () => {
        const { system } = toAnthropicMessages([{ role: 'user', content: 'hi' }]);
        expect(system).toBeUndefined();
    });
});
