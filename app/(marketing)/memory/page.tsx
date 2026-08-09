import { Metadata } from 'next';
import Link from 'next/link';
import { codeToHtml } from 'shiki';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Cencori Memory | The memory layer of the AI cloud',
    description:
        'The memory layer for any AI app. recall() and remember() give any model — OpenAI, Anthropic, local — persistent memory across sessions. Already on Cencori? One flag. PII-redacted, region-pinned, audit-logged, forget-able.',
};

const SIGNUP_URL = '/signup';
const DOCS_URL = '/docs';
const WAITLIST_URL = 'mailto:memory@cencori.com?subject=Cencori%20Memory%20%E2%80%94%20early%20access';

/* ------------------------------------------------------------------ */
/* Bordered frame primitives                                          */
/* ------------------------------------------------------------------ */

function CornerMarkers({ withVertical = false }: { withVertical?: boolean }) {
    return (
        <>
            <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
            {withVertical && (
                <>
                    <div className="hidden md:flex absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                    <div className="hidden md:flex absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                </>
            )}
        </>
    );
}

/* ------------------------------------------------------------------ */
/* Code blocks                                                        */
/* ------------------------------------------------------------------ */

async function highlight(code: string, lang: string): Promise<string> {
    try {
        return await codeToHtml(code, {
            lang,
            themes: { light: 'min-light', dark: 'vesper' },
            defaultColor: false,
        });
    } catch {
        return await codeToHtml(code, {
            lang: 'text',
            themes: { light: 'min-light', dark: 'vesper' },
            defaultColor: false,
        });
    }
}

