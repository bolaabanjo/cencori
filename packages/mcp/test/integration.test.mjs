import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, '..', 'dist', 'index.js');
const BASE = process.env.CENCORI_DOCS_BASE_URL ?? 'https://cencori.com';
const API_KEY = process.env.CENCORI_API_KEY?.trim();

function skipWithoutApiKey(t) {
    console.warn(
        '[cencori-mcp tests] Skipping authenticated test: CENCORI_API_KEY is not set. ' +
            'Non-auth coverage still runs; set CENCORI_API_KEY for full suite.',
    );
    t.skip('CENCORI_API_KEY not set');
}

function parseToolText(result) {
    const text = result.content?.find((item) => item.type === 'text')?.text;
    assert.ok(text, 'Expected text tool result');
    return JSON.parse(text);
}

async function withMcpClient(env, fn) {
    const childEnv = { ...process.env, ...env };

    if (env.CENCORI_API_KEY === '') {
        delete childEnv.CENCORI_API_KEY;
    }

    const transport = new StdioClientTransport({
        command: 'node',
        args: [serverPath],
        env: childEnv,
        stderr: 'pipe',
    });

    const client = new Client({ name: 'cencori-mcp-test', version: '1.0.0' });
    await client.connect(transport);

    try {
        return await fn(client);
    } finally {
        await client.close();
    }
}

test('docs API: search returns results for failover', async () => {
    const response = await fetch(`${BASE}/api/docs/search?q=failover`);
    assert.equal(response.status, 200);

    const data = await response.json();
    assert.ok(Array.isArray(data.results));
    assert.ok(data.results.length > 0, 'Expected at least one search result');
});

test('docs API: get_doc returns markdown for ai/sdk', async () => {
    const response = await fetch(`${BASE}/api/docs/raw?slug=ai%2Fsdk`);
    assert.equal(response.status, 200);

    const data = await response.json();
    assert.ok(data.content);
    assert.match(data.content, /npm install cencori/i);
});

test('docs API: list_docs returns sections', async () => {
    const response = await fetch(`${BASE}/api/docs/navigation`);
    assert.equal(response.status, 200);

    const data = await response.json();
    assert.ok(Array.isArray(data.sections));
    assert.ok(data.sections.length > 0);
});

test('MCP server: docs-only mode exposes docs tools without API key', async () => {
    await withMcpClient(
        {
            CENCORI_API_KEY: '',
            CENCORI_MCP_FEATURES: 'docs,gateway,agents',
        },
        async (client) => {
            const { tools } = await client.listTools();
            const names = tools.map((tool) => tool.name).sort();

            assert.deepEqual(names, ['get_doc', 'get_integration_guide', 'list_docs', 'search_docs']);
        },
    );
});

test('MCP server: search_docs tool returns results', async () => {
    await withMcpClient({}, async (client) => {
        const result = await client.callTool({
            name: 'search_docs',
            arguments: { query: 'failover' },
        });

        const data = parseToolText(result);
        assert.equal(data.query, 'failover');
        assert.ok(data.count > 0);
        assert.ok(Array.isArray(data.results));
    });
});

test('MCP server: get_doc tool returns markdown', async () => {
    await withMcpClient({}, async (client) => {
        const result = await client.callTool({
            name: 'get_doc',
            arguments: { slug: 'ai/sdk' },
        });

        const data = parseToolText(result);
        assert.equal(data.slug, 'ai/sdk');
        assert.ok(data.content);
        assert.match(data.content, /npm install cencori/i);
    });
});

test('MCP server: list_docs tool returns sections', async () => {
    await withMcpClient({}, async (client) => {
        const result = await client.callTool({
            name: 'list_docs',
            arguments: {},
        });

        const data = parseToolText(result);
        assert.ok(Array.isArray(data.sections));
        assert.ok(data.sections.length > 0);
    });
});

test('MCP server: feature flag docs-only hides platform tools even with API key', async (t) => {
    if (!API_KEY) {
        skipWithoutApiKey(t);
        return;
    }

    await withMcpClient(
        {
            CENCORI_API_KEY: API_KEY,
            CENCORI_MCP_FEATURES: 'docs',
        },
        async (client) => {
            const { tools } = await client.listTools();
            const names = tools.map((tool) => tool.name).sort();

            assert.deepEqual(names, ['get_doc', 'get_integration_guide', 'list_docs', 'search_docs']);
        },
    );
});

