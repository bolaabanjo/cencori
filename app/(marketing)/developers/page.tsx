import { Metadata } from 'next';
import Link from 'next/link';
import { codeToHtml } from 'shiki';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Cencori for Developers | Build AI products on Cencori',
    description:
        'One SDK to every frontier model. A compute layer to train, host, and deploy your own. Regional cloud you can pin workloads to. For developers, AI engineers, and research teams shipping real products.',
};

const SIGNUP_URL = '/signup';
const DOCS_URL = '/docs';
const COMPUTE_WAITLIST = 'mailto:enterprise@cencori.com?subject=Cencori%20Compute%20%E2%80%94%20early%20access';

/* ------------------------------------------------------------------ */
/* Bordered frame primitive — matches the homepage aesthetic exactly. */
/* ------------------------------------------------------------------ */

function CornerMarkers({ withVertical = false, withHorizontal = false }: { withVertical?: boolean; withHorizontal?: boolean }) {
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
            {withHorizontal && (
                <>
                    <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                    <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
                </>
            )}
        </>
    );
}

/* ------------------------------------------------------------------ */
/* Code cards — Shiki, but visually restrained to match the frame.    */
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

const QUICKSTART_TS = `import { Cencori } from 'cencori';

const cencori = new Cencori({ apiKey: process.env.CENCORI_API_KEY });

const response = await cencori.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Explain hedging in one sentence.' }],
});

console.log(response.choices[0].message.content);`;

const PROVIDER_SWAP = `// Same code. Any provider. Zero rewrites.

await cencori.chat.completions.create({ model: 'gpt-4o', messages });
await cencori.chat.completions.create({ model: 'claude-sonnet-4-6', messages });
await cencori.chat.completions.create({ model: 'gemini-2.5-flash', messages });
await cencori.chat.completions.create({ model: 'mistral-large-latest', messages });
await cencori.chat.completions.create({ model: 'grok-4', messages });`;

const REACT_SNIPPET = `import { Chat, VisionUploader } from 'cencori/react';

export default function App() {
    return (
        <>
            <Chat model="gpt-4o" apiKey={process.env.NEXT_PUBLIC_CENCORI_KEY!} />
            <VisionUploader onExtract={(text) => console.log(text)} />
        </>
    );
}`;

