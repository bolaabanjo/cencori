'use client';

import { useState, use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { SecurityDashboard } from '@/components/security/SecurityDashboard';
import { SecuritySettings } from '@/components/security/SecuritySettings';
import { SecurityAuditLog } from '@/components/security/SecurityAuditLog';
import { SecurityWebhooks } from '@/components/security/SecurityWebhooks';
import { SecurityIncidentsTable } from '@/components/audit/SecurityIncidentsTable';
import { CustomDataRulesManager } from '@/components/security/CustomDataRulesManager';
import { AIDetectTest } from '@/components/security/AIDetectTest';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, ShieldAlert, LayoutDashboard, AlertTriangle, Settings, FileText, Webhook, Database, Sparkles } from 'lucide-react';
import { useEnvironment } from '@/lib/contexts/EnvironmentContext';
import { Skeleton } from '@/components/ui/skeleton';

interface PageProps {
    params: Promise<{
        orgSlug: string;
        projectSlug: string;
    }>;
}

// Hook to get projectId from slugs (with caching)
function useProjectId(orgSlug: string, projectSlug: string) {
    return useQuery({
        queryKey: ["projectId", orgSlug, projectSlug],
        queryFn: async () => {
            const { data: orgData } = await supabase
                .from('organizations')
                .select('id')
                .eq('slug', orgSlug)
                .single();

            if (!orgData) throw new Error("Organization not found");

            const { data: projectData } = await supabase
                .from('projects')
                .select('id')
                .eq('slug', projectSlug)
                .eq('organization_id', orgData.id)
                .single();

            if (!projectData) throw new Error("Project not found");
            return projectData.id;
        },
        staleTime: 5 * 60 * 1000, // IDs rarely change
    });
}

export default function SecurityPage({ params }: PageProps) {
    const { orgSlug, projectSlug } = use(params);
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

    if (isLoading) {
        return (
            <div className="w-full max-w-5xl mx-auto px-6 py-8">
                <div className="mb-6">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-3 w-64 mt-1" />
                </div>
                <Skeleton className="h-10 w-full mb-4" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
                </div>
                <Skeleton className="h-[300px]" />
            </div>
        );
    }

    if (!projectId) {
        return (
            <div className="w-full max-w-5xl mx-auto px-6 py-8">
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

    return (
        <div className="w-full max-w-5xl mx-auto px-6 py-8">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-base font-medium">Security</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Monitor threats, configure security settings, and manage alerts
                </p>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList>
                    <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                    <TabsTrigger value="incidents">Incidents</TabsTrigger>
                    <TabsTrigger value="data-rules">Data Rules</TabsTrigger>
                    <TabsTrigger value="ai-detect">AI Detect</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                    <TabsTrigger value="audit">Audit Log</TabsTrigger>
                </TabsList>

                {/* Dashboard Tab */}
                <TabsContent value="dashboard" className="mt-0">
                    <SecurityDashboard projectId={projectId} />
                </TabsContent>

                {/* Incidents Tab */}
                <TabsContent value="incidents" className="mt-0">
                    {/* Filters Row */}
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                        {/* Severity */}
                        <Select
                            value={filters.severity}
                            onValueChange={(value) => setFilters(prev => ({ ...prev, severity: value }))}
                        >
                            <SelectTrigger className="w-auto h-8 text-xs gap-2 px-3">
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

                        {/* Type */}
                        <Select
                            value={filters.type}
                            onValueChange={(value) => setFilters(prev => ({ ...prev, type: value }))}
                        >
                            <SelectTrigger className="w-auto h-8 text-xs gap-2 px-3">
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

                        {/* Review Status */}
                        <Select
                            value={filters.reviewed}
                            onValueChange={(value) => setFilters(prev => ({ ...prev, reviewed: value }))}
                        >
                            <SelectTrigger className="w-auto h-8 text-xs gap-2 px-3">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-xs">All statuses</SelectItem>
                                <SelectItem value="false" className="text-xs">Pending</SelectItem>
                                <SelectItem value="true" className="text-xs">Reviewed</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Time Range */}
                        <Select
                            value={filters.time_range}
                            onValueChange={(value) => setFilters(prev => ({ ...prev, time_range: value }))}
                        >
                            <SelectTrigger className="w-auto h-8 text-xs gap-2 px-3">
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

                        {/* Clear Filters */}
                        {hasActiveFilters && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={handleClearFilters}
                            >
                                <X className="h-3 w-3 mr-1" />
                                Clear
                            </Button>
                        )}
                    </div>

                    {/* Security incidents table */}
                    <SecurityIncidentsTable projectId={projectId} filters={filters} environment={environment} />
                </TabsContent>

                {/* Data Rules Tab */}
                <TabsContent value="data-rules" className="mt-0">
                    <CustomDataRulesManager projectId={projectId} />
                </TabsContent>

                {/* Settings Tab */}
                <TabsContent value="settings" className="mt-0">
                    <SecuritySettings projectId={projectId} />
                </TabsContent>

                {/* Audit Log Tab */}
                <TabsContent value="audit" className="mt-0">
                    <SecurityAuditLog projectId={projectId} />
                </TabsContent>

                {/* AI Detect Tab */}
                <TabsContent value="ai-detect" className="mt-0">
                    <div className="max-w-2xl">
                        <div className="mb-4">
                            <h2 className="text-sm font-medium">AI-Powered Content Detection</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Test content against AI detection to identify sensitive data, security risks, and policy violations.
                            </p>
                        </div>
                        <AIDetectTest projectId={projectId} />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
