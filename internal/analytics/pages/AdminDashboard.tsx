'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Activity, Shield, Building2, FolderOpen, Key, Users, DollarSign, Zap, Settings, ScanSearch, Radio, Database, Bot } from 'lucide-react';
import { usePlatformMetrics } from '../hooks/useMetrics';
import { MetricsCard, MetricsGrid, MetricsSection } from '../components/MetricsCard';
import { TimeRangeSelector } from '../components/TimeRangeSelector';
import type { TimePeriod } from '../lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

const PERIOD_LABELS: Record<TimePeriod, string> = {
    '1h': '1h',
    '24h': '24h',
    '7d': '7d',
    '30d': '30d',
    '90d': '90d',
    '1y': '1y',
    'all': 'all time',
};

export function AdminDashboard() {
    const [period, setPeriod] = useState<TimePeriod>('7d');
    const { data, isLoading, error } = usePlatformMetrics(period);

    if (error) {
        return (
            <div className="w-full max-w-6xl mx-auto px-6 py-8">
                <div className="text-center py-12">
                    <p className="text-sm text-red-500">Failed to load metrics</p>
                    <p className="text-xs text-muted-foreground mt-1">{(error as Error).message}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
            {/* Header */}
            <div className="space-y-3">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-lg sm:text-xl font-semibold">Platform Analytics</h1>
                        <p className="text-xs text-muted-foreground">Real-time metrics across all Cencori services</p>
                    </div>
                    <Link href="/internal/settings">
                        <Button variant="outline" size="sm" className="h-8 text-xs rounded-full">
                            <Settings className="h-3.5 w-3.5 mr-1.5" />
                            Team
                        </Button>
                    </Link>
                </div>
                <TimeRangeSelector value={period} onChange={setPeriod} />
            </div>

            {isLoading ? (
                <LoadingSkeleton />
            ) : data ? (
                <>
                    {/* Throughput — the counter (Panel 1) */}
                    <MetricsSection
                        title="Throughput"
                        description={`What % of global AI runs on Cencori — the numerator we grow (${PERIOD_LABELS[period]})`}
                    >
                        <ThroughputHero
                            tokens={data.aiGateway.totalTokens}
                            requests={data.aiGateway.totalRequests}
                            cost={data.aiGateway.totalCost}
                            governedShare={
                                data.capture.gatewayRequests > 0
                                    ? Math.min(100, (data.capture.governanceDecisions / data.capture.gatewayRequests) * 100)
                                    : 0
                            }
                            period={period}
                        />
                    </MetricsSection>

                    {/* Capture by product (Panel 2) */}
                    <MetricsSection
                        title="Capture by product"
                        description="Each product captures a type of AI workload"
                    >
                        <MetricsGrid columns={4}>
                            <MetricsCard
                                title="Gateway"
                                value={data.capture.gatewayRequests}
                                subtitle={`${data.aiGateway.totalTokens.toLocaleString()} tokens · model traffic`}
                                subtitleColor="success"
                                icon={<Activity className="h-4 w-4" />}
                            />
                            <MetricsCard
                                title="Governance"
                                value={data.capture.governanceDecisions}
                                subtitle="governed events · enterprise usage"
                                icon={<Shield className="h-4 w-4" />}
                            />
                            <MetricsCard
                                title="Memory"
                                value={data.capture.memories}
                                subtitle="memories · state captured"
                                icon={<Database className="h-4 w-4" />}
                            />
                            <MetricsCard
                                title="Agents"
                                value={data.capture.agentSessions}
                                subtitle="sessions · agent workloads"
                                icon={<Bot className="h-4 w-4" />}
                            />
                        </MetricsGrid>
                    </MetricsSection>

                    {/* AI Gateway Section */}
                    <MetricsSection
                        title="AI Gateway"
                        description="Request processing and cost metrics"
                    >
                        <MetricsGrid columns={4}>
                            <MetricsCard
                                title="Total Requests"
                                value={data.aiGateway.totalRequests}
                                subtitle={`${data.aiGateway.successfulRequests} successful`}
                                subtitleColor="success"
                                icon={<Activity className="h-4 w-4" />}
                            />
                            <MetricsCard
                                title="Total Cost"
                                value={`$${data.aiGateway.totalCost.toFixed(2)}`}
                                subtitle={`${data.aiGateway.totalTokens.toLocaleString()} tokens`}
                                icon={<DollarSign className="h-4 w-4" />}
                            />
                            <MetricsCard
                                title="Avg Latency"
                                value={`${data.aiGateway.avgLatency}ms`}
                                subtitle={`${data.aiGateway.streamingRequests} streaming`}
                                icon={<Zap className="h-4 w-4" />}
                            />
                            <MetricsCard
                                title="Error Rate"
                                value={`${data.aiGateway.totalRequests > 0
                                    ? ((data.aiGateway.errorRequests / data.aiGateway.totalRequests) * 100).toFixed(1)
                                    : 0}%`}
                                subtitle={`${data.aiGateway.errorRequests} errors, ${data.aiGateway.filteredRequests} filtered`}
                                subtitleColor={data.aiGateway.errorRequests > 0 ? 'error' : 'success'}
                            />
                        </MetricsGrid>

                        {/* Provider & Model Breakdown */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <BreakdownCard
                                title="By Provider"
                                data={data.aiGateway.requestsByProvider}
                                total={data.aiGateway.totalRequests}
                            />
                            <BreakdownCard
                                title="By Model"
                                data={data.aiGateway.requestsByModel}
                                total={data.aiGateway.totalRequests}
                            />
                        </div>
                    </MetricsSection>

                    {/* Security Section */}
                    <MetricsSection
                        title="Security"
                        description="Threats detected and blocked"
                    >
                        <MetricsGrid columns={4}>
                            <MetricsCard
                                title="Total Incidents"
                                value={data.security.totalIncidents}
                                icon={<Shield className="h-4 w-4" />}
                            />
                            <MetricsCard
                                title="Critical"
                                value={data.security.incidentsBySeverity.critical}
                                subtitleColor={data.security.incidentsBySeverity.critical > 0 ? 'error' : 'default'}
                            />
                            <MetricsCard
                                title="High"
                                value={data.security.incidentsBySeverity.high}
                                subtitleColor={data.security.incidentsBySeverity.high > 0 ? 'warning' : 'default'}
                            />
                            <MetricsCard
                                title="Medium / Low"
                                value={`${data.security.incidentsBySeverity.medium} / ${data.security.incidentsBySeverity.low}`}
                            />
                        </MetricsGrid>
                    </MetricsSection>

                    {/* Organizations & Projects */}
                    <MetricsSection
                        title="Organizations & Projects"
                        description="Platform adoption metrics"
                    >
                        <MetricsGrid columns={4}>
                            <MetricsCard
                                title="Organizations"
                                value={data.organizations.total}
                                subtitle={`${data.organizations.active} active`}
                                subtitleColor="success"
                                icon={<Building2 className="h-4 w-4" />}
                            />
                            <MetricsCard
                                title="Projects"
                                value={data.projects.total}
                                subtitle={`${data.projects.active} active`}
                                subtitleColor="success"
                                icon={<FolderOpen className="h-4 w-4" />}
                            />
                            <MetricsCard
                                title="API Keys"
                                value={data.apiKeys.total}
                                subtitle={`${data.apiKeys.active} active`}
                                subtitleColor="success"
                                icon={<Key className="h-4 w-4" />}
                            />
                            <MetricsCard
                                title="Team Members"
                                value={data.organizations.totalMembers}
                                icon={<Users className="h-4 w-4" />}
                            />
                        </MetricsGrid>
                    </MetricsSection>

                    {/* Users */}
                    <MetricsSection
                        title="Users"
                        description="Signup and activity metrics"
                    >
                        <MetricsGrid columns={4}>
                            <MetricsCard
                                title="Total Users"
                                value={data.users.total}
                                subtitle={`${data.users.active} active (${PERIOD_LABELS[period]})`}
                                subtitleColor="success"
                                icon={<Users className="h-4 w-4" />}
                            />
                            <MetricsCard
                                title="New This Period"
                                value={data.users.newThisPeriod}
                                subtitle={PERIOD_LABELS[period]}
                                subtitleColor={data.users.newThisPeriod > 0 ? 'success' : 'default'}
                            />
                            <MetricsCard
                                title="New This Week"
                                value={data.users.newThisWeek}
                            />
                            <MetricsCard
                                title="New This Month"
                                value={data.users.newThisMonth}
                            />
                        </MetricsGrid>
                    </MetricsSection>

                    {/* Billing / Revenue */}
                    <MetricsSection
                        title="Billing & Revenue"
                        description="Subscription and revenue metrics"
                    >
                        <MetricsGrid columns={4}>
                            <MetricsCard
                                title="MRR"
                                value={`$${data.billing.mrr.toLocaleString()}`}
                                subtitle={`${data.billing.activeSubscriptions} paid subscriptions`}
                                subtitleColor="success"
                                icon={<DollarSign className="h-4 w-4" />}
                            />
                            <MetricsCard
                                title="Active Subscriptions"
                                value={data.billing.activeSubscriptions}
                                subtitleColor="success"
                            />
                            <MetricsCard
                                title="Churned"
                                value={data.billing.churnedThisPeriod}
                                subtitle="this period"
                                subtitleColor={data.billing.churnedThisPeriod > 0 ? 'warning' : 'default'}
                            />
                            <MetricsCard
                                title="Avg Revenue / User"
                                value={data.billing.activeSubscriptions > 0
                                    ? `$${(data.billing.mrr / data.billing.activeSubscriptions).toFixed(0)}`
                                    : '$0'
                                }
                            />
                        </MetricsGrid>
                    </MetricsSection>

                    {/* Platform Events Section */}
                    <MetricsSection
                        title="Platform Events"
                        description="Cross-platform user activity tracking"
                    >
                        <MetricsGrid columns={4}>
                            <MetricsCard
                                title="Total Events"
                                value={data.platformEvents.totalEvents}
                                subtitle={`${data.platformEvents.eventsToday} today`}
                                subtitleColor={data.platformEvents.eventsToday > 0 ? 'success' : 'default'}
                                icon={<Radio className="h-4 w-4" />}
                            />
                            <MetricsCard
                                title="Top Product"
                                value={Object.entries(data.platformEvents.eventsByProduct).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'}
                                subtitle={`${Object.entries(data.platformEvents.eventsByProduct).sort((a, b) => b[1] - a[1])[0]?.[1] || 0} events`}
                            />
                            <MetricsCard
                                title="Top Event Type"
                                value={Object.entries(data.platformEvents.eventsByType).sort((a, b) => b[1] - a[1])[0]?.[0]?.split('.')[1] || 'N/A'}
                                subtitle={`${Object.entries(data.platformEvents.eventsByType).sort((a, b) => b[1] - a[1])[0]?.[1] || 0} occurrences`}
                            />
                            <MetricsCard
                                title="Event Types"
                                value={Object.keys(data.platformEvents.eventsByType).length}
                                subtitle="unique types tracked"
                            />
                        </MetricsGrid>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <BreakdownCard
                                title="By Product"
                                data={data.platformEvents.eventsByProduct}
                                total={data.platformEvents.totalEvents}
                            />
                            <BreakdownCard
                                title="By Event Type"
                                data={data.platformEvents.eventsByType}
                                total={data.platformEvents.totalEvents}
                            />
                        </div>
                    </MetricsSection>

                    {/* Cencori Scan Section */}
                    <MetricsSection
                        title="Cencori Scan"
                        description="CLI usage and adoption metrics"
                    >
                        <MetricsGrid columns={4}>
                            <MetricsCard
                                title="Total Scans"
                                value={data.scan.totalScans}
                                subtitle={`${data.scan.authenticatedScans} with API key`}
                                subtitleColor="success"
                                icon={<ScanSearch className="h-4 w-4" />}
                            />
                            <MetricsCard
                                title="Conversion Rate"
                                value={`${data.scan.conversionRate}%`}
                                subtitle={`${data.scan.anonymousScans} anonymous`}
                                subtitleColor={data.scan.conversionRate > 10 ? 'success' : 'warning'}
                            />
                            <MetricsCard
                                title="Files Scanned"
                                value={data.scan.totalFilesScanned.toLocaleString()}
                                subtitle={`${data.scan.avgIssuesPerScan} avg issues/scan`}
                            />
                            <MetricsCard
                                title="Issues Found"
                                value={data.scan.totalIssuesFound.toLocaleString()}
                            />
                        </MetricsGrid>

                        {/* Score & Platform Breakdown */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <BreakdownCard
                                title="By Score"
                                data={{
                                    'A-Tier': data.scan.scoreBreakdown.A,
                                    'B-Tier': data.scan.scoreBreakdown.B,
                                    'C-Tier': data.scan.scoreBreakdown.C,
                                    'D-Tier': data.scan.scoreBreakdown.D,
                                    'F-Tier': data.scan.scoreBreakdown.F,
                                }}
                                total={data.scan.totalScans}
                            />
                            <BreakdownCard
                                title="By Platform"
                                data={{
                                    'macOS': data.scan.platformBreakdown.darwin,
                                    'Linux': data.scan.platformBreakdown.linux,
                                    'Windows': data.scan.platformBreakdown.win32,
                                    'Other': data.scan.platformBreakdown.other,
                                }}
                                total={data.scan.totalScans}
                            />
                        </div>
                    </MetricsSection>
                </>
            ) : null}

            {/* Footer */}
            <div className="text-center text-[10px] text-muted-foreground pt-4 border-t border-border/40">
                {data && `Last updated: ${new Date(data.generatedAt).toLocaleString()}`}
            </div>
        </div>
    );
}

// Throughput hero — the headline "AI running on Cencori" counter (Panel 1)
function ThroughputHero({
    tokens, requests, cost, governedShare, period,
}: { tokens: number; requests: number; cost: number; governedShare: number; period: TimePeriod }) {
    const subStat = (label: string, value: string) => (
        <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="mt-1 font-mono text-lg tabular-nums">{value}</p>
        </div>
    );
    return (
        <div className="rounded-xl border border-border/50 bg-card p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        AI Throughput · {PERIOD_LABELS[period]}
                    </p>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="font-mono text-4xl sm:text-5xl font-semibold tabular-nums">
                            {tokens.toLocaleString()}
                        </span>
                        <span className="text-sm text-muted-foreground">tokens processed</span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                        The numerator behind &ldquo;% of global AI on Cencori.&rdquo;
                    </p>
                </div>
                <div className="flex gap-6 sm:gap-8">
                    {subStat('Requests', requests.toLocaleString())}
                    {subStat('Cost', `$${cost.toFixed(2)}`)}
                    {subStat('Governed', `${governedShare.toFixed(0)}%`)}
                </div>
            </div>
        </div>
    );
}

// Breakdown card for provider/model distribution
function BreakdownCard({ title, data, total }: { title: string; data: Record<string, number>; total: number }) {
    const sortedEntries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return (
        <div className="rounded-xl border border-border/50 bg-card p-4">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
                {title}
            </p>
            <div className="space-y-2">
                {sortedEntries.length > 0 ? sortedEntries.map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                        <div className="flex-1">
                            <div className="flex justify-between text-xs mb-0.5">
                                <span className="font-mono truncate">{key}</span>
                                <span className="text-muted-foreground">{value}</span>
                            </div>
                            <div className="h-1 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500 rounded-full"
                                    style={{ width: `${total > 0 ? (value / total) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                    </div>
                )) : (
                    <p className="text-xs text-muted-foreground">No data</p>
                )}
            </div>
        </div>
    );
}

// Loading skeleton
function LoadingSkeleton() {
    return (
        <div className="space-y-8">
            <div className="space-y-4">
                <Skeleton className="h-4 w-32" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
            </div>
            <div className="space-y-4">
                <Skeleton className="h-4 w-24" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
            </div>
        </div>
    );
}
