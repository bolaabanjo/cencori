// Platform Analytics Types

export type TimePeriod = '1h' | '24h' | '7d' | '30d' | '90d' | '1y' | 'all';

export interface TimeSeriesDataPoint {
    date: string;
    value: number;
}

export interface AIGatewayMetrics {
    totalRequests: number;
    successfulRequests: number;
    errorRequests: number;
    filteredRequests: number;
    totalTokens: number;
    totalCost: number;
    avgLatency: number;
    requestsByProvider: Record<string, number>;
    requestsByModel: Record<string, number>;
    streamingRequests: number;
    nonStreamingRequests: number;
    timeSeries: TimeSeriesDataPoint[];
}

export interface SecurityMetrics {
    totalIncidents: number;
    incidentsByType: Record<string, number>;
    incidentsBySeverity: {
        low: number;
        medium: number;
        high: number;
        critical: number;
    };
    timeSeries: TimeSeriesDataPoint[];
}

export interface OrganizationsMetrics {
    total: number;
    active: number;
    byTier: Record<string, number>;
    totalMembers: number;
    newThisPeriod: number;
}

export interface ProjectsMetrics {
    total: number;
    active: number;
    byStatus: { active: number; inactive: number };
    byVisibility: { public: number; private: number };
    newThisPeriod: number;
}

export interface ApiKeysMetrics {
    total: number;
    active: number;
    byEnvironment: { production: number; development: number };
    newThisPeriod: number;
}

export interface UsersMetrics {
    total: number;
    active: number;
    newToday: number;
    newThisWeek: number;
    newThisMonth: number;
    newThisPeriod: number;
}

export interface BillingMetrics {
    activeSubscriptions: number;
    mrr: number;
    byTier: Record<string, number>;
    churnedThisPeriod: number;
}

export interface ScanMetrics {
    totalScans: number;
    authenticatedScans: number;
    anonymousScans: number;
    conversionRate: number;
    totalFilesScanned: number;
    totalIssuesFound: number;
    avgIssuesPerScan: number;
    scoreBreakdown: {
        A: number;
        B: number;
        C: number;
        D: number;
        F: number;
    };
    issueBreakdown: {
        secrets: number;
        pii: number;
        routes: number;
        config: number;
        vulnerabilities: number;
    };
    platformBreakdown: {
        darwin: number;
        linux: number;
        win32: number;
        other: number;
    };
}

export interface PlatformEventEntry {
    id: string;
    event_type: string;
    product: string;
    user_id: string | null;
    organization_id: string | null;
    project_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
}

export interface PlatformEventsMetrics {
    totalEvents: number;
    eventsByProduct: Record<string, number>;
    eventsByType: Record<string, number>;
    recentEvents: PlatformEventEntry[];
    eventsToday: number;
}

/**
 * Workload-capture instrument — the operational version of "% of global AI on
 * Cencori". Each field is a workload a Cencori product captures.
 */
export interface CaptureMetrics {
    gatewayRequests: number;      // model traffic captured
    governanceDecisions: number;  // enterprise AI usage captured (governed events)
    memories: number;             // state captured
    agentSessions: number;        // agent workloads captured
}

export interface PlatformOverviewMetrics {
    aiGateway: AIGatewayMetrics;
    capture: CaptureMetrics;
    security: SecurityMetrics;
    organizations: OrganizationsMetrics;
    projects: ProjectsMetrics;
    apiKeys: ApiKeysMetrics;
    users: UsersMetrics;
    billing: BillingMetrics;
    scan: ScanMetrics;
    platformEvents: PlatformEventsMetrics;
    period: TimePeriod;
    generatedAt: string;
}

