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

test('MCP server: docs-only mode exposes 3 tools without API key', async () => {
    await withMcpClient(
        {
            CENCORI_API_KEY: '',
            CENCORI_MCP_FEATURES: 'docs,gateway,agents',
        },
        async (client) => {
            const { tools } = await client.listTools();
            const names = tools.map((tool) => tool.name).sort();

            assert.deepEqual(names, ['get_doc', 'list_docs', 'search_docs']);
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

            assert.deepEqual(names, ['get_doc', 'list_docs', 'search_docs']);
        },
    );
});

test('MCP server: authenticated mode exposes all 7 tools', async (t) => {
    if (!API_KEY) {
        skipWithoutApiKey(t);
        return;
    }

    await withMcpClient(
        {
            CENCORI_API_KEY: API_KEY,
            CENCORI_MCP_FEATURES: 'docs,gateway,agents',
        },
        async (client) => {
            const { tools } = await client.listTools();
            const names = tools.map((tool) => tool.name).sort();

            assert.deepEqual(names, [
                'get_agent',
                'get_doc',
                'get_metrics',
                'list_agents',
                'list_docs',
                'list_models',
                'search_docs',
            ]);
        },
    );
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
