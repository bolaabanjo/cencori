/**
 * @vitest-environment node
 *
 * Basecode's inference proxy.
 *
 * Basecode is a product built on Cencori: one customer, one project, one key. That key cannot ship
 * inside a desktop app — anyone who installs it could read it out of the bundle — so it lives here
 * and the app authenticates as the signed-in user instead.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthenticate = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/lib/basecode-data', () => ({
    authenticateBasecodeDataRequest: (...args: unknown[]) => mockAuthenticate(...args),
}));

vi.mock('@/lib/basecode-auth', () => ({
    noStoreHeaders: () => ({ 'Cache-Control': 'no-store' }),
}));

const PRODUCT_KEY = 'csk_the_products_own_key';
process.env.BASECODE_GATEWAY_API_KEY = PRODUCT_KEY;

const { POST } = await import('@/app/api/basecode/inference/v1/responses/route');

function request(body: unknown = { model: 'gpt-4o', input: 'hi' }, token = 'session-token') {
    return new Request('https://cencori.com/api/basecode/inference/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }) as never;
}

function signedIn(allowed: boolean, reason?: string) {
    mockRpc.mockResolvedValue({
        data: { allowed, ...(reason ? { reason } : {}) },
        error: null,
    });
    mockAuthenticate.mockResolvedValue({
        admin: { rpc: mockRpc },
        user: { id: 'user-basecode-1' },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('{"ok":true}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }))
    );
});

describe('who may run a turn', () => {
    it('refuses a request with no session', async () => {
        mockAuthenticate.mockResolvedValue(null);

        const response = await POST(request());

        expect(response.status).toBe(401);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    /**
     * The gateway used to enforce this, because it recognised a Basecode key by `client_app` and
     * called the entitlement function itself. A product key carries no such mark, so without this
     * check a user could spend past their plan on the product's credits.
     */
    it('refuses a turn the plan does not allow', async () => {
        signedIn(false, 'weekly_budget_limit');

        const response = await POST(request());

        expect(response.status).toBe(429);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('separates a concurrent turn from a spent budget', async () => {
        signedIn(false, 'concurrency_limit');

        expect((await POST(request())).status).toBe(409);
    });
});

describe('what reaches the gateway', () => {
    it('sends the product key, and never returns it', async () => {
        signedIn(true);

        const response = await POST(request());
        const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
            string,
            { headers: Record<string, string>; body: string },
        ];

        expect(init.headers.Authorization).toBe(`Bearer ${PRODUCT_KEY}`);
        // The decisive one: the key is the product's, and a client must never see it.
        const returned = await response.text();
        expect(returned).not.toContain(PRODUCT_KEY);
        expect(JSON.stringify([...response.headers])).not.toContain(PRODUCT_KEY);
    });

    /**
     * One key for the whole product would otherwise make every user indistinguishable in the
     * project's logs. The gateway reads `user` as the end user, so spend stays attributable.
     */
    it('attributes the turn to the person who ran it', async () => {
        signedIn(true);

        await POST(request());
        const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
            string,
            { body: string },
        ];

        expect(JSON.parse(init.body)).toMatchObject({ model: 'gpt-4o', user: 'user-basecode-1' });
    });

    it('does not pass the caller their own session as a gateway credential', async () => {
        signedIn(true);

        await POST(request({ model: 'gpt-4o', input: 'hi' }, 'session-token'));
        const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
            string,
            { headers: Record<string, string> },
        ];

        expect(init.headers.Authorization).not.toContain('session-token');
    });
});
