#!/usr/bin/env node
/**
 * Cencori Node shim — wraps a user's Node/TS agent with the Runtime Contract v2.
 *
 * Baked into the Node base image. The generic-node adapter (and JS frameworks
 * that expose an agent rather than a server) point START_COMMAND here and set
 * AGENT_ENTRYPOINT="<file>[:export]". Dependency-free (built-in http); Node
 * >=23.6 imports .ts entries directly via native type-stripping.
 *
 * Contract surface:
 *   GET  /_health              liveness + entry
 *   GET  /_manifest            capabilities (streaming, framework)
 *   POST /invoke               sync sugar — runs to completion, returns {output}
 *   POST /runs                 start an async run → {id, status}
 *   GET  /runs/:id             run state (status, output/error, suspend info)
 *   GET  /runs/:id/events      SSE event stream (?after=<seq> to resume)
 *   POST /runs/:id/cancel      request cancellation (best-effort via AbortSignal)
 *   POST /runs/:id/resume      resume a suspended run with {resume|input}
 *
 * Events are normalized across frameworks so the platform renders one timeline:
 *   run.started · message · token · tool.call · tool.result ·
 *   run.suspended · run.output · run.failed · run.completed
 *
 * Runs live in-memory (one agent per machine). A durable run store lands with
 * the platform; reconnecting clients replay from the ?after cursor meanwhile.
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const PORT = Number(process.env.PORT || 8080);
const SPEC = process.env.AGENT_ENTRYPOINT || '';
const FRAMEWORK = process.env.FRAMEWORK || '';

let entry = null;

async function load() {
    if (entry) return entry;
    const [file, attr] = SPEC.split(':');
    if (!file) throw new Error('AGENT_ENTRYPOINT is not set (expected "<file>[:export]")');
    const mod = await import(pathToFileURL(resolve(process.cwd(), file)).href);
    entry = attr && mod[attr] != null ? mod[attr] : mod.default ?? mod.agent ?? mod;
    if (entry == null) throw new Error(`No usable export found in ${file}`);
    return entry;
}

/** Resolve a package from the AGENT's node_modules (not the shim's location). */
async function fromAgent(pkg) {
    const req = createRequire(pathToFileURL(resolve(process.cwd(), 'package.json')).href);
    return import(pathToFileURL(req.resolve(pkg)).href);
}

// ── Framework-aware invocation ─────────────────────────────────────────────

/** Sync call — runs to completion, returns the final output. */
async function callAgent(input) {
    const e = await load();
    if (FRAMEWORK === 'openai-agents') {
        const { run } = await fromAgent('@openai/agents');
        const result = await run(e, input);
        return result?.finalOutput ?? result;
    }
    if (FRAMEWORK === 'mastra' && e && typeof e.generate === 'function') {
        const result = await e.generate(input);
        return result?.text ?? result;
    }
    let out;
    if (e && typeof e.invoke === 'function') out = e.invoke(input);
    else if (typeof e === 'function') out = e(input);
    else if (e && typeof e.run === 'function') out = e.run(input);
    else if (e && typeof e.generate === 'function') out = e.generate(input);
    else throw new Error('AGENT_ENTRYPOINT is not callable and has no .invoke()/.run()');
    return await out;
}

/** LangGraph interrupts surface as `__interrupt__` on a streamed/returned chunk. */
function langgraphInterrupt(chunk) {
    const i = chunk && (chunk.__interrupt__ ?? chunk['__interrupt__']);
    if (i == null) return null;
    return { reason: 'interrupt', data: i };
}

/**
 * Stream an agent as normalized events. Yields any of:
 *   { type: 'message'|'token'|'tool.call'|'tool.result', data }
 *   { type: 'run.suspended', reason, data }   (terminal-for-now; resumable)
 *   { type: 'run.output', output }            (final result)
 * Frameworks without a stream method run sync and yield a single run.output.
 */