// ── Tool composition / tiering (offline: listTools does not call the API, so a
// dummy key exercises registration without network). ──────────────────────
async function toolNames(env) {
    return withMcpClient(env, async (client) => {
        const { tools } = await client.listTools();
        return tools.map((tool) => tool.name);
    });
}

test('MCP server: guidance tools are always available without an API key', async () => {
    const names = await toolNames({ CENCORI_API_KEY: '' });
    // Manual-only guidance is read-only and key-less.
    assert.ok(names.includes('how_to_create_api_key'));
    assert.ok(names.includes('how_to_revoke_api_key'));
    assert.ok(names.includes('how_to_activate_policy'));
    assert.ok(names.includes('how_to_manage_members'));
    // The integration guide (llm.txt) is public — key-less.
    assert.ok(names.includes('get_integration_guide'));
    // No platform tools without a key.
    assert.ok(!names.includes('list_models'));
    assert.ok(!names.includes('generate_text'));
    // There is no executable API-key/billing/activation tool — guidance only.
    assert.ok(!names.includes('create_api_key'));
    assert.ok(!names.includes('activate_policy'));
    assert.ok(!names.includes('create_agent_key'));
});

test('MCP server: reads register with a key; inference is gated behind CENCORI_MCP_WRITE', async () => {
    const readOnly = await toolNames({ CENCORI_API_KEY: 'csk_dummy_for_listing' });
    // Reads across products.
    for (const t of ['list_models', 'get_health', 'check_quota', 'list_memories', 'list_sessions', 'list_policies', 'poll_agent_actions']) {
        assert.ok(readOnly.includes(t), `expected read tool ${t}`);
    }
    // Inference must NOT be present without the write flag.
    assert.ok(!readOnly.includes('generate_text'), 'inference should be gated');
    for (const t of ['web_search', 'web_fetch', 'web_extract', 'get_web_browser_job']) {
        assert.ok(readOnly.includes(t), `expected web read tool ${t}`);
    }
    for (const t of ['web_browse', 'web_crawl', 'request_web_takedown']) {
        assert.ok(!readOnly.includes(t), `web write tool ${t} must be gated`);
    }

    const withWrite = await toolNames({ CENCORI_API_KEY: 'csk_dummy_for_listing', CENCORI_MCP_WRITE: '1' });
    for (const t of ['generate_text', 'describe_image', 'query_document', 'create_embeddings', 'text_to_speech', 'transcribe_audio']) {
        assert.ok(withWrite.includes(t), `expected inference tool ${t} with write enabled`);
    }
    for (const t of ['web_browse', 'web_crawl', 'request_web_takedown']) {
        assert.ok(withWrite.includes(t), `expected web write tool ${t} with write enabled`);
    }
});

test('MCP server: web feature can be selected independently', async () => {
    const names = await toolNames({
        CENCORI_API_KEY: 'csk_dummy_for_listing',
        CENCORI_MCP_FEATURES: 'web',
    });
    assert.deepEqual(names.sort(), ['get_web_browser_job', 'web_extract', 'web_fetch', 'web_search']);

    const withWrite = await toolNames({
        CENCORI_API_KEY: 'csk_dummy_for_listing',
        CENCORI_MCP_FEATURES: 'web',
        CENCORI_MCP_WRITE: '1',
    });
    for (const t of ['web_search', 'web_fetch', 'web_extract', 'get_web_browser_job', 'web_browse', 'web_crawl', 'request_web_takedown']) {
        assert.ok(withWrite.includes(t), `expected standalone web tool ${t}`);
    }
});

test('MCP server: web tools declare open-world access and action safety', async () => {
    await withMcpClient(
        {
            CENCORI_API_KEY: 'csk_dummy_for_listing',
            CENCORI_MCP_FEATURES: 'web',
            CENCORI_MCP_WRITE: '1',
        },
        async (client) => {
            const { tools } = await client.listTools();
            const byName = new Map(tools.map((tool) => [tool.name, tool]));

            assert.equal(byName.get('web_search')?.annotations?.openWorldHint, true);
            assert.equal(byName.get('web_search')?.annotations?.readOnlyHint, true);
            assert.equal(byName.get('web_browse')?.annotations?.openWorldHint, true);
            assert.equal(byName.get('web_browse')?.annotations?.readOnlyHint, false);
            assert.equal(byName.get('request_web_takedown')?.annotations?.destructiveHint, false);
        },
    );
});

