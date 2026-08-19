import { describe, expect, it } from 'vitest';
import { extractRequestPrompt } from '../RequestDetailModal';

describe('extractRequestPrompt', () => {
    it('pulls the last user message from a chat payload', () => {
        const { text } = extractRequestPrompt({
            model: 'claude-haiku-4-5',
            stream: true,
            messages: [
                { role: 'system', content: 'You are helpful' },
                { role: 'user', content: 'first' },
                { role: 'assistant', content: 'ok' },
                { role: 'user', content: 'second' },
            ],
        });
        expect(text).toBe('second');
    });

    it('flattens multimodal content parts', () => {
        const { text } = extractRequestPrompt({
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'what is this?' },
                        { type: 'image_url', image_url: { url: 'https://x/y.png' } },
                    ],
                },
            ],
        });
        expect(text).toBe('what is this?\n[image_url]');
    });

    it('reads the Responses API input field', () => {
        expect(extractRequestPrompt({ model: 'maximo-atlas-1.1', input: 'summarize this' }).text)
            .toBe('summarize this');
    });

    it('falls back to raw JSON when no prompt field is recognised', () => {
        const { text, raw } = extractRequestPrompt({ prompt_id: 'p_123' });
        expect(text).toBe('');
        expect(raw).toContain('p_123');
    });

    it('reports nothing for empty or missing payloads', () => {
        expect(extractRequestPrompt({})).toEqual({ text: '', raw: '' });
        expect(extractRequestPrompt(null)).toEqual({ text: '', raw: '' });
        expect(extractRequestPrompt(undefined)).toEqual({ text: '', raw: '' });
    });

    it('skips a user message with empty content and shows the payload instead', () => {
        const { text, raw } = extractRequestPrompt({ messages: [{ role: 'user', content: '' }] });
        expect(text).toBe('');
        expect(raw).toContain('messages');
    });
});
