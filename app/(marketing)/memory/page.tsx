import { Metadata } from 'next';
import Link from 'next/link';
import { codeToHtml } from 'shiki';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Cencori Memory | The memory layer of the AI cloud',
    description:
        'Add memory to any AI app in one line. Cross-session, cross-device, cross-provider. PII-redacted, region-pinned, audit-logged, forget-able. Never lose context again.',
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

const BEFORE_SNIPPET = `// Without memory: every new chat starts from zero.
await cencori.chat.completions.create({
    model: 'gpt-4o',
    messages,
});`;

const AFTER_SNIPPET = `// With memory: the model already knows the user.
await cencori.chat.completions.create({
    model: 'gpt-4o',
    messages,
    memory: { userId: session.user.id },
});`;

const FORGET_SNIPPET = `// GDPR-grade forget. Real deletion. Cryptographic receipt.
await cencori.memory.forget({ userId: session.user.id });`;

const REACT_SNIPPET = `import { Chat, MemoryInspector } from 'cencori/react';

// One flag, memory-aware chat.
<Chat model="gpt-4o" memory={{ userId }} />

// Drop-in "what does the model remember about me" panel.
<MemoryInspector userId={userId} />`;

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
    { title: 'Hard-forget', body: 'Real deletion, not a soft flag. Cryptographic receipt in the audit log.' },
    { title: 'Multi-provider', body: 'Memory lives above the provider layer. Swap OpenAI for Claude for Gemini — memory unchanged.' },
    { title: 'MCP bridge', body: 'Cursor, Claude Desktop, and any MCP client can read from your memory. Distribution moment.' },
    { title: 'React components', body: 'Chat, MemoryProvider, useMemory, MemoryInspector. Ship a memory-aware UI in one afternoon.' },
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
                            <span className="font-semibold text-amber-600 dark:text-amber-400">
                                Early access
                            </span>
                            <span>· Q3 2026</span>
                        </div>

                        <h1 className="font-heading text-[1.875rem] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-[2.125rem] lg:text-[2.375rem]">
                            <span className="block sm:whitespace-nowrap">Never lose</span>
                            <span className="block sm:whitespace-nowrap">context.</span>
                            <span className="block sm:whitespace-nowrap">Never again.</span>
                        </h1>

                        <p className="mt-8 max-w-xl text-sm leading-relaxed text-muted-foreground">
                            Cencori Memory is the memory layer of the AI cloud. Add{' '}
                            <span className="font-mono text-foreground/90">memory: &#123; userId &#125;</span>{' '}
                            to any chat request and the model already knows the user &mdash; across
                            new chats, new devices, new providers. No vector store to build. No
                            context to re-paste. Nothing your users have to think about.
                        </p>

                        <div className="mt-12 flex flex-wrap gap-3">
                            <Link href={WAITLIST_URL}>
                                <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90">
                                    Join early access
                                </Button>
                            </Link>
                            <Link href={DOCS_URL}>
                                <Button
                                    variant="outline"
                                    className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground"
                                >
                                    Read the walkthrough
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>

                {/* --- BEFORE / AFTER SPLIT -------------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers withVertical />

                        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30">
                            <div className="px-6 py-16 md:py-24 md:pr-12 flex flex-col justify-center">
                                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                    Add one flag
                                </p>
                                <h2 className="font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl lg:text-5xl text-foreground">
                                    From stateless <br />to stateful.
                                </h2>
                                <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
                                    Your existing chat completions call, plus one field. The gateway
                                    handles retrieval, injection, PII redaction, fact extraction,
                                    embedding, storage, and forget. You write no vector-store code.
                                    Ever.
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
                                Four steps. <br />All inside the gateway.
                            </h2>
                            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                                Memory is not a service you call. It&rsquo;s what the gateway does
                                to your request. p95 retrieval overhead: under 150ms.
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
                                Everything the gateway <br />already gave you. Now stateful.
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
                                    turns any surface stateful.{' '}
                                    <span className="font-mono text-foreground/90">&lt;MemoryInspector /&gt;</span>{' '}
                                    gives your users the GDPR right-to-be-forgotten page for free.
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
                                    <Link href={WAITLIST_URL} className="pt-2">
                                        <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90 transition-colors">
                                            Join early access
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
                                Early access
                            </p>
                            <h2 className="mt-4 font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl text-foreground">
                                Give your users a product that remembers.
                            </h2>
                            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                                Cencori Memory ships in Q3 2026. Early access opens first to teams
                                already building on Cencori.
                            </p>
                            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                                <Link href={WAITLIST_URL}>
                                    <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90 transition-colors">
                                        Join early access
                                    </Button>
                                </Link>
                                <Link href="/developers">
                                    <Button
                                        variant="outline"
                                        className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground transition-colors"
                                    >
                                        See the developer platform
                                    </Button>
                                </Link>
                            </div>
                            <p className="mt-6 font-mono text-[10px] tracking-wider text-muted-foreground">
                                memory@cencori.com · Responses within one business day
                            </p>
                        </div>
                    </div>
                </section>
            </main>
    );
}
