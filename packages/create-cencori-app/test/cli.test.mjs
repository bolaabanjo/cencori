import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const cliPath = join(process.cwd(), 'dist', 'cli.js');

function withTempDir(fn) {
    const dir = mkdtempSync(join(tmpdir(), 'create-cencori-app-'));

    try {
        return fn(dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function runCli(cwd, args) {
    return execFileSync('node', [cliPath, ...args], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, NO_COLOR: '1', CENCORI_SKIP_API_KEY_VERIFY: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

function runCliFailure(cwd, args) {
    try {
        runCli(cwd, args);
    } catch (error) {
        return [
            error.stdout?.toString() || '',
            error.stderr?.toString() || '',
            error.message || '',
        ].join('\n');
    }

    throw new Error('Expected CLI command to fail.');
}

function read(projectDir, relativePath) {
    return readFileSync(join(projectDir, relativePath), 'utf8');
}

test('rejects invalid template names', () => {
    withTempDir((cwd) => {
        const output = runCliFailure(cwd, [
            'bad-template-app',
            '--template',
            'bogus',
            '--no-install',
        ]);

        assert.match(output, /Invalid template "bogus"/);
        assert.equal(existsSync(join(cwd, 'bad-template-app')), false);
    });
});

test('rejects npm-invalid project names', () => {
    withTempDir((cwd) => {
        const output = runCliFailure(cwd, [
            'BadName',
            '--template',
            'nextjs',
            '--no-install',
        ]);

        assert.match(output, /Project name must be lowercase/);
    });
});

test('scaffolds TanStack with ignored env files and streaming config', () => {
    withTempDir((cwd) => {
        runCli(cwd, [
            'tanstack-app',
            '--template',
            'tanstack',
            '--no-install',
            '--api-key',
            'csk_secret',
        ]);

        const projectDir = join(cwd, 'tanstack-app');
        const gitignore = read(projectDir, '.gitignore');
        const html = read(projectDir, 'index.html');
        const server = read(projectDir, 'server/index.ts');
        const hook = read(projectDir, 'src/lib/use-chat.ts');

        assert.match(gitignore, /^\.env$/m);
        assert.match(gitignore, /^!\.env\.example$/m);
        assert.match(html, /<link rel="icon" href="\/favicon\.ico" \/>/);
        assert.match(read(projectDir, '.env'), /CENCORI_API_KEY=csk_secret/);
        assert.match(read(projectDir, '.env.example'), /CENCORI_API_KEY=csk_\.\.\./);
        assert.equal(existsSync(join(projectDir, 'public/favicon.ico')), true);
        assert.equal(existsSync(join(projectDir, 'app/favicon.ico')), false);
        assert.match(server, /cencoriConfig\.defaultModel/);
        assert.match(server, /chatStream/);
        // the client must not pin a model id; the server resolves it from cencori.config.ts
        assert.doesNotMatch(hook, /model: '[^']+'/);
        assert.match(hook, /TextDecoder/);
    });
});

test('scaffolds Next.js no-chat without chat-only assets', () => {
    withTempDir((cwd) => {
        runCli(cwd, ['next-app', '--template', 'nextjs', '--no-chat', '--no-install']);

        const projectDir = join(cwd, 'next-app');
        const packageJson = JSON.parse(read(projectDir, 'package.json'));
        const route = read(projectDir, 'app/api/chat/route.ts');

        assert.equal(existsSync(join(projectDir, 'components/chat.tsx')), false);
        assert.equal(existsSync(join(projectDir, 'public/logos/ww.png')), false);
        assert.equal(existsSync(join(projectDir, 'public/logos/bw.png')), false);
        assert.equal(packageJson.dependencies['@ai-sdk/react'], undefined);
        assert.match(route, /cencoriConfig\.defaultModel/);
        // and must actually use it — a hardcoded id here silently ignores the config
        assert.match(route, /cencori\(selectedModel\)/);
        assert.equal(existsSync(join(projectDir, '.env.example')), true);
    });
});

test('scaffolds Cencori agent starter without integration dependencies', () => {
    withTempDir((cwd) => {
        runCli(cwd, [
            'agent-app',
            '--template',
            'agent',
            '--no-install',
            '--api-key',
            'csk_secret',
        ]);

        const projectDir = join(cwd, 'agent-app');
        const packageJson = JSON.parse(read(projectDir, 'package.json'));
        const env = read(projectDir, '.env');
        const readme = read(projectDir, 'README.md');
        const index = read(projectDir, 'src/index.mjs');

        assert.equal(packageJson.scripts.demo, 'node src/index.mjs');
        assert.equal(packageJson.dependencies, undefined);
        assert.match(env, /CENCORI_API_KEY=csk_secret/);
        assert.match(env, /CENCORI_BASE_URL=https:\/\/api\.cencori\.com\/v1/);
        // the base scaffold is integration-neutral; the Celo variant is the one that isn't
        assert.match(readme, /Integrations for Celo, MiniPay, Slack, GitHub, databases, and MCP can be layered on top/);
        assert.match(readme, /Celo Sepolia receipts on top of the Cencori agent core/);
        assert.match(index, /Cencori Agent Starter Demo/);
        assert.equal(existsSync(join(projectDir, 'src/run-receipt.mjs')), true);
        assert.equal(existsSync(join(projectDir, 'src/celo-record.mjs')), false);
        assert.equal(existsSync(join(projectDir, 'contracts/AgentRunReceipts.sol')), false);
        assert.equal(existsSync(join(projectDir, '.env.example')), true);
    });
});

test('scaffolds Celo agent starter with Cencori defaults and receipt contract', () => {
    withTempDir((cwd) => {
        runCli(cwd, [
            'celo-agent-app',
            '--template',
            'celo-agent',
            '--no-install',
            '--api-key',
            'csk_secret',
        ]);

        const projectDir = join(cwd, 'celo-agent-app');
        const packageJson = JSON.parse(read(projectDir, 'package.json'));
        const env = read(projectDir, '.env');
        const readme = read(projectDir, 'README.md');
        const contract = read(projectDir, 'contracts/AgentRunReceipts.sol');
        const index = read(projectDir, 'src/index.mjs');
        const envMjs = read(projectDir, 'src/env.mjs');

        assert.equal(packageJson.scripts.demo, 'node src/index.mjs');
        assert.equal(packageJson.dependencies.viem, '^2.39.3');
        assert.match(env, /CENCORI_API_KEY=csk_secret/);
        assert.match(env, /CENCORI_BASE_URL=https:\/\/api\.cencori\.com\/v1/);
        assert.match(env, /CELO_RPC_URL=https:\/\/forno\.celo-sepolia\.celo-testnet\.org/);
        assert.match(readme, /Cencori for agent infrastructure/);
        assert.match(contract, /event AgentRunRecorded/);
        assert.match(index, /Cencori x Celo Agent Receipt Demo/);
        assert.match(envMjs, /readOptionalAgentId/);
        assert.match(index, /readOptionalAgentId/);
        assert.doesNotMatch(index, /demo-agent/);
        assert.equal(existsSync(join(projectDir, '.env.example')), true);
    });
});
