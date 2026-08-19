import { describe, expect, it } from 'vitest';
import {
    LOG_TEXT_LIMIT,
    promptPayload,
    redactBinaryRef,
    textResponsePayload,
    toLoggedMessages,
    toLoggedText,
    truncateForLog,
} from '../log-payload';

describe('truncateForLog', () => {
    it('leaves short text alone and caps long text', () => {
        expect(truncateForLog('hello')).toBe('hello');
        const long = 'x'.repeat(LOG_TEXT_LIMIT + 500);
        const out = truncateForLog(long);
        expect(out.length).toBeLessThan(long.length);
        expect(out).toContain('truncated 500 chars');
    });
});

describe('redactBinaryRef', () => {
    it('summarises data URIs instead of storing the blob', () => {
        const uri = `data:image/png;base64,${'A'.repeat(5000)}`;
        const out = redactBinaryRef(uri);
        expect(out).toBe(`[inline image/png, ${uri.length} chars]`);
        expect(out).not.toContain('AAAA');
    });

    it('keeps ordinary URLs', () => {
        expect(redactBinaryRef('https://example.com/a.png')).toBe('https://example.com/a.png');
    });
});

describe('toLoggedText', () => {
    it('flattens content parts and redacts inline images', () => {
        const text = toLoggedText([
            { type: 'text', text: 'describe this' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${'B'.repeat(3000)}` } },
        ]);
        expect(text).toContain('describe this');
        expect(text).toContain('[inline image/jpeg');
        expect(text).not.toContain('BBBB');
    });

    it('handles bare data URI strings, objects and nullish content', () => {
        expect(toLoggedText(`data:audio/mpeg;base64,${'C'.repeat(100)}`)).toContain('[inline audio/mpeg');
        expect(toLoggedText({ a: 1 })).toBe('{"a":1}');
        expect(toLoggedText(null)).toBe('');
        expect(toLoggedText(undefined)).toBe('');
    });
});

describe('payload builders', () => {
    it('shapes prompts and responses like a chat turn', () => {
        expect(promptPayload('summarize', { model: 'm' })).toEqual({
            messages: [{ role: 'user', content: 'summarize' }],
            model: 'm',
        });
        expect(textResponsePayload('done', { finishReason: 'stop' })).toEqual({
            content: 'done',
            finishReason: 'stop',
        });
        expect(toLoggedMessages([{ role: 'user', content: ['hi'] }])).toEqual([
            { role: 'user', content: 'hi' },
        ]);
        expect(toLoggedMessages(undefined)).toEqual([]);
    });
});