async function* streamAgent(input, signal) {
    const e = await load();

    // OpenAI Agents SDK — streaming run yields SDK events; finalOutput at the end.
    if (FRAMEWORK === 'openai-agents') {
        const { run } = await fromAgent('@openai/agents');
        const result = await run(e, input, { stream: true });
        if (result && typeof result[Symbol.asyncIterator] === 'function') {
            for await (const ev of result) {
                if (signal?.aborted) return;
                // Interruptions (approvals/handoffs) → suspended run.
                if (ev && (ev.type === 'run_item_stream_event') && ev.item?.type === 'tool_approval_item') {
                    yield { type: 'run.suspended', reason: 'approval', data: ev.item };
                    return;
                }
                yield { type: 'message', data: ev };
            }
        }
        yield { type: 'run.output', output: result?.finalOutput ?? result };
        return;
    }

    // LangGraph.js / LangChain / Mastra — native async-iterable .stream().
    if (e && typeof e.stream === 'function') {
        const stream = await e.stream(input, signal ? { signal } : undefined);
        let last;
        for await (const chunk of stream) {
            if (signal?.aborted) return;
            const suspend = langgraphInterrupt(chunk);
            if (suspend) {
                yield { type: 'run.suspended', reason: suspend.reason, data: suspend.data };
                return;
            }
            last = chunk;
            yield { type: 'message', data: chunk };
        }
        yield { type: 'run.output', output: last };
        return;
    }

    // No native streaming — run to completion, emit a single output event.
    yield { type: 'run.output', output: await callAgent(input) };
}

/** Resume a suspended run. LangGraph resumes by re-invoking with a Command. */
async function* resumeAgent(run, payload, signal) {
    const e = await load();
    if (e && typeof e.stream === 'function') {
        // LangGraph: `new Command({ resume })` — construct loosely to avoid a dep.
        const command = { resume: payload?.resume ?? payload?.input ?? payload };
        const stream = await e.stream(command, signal ? { signal } : undefined);
        let last;
        for await (const chunk of stream) {
            if (signal?.aborted) return;
            const suspend = langgraphInterrupt(chunk);
            if (suspend) {
                yield { type: 'run.suspended', reason: suspend.reason, data: suspend.data };
                return;
            }
            last = chunk;
            yield { type: 'message', data: chunk };
        }
        yield { type: 'run.output', output: last };
        return;
    }
    void run;
    throw new Error(`resume is not supported for framework "${FRAMEWORK || 'generic'}"`);
}

// ── In-memory run store + SSE fan-out ──────────────────────────────────────

/** @type {Map<string, Run>} */
const runs = new Map();

function createRun(input) {
    const run = {
        id: randomUUID(),
        status: 'running', // running | suspended | completed | failed | canceled
        input,
        output: undefined,
        error: undefined,
        suspend: undefined, // { reason, data } when status === 'suspended'
        events: [], // [{ seq, ts, type, ...payload }]
        seq: 0,
        subscribers: new Set(), // Set<http.ServerResponse>
        controller: new AbortController(),
        createdAt: Date.now(),
    };
    runs.set(run.id, run);
    return run;
}

function emit(run, event) {
    const record = { seq: ++run.seq, ts: Date.now(), ...event };
    run.events.push(record);
    const line = `id: ${record.seq}\nevent: ${record.type}\ndata: ${JSON.stringify(record)}\n\n`;
    for (const res of run.subscribers) res.write(line);
    return record;
}

const TERMINAL = new Set(['completed', 'failed', 'canceled']);

function finish(run, status, patch = {}) {
    if (TERMINAL.has(run.status)) return; // already settled — don't double-emit
    run.status = status;
    Object.assign(run, patch);
    emit(run, { type: 'run.completed', status, ...(patch.error ? { error: patch.error } : {}) });
    for (const res of run.subscribers) res.end();
    run.subscribers.clear();
}

/** Drive a run's async iterator, emitting normalized events until terminal. */
async function driveRun(run, iterator) {
    emit(run, { type: 'run.started', runId: run.id });
    try {
        for await (const ev of iterator) {
            if (run.controller.signal.aborted) {
                finish(run, 'canceled');
                return;
            }
            if (ev.type === 'run.suspended') {
                run.suspend = { reason: ev.reason, data: ev.data };
                emit(run, ev);
                run.status = 'suspended';
                // Suspended is not terminal — keep subscribers open for resume.
                for (const res of run.subscribers) res.write(`event: ping\ndata: {}\n\n`);
                return;
            }
            if (ev.type === 'run.output') {
                run.output = ev.output;
                emit(run, ev);
                finish(run, 'completed', { output: ev.output });
                return;
            }
            emit(run, ev);
        }
        // Iterator ended. Don't overwrite a run that cancel/suspend already settled
        // (streamAgent returns cleanly on abort, ending this loop normally).
        if (run.controller.signal.aborted) return finish(run, 'canceled');
        if (run.status === 'running') finish(run, 'completed', { output: run.output ?? null });
    } catch (err) {
        if (run.controller.signal.aborted) return finish(run, 'canceled');
        const error = { code: 'run_failed', message: String(err?.message ?? err) };
        run.error = error;
        emit(run, { type: 'run.failed', error });
        finish(run, 'failed', { error });
    }
}

