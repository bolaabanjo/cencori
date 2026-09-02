/**
 * @vitest-environment node
 *
 * What the console shows for a turn that used tools.
 *
 * The gateway logged one row per request holding the prompt and the completion text. That is the
 * whole record of an agentic turn, and an agentic turn frequently produces no text at all: the
 * model answers with tool calls and nothing else. Those rows logged an empty `content`, so the
 * console said a request had happened and nothing about what it did.
 */
import { describe, expect, it } from 'vitest';
import { buildMaskedLogPayloads } from '@/lib/gateway/chat-post-success';
import { LOG_TEXT_LIMIT } from '@/lib/gateway/log-payload';
import type { CustomDataRule } from '@/lib/safety/custom-data-rules';

const MESSAGES = [{ role: 'user', content: 'Find the theme tokens' }];

function rule(overrides: Partial<CustomDataRule> = {}): CustomDataRule {
    return {
        id: 'rule-1',
        project_id: 'project-1',
        name: 'secrets',
        match_type: 'regex',
        pattern: 'csk_[A-Za-z0-9]+',
        case_sensitive: false,
        action: 'redact',
        is_active: true,
        priority: 1,
        ...overrides,
    };
}

describe('logging a turn that used tools', () => {
    it('records the calls when the model wrote no prose at all', async () => {
        const { loggedResponse, loggedToolCalls } = await buildMaskedLogPayloads({
            messages: MESSAGES,
            responseText: '',
            toolCalls: [
                { name: 'shell', arguments: '{"command":["rg","--line-085"]}' },
                { name: 'read_file', arguments: '{"path":"src/styles.css"}' },
            ],
        });

        // The decisive assertion: the text is empty and the row is still not blank.
        expect(loggedResponse).toBe('');
        expect(loggedToolCalls).toEqual([
            { name: 'shell', arguments: '{"command":["rg","--line-085"]}' },
            { name: 'read_file', arguments: '{"path":"src/styles.css"}' },
        ]);
    });

    it('leaves a turn that called nothing exactly as it was', async () => {
        const { loggedResponse, loggedToolCalls } = await buildMaskedLogPayloads({
            messages: MESSAGES,
            responseText: 'The tokens live in styles.css.',
        });

        expect(loggedResponse).toBe('The tokens live in styles.css.');
        expect(loggedToolCalls).toEqual([]);
    });

    it('masks tool arguments with the same rules as the response', async () => {
        // Arguments carry file contents and paths, and are routinely the most sensitive part of
        // the turn. Logging them raw would defeat the project's rules at the one point they matter.
        const { loggedToolCalls } = await buildMaskedLogPayloads({
            messages: MESSAGES,
            responseText: 'done',
            toolCalls: [
                { name: 'shell', arguments: '{"env":"CENCORI_API_KEY=csk_abcdef123456"}' },
            ],
            customRules: {
                rules: [rule()],
                inputResult: { wasProcessed: false, matchedRules: [] },
            } as never,
        });

        expect(loggedToolCalls[0]?.arguments).not.toContain('csk_abcdef123456');
        expect(loggedToolCalls[0]?.name).toBe('shell');
    });

    it('truncates arguments so one call cannot become the whole row', async () => {
        const { loggedToolCalls } = await buildMaskedLogPayloads({
            messages: MESSAGES,
            responseText: '',
            toolCalls: [{ name: 'apply_patch', arguments: 'x'.repeat(LOG_TEXT_LIMIT * 2) }],
        });

        expect(loggedToolCalls[0]?.arguments.length).toBeLessThan(LOG_TEXT_LIMIT + 200);
        expect(loggedToolCalls[0]?.arguments).toContain('truncated');
    });
});