test('MCP server: writes need CENCORI_MCP_WRITE; deletes need CENCORI_MCP_DESTRUCTIVE', async () => {
    const write = await toolNames({ CENCORI_API_KEY: 'csk_dummy_for_listing', CENCORI_MCP_WRITE: '1' });
    // Additive writes present with WRITE.
    for (const t of ['remember_memory', 'write_memory', 'create_namespace', 'create_agent', 'update_agent', 'create_session', 'add_session_turn', 'create_policy', 'install_template']) {
        assert.ok(write.includes(t), `expected write tool ${t}`);
    }
    // Destructive tools absent until DESTRUCTIVE.
    for (const t of ['delete_memory', 'delete_agent', 'delete_session', 'approve_session', 'reject_session']) {
        assert.ok(!write.includes(t), `destructive tool ${t} must be gated`);
    }

    const destructive = await toolNames({ CENCORI_API_KEY: 'csk_dummy_for_listing', CENCORI_MCP_DESTRUCTIVE: '1' });
    for (const t of ['delete_memory', 'delete_agent', 'delete_session', 'approve_session', 'reject_session']) {
        assert.ok(destructive.includes(t), `expected destructive tool ${t}`);
    }
    // Destructive implies write.
    assert.ok(destructive.includes('create_agent'), 'destructive should imply write');
});

test('MCP server: list_models returns model list', async (t) => {
    if (!API_KEY) {
        skipWithoutApiKey(t);
        return;
    }

    await withMcpClient(
        {
            CENCORI_API_KEY: API_KEY,
            CENCORI_MCP_FEATURES: 'gateway',
        },
        async (client) => {
            const result = await client.callTool({
                name: 'list_models',
                arguments: {},
            });

            const data = parseToolText(result);
            assert.equal(data.object, 'list');
            assert.ok(Array.isArray(data.data));
            assert.ok(data.data.length > 0);
        },
    );
});

test('MCP server: get_metrics returns usage JSON', async (t) => {
    if (!API_KEY) {
        skipWithoutApiKey(t);
        return;
    }

    await withMcpClient(
        {
            CENCORI_API_KEY: API_KEY,
            CENCORI_MCP_FEATURES: 'gateway',
        },
        async (client) => {
            const result = await client.callTool({
                name: 'get_metrics',
                arguments: { period: '7d' },
            });

            const data = parseToolText(result);
            assert.equal(data.period, '7d');
            assert.ok(data.requests);
            assert.ok(data.cost);
            assert.ok(data.tokens);
            assert.ok(data.latency);
        },
    );
});

test('MCP server: list_agents returns data array', async (t) => {
    if (!API_KEY) {
        skipWithoutApiKey(t);
        return;
    }

    await withMcpClient(
        {
            CENCORI_API_KEY: API_KEY,
            CENCORI_MCP_FEATURES: 'agents',
        },
        async (client) => {
            const result = await client.callTool({
                name: 'list_agents',
                arguments: {},
            });

            const data = parseToolText(result);
            assert.ok(Array.isArray(data.data));
        },
    );
});

test('MCP server: get_agent returns config for first agent', async (t) => {
    if (!API_KEY) {
        skipWithoutApiKey(t);
        return;
    }

    await withMcpClient(
        {
            CENCORI_API_KEY: API_KEY,
            CENCORI_MCP_FEATURES: 'agents',
        },
        async (client) => {
            const listResult = await client.callTool({
                name: 'list_agents',
                arguments: {},
            });
            const listData = parseToolText(listResult);

            if (listData.data.length === 0) {
                t.skip('No agents in project');
                return;
            }

            const agentId = listData.data[0].id;
            const result = await client.callTool({
                name: 'get_agent',
                arguments: { agent_id: agentId },
            });

            const data = parseToolText(result);
            assert.equal(data.id, agentId);
            assert.ok(data.config);
            assert.ok('model' in data.config);
        },
    );
});
