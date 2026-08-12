import { afterEach, describe, expect, it } from 'vitest';
import {
    applySpeedProfile,
    resolveGatewayRoutingProfile,
} from '@/lib/gateway/speed-profile';

const original = {
    model: process.env.CENCORI_SPEED_MODEL,
    output: process.env.CENCORI_SPEED_MAX_TOKENS,
    input: process.env.CENCORI_SPEED_MAX_INPUT_TOKENS,
};

afterEach(() => {
    if (original.model === undefined) delete process.env.CENCORI_SPEED_MODEL;
    else process.env.CENCORI_SPEED_MODEL = original.model;
    if (original.output === undefined) delete process.env.CENCORI_SPEED_MAX_TOKENS;
    else process.env.CENCORI_SPEED_MAX_TOKENS = original.output;
    if (original.input === undefined) delete process.env.CENCORI_SPEED_MAX_INPUT_TOKENS;
    else process.env.CENCORI_SPEED_MAX_INPUT_TOKENS = original.input;
});

describe('speed routing profile', () => {
    it('is opt-in through either body or header', () => {
        expect(resolveGatewayRoutingProfile(undefined, null)).toBe('balanced');
        expect(resolveGatewayRoutingProfile('speed', null)).toBe('speed');
        expect(resolveGatewayRoutingProfile(undefined, 'SPEED')).toBe('speed');
    });

    it('routes, bounds output, and retains system plus newest context', () => {
        process.env.CENCORI_SPEED_MODEL = 'llama-3.1-8b-instant';
        process.env.CENCORI_SPEED_MAX_TOKENS = '128';
        process.env.CENCORI_SPEED_MAX_INPUT_TOKENS = '10';
        const result = applySpeedProfile({
            model: 'gpt-4o',
            maxTokens: 1000,
            messages: [
                { role: 'system', content: 'Keep this system prompt.' },
                { role: 'user', content: 'x'.repeat(100) },
                { role: 'assistant', content: 'old answer' },
                { role: 'user', content: 'new question' },
            ],
        });

        expect(result.model).toBe('llama-3.1-8b-instant');
        expect(result.maxTokens).toBe(128);
        expect(result.messages.map((message) => message.role)).toEqual(['system', 'user']);
        expect(result.messages[1].content).toBe('new question');
        expect(result.trimmedMessages).toBe(2);
        expect(result.hedgeDelayMs).toBeGreaterThan(0);
    });
});