const CAPABILITIES = [
    { title: 'Chat & tool use', body: 'Streaming, structured outputs, JSON mode. Every provider through one shape.', status: 'Live' },
    { title: 'Vision', body: 'Image analysis, OCR, multi-image reasoning in a single call.', status: 'Live' },
    { title: 'Documents', body: 'Extract, summarize, and query PDFs. Native parse first, LLM second.', status: 'Live' },
    { title: 'Embeddings', body: 'Portable vectors across every major embedding model.', status: 'Live' },
    { title: 'Agents', body: 'Multi-step tool use with retries, timeouts, and cost caps built in.', status: 'Live' },
    { title: 'Voice', body: 'TTS, STT, and realtime bidirectional voice. Multi-provider.', status: 'Soon' },
    { title: 'Fine-tuning', body: 'Train and host your own models. Ships with Cencori Compute.', status: 'Q4 2026' },
    { title: 'React components', body: 'Drop-in Chat, VoiceCall, VisionUploader, DocumentReader.', status: 'Live' },
];

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default async function DevelopersPage() {
    return (
      <main className="pt-28 sm:pt-36">
                {/* --- HERO ------------------------------------------------ */}
                <section className="bg-background border-b border-border/30 pb-0">
                    <div className="mx-auto max-w-6xl border-t border-x border-border/30 relative px-6 py-20 sm:px-12 sm:py-28">
                        <CornerMarkers />

                        <div className="mb-6 flex items-center gap-1.5 font-mono text-[10px] sm:text-[11px] tracking-wider text-muted-foreground select-none">
                            <span>Cencori for Developers ·</span>
                            <span className="tabular-nums">150+ models</span>
                            <span>·</span>
                            <span className="tabular-nums">10 providers</span>
                            <span>·</span>
                            <span>1 SDK</span>
                        </div>

                        <h1 className="font-heading text-[1.875rem] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-[2.125rem] lg:text-[2.375rem]">
                            <span className="block sm:whitespace-nowrap">Build AI products</span>
                            <span className="block sm:whitespace-nowrap">on Cencori.</span>
                        </h1>

                        <p className="mt-8 max-w-xl text-sm leading-relaxed text-muted-foreground">
                            For developers, AI engineers, and research teams shipping real products. One
                            SDK to every frontier model. A compute layer to train, host, and deploy your
                            own. Regional cloud you can pin workloads to.
                        </p>

                        <div className="mt-12 flex flex-wrap gap-3">
                            <Link href={SIGNUP_URL}>
                                <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90">
                                    Get started
                                </Button>
                            </Link>
                            <Link href={DOCS_URL}>
                                <Button
                                    variant="outline"
                                    className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground"
                                >
                                    Documentation
                                </Button>
                            </Link>
                        </div>
                    </div>
                </section>

                {/* --- QUICKSTART SPLIT ------------------------------------ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers withVertical />

                        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30">
                            <div className="px-6 py-16 md:py-24 md:pr-12 flex flex-col justify-center">
                                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                    Ship in five lines
                                </p>
                                <h2 className="font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl lg:text-5xl text-foreground">
                                    Run.
                                </h2>
                                <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
                                    OpenAI-compatible request shape. If you have OpenAI code, changing
                                    one import gets you multi-provider routing, caching, logging, and
                                    spend caps &mdash; without touching business logic.
                                </p>
                                <Link href={DOCS_URL} className="mt-8 inline-block">
                                    <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90 transition-colors">
                                        Read the SDK docs
                                    </Button>
                                </Link>
                            </div>

                            <div className="px-6 py-10 md:py-16 md:px-8 flex items-center">
                                <div className="w-full">
                                    <CodeBlock label="TypeScript" lang="typescript" code={QUICKSTART_TS} />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- THREE-LAYER PLATFORM -------------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers />

                        <div className="px-6 pt-16 pb-12 sm:px-12 max-w-2xl">
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                The platform
                            </p>
                            <h2 className="mt-4 font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl text-foreground">
                                One platform. Three layers.
                            </h2>
                            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                                Cencori is not a gateway. It is a cloud &mdash; delivered in three
                                composable layers so you can adopt what you need today and grow into
                                the rest.
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
                                {/* Gateway */}
                                <div className="flex flex-col justify-between items-start p-8 sm:p-12 space-y-6">
                                    <div className="space-y-4 w-full">
                                        <div className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/5 px-2.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                            Live
                                        </div>
                                        <h3 className="font-heading text-xl font-semibold text-foreground">
                                            Cencori Gateway
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            One SDK to every frontier model. Chat, vision, documents,
                                            embeddings, agents &mdash; with governance, caching, and
                                            observability on by default.
                                        </p>
                                        <ul className="space-y-2 pt-2">
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>150+ models across 10 providers</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>OpenAI-compatible API</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>BYOK &amp; multi-provider fallback</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <Link href={DOCS_URL} className="pt-2">
                                        <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90 transition-colors">
                                            Read the docs
                                        </Button>
                                    </Link>
                                </div>

                                {/* Compute */}
                                <div className="flex flex-col justify-between items-start p-8 sm:p-12 space-y-6">
                                    <div className="space-y-4 w-full">
                                        <div className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/5 px-2.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                            Q4 2026 · Early access
                                        </div>
                                        <h3 className="font-heading text-xl font-semibold text-foreground">
                                            Cencori Compute
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            For research teams and AI engineers who need to train,
                                            host, and deploy their own models. Point at a repo,
                                            wire a dataset, benchmark, publish &mdash; your model
                                            becomes an endpoint in your gateway.
                                        </p>
                                        <ul className="space-y-2 pt-2">
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>Repo &rarr; dataset &rarr; training</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>Benchmarks against reference models</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>One-click publish to the gateway</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <Link href={COMPUTE_WAITLIST} className="pt-2">
                                        <Button
                                            variant="outline"
                                            className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground transition-colors"
                                        >
                                            Join early access
                                        </Button>
                                    </Link>
                                </div>

                                {/* Cloud */}
                                <div className="flex flex-col justify-between items-start p-8 sm:p-12 space-y-6">
                                    <div className="space-y-4 w-full">
                                        <div className="inline-flex items-center rounded-full border border-border/60 bg-background/50 px-2.5 py-0.5 text-[10px] font-medium text-foreground">
                                            2027 · Preview
                                        </div>
                                        <h3 className="font-heading text-xl font-semibold text-foreground">
                                            Cencori Cloud
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Region-native inference and workload hosting. Pin a
                                            project to a region and enforce residency at the
                                            platform layer &mdash; Lagos colocation partnerships
                                            already in flight.
                                        </p>
                                        <ul className="space-y-2 pt-2">
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>Region-locked storage &amp; inference</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>Residency by contract</span>
                                            </li>
                                            <li className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                                                <span>CPU + GPU hybrid capacity</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <Link href="/enterprise" className="pt-2">
                                        <Button
                                            variant="outline"
                                            className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground transition-colors"
                                        >
                                            Enterprise
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- PROVIDER SWAP SPLIT --------------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers withVertical />

                        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30">
                            <div className="px-6 py-10 md:py-16 md:px-8 flex items-center order-2 md:order-1">
                                <div className="w-full">
                                    <CodeBlock label="TypeScript" lang="typescript" code={PROVIDER_SWAP} />
                                </div>
                            </div>
                            <div className="px-6 py-16 md:py-24 md:pl-12 flex flex-col justify-center order-1 md:order-2">
                                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                    Multi-provider
                                </p>
                                <h2 className="font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl lg:text-5xl text-foreground">
                                    Any model. One line.
                                </h2>
                                <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
                                    Switch providers by changing a string. Set automatic fallbacks so
                                    a provider outage never becomes your outage. When your own
                                    fine-tune ships from Cencori Compute, it becomes just another
                                    model in the same list.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- REACT SPLIT ----------------------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers withVertical />

                        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/30">
                            <div className="px-6 py-16 md:py-24 md:pr-12 flex flex-col justify-center">
                                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                    cencori/react
                                </p>
                                <h2 className="font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl lg:text-5xl text-foreground">
                                    We ship the UI too.
                                </h2>
                                <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
                                    Drop-in Chat, VisionUploader, DocumentReader, and VoiceCall
                                    components. Streaming, accessible, themable. You can put an AI
                                    surface in front of a user tonight.
                                </p>
                            </div>
                            <div className="px-6 py-10 md:py-16 md:px-8 flex items-center">
                                <div className="w-full">
                                    <CodeBlock label="React" lang="tsx" code={REACT_SNIPPET} />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- CAPABILITIES ---------------------------------------- */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers />

                        <div className="px-6 pt-16 pb-12 sm:px-12 max-w-2xl">
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                Capabilities
                            </p>
                            <h2 className="mt-4 font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl text-foreground">
                                Everything you need to ship AI.
                            </h2>
                            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                                One SDK covers the entire surface. Adding a capability is a method
                                call &mdash; not another vendor account.
                            </p>
                        </div>

                        <div className="border-t border-border/30 grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-border/30">
                            {CAPABILITIES.map(({ title, body, status }) => (
                                <div key={title} className="p-6 flex flex-col">
                                    <div className="mb-3">
                                        <span
                                            className={
                                                status === 'Live'
                                                    ? 'inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/5 px-2 py-0.5 text-[9px] font-medium text-emerald-600 dark:text-emerald-400'
                                                    : status === 'Soon'
                                                    ? 'inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/5 px-2 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400'
                                                    : 'inline-flex items-center rounded-full border border-border/60 bg-background/50 px-2 py-0.5 text-[9px] font-medium text-muted-foreground'
                                            }
                                        >
                                            {status}
                                        </span>
                                    </div>
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

                {/* --- BOTTOM CTA ------------------------------------------ */}
                <section className="bg-background border-b border-border/30">
                    <div className="mx-auto max-w-6xl border-x border-border/30 relative">
                        <CornerMarkers />

                        <div className="px-6 pt-16 pb-12 sm:px-12 text-center max-w-2xl mx-auto">
                            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                Get started
                            </p>
                            <h2 className="mt-4 font-serif text-3xl font-normal leading-tight tracking-tight sm:text-4xl text-foreground">
                                Ship AI today. Train your own tomorrow.
                            </h2>
                            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                                Grab an API key, paste it into your existing code, and you&rsquo;ll
                                have a first response in about ninety seconds. When you&rsquo;re
                                ready to train your own model, Compute is a queue away.
                            </p>
                            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                                <Link href={SIGNUP_URL}>
                                    <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90 transition-colors">
                                        Get started free
                                    </Button>
                                </Link>
                                <Link href={COMPUTE_WAITLIST}>
                                    <Button
                                        variant="outline"
                                        className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground transition-colors"
                                    >
                                        Join Compute early access
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
    );
}
