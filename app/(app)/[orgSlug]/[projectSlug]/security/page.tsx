'use client';

import { useState, use } from 'react';
import { usePathname } from 'next/navigation';
import { SecurityDashboard } from '@/components/security/SecurityDashboard';
import { SecuritySettings } from '@/components/security/SecuritySettings';
import { SecurityAuditLog } from '@/components/security/SecurityAuditLog';
import { SecurityIncidentsTable } from '@/components/audit/SecurityIncidentsTable';
import { CustomDataRulesManager } from '@/components/security/CustomDataRulesManager';
import { AIDetectTest } from '@/components/security/AIDetectTest';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, ShieldAlert } from 'lucide-react';
import { useEnvironment } from '@/lib/contexts/EnvironmentContext';
import { useOrganization, useProjectIdBySlug } from '@/lib/hooks/useQueries';
import { hasFeature, type SubscriptionTier } from '@/lib/entitlements';
import { FeatureUpgradeWall } from '@/components/billing/FeatureUpgradeWall';
import { Skeleton } from '@/components/ui/skeleton';

interface PageProps {
    params: Promise<{
        orgSlug: string;
        projectSlug: string;
    }>;
}

// Hook to get projectId from slugs (with caching)
function useProjectId(orgSlug: string, projectSlug: string) {
    return useProjectIdBySlug(orgSlug, projectSlug);
}