async function CodeBlock({ label, lang, code }: { label: string; lang: string; code: string }) {
    const html = await highlight(code, lang);
    return (
        <div className="overflow-hidden rounded-md border border-border/50 bg-muted/20">
            <div className="flex items-center justify-between border-b border-border/40 px-3 py-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    {label}
                </span>
            </div>
            <div
                className="overflow-x-auto px-4 py-4 text-[12.5px] leading-6 [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-0"
                dangerouslySetInnerHTML={{ __html: html }}
            />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Snippets                                                           */
/* ------------------------------------------------------------------ */

const STANDALONE_SNIPPET = `// Works with any model — memory around your own model call.
const context = await cencori.memory.recall(userId, message);

const reply = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
        { role: 'system', content: context },
        { role: 'user', content: message },
    ],
});

// Extract the durable facts from the exchange and store them.
await cencori.memory.remember(userId, {
    user: message,
    assistant: reply.choices[0].message.content,
});`;

const BEFORE_SNIPPET = `// Without memory: every new chat starts from zero.
await cencori.chat.completions.create({
    model: 'gpt-4o',
    messages,
});`;

const AFTER_SNIPPET = `// On the gateway: recall + remember collapse into one flag.
await cencori.chat.completions.create({
    model: 'gpt-4o',
    messages,
    memory: { userId: session.user.id },
});`;

const FORGET_SNIPPET = `// Hard-delete a memory by id. Real deletion, audit-logged.
await cencori.memory.forget(memoryId);

// Surface stale, low-value memories to prune (candidates only).
const { suggestions } = await cencori.memory.forgetSuggestions({ userId });`;

const REACT_SNIPPET = `import { Chat, useMemory } from 'cencori/react';

// One flag, memory-aware chat.
<Chat model="gpt-4o" memory={{ userId }} />

// Build a "what do you remember about me" panel from the hook:
// list · search · forget(id) · exportAll (GDPR export).
const { memories, forget, exportAll } = useMemory({ userId });`;

const TRANSCRIPT = `session #47 — earlier this week
─────────────────────────────────────────────
user   Help me redo the pricing tiers on my app.
model  [200 messages of back-and-forth. You land
        on tiered Stripe billing, 14-day trial,
        metered overages at $0.01/unit.]


session #48 — new chat, moments ago
─────────────────────────────────────────────
user   Let's keep going.
model  Picking up from where we left off with the
        tiered Stripe billing — the metered overage
        rate you set was $0.01/unit. Want to add
        annual discounting next?`;

/* ------------------------------------------------------------------ */
/* Data                                                               */
/* ------------------------------------------------------------------ */

const PIPELINE = [
    {
        step: '01',
        title: 'Retrieve',
        body: 'The latest user message is embedded. pgvector query, scoped to (org, userId), returns top-K memories above the relevance threshold. ~40ms.',
    },
    {
        step: '02',
        title: 'Inject',
        body: 'Retrieved memories are formatted as a system block ahead of the user turn. The model reads them as prior context, not as a separate lookup.',
    },
    {
        step: '03',
        title: 'Complete',
        body: 'Provider dispatch — OpenAI, Anthropic, Google, whoever. BYOK if set. Response streams back. Latency-neutral vs. no-memory case.',
    },
    {
        step: '04',
        title: 'Extract & write',
        body: 'Async fact extraction on the completed exchange. PII redaction before writeback. Embedded and stored region-pinned. Audit entry emitted.',
    },
];

const CAPABILITIES = [
    { title: 'Scoped memory', body: 'session · user · workspace · org. Each scope has its own storage and lifecycle.' },
    { title: 'Region-pinned', body: 'Memories written in EU stay in EU. Enforced at write, not query. No accidental leakage.' },
    { title: 'PII redaction pre-write', body: 'Regulated identifiers detected and redacted before anything hits storage.' },
    { title: 'Immutable audit log', body: 'Every read and write recorded. Cryptographic timestamps. Exportable to your SIEM.' },
    { title: 'Hard-forget', body: 'Real deletion, not a soft flag. Every forget is recorded in the audit log.' },
    { title: 'Multi-provider', body: 'Memory lives above the provider layer. Swap OpenAI for Claude for Gemini — memory unchanged.' },
    { title: 'MCP bridge', body: 'Cursor, Claude Desktop, and any MCP client can read from your memory. Distribution moment.' },
    { title: 'React components', body: '<Chat memory> for stateful chat; the useMemory hook for search, forget, and GDPR-export panels.' },
];

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default async function MemoryPage() {
    return (
      <main className="pt-28 sm:pt-36">
                {/* --- HERO ------------------------------------------------ */}
                <section className="bg-background border-b border-border/30 pb-0">
                    <div className="mx-auto max-w-6xl border-t border-x border-border/30 relative px-6 py-20 sm:px-12 sm:py-28">
                        <CornerMarkers />

                        <div className="mb-6 flex items-center gap-1.5 font-mono text-[10px] sm:text-[11px] tracking-wider text-muted-foreground select-none">
                            <span>Cencori Memory ·</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                Live
                            </span>
                            <span>· Works with any model</span>
                        </div>

                        <h1 className="font-heading text-[1.875rem] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-[2.125rem] lg:text-[2.375rem]">
                            <span className="block sm:whitespace-nowrap">Never lose</span>
                            <span className="block sm:whitespace-nowrap">context.</span>
                            <span className="block sm:whitespace-nowrap">Never again.</span>
                        </h1>

                        <p className="mt-8 max-w-xl text-sm leading-relaxed text-muted-foreground">
                            Cencori Memory gives any AI app persistent memory. Two calls &mdash;{' '}
                            <span className="font-mono text-foreground/90">recall()</span> and{' '}
                            <span className="font-mono text-foreground/90">remember()</span> &mdash; give
                            any model context across new chats, new devices, new providers, with your
                            inference running wherever it already runs. Already on Cencori? It collapses
                            to one flag. No vector store to build. No context to re-paste.
                        </p>

                        <div className="mt-12 flex flex-wrap gap-3">
                            <Link href={SIGNUP_URL}>
                                <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90">
                                    Start building
                                </Button>
                            </Link>
                            <Link href={DOCS_URL}>
                                <Button
                                    variant="outline"
                                    className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground"
                                >
                                    Read the docs
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>

                {/* --- STANDALONE: ANY LLM -------------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers withVertical />

                        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30">
                            <div className="px-6 py-16 md:py-24 md:pr-12 flex flex-col justify-center">
                                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                    Works with any model
                                </p>
                                <h2 className="font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl lg:text-5xl text-foreground">
                                    Memory for any LLM. <br />Not just ours.
                                </h2>
                                <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
                                    <span className="font-mono text-foreground/90">recall()</span> pulls
                                    what you know about the user;{' '}
                                    <span className="font-mono text-foreground/90">remember()</span>{' '}
                                    extracts and stores the new facts. Wrap them around your own OpenAI,
                                    Anthropic, or local model call &mdash; your inference runs wherever
                                    it already does. Moving off Mem0 or Zep takes an afternoon.
                                </p>
                            </div>
                            <div className="px-6 py-10 md:py-16 md:px-8 flex flex-col justify-center gap-3">
                                <CodeBlock label="Any provider" lang="typescript" code={STANDALONE_SNIPPET} />
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- GATEWAY UPGRADE: ONE FLAG -------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers withVertical />

                        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30">
                            <div className="px-6 py-16 md:py-24 md:pr-12 flex flex-col justify-center">
                                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                    Already on Cencori
                                </p>
                                <h2 className="font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl lg:text-5xl text-foreground">
                                    Or skip the wiring. <br />One flag.
                                </h2>
                                <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
                                    If your inference already routes through Cencori,{' '}
                                    <span className="font-mono text-foreground/90">recall</span> and{' '}
                                    <span className="font-mono text-foreground/90">remember</span> fuse
                                    into a single field on the request. The gateway handles retrieval,
                                    injection, PII redaction, extraction, embedding, storage, and
                                    forget in-line. Something no other memory API can do &mdash;
                                    because none of them are the gateway.
                                </p>
                            </div>
                            <div className="px-6 py-10 md:py-16 md:px-8 flex flex-col justify-center gap-3">
                                <CodeBlock label="Before" lang="typescript" code={BEFORE_SNIPPET} />
                                <CodeBlock label="After" lang="typescript" code={AFTER_SNIPPET} />
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- PIPELINE ------------------------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers />

                        <div className="px-6 pt-16 pb-12 sm:px-12 max-w-2xl">
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                The pipeline
                            </p>
                            <h2 className="mt-4 font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl text-foreground">
                                Four steps. <br />One engine, either path.
                            </h2>
                            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                                Whether you call <span className="font-mono text-foreground/90">recall</span>/<span className="font-mono text-foreground/90">remember</span>{' '}
                                yourself or hand the gateway one flag, the same pipeline runs
                                underneath. p95 retrieval overhead: under 150ms.
                            </p>
                        </div>

                        <div className="border-t border-border/30 grid grid-cols-1 md:grid-cols-4 divide-x divide-y divide-border/30">
                            {PIPELINE.map(({ step, title, body }) => (
                                <div key={title} className="p-6 sm:p-8 flex flex-col">
                                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
                                        {step}
                                    </span>
                                    <h3 className="font-heading text-base font-semibold text-foreground mb-2">
                                        {title}
                                    </h3>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        {body}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* --- CASE STUDY: THE NEW-CHAT MOMENT --------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers withVertical />

                        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30">
                            <div className="px-6 py-16 md:py-24 md:pr-12 flex flex-col justify-center">
                                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                    The new-chat moment
                                </p>
                                <h2 className="font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl lg:text-5xl text-foreground">
                                    Session ends. <br />Context doesn&rsquo;t.
                                </h2>
                                <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
                                    Every AI product ships context-loss as an accepted default. Hit
                                    the context limit, start a new chat, re-paste your project
                                    context like a caveman. Cencori Memory fixes it out of the box.
                                </p>
                                <ul className="mt-6 space-y-2 max-w-md">
                                    <li className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                                        <Check className="mt-0.5 h-3.5 w-3.5 text-foreground shrink-0" />
                                        <span>New chat &mdash; session-scope resets, user-scope carries forward.</span>
                                    </li>
                                    <li className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                                        <Check className="mt-0.5 h-3.5 w-3.5 text-foreground shrink-0" />
                                        <span>New device &mdash; same userId, same memory.</span>
                                    </li>
                                    <li className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                                        <Check className="mt-0.5 h-3.5 w-3.5 text-foreground shrink-0" />
                                        <span>New provider &mdash; memory lives above the model layer.</span>
                                    </li>
                                    <li className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                                        <Check className="mt-0.5 h-3.5 w-3.5 text-foreground shrink-0" />
                                        <span>MCP bridge &mdash; Cursor and Claude Desktop join in.</span>
                                    </li>
                                </ul>
                            </div>
                            <div className="px-6 py-10 md:py-16 md:px-8 flex flex-col justify-center gap-4">
                                <CodeBlock label="Transcript" lang="text" code={TRANSCRIPT} />
                                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground text-center">
                                    Same user. Two sessions. Zero re-paste.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- WHAT'S IN THE BOX ---------------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers />

                        <div className="px-6 pt-16 pb-12 sm:px-12 max-w-2xl">
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                What&rsquo;s in the box
                            </p>
                            <h2 className="mt-4 font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl text-foreground">
                                Everything you&rsquo;d otherwise <br />build yourself. Handled.
                            </h2>
                        </div>

                        <div className="border-t border-border/30 grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-border/30">
                            {CAPABILITIES.map(({ title, body }) => (
                                <div key={title} className="p-6 flex flex-col">
                                    <h3 className="font-heading text-sm font-semibold text-foreground mb-1.5">
                                        {title}
                                    </h3>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        {body}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* --- REACT / FORGET SPLIT -------------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers withVertical />

                        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30">
                            <div className="px-6 py-16 md:py-24 md:pr-12 flex flex-col justify-center">
                                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                    We ship the UI too
                                </p>
                                <h2 className="font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl text-foreground">
                                    A memory-aware <br />UI, out of the box.
                                </h2>
                                <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
                                    <span className="font-mono text-foreground/90">&lt;Chat memory /&gt;</span>{' '}
                                    turns any surface stateful. The{' '}
                                    <span className="font-mono text-foreground/90">useMemory</span>{' '}
                                    hook &mdash; list, search, forget, export &mdash; is everything you
                                    need to build a right-to-be-forgotten panel, no backend.
                                </p>
                            </div>
                            <div className="px-6 py-10 md:py-16 md:px-8 flex flex-col justify-center gap-3">
                                <CodeBlock label="React" lang="tsx" code={REACT_SNIPPET} />
                                <CodeBlock label="Forget" lang="typescript" code={FORGET_SNIPPET} />
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- PRICING PREVIEW ------------------------------------ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers />

                        <div className="px-6 pt-16 pb-12 sm:px-12 max-w-2xl">
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                Pricing &mdash; the fill gauge
                            </p>
                            <h2 className="mt-4 font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl text-foreground">
                                One bar. Zero to 100%. <br />You know what to do.
                            </h2>
                            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                                Same shape as Vercel bandwidth or Supabase storage. Free tier fills
                                fast &mdash; that&rsquo;s the upgrade signal. Reads keep working at
                                100%; only new writes block, with a clean{' '}
                                <span className="font-mono text-foreground/90">429 memory_quota_exceeded</span>{' '}
                                and an upgrade URL in the error payload.
                            </p>
                        </div>

                        <div className="relative border-t border-border/30">
                            <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="hidden md:flex absolute -top-1.5 left-1/3 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="hidden md:flex absolute -top-1.5 left-2/3 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="hidden md:flex absolute -bottom-1.5 left-1/3 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                            <div className="hidden md:flex absolute -bottom-1.5 left-2/3 -translate-x-1/2 h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

                            <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/30">
                                {/* Free */}
                                <div className="flex flex-col justify-between items-start p-8 sm:p-12 space-y-6">
                                    <div className="space-y-4 w-full">
                                        <div className="inline-flex items-center rounded-full border border-border/60 bg-background/50 px-2.5 py-0.5 text-[10px] font-medium text-foreground">
                                            Free · Developer
                                        </div>
                                        <h3 className="font-heading text-xl font-semibold text-foreground">
                                            Start free
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            The starter tank. Enough to prototype a real product
                                            and hit the demo bar.
                                        </p>
                                        <ul className="space-y-2 pt-2">
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>1,000 memories per project</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>session + user scope</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>30 / 90-day retention</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <Link href={SIGNUP_URL} className="pt-2">
                                        <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90 transition-colors">
                                            Get started
                                        </Button>
                                    </Link>
                                </div>

                                {/* Pro */}
                                <div className="flex flex-col justify-between items-start p-8 sm:p-12 space-y-6">
                                    <div className="space-y-4 w-full">
                                        <div className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/5 px-2.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                            Pro
                                        </div>
                                        <h3 className="font-heading text-xl font-semibold text-foreground">
                                            Ship a product
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            The product tank. Cursor-shaped apps, chatbots, agents,
                                            code-gen tools. Where real usage lives.
                                        </p>
                                        <ul className="space-y-2 pt-2">
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>100,000 memories per project</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>All scopes · 1-year retention</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>MCP bridge · US/EU regions</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <Link href={SIGNUP_URL} className="pt-2">
                                        <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90 transition-colors">
                                            Start building
                                        </Button>
                                    </Link>
                                </div>

                                {/* Enterprise */}
                                <div className="flex flex-col justify-between items-start p-8 sm:p-12 space-y-6">
                                    <div className="space-y-4 w-full">
                                        <div className="inline-flex items-center rounded-full border border-border/60 bg-background/50 px-2.5 py-0.5 text-[10px] font-medium text-foreground">
                                            Enterprise
                                        </div>
                                        <h3 className="font-heading text-xl font-semibold text-foreground">
                                            Own the region
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Unlimited. Region-locked. Private tenants. SLA and
                                            audit-log integration on contract.
                                        </p>
                                        <ul className="space-y-2 pt-2">
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>Unlimited memories</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>Up to 7-year retention</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>Private tenant · custom regions</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <Link href="/enterprise" className="pt-2">
                                        <Button
                                            variant="outline"
                                            className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground transition-colors"
                                        >
                                            Talk to us
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- BOTTOM CTA ------------------------------------------ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers />

                        <div className="px-6 pt-16 pb-12 sm:px-12 text-center max-w-2xl mx-auto">
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                Get started
                            </p>
                            <h2 className="mt-4 font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl text-foreground">
                                Give your users a product that remembers.
                            </h2>
                            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                                Two calls and any model, or one flag on the gateway. Start free &mdash;
                                the usage bar tells you when it&rsquo;s time to upgrade.
                            </p>
                            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                                <Link href={SIGNUP_URL}>
                                    <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90 transition-colors">
                                        Start building
                                    </Button>
                                </Link>
                                <Link href={WAITLIST_URL}>
                                    <Button
                                        variant="outline"
                                        className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground transition-colors"
                                    >
                                        Talk to the team
                                    </Button>
                                </Link>
                            </div>
                            <p className="mt-6 font-mono text-[10px] tracking-wider text-muted-foreground">
                                Free to start · No credit card · memory@cencori.com for enterprise
                            </p>
                        </div>
                    </div>
                </section>
            </main>
    );
}
