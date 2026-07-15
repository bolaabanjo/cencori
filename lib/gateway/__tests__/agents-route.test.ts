/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
    getUser: vi.fn(),
    from: vi.fn(),
    validateGatewayRequest: vi.fn(),
    extractApiKey: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({
        auth: { getUser: mocks.getUser },
    })),
}));

vi.mock('@/lib/supabaseAdmin', () => ({
    createAdminClient: vi.fn(() => ({ from: mocks.from })),
}));

vi.mock('@/lib/gateway-middleware', () => ({
    validateGatewayRequest: mocks.validateGatewayRequest,
    handleCorsPreFlight: vi.fn(() => new NextResponse(null, { status: 204 })),
}));

vi.mock('@/lib/api-keys', () => ({
    extractCencoriApiKeyFromHeaders: mocks.extractApiKey,
}));

import { GET, POST } from '@/app/api/v1/agents/route';

function queryReturning(result: unknown) {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ['select', 'eq', 'order', 'insert', 'delete']) {
        query[method] = vi.fn(() => query);
    }
    query.maybeSingle = vi.fn(async () => result);
    query.single = vi.fn(async () => result);
    return query;
}

describe('/v1/agents authorization and body handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.extractApiKey.mockReturnValue(null);
        mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    });

    it('parses a JWT create request once and creates the agent for an authorized owner', async () => {
        const projectQuery = queryReturning({
            data: {
                id: 'project-1',
                organization_id: 'org-1',
                organizations: { owner_id: 'user-1' },
            },
            error: null,
        });
        const agentQuery = queryReturning({
            data: {
                id: 'agent-1',
                name: 'Support',
                description: null,
                is_active: true,
                shadow_mode: true,
                created_at: '2026-07-15T00:00:00Z',
            },
            error: null,
        });
        const configQuery = queryReturning({
            data: {
                model: 'gpt-4o-mini',
                system_prompt: null,
                tools: [],
                temperature: 0.2,
            },
            error: null,
        });

        mocks.from.mockImplementation((table: string) => {
            if (table === 'projects') return projectQuery;
            if (table === 'agents') return agentQuery;
            if (table === 'agent_configs') return configQuery;
            throw new Error(`Unexpected table: ${table}`);
        });

        const request = new NextRequest('https://api.cencori.com/v1/agents', {
            method: 'POST',
            headers: { Authorization: 'Bearer jwt' },
            body: JSON.stringify({
                project_id: 'project-1',
                name: 'Support',
                config: { model: 'gpt-4o-mini', temperature: 0.2 },
            }),
        });

        const response = await POST(request);

        expect(response.status).toBe(201);
        await expect(response.json()).resolves.toMatchObject({ id: 'agent-1', name: 'Support' });
        expect(projectQuery.maybeSingle).toHaveBeenCalledOnce();
        expect(agentQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
            project_id: 'project-1',
            name: 'Support',
        }));
        expect(configQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
            agent_id: 'agent-1',
            model: 'gpt-4o-mini',
        }));
    });

    it('rejects JWT list access when the user is not an owner or member', async () => {
        const projectQuery = queryReturning({
            data: {
                id: 'project-2',
                organization_id: 'org-2',
                organizations: { owner_id: 'someone-else' },
            },
            error: null,
        });
        const membershipQuery = queryReturning({ data: null, error: null });

        mocks.from.mockImplementation((table: string) => {
            if (table === 'projects') return projectQuery;
            if (table === 'organization_members') return membershipQuery;
            throw new Error(`Unexpected table: ${table}`);
        });

        const request = new NextRequest('https://api.cencori.com/v1/agents?project_id=project-2', {
            headers: { Authorization: 'Bearer jwt' },
        });

        const response = await GET(request);

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({
            error: { code: 'forbidden' },
        });
        expect(membershipQuery.maybeSingle).toHaveBeenCalledOnce();
    });
});
