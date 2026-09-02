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

const { GET, POST } = await import('@/app/api/basecode/inference/v1/[...path]/route');

function request(body: unknown = { model: 'gpt-4o', input: 'hi' }, token = 'session-token') {
    return new Request('https://cencori.com/api/basecode/inference/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }) as never;
}

/** The catch-all takes the path as a route parameter, the way Next hands it over. */
function at(...path: string[]) {
    return { params: Promise.resolve({ path }) } as never;
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

        const response = await POST(request(), at('responses'));

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

        const response = await POST(request(), at('responses'));

        expect(response.status).toBe(429);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('separates a concurrent turn from a spent budget', async () => {
        signedIn(false, 'concurrency_limit');

        expect((await POST(request(), at('responses'))).status).toBe(409);
    });
});

describe('what reaches the gateway', () => {
    it('sends the product key, and never returns it', async () => {
        signedIn(true);

        const response = await POST(request(), at('responses'));
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

        await POST(request(), at('responses'));
        const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
            string,
            { body: string },
        ];

        expect(JSON.parse(init.body)).toMatchObject({ model: 'gpt-4o', user: 'user-basecode-1' });
    });

    it('does not pass the caller their own session as a gateway credential', async () => {
        signedIn(true);

        await POST(request({ model: 'gpt-4o', input: 'hi' }, 'session-token'), at('responses'));
        const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
            string,
            { headers: Record<string, string> },
        ];

        expect(init.headers.Authorization).not.toContain('session-token');
    });
});

describe('what the product key may be spent on', () => {
    function get(path: string[], token = 'session-token') {
        return [
            new Request(`https://cencori.com/api/basecode/inference/v1/${path.join('/')}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
            }) as never,
            at(...path),
        ] as const;
    }

    /**
     * An allowlist, because this route holds the product's key: anything it forwards is something
     * any signed-in user can spend that key on. A blind proxy would hand them the whole API.
     */
    it('refuses a path it does not serve', async () => {
        signedIn(true);

        const response = await POST(request(), at('embeddings'));

        expect(response.status).toBe(404);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('refuses a method the path does not take', async () => {
        signedIn(true);

        expect((await GET(...get(['responses']))).status).toBe(404);
    });

    /**
     * Listing models costs nothing, and gating it would leave a user at their limit unable to see
     * which models exist — which reads as the app being broken rather than as a limit being hit.
     */
    it('lists models without charging them against the plan', async () => {
        signedIn(false, 'weekly_budget_limit');

        const response = await GET(...get(['models']));

        expect(response.status).toBe(200);
        expect(mockRpc).not.toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('still requires a session to list them', async () => {
        mockAuthenticate.mockResolvedValue(null);

        expect((await GET(...get(['models']))).status).toBe(401);
    });

    it('forwards chat completions under the plan, like a turn', async () => {
        signedIn(false, 'weekly_budget_limit');

        const response = await POST(request(), at('chat', 'completions'));

        expect(response.status).toBe(429);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('sends each path on to its own upstream', async () => {
        signedIn(true);

        await POST(request(), at('chat', 'completions'));

        expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(
            'https://api.cencori.com/v1/chat/completions'
        );
    });
});
