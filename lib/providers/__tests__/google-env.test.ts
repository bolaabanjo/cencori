import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getGoogleApiKey, getMemoryGoogleApiKey } from '../google-env';

const GOOGLE_VARS = [
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'GOOGLE_AI_API_KEY',
    'GEMINI_API_KEY',
    'MEMORY_GEMINI_API_KEY',
];

describe('google key resolution', () => {
    let saved: Record<string, string | undefined>;

    beforeEach(() => {
        saved = {};
        for (const v of GOOGLE_VARS) {
            saved[v] = process.env[v];
            delete process.env[v];
        }
    });

    afterEach(() => {
        for (const v of GOOGLE_VARS) {
            if (saved[v] === undefined) delete process.env[v];
            else process.env[v] = saved[v];
        }
    });

    it('getGoogleApiKey follows the shared env order', () => {
        process.env.GEMINI_API_KEY = 'shared-key';
        expect(getGoogleApiKey()).toBe('shared-key');
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'preferred-key';
        expect(getGoogleApiKey()).toBe('preferred-key');
    });

    it('getMemoryGoogleApiKey uses the dedicated memory key when set', () => {
        process.env.GEMINI_API_KEY = 'shared-key';
        process.env.MEMORY_GEMINI_API_KEY = 'memory-only-key';
        expect(getMemoryGoogleApiKey()).toBe('memory-only-key');
        // and the shared resolver is unaffected — chat can't reach the memory key
        expect(getGoogleApiKey()).toBe('shared-key');
    });

    it('getMemoryGoogleApiKey falls back to the shared key when unset', () => {
        process.env.GEMINI_API_KEY = 'shared-key';
        expect(getMemoryGoogleApiKey()).toBe('shared-key');
    });

    it('trims and ignores blank values', () => {
        process.env.MEMORY_GEMINI_API_KEY = '   ';
        process.env.GEMINI_API_KEY = '  shared-key  ';
        // blank dedicated key is ignored → falls back to (trimmed) shared key
        expect(getMemoryGoogleApiKey()).toBe('shared-key');
    });
});
