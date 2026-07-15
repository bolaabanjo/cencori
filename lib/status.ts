import { getAllCircuitStates } from './providers/circuit-breaker';
import { createAdminClient } from './supabaseAdmin';

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

export async function getStatus(): Promise<StatusReport> {
  const supabase = createAdminClient();
  const [providerStates, storageProbe] = await Promise.all([
    getAllCircuitStates(),
    supabase.from('projects').select('id').limit(1),
  ]);

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

  const storageStatus: ServiceStatus = storageProbe.error ? 'down' : 'operational';
  const gatewayStatus: ServiceStatus = storageStatus === 'down'
    ? 'down'
    : providerNetworkStatus;

  // Only report components this endpoint can actually observe. Avoid
  // presenting unrelated products as operational without a health signal.
  const services: ServiceHealth[] = [
    {
      id: 'api',
      name: 'API',
      description: 'Public REST API and OpenAI-compatible endpoints',
      status: 'operational',
    },
    {
      id: 'storage',
      name: 'Storage',
      description: 'Primary Gateway database',
      status: storageStatus,
    },
    {
      id: 'provider-network',
      name: 'Provider Network',
      description: 'Observed provider circuit states',
      status: providerNetworkStatus,
    },
    {
      id: 'ai-gateway',
      name: 'AI Gateway',
      description: 'Request routing, policy enforcement, and failover',
      status: gatewayStatus,
    },
  ];

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