export default function SecurityPage({ params }: PageProps) {
    const { orgSlug, projectSlug } = use(params);
    const pathname = usePathname();
    const { environment } = useEnvironment();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [filters, setFilters] = useState({
        severity: 'all',
        type: 'all',
        reviewed: 'all',
        time_range: '7d',
    });

    // Get projectId with caching - INSTANT ON REVISIT!
    const { data: projectId, isLoading } = useProjectId(orgSlug, projectSlug);
    const { data: organization, isLoading: isOrganizationLoading } = useOrganization(orgSlug);
    const subscriptionTier = (organization?.subscription_tier || 'free') as SubscriptionTier;
    const hasSecurityEntitlement = hasFeature(subscriptionTier, 'security');
    const isLocalPaidPreview = process.env.NODE_ENV === 'development' && !hasSecurityEntitlement;
    const securityEnabled = hasSecurityEntitlement || isLocalPaidPreview;

    const handleClearFilters = () => {
        setFilters({
            severity: 'all',
            type: 'all',
            reviewed: 'all',
            time_range: '7d',
        });
    };

    const hasActiveFilters =
        filters.severity !== 'all' ||
        filters.type !== 'all' ||
        filters.reviewed !== 'all' ||
        filters.time_range !== '7d';

    if (isLoading || isOrganizationLoading) {
        return (
            <main className="mx-auto w-full max-w-[1180px] px-4 py-8 pb-24 sm:px-6 sm:py-10 lg:px-8">
                <div className="mb-8">
                    <div>
                        <Skeleton className="h-8 w-32" />
                        <Skeleton className="mt-3 h-3 w-80 max-w-full" />
                    </div>
                </div>
                <Skeleton className="mb-7 h-10 w-full" />
                <Skeleton className="h-[560px] w-full rounded-xl" />
            </main>
        );
    }

    if (!projectId) {
        return (
            <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
                <div className="text-center py-16 flex flex-col items-center">
                    <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mb-3">
                        <ShieldAlert className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">Project not found</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Unable to load security settings</p>
                </div>
            </div>
        );
    }

    if (organization && !securityEnabled) {
        return (
            <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
                <div className="mb-6">
                    <h1 className="text-base font-medium">Security</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Monitor threats, configure security settings, and manage alerts
                    </p>
                </div>
                <FeatureUpgradeWall
                    orgSlug={orgSlug}
                    orgId={organization.id}
                    orgName={organization.name}
                    currentTier={organization.subscription_tier}
                    feature="Security"
                    message="Upgrade to Pro to monitor threats, configure security controls, and review incidents."
                    returnPath={pathname}
                />
            </div>
        );
    }

    return (
        <main className="mx-auto w-full max-w-[1180px] px-4 py-8 pb-24 sm:px-6 sm:py-10 lg:px-8">
            <header className="mb-8">
                <div>
                    <h1 className="text-[2rem] font-medium leading-none tracking-[-0.055em] text-balance">Security</h1>
                    <p className="mt-3 max-w-[58ch] text-xs leading-5 text-muted-foreground text-pretty">
                        Monitor threat signals, investigate incidents, and control how this project handles unsafe AI traffic.
                    </p>
                </div>
            </header>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-7">
                <TabsList className="w-full justify-start gap-6 overflow-x-auto border-border/30">
                    <TabsTrigger value="dashboard" disabled={!projectId} className="shrink-0 px-0 py-3 text-xs">Overview</TabsTrigger>
                    <TabsTrigger value="incidents" disabled={!projectId} className="shrink-0 px-0 py-3 text-xs">Incidents</TabsTrigger>
                    <TabsTrigger value="data-rules" disabled={!projectId} className="shrink-0 px-0 py-3 text-xs">Rules</TabsTrigger>
                    <TabsTrigger value="ai-detect" disabled={!projectId} className="shrink-0 px-0 py-3 text-xs">Detection lab</TabsTrigger>
                    <TabsTrigger value="settings" disabled={!projectId} className="shrink-0 px-0 py-3 text-xs">Controls</TabsTrigger>
                    <TabsTrigger value="audit" disabled={!projectId} className="shrink-0 px-0 py-3 text-xs">Audit log</TabsTrigger>
                </TabsList>

                {/* Dashboard Tab */}
                <TabsContent value="dashboard" className="mt-0">
                    <SecurityDashboard projectId={projectId} />
                </TabsContent>

                {/* Incidents Tab */}
                <TabsContent value="incidents" className="mt-0">
                    <div className="mb-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h2 className="text-sm font-medium tracking-[-0.01em]">Incident queue</h2>
                            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                                Review detections, enforcement decisions, and unresolved security signals.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Select
                                value={filters.severity}
                                onValueChange={(value) => setFilters(prev => ({ ...prev, severity: value }))}
                            >
                                <SelectTrigger className="h-8 w-auto min-w-[124px] gap-2 border-border/30 bg-transparent px-3 text-xs shadow-none">
                                    <SelectValue placeholder="Severity" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-xs">All severities</SelectItem>
                                    <SelectItem value="critical" className="text-xs">Critical</SelectItem>
                                    <SelectItem value="high" className="text-xs">High</SelectItem>
                                    <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                                    <SelectItem value="low" className="text-xs">Low</SelectItem>
                                </SelectContent>
                            </Select>

                        <Select
                            value={filters.type}
                            onValueChange={(value) => setFilters(prev => ({ ...prev, type: value }))}
                        >
                            <SelectTrigger className="h-8 w-auto min-w-[110px] gap-2 border-border/30 bg-transparent px-3 text-xs shadow-none">
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-xs">All types</SelectItem>
                                <SelectItem value="jailbreak_attempt" className="text-xs">Jailbreak</SelectItem>
                                <SelectItem value="pii_detection" className="text-xs">PII Detection</SelectItem>
                                <SelectItem value="prompt_injection" className="text-xs">Prompt Injection</SelectItem>
                                <SelectItem value="harmful_content" className="text-xs">Harmful Content</SelectItem>
                                <SelectItem value="data_exfiltration" className="text-xs">Data Exfiltration</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select
                            value={filters.reviewed}
                            onValueChange={(value) => setFilters(prev => ({ ...prev, reviewed: value }))}
                        >
                            <SelectTrigger className="h-8 w-auto min-w-[118px] gap-2 border-border/30 bg-transparent px-3 text-xs shadow-none">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-xs">All statuses</SelectItem>
                                <SelectItem value="false" className="text-xs">Pending</SelectItem>
                                <SelectItem value="true" className="text-xs">Reviewed</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select
                            value={filters.time_range}
                            onValueChange={(value) => setFilters(prev => ({ ...prev, time_range: value }))}
                        >
                            <SelectTrigger className="h-8 w-auto min-w-[106px] gap-2 border-border/30 bg-transparent px-3 text-xs shadow-none">
                                <SelectValue placeholder="Time" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1h" className="text-xs">1 Hour</SelectItem>
                                <SelectItem value="24h" className="text-xs">24 Hours</SelectItem>
                                <SelectItem value="7d" className="text-xs">7 Days</SelectItem>
                                <SelectItem value="30d" className="text-xs">30 Days</SelectItem>
                                <SelectItem value="all" className="text-xs">All Time</SelectItem>
                            </SelectContent>
                        </Select>

                        {hasActiveFilters && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs text-muted-foreground"
                                onClick={handleClearFilters}
                            >
                                <X className="h-3 w-3 mr-1" />
                                Clear
                            </Button>
                        )}
                        </div>
                    </div>

                    {/* Security incidents table */}
                    {projectId && (
                        <SecurityIncidentsTable projectId={projectId} filters={filters} environment={environment} />
                    )}
                </TabsContent>

                {/* Data Rules Tab */}
                <TabsContent value="data-rules" className="mt-0">
                    {projectId && <CustomDataRulesManager projectId={projectId} />}
                </TabsContent>

                {/* Settings Tab */}
                <TabsContent value="settings" className="mt-0">
                    {projectId && <SecuritySettings projectId={projectId} />}
                </TabsContent>

                {/* Audit Log Tab */}
                <TabsContent value="audit" className="mt-0">
                    {projectId && <SecurityAuditLog projectId={projectId} />}
                </TabsContent>

                {/* AI Detect Tab */}
                <TabsContent value="ai-detect" className="mt-0">
                    <div className="mb-3">
                        <h2 className="text-sm font-medium tracking-[-0.01em]">Detection lab</h2>
                        <p className="mt-1 max-w-[62ch] text-[11px] leading-4 text-muted-foreground">
                            Test representative content against the project&apos;s AI classifier before it reaches production.
                        </p>
                    </div>
                    {projectId && <AIDetectTest projectId={projectId} />}
                </TabsContent>
            </Tabs>
        </main>
    );
}