function runView(run) {
    return {
        id: run.id,
        status: run.status,
        output: run.output,
        error: run.error,
        suspend: run.suspend,
        seq: run.seq,
    };
}

// ── HTTP ───────────────────────────────────────────────────────────────────

function send(res, code, body) {
    let payload;
    try {
        payload = JSON.stringify(body);
    } catch {
        payload = JSON.stringify({ output: String(body?.output ?? body) });
    }
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(payload);
}

function readJson(req) {
    return new Promise((resolveBody, reject) => {
        let raw = '';
        req.on('data', (c) => { raw += c; });
        req.on('end', () => {
            if (!raw) return resolveBody({});
            try { resolveBody(JSON.parse(raw)); } catch { reject(new Error('bad_json')); }
        });
        req.on('error', reject);
    });
}

function streamEvents(req, res, run, afterSeq) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    // Replay buffered events past the cursor (reconnect support).
    for (const ev of run.events) {
        if (ev.seq > afterSeq) res.write(`id: ${ev.seq}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
    }
    // Terminal already? close after the replay.
    if (run.status === 'completed' || run.status === 'failed' || run.status === 'canceled') {
        return res.end();
    }
    run.subscribers.add(res);
    const keepalive = setInterval(() => res.write(': keepalive\n\n'), 15000);
    req.on('close', () => {
        clearInterval(keepalive);
        run.subscribers.delete(res);
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    if (req.method === 'GET' && path === '/_health') return send(res, 200, { ok: true, entry: SPEC });
    if (req.method === 'GET' && path === '/_manifest') {
        return send(res, 200, { contract: 'v2', shim: 'generic-node', framework: FRAMEWORK || 'generic', streaming: true, runs: true });
    }

    // Sync sugar: run to completion.
    if (req.method === 'POST' && path === '/invoke') {
        let body;
        try { body = await readJson(req); } catch { return send(res, 400, { error: { code: 'bad_json', message: 'Invalid JSON body' } }); }
        try {
            return send(res, 200, { output: await callAgent(body.input) });
        } catch (err) {
            return send(res, 500, { error: { code: 'invoke_failed', message: String(err?.message ?? err) } });
        }
    }

    // Start an async run.
    if (req.method === 'POST' && path === '/runs') {
        let body;
        try { body = await readJson(req); } catch { return send(res, 400, { error: { code: 'bad_json', message: 'Invalid JSON body' } }); }
        const run = createRun(body.input);
        // Fire-and-forget; the client subscribes to /events for progress.
        driveRun(run, streamAgent(body.input, run.controller.signal)).catch((err) => {
            console.error('[cencori-shim] run crashed:', err);
        });
        return send(res, 202, runView(run));
    }

    // /runs/:id[/events|/cancel|/resume]
    const m = path.match(/^\/runs\/([^/]+)(\/events|\/cancel|\/resume)?$/);
    if (m) {
        const run = runs.get(m[1]);
        if (!run) return send(res, 404, { error: { code: 'run_not_found', message: m[1] } });
        const sub = m[2];

        if (!sub && req.method === 'GET') return send(res, 200, runView(run));

        if (sub === '/events' && req.method === 'GET') {
            const after = Number(url.searchParams.get('after') || '0') || 0;
            return streamEvents(req, res, run, after);
        }

        if (sub === '/cancel' && req.method === 'POST') {
            if (run.status === 'running' || run.status === 'suspended') {
                run.controller.abort();
                finish(run, 'canceled');
            }
            return send(res, 200, runView(run));
        }

        if (sub === '/resume' && req.method === 'POST') {
            if (run.status !== 'suspended') return send(res, 409, { error: { code: 'not_suspended', message: `run is ${run.status}` } });
            let body;
            try { body = await readJson(req); } catch { return send(res, 400, { error: { code: 'bad_json', message: 'Invalid JSON body' } }); }
            run.status = 'running';
            run.suspend = undefined;
            run.controller = new AbortController();
            driveRun(run, resumeAgent(run, body, run.controller.signal)).catch((err) => {
                console.error('[cencori-shim] resume crashed:', err);
            });
            return send(res, 202, runView(run));
        }

        return send(res, 405, { error: { code: 'method_not_allowed', message: `${req.method} ${path}` } });
    }

    send(res, 404, { error: { code: 'not_found', message: `${req.method} ${path}` } });
});

server.listen(PORT, '0.0.0.0', () => console.error(`[cencori-shim] node shim (contract v2) on :${PORT} — entry=${SPEC} framework=${FRAMEWORK || 'generic'}`));
