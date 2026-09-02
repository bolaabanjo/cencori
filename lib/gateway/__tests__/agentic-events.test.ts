/**
 * @vitest-environment node
 *
 * The timeline a stateless turn writes.
 */
import { describe, expect, it, vi } from 'vitest';
import {
    buildResponseTurnEvents,
    recordResponseTurnEvents,
    toolResultsIn,
} from '@/lib/gateway/agentic-events';

function params(overrides: Record<string, unknown> = {}) {
    return {
        supabase: {} as never,
        projectId: 'project-1',
        organizationId: 'org-1',
        responseId: 'resp_2',
        previousResponseId: 'resp_1',
        model: 'gpt-4o',
        toolsOffered: ['shell', 'read_file'],
        toolCalls: [{ name: 'shell', arguments: '{"command":["ls"]}', id: 'call_b' }],
        toolResults: [{ callId: 'call_a', outputBytes: 120 }],
        usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
        ...overrides,
    } as Parameters<typeof buildResponseTurnEvents>[0];
}

describe('the shape of a turn', () => {
    it('orders the turn as it happened: results, then new calls', () => {
        // The result completes a call made on the previous request, so it is the first thing that
        // happens in this one. Getting this backwards would misreport every duration.
        expect(buildResponseTurnEvents(params()).map((event) => event.event_type)).toEqual([
            'turn.started',
            'tool_call.completed',
            'tool_call.started',
            'turn.completed',
        ]);
    });

    it('records what was offered, not only what was called', () => {
        const [started] = buildResponseTurnEvents(params());

        expect(started?.payload.tools_offered).toEqual(['shell', 'read_file']);
    });

    it('carries the shape of a call without copying its content', () => {
        const call = buildResponseTurnEvents(params()).find(
            (event) => event.event_type === 'tool_call.started'
        );

        expect(call?.payload).toEqual({
            tool: 'shell',
            call_id: 'call_b',
            arguments_bytes: '{"command":["ls"]}'.length,
        });
        // The arguments themselves live in ai_requests, masked. A second copy here would be a
        // second place for a secret to sit and a second masking path to keep in step.
        expect(JSON.stringify(call?.payload)).not.toContain('ls');
    });

    it('still writes a timeline for a turn that used no tools at all', () => {
        const events = buildResponseTurnEvents(params({ toolCalls: [], toolResults: [], toolsOffered: [] }));

        expect(events.map((event) => event.event_type)).toEqual(['turn.started', 'turn.completed']);
    });
});

describe('writing the timeline', () => {
    it('chains every row to the run and numbers them in order', async () => {
        const insert = vi.fn().mockResolvedValue({ error: null });
        await recordResponseTurnEvents(params({ supabase: { from: () => ({ insert }) } }));

        const rows = insert.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
        expect(rows.map((row) => row.sequence)).toEqual([0, 1, 2, 3]);
        expect(new Set(rows.map((row) => row.response_id))).toEqual(new Set(['resp_2']));
        expect(new Set(rows.map((row) => row.previous_response_id))).toEqual(new Set(['resp_1']));
        expect(new Set(rows.map((row) => row.session_id))).toEqual(new Set([null]));
    });

    it('never lets a logging failure reach the request', async () => {
        // The response has already been sent. A throw here would surface as an unhandled rejection
        // and buy nothing.
        const insert = vi.fn().mockRejectedValue(new Error('connection reset'));
        await expect(
            recordResponseTurnEvents(params({ supabase: { from: () => ({ insert }) } }))
        ).resolves.toBeUndefined();
    });
});

describe('finding the results a request carries', () => {
    it('picks out tool outputs and measures them', () => {
        expect(
            toolResultsIn([
                { type: 'message', role: 'user', content: 'go on' },
                { type: 'function_call_output', call_id: 'call_a', output: 'four bytes' },
            ])
        ).toEqual([{ callId: 'call_a', outputBytes: 'four bytes'.length }]);
    });

    it('is unbothered by a plain string input', () => {
        expect(toolResultsIn('just a prompt')).toEqual([]);
    });
});
