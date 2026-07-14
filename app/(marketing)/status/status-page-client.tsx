"use client";

import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { StatusReport, ServiceStatus } from '@/lib/status';

const STATUS_LABELS: Record<ServiceStatus, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  maintenance: 'Maintenance',
};

const STATUS_COLORS: Record<ServiceStatus, string> = {
  operational: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  down: 'bg-red-500',
  maintenance: 'bg-blue-500',
};

const STATUS_TEXT_COLORS: Record<ServiceStatus, string> = {
  operational: 'text-emerald-600 dark:text-emerald-400',
  degraded: 'text-amber-600 dark:text-amber-400',
  down: 'text-red-600 dark:text-red-400',
  maintenance: 'text-blue-600 dark:text-blue-400',
};

const PROVIDER_DISPLAY: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  mistral: 'Mistral',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  cohere: 'Cohere',
  groq: 'Groq',
  perplexity: 'Perplexity',
  together: 'Together',
  qwen: 'Qwen',
};

function CornerMarkers() {
  return (
    <>
      <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
      <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
      <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
      <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
    </>
  );
}

function StatusDot({ status, animate = false }: { status: ServiceStatus; animate?: boolean }) {
  return (
    <span
      className={cn(
        'inline-block h-1.5 w-1.5 rounded-full shrink-0',
        STATUS_COLORS[status],
        animate && status === 'operational' && 'animate-pulse',
      )}
      aria-hidden="true"
    />
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return formatTime(ts);
}

function OverallBanner({ report }: { report: StatusReport }) {
  const isGood = report.overall === 'operational';
  return (
    <section className="bg-background border-b border-border/30">
      <div className="mx-auto max-w-6xl border-x border-border/30 relative">
        <CornerMarkers />
        <div className="px-6 py-16 sm:px-12 sm:py-20 text-center">
          <div className="mb-4 flex items-center justify-center gap-2 font-mono text-[10px] sm:text-[11px] tracking-wider text-muted-foreground select-none">
            <span>Current status</span>
            <span className="text-muted-foreground/40">·</span>
            <span className={cn('font-semibold', STATUS_TEXT_COLORS[report.overall])}>
              <StatusDot status={report.overall} animate />
              <span className="ml-1.5">{STATUS_LABELS[report.overall]}</span>
            </span>
          </div>
          <h1 className={cn('font-heading text-2xl font-semibold leading-[1.1] tracking-[-0.02em] sm:text-3xl lg:text-4xl', isGood ? 'text-foreground' : STATUS_TEXT_COLORS[report.overall])}>
            {isGood ? 'All systems operational' : 'Experiencing disruptions'}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {isGood
              ? 'Every service is running normally.'
              : 'Some services are experiencing issues. Check below for details.'}
          </p>
        </div>
      </div>
    </section>
  );
}

function ServiceCard({ name, description, status }: { name: string; description: string; status: ServiceStatus }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border/30 px-6 py-4 sm:px-8 sm:py-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span className="font-heading text-sm font-medium text-foreground">{name}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <span className={cn('shrink-0 font-mono text-[11px] font-medium tracking-wide', STATUS_TEXT_COLORS[status])}>
        {STATUS_LABELS[status]}
      </span>
    </div>
  );
}

function ProviderRow({ provider, state }: { provider: string; state: 'closed' | 'open' | 'half-open' }) {
  const label = PROVIDER_DISPLAY[provider] ?? provider;
  const status: ServiceStatus = state === 'closed' ? 'operational' : state === 'half-open' ? 'degraded' : 'down';
  return (
    <div className="flex items-center justify-between border-t border-border/30 px-6 py-3 sm:px-8">
      <div className="flex items-center gap-2">
        <StatusDot status={status} />
        <span className="font-mono text-xs text-foreground capitalize">{label}</span>
      </div>
      <span className={cn('font-mono text-[10px] font-medium tracking-wide', STATUS_TEXT_COLORS[status])}>
        {state === 'closed' ? 'connected' : state === 'half-open' ? 'testing' : 'disconnected'}
      </span>
    </div>
  );
}

export default function StatusPageClient() {
  const [report, setReport] = useState<StatusReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now());

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: StatusReport = await res.json();
      setReport(data);
      setLastRefreshed(Date.now());
      setError(null);
    } catch (e) {
      setError('Failed to load status data');
      console.error('[StatusPage] fetch error:', e);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return (
    <main className="pt-28 sm:pt-36">
      {error && !report && (
        <section className="bg-background border-b border-border/30">
          <div className="mx-auto max-w-6xl border-x border-border/30 relative">
            <CornerMarkers />
            <div className="px-6 py-20 sm:px-12 text-center">
              <p className="font-mono text-xs text-muted-foreground">{error}</p>
              <button onClick={fetchStatus} className="mt-4 text-xs font-medium text-foreground underline underline-offset-4 hover:text-foreground/80 transition-colors">
                Try again
              </button>
            </div>
          </div>
        </section>
      )}

      {report && <OverallBanner report={report} />}

      {report && (
        <section className="bg-background border-b border-border/30">
          <div className="mx-auto max-w-6xl border-x border-border/30 relative">
            <CornerMarkers />
            <div className="divide-y-0">
              {report.services.map((service) => (
                <ServiceCard key={service.id} {...service} />
              ))}
            </div>
          </div>
        </section>
      )}

      {report && report.providers.length > 0 && (
        <section className="bg-background border-b border-border/30">
          <div className="mx-auto max-w-6xl border-x border-border/30 relative">
            <CornerMarkers />
            <div className="px-6 pt-8 pb-2 sm:px-8">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                AI Provider Connections
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Circuit state for each AI model provider. Closed = accepting traffic, open = circuit breaker engaged.
              </p>
            </div>
            <div className="pb-4">
              {report.providers.map((p) => (
                <ProviderRow key={p.provider} provider={p.provider} state={p.state} />
              ))}
            </div>
          </div>
        </section>
      )}

      {report && (
        <section className="bg-background border-b border-border/30">
          <div className="mx-auto max-w-6xl border-x border-border/30 relative">
            <CornerMarkers />
            <div className="px-6 py-6 sm:px-8 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 font-mono text-[10px] sm:text-[11px] tracking-wider text-muted-foreground">
                <span>
                  Updated:{' '}
                  <span className="text-foreground/80" suppressHydrationWarning>
                    {timeAgo(lastRefreshed)}
                  </span>
                </span>
                <span className="text-muted-foreground/40">·</span>
                <span>Auto-refreshes every 60s</span>
              </div>
              <button onClick={fetchStatus} className="font-mono text-[10px] sm:text-[11px] tracking-wider text-foreground/60 hover:text-foreground transition-colors underline underline-offset-4">
                Refresh now
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
