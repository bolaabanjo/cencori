'use client';

interface CostByProviderChartProps {
    data: Record<string, number>;
    requests?: Record<string, number>;
}

const PROVIDERS: Record<string, { label: string; color: string }> = {
    openai: { label: 'OpenAI', color: 'hsl(158 64% 45%)' },
    anthropic: { label: 'Anthropic', color: 'hsl(24 72% 54%)' },
    google: { label: 'Google', color: 'hsl(217 79% 58%)' },
    gemini: { label: 'Gemini', color: 'hsl(217 79% 58%)' },
    cohere: { label: 'Cohere', color: 'hsl(270 55% 62%)' },
    mistral: { label: 'Mistral', color: 'hsl(8 78% 58%)' },
    groq: { label: 'Groq', color: 'hsl(36 76% 52%)' },
    deepgram: { label: 'Deepgram', color: 'hsl(188 72% 45%)' },
    deepseek: { label: 'DeepSeek', color: 'hsl(199 68% 52%)' },
    together: { label: 'Together AI', color: 'hsl(248 62% 63%)' },
    perplexity: { label: 'Perplexity', color: 'hsl(174 57% 42%)' },
    xai: { label: 'xAI', color: 'hsl(220 8% 62%)' },
    cartesia: { label: 'Cartesia', color: 'hsl(326 58% 57%)' },
    assemblyai: { label: 'AssemblyAI', color: 'hsl(264 58% 61%)' },
    spitch: { label: 'Spitch', color: 'hsl(45 72% 49%)' },
};

function getProviderMeta(key: string) {
    return PROVIDERS[key] ?? {
        label: key.replace(/[-_]/g, ' ').replace(/\b\w/g, character => character.toUpperCase()),
        color: 'hsl(220 8% 56%)',
    };
}

function formatCost(value: number): string {
    if (value === 0) return '$0';
    if (value < 0.001) return `$${value.toFixed(6)}`;
    if (value < 0.01) return `$${value.toFixed(4)}`;
    if (value < 1) return `$${value.toFixed(3)}`;
    return `$${value.toFixed(2)}`;
}

export function CostByProviderChart({ data, requests = {} }: CostByProviderChartProps) {
    const items = Object.entries(data)
        .map(([name, value]) => {
            const key = name.toLowerCase();
            const requestCount = requests[name] ?? requests[key] ?? 0;

            return {
                key,
                value,
                requestCount,
                ...getProviderMeta(key),
            };
        })
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value);

    const total = items.reduce((sum, item) => sum + item.value, 0);
    const totalRequests = items.reduce((sum, item) => sum + item.requestCount, 0);

    return (
        <section className="flex h-full min-h-[286px] flex-col bg-card" aria-labelledby="provider-cost-heading">
            <header className="flex items-start justify-between gap-4 px-4 pb-4 pt-4">
                <div>
                    <h3 id="provider-cost-heading" className="text-xs font-medium">Cost by provider</h3>
                    <p className="mt-1 text-[10px] text-muted-foreground">Spend concentration across routed traffic</p>
                </div>
                <div className="text-right">
                    <p className="font-mono text-xl font-medium tracking-[-0.04em] tabular-nums">{formatCost(total)}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {items.length} provider{items.length === 1 ? '' : 's'}
                    </p>
                </div>
            </header>

            {items.length === 0 ? (
                <div className="flex flex-1 items-center justify-center px-4 py-8">
                    <p className="text-[11px] text-muted-foreground/55">No spend in this period</p>
                </div>
            ) : (
                <>
                    <div
                        className="mx-4 flex h-1.5 overflow-hidden rounded-[2px] bg-secondary"
                        aria-label="Provider share of total spend"
                    >
                        {items.map(item => (
                            <span
                                key={item.key}
                                className="min-w-px transition-[filter] duration-200 hover:brightness-125"
                                style={{ flexBasis: 0, flexGrow: item.value, backgroundColor: item.color }}
                                title={`${item.label}: ${((item.value / total) * 100).toFixed(1)}% of spend`}
                            />
                        ))}
                    </div>

                    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_4.25rem_5.5rem] border-y border-border/40 px-4 py-2 text-[9px] font-medium text-muted-foreground">
                        <span>Provider</span>
                        <span className="text-right">Requests</span>
                        <span className="text-right">Spend</span>
                    </div>

                    <div className="divide-y divide-border/35">
                        {items.map((item, index) => {
                            const share = total > 0 ? (item.value / total) * 100 : 0;
                            const averageCost = item.requestCount > 0 ? item.value / item.requestCount : 0;

                            return (
                                <div
                                    key={item.key}
                                    className="group grid grid-cols-[minmax(0,1fr)_4.25rem_5.5rem] items-center px-4 py-2.5 transition-colors duration-200 hover:bg-muted/30"
                                    title={`${item.label}: ${item.requestCount.toLocaleString()} requests at ${formatCost(averageCost)} per request`}
                                >
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <span className="w-3 shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground/45">
                                            {String(index + 1).padStart(2, '0')}
                                        </span>
                                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                                        <div className="min-w-0">
                                            <p className="truncate text-[11px] font-medium">{item.label}</p>
                                            <p className="font-mono text-[9px] tabular-nums text-muted-foreground">{share.toFixed(1)}% of spend</p>
                                        </div>
                                    </div>
                                    <span className="text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                                        {item.requestCount.toLocaleString()}
                                    </span>
                                    <div className="text-right">
                                        <p className="font-mono text-[11px] font-medium tabular-nums">{formatCost(item.value)}</p>
                                        <p className="font-mono text-[9px] tabular-nums text-muted-foreground">
                                            {formatCost(averageCost)}/req
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {totalRequests > 0 && (
                        <footer className="mt-auto flex items-center justify-between border-t border-border/40 px-4 py-2 text-[9px] text-muted-foreground">
                            <span>Processed requests</span>
                            <span className="font-mono tabular-nums">{totalRequests.toLocaleString()}</span>
                        </footer>
                    )}
                </>
            )}
        </section>
    );
}
