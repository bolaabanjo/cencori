import { getAllCircuitStates } from './providers/circuit-breaker';

export type ServiceStatus = 'operational' | 'degraded' | 'down' | 'maintenance';

export interface ServiceHealth {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
}

export interface ProviderHealth {
  provider: string;
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure: number;
  lastSuccess: number;
}

export interface StatusReport {
  overall: ServiceStatus;
  services: ServiceHealth[];
  providers: ProviderHealth[];
  lastUpdated: number;
}

const CORE_SERVICES: Omit<ServiceHealth, 'status'>[] = [
  {
    id: 'ai-gateway',
    name: 'AI Gateway',
    description: 'Request routing, load balancing, and failover for AI model providers',
  },
  {
    id: 'api',
    name: 'API',
    description: 'Public REST API and OpenAI-compatible endpoints',
  },
  {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Web application and management console',
  },
  {
    id: 'compute',
    name: 'Compute',
    description: 'Serverless edge execution environment',
  },
  {
    id: 'workflow',
    name: 'Workflow',
    description: 'Multi-step AI pipeline orchestration',
  },
  {
    id: 'storage',
    name: 'Storage',
    description: 'Data persistence, vector sync, and caching layer',
  },
  {
    id: 'provider-network',
    name: 'Provider Network',
    description: 'AI model provider connections and circuit states',
  },
  {
    id: 'docs',
    name: 'Documentation',
    description: 'Developer documentation and API reference',
  },
];

export async function getStatus(): Promise<StatusReport> {
  const providerStates = await getAllCircuitStates();

  const providers: ProviderHealth[] = Object.entries(providerStates).map(
    ([provider, state]) => ({
      provider,
      state: state.state,
      failures: state.failures,
      lastFailure: state.lastFailure,
      lastSuccess: state.lastSuccess,
    })
  );

  const openCount = providers.filter((p) => p.state === 'open').length;
  const halfOpenCount = providers.filter((p) => p.state === 'half-open').length;

  let providerNetworkStatus: ServiceStatus = 'operational';
  if (openCount > 2) providerNetworkStatus = 'down';
  else if (openCount > 0 || halfOpenCount > 0)
    providerNetworkStatus = 'degraded';

  const services: ServiceHealth[] = CORE_SERVICES.map((s) => {
    if (s.id === 'provider-network') {
      return { ...s, status: providerNetworkStatus };
    }
    return { ...s, status: 'operational' };
  });

  const hasDown = services.some((s) => s.status === 'down');
  const hasDegraded = services.some((s) => s.status === 'degraded');
  const overall: ServiceStatus = hasDown
    ? 'down'
    : hasDegraded
      ? 'degraded'
      : 'operational';

  return {
    overall,
    services,
    providers,
    lastUpdated: Date.now(),
  };
}
