/**
 * @vitest-environment node
 *
 * Images on the /v1/responses surface. An agent that can call an image tool sends the tool's result
 * back as content parts; before this the gateway rejected the item outright, which killed the turn
 * and every turn after it.
 */
import { describe, expect, it } from 'vitest';
import {
    measureResponsesContent,
    normalizeResponsesContent,
    TOOL_IMAGE_CAPTION,
    TOOL_IMAGE_PLACEHOLDER,
    toolOutputTurns,
} from '@/lib/gateway/responses-content';
import { validateResponsesInput } from '@/lib/gateway/responses-input';
import { toOpenAIMessages } from '@/lib/providers/utils';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';

const LIMITS = { maxTextBytes: 1024, maxImageBytes: 1024, maxImages: 3 };

describe('normalizeResponsesContent', () => {
    it('passes a plain string through', () => {
        expect(normalizeResponsesContent('hello')).toEqual({ text: 'hello', images: [] });
    });

    it('splits parts into the text the pipeline scans and the images the provider gets', () => {
        const result = normalizeResponsesContent([
            { type: 'input_text', text: 'what is wrong here' },
            { type: 'input_image', image_url: PNG },
        ]);

        expect(result.text).toBe('what is wrong here');
        expect(result.images).toEqual([{ url: PNG }]);
    });

    it('reads the several spellings of an image part', () => {
        const result = normalizeResponsesContent([
            { type: 'input_image', image_url: PNG },
            { type: 'image_url', image_url: { url: 'https://example.com/a.png', detail: 'high' } },
            { type: 'image', url: 'https://example.com/b.png' },
        ]);

        expect(result.images).toEqual([
            { url: PNG },
            { url: 'https://example.com/a.png', detail: 'high' },
            { url: 'https://example.com/b.png' },
        ]);
    });

    it('ignores a part it cannot read rather than losing the rest of the turn', () => {
        const result = normalizeResponsesContent([
            { type: 'input_text', text: 'keep me' },
            { type: 'input_audio', audio: 'unsupported' },
            { type: 'input_image' },
        ]);

        expect(result).toEqual({ text: 'keep me', images: [] });
    });
});

describe('toolOutputTurns', () => {
    it('leaves a text tool result as one tool turn', () => {
        expect(toolOutputTurns('exit code 0', 'call-1')).toEqual([
            { role: 'tool', content: 'exit code 0', toolCallId: 'call-1' },
        ]);
    });

    /**
     * A tool message cannot carry an image on the chat-completions wire format, so the image moves
     * to the user turn behind it. Dropping it would leave the agent describing a blank.
     */
    it('moves an image result onto the user turn that follows it', () => {
        expect(toolOutputTurns([{ type: 'input_image', image_url: PNG }], 'call-2')).toEqual([
            { role: 'tool', content: TOOL_IMAGE_PLACEHOLDER, toolCallId: 'call-2' },
            { role: 'user', content: TOOL_IMAGE_CAPTION, images: [{ url: PNG }] },
        ]);
    });

    it('keeps text the tool returned alongside the image', () => {
        const turns = toolOutputTurns(
            [{ type: 'input_text', text: 'screenshot.png, 1024x768' }, { type: 'input_image', image_url: PNG }],
            'call-3',
        );

        expect(turns[0]).toEqual({ role: 'tool', content: 'screenshot.png, 1024x768', toolCallId: 'call-3' });
        expect(turns[1].images).toEqual([{ url: PNG }]);
    });
});

describe('measureResponsesContent', () => {
    it('rejects a value that is neither text nor parts', () => {
        expect(measureResponsesContent(42, 'Function call output', LIMITS).error).toBe(
            'Function call output must be a string or an array of content parts.',
        );
    });

    it('holds one image to the per-image cap', () => {
        const oversized = `data:image/png;base64,${'A'.repeat(2048)}`;
        expect(measureResponsesContent([{ type: 'input_image', image_url: oversized }], 'Message content', LIMITS).error)
            .toBe('Message content contains an image that exceeds the per-image limit.');
    });

    it('caps how many images one item may carry', () => {
        const parts = Array.from({ length: 4 }, () => ({ type: 'input_image', image_url: PNG }));
        expect(measureResponsesContent(parts, 'Message content', LIMITS).error).toBe(
            'Message content may contain at most 3 images.',
        );
    });

    it('reports what a legal value costs so the caller can hold it against the request total', () => {
        const measured = measureResponsesContent(
            [{ type: 'input_text', text: 'abc' }, { type: 'input_image', image_url: PNG }],
            'Message content',
            LIMITS,
        );

        expect(measured.error).toBeUndefined();
        expect(measured.textBytes).toBe(3);
        expect(measured.imageCount).toBe(1);
        expect(measured.imageBytes).toBe(PNG.length);
    });
});

describe('validateResponsesInput', () => {
    /** The exact payload shape that used to 400 mid-session: `view_image` answering with an image. */
    it('accepts an image tool result', () => {
        expect(validateResponsesInput([
            { type: 'message', role: 'user', content: 'what do you see' },
            { type: 'function_call', id: 'fc-1', call_id: 'call-1', name: 'view_image', arguments: '{"path":"a.png"}' },
            { type: 'function_call_output', call_id: 'call-1', output: [{ type: 'input_image', image_url: PNG }] },
        ])).toBeNull();
    });

    it('accepts a user turn that carries the image itself', () => {
        expect(validateResponsesInput([
            { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'this screenshot' }, { type: 'input_image', image_url: PNG }] },
        ])).toBeNull();
    });

    it('still requires a call_id on a tool result', () => {
        expect(validateResponsesInput([
            { type: 'function_call_output', output: 'done' },
        ])).toBe('Function call output items require a string call_id field.');
    });

    /** A long agent session resends every screenshot it has seen, so the budget has to hold many. */
    it('accepts a conversation carrying several images', () => {
        const input = Array.from({ length: 12 }, (_, index) => ({
            type: 'function_call_output',
            call_id: `call-${index}`,
            output: [{ type: 'input_image', image_url: PNG }],
        }));

        expect(validateResponsesInput(input)).toBeNull();
    });

    it('stops a request that carries more images than the budget allows', () => {
        const input = Array.from({ length: 41 }, (_, index) => ({
            type: 'function_call_output',
            call_id: `call-${index}`,
            output: [{ type: 'input_image', image_url: PNG }],
        }));

        expect(validateResponsesInput(input)).toBe('Input may contain at most 40 images.');
    });

    it('still rejects an unsupported item type', () => {
        expect(validateResponsesInput([{ type: 'reasoning', summary: [] }])).toBe('Unsupported input item type.');
    });
});

describe('toOpenAIMessages', () => {
    it('leaves a text turn as a plain string', () => {
        expect(toOpenAIMessages([{ role: 'user', content: 'hi' }])).toEqual([
            { role: 'user', content: 'hi' },
        ]);
    });

    it('sends an image turn as content parts', () => {
        expect(toOpenAIMessages([
            { role: 'user', content: 'look', images: [{ url: PNG, detail: 'high' }] },
        ])).toEqual([
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'look' },
                    { type: 'image_url', image_url: { url: PNG, detail: 'high' } },
                ],
            },
        ]);
    });

    it('never puts an image on a tool message, which this wire format rejects', () => {
        expect(toOpenAIMessages([
            { role: 'tool', content: 'output', toolCallId: 'call-1', images: [{ url: PNG }] },
        ])).toEqual([
            { role: 'tool', content: 'output', tool_call_id: 'call-1' },
        ]);
    });
});

/**
 * The turn that used to fail. Basecode's runtime calls `view_image`, the tool answers with an
 * `input_image` part, and the whole conversation is replayed on the next request. Every link of
 * that chain has to hold or the session dies where it stands.
 */
describe('a view_image turn, end to end', () => {
    const input = [
        { type: 'message', role: 'user', content: "i can't verify you just did" },
        {
            type: 'function_call',
            id: 'fc_01a01bb9',
            call_id: 'chatcmpl-tool-833fda3e',
            name: 'view_image',
            arguments: '{"path":"/tmp/pasted.png"}',
        },
        {
            type: 'function_call_output',
            call_id: 'chatcmpl-tool-833fda3e',
            output: [{ type: 'input_image', image_url: PNG }],
        },
    ];

    it('passes the door, and reaches the provider as an image', () => {
        expect(validateResponsesInput(input)).toBeNull();

        const messages = [
            { role: 'user' as const, content: "i can't verify you just did" },
            ...toolOutputTurns(input[2].output, 'chatcmpl-tool-833fda3e'),
        ];
        const wire = toOpenAIMessages(messages);

        expect(wire[1]).toEqual({
            role: 'tool',
            content: TOOL_IMAGE_PLACEHOLDER,
            tool_call_id: 'chatcmpl-tool-833fda3e',
        });
        expect(wire[2]).toEqual({
            role: 'user',
            content: [
                { type: 'text', text: TOOL_IMAGE_CAPTION },
                { type: 'image_url', image_url: { url: PNG } },
            ],
        });
    });
});
