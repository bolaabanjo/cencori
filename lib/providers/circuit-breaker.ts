/**
 * Circuit Breaker Pattern for Provider Failover
 * 
 * Tracks provider health and prevents cascading failures
 * by opening circuit when failure threshold is reached.
 * 
 * Supports both Redis (Upstash) for persistence across instances
 * and in-memory fallback when Redis is not configured.
 */

interface CircuitState {
    failures: number;
    lastFailure: number;
    state: 'closed' | 'open' | 'half-open';
    lastSuccess: number;
}

// Default configuration
const DEFAULT_FAILURE_THRESHOLD = 5;       // Failures before circuit opens
const DEFAULT_TIMEOUT_MS = 60 * 1000;      // 60 seconds circuit open time
const CIRCUIT_PREFIX = 'circuit:'; // Redis key prefix

export interface CircuitBreakerConfig {
    failureThreshold: number;
    timeoutMs: number;
    enabled: boolean;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: DEFAULT_FAILURE_THRESHOLD,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    enabled: true,
};

// In-memory fallback (used when Redis is not configured)
const memoryCircuits: Map<string, CircuitState> = new Map();

// Redis client (lazy loaded)
let redisClient: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, options?: { ex?: number }) => Promise<void>;
} | null = null;
let redisInitialized = false;

/**
 * Initialize Redis client if Upstash is configured
 */
async function initRedis(): Promise<boolean> {
    if (redisInitialized) return redisClient !== null;
    redisInitialized = true;

    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!redisUrl || !redisToken) {
        console.log('[CircuitBreaker] Redis not configured, using in-memory state');
        return false;
    }

    try {
        // Dynamic import using a variable to avoid TypeScript module resolution
        const moduleName = '@upstash/redis';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upstash: any = await import(/* webpackIgnore: true */ moduleName).catch(() => null);
        if (!upstash || !upstash.Redis) {
            console.warn('[CircuitBreaker] @upstash/redis not installed, using in-memory state');
            return false;
        }
        redisClient = new upstash.Redis({
            url: redisUrl,
            token: redisToken,
        });
        console.log('[CircuitBreaker] Redis initialized');
        return true;
    } catch (error) {
        console.warn('[CircuitBreaker] Failed to initialize Redis, using in-memory:', error);
        return false;
    }
}

/**
 * Get circuit state from Redis or memory
 */
async function getCircuitState(provider: string): Promise<CircuitState> {
    await initRedis();

    const defaultState: CircuitState = {
        failures: 0,
        lastFailure: 0,
        state: 'closed',
        lastSuccess: Date.now(),
    };

    if (redisClient) {
        try {
            const data = await redisClient.get(`${CIRCUIT_PREFIX}${provider}`);
            if (data) {
                return JSON.parse(data) as CircuitState;
            }
        } catch (error) {
            console.warn('[CircuitBreaker] Redis read error:', error);
        }
    }

    // Fall back to memory
    return memoryCircuits.get(provider) || defaultState;
}

/**
 * Save circuit state to Redis and memory
 */
async function saveCircuitState(provider: string, state: CircuitState): Promise<void> {
    // Always update memory for immediate reads
    memoryCircuits.set(provider, state);

    if (redisClient) {
        try {
            await redisClient.set(
                `${CIRCUIT_PREFIX}${provider}`,
                JSON.stringify(state),
                { ex: 3600 } // 1 hour TTL
            );
        } catch (error) {
            console.warn('[CircuitBreaker] Redis write error:', error);
        }
    }
}

/**
 * Check if the circuit is open (provider should not be used)
 */
export async function isCircuitOpen(provider: string, config?: Partial<CircuitBreakerConfig>): Promise<boolean> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    if (!cfg.enabled) return false;

    const circuit = await getCircuitState(provider);

    // If circuit is open, check if timeout has passed
    if (circuit.state === 'open') {
        const timeSinceFailure = Date.now() - circuit.lastFailure;

        if (timeSinceFailure >= cfg.timeoutMs) {
            // Transition to half-open (allow one test request)
            circuit.state = 'half-open';
            await saveCircuitState(provider, circuit);
            console.log(`[CircuitBreaker] ${provider}: Open → Half-Open (timeout elapsed)`);
            return false; // Allow the test request
        }

        return true; // Circuit still open
    }

    return false; // Circuit closed or half-open
}

/**
 * Record a successful request to a provider
 */
export async function recordSuccess(provider: string): Promise<void> {
    const circuit = await getCircuitState(provider);

    if (circuit.state === 'half-open') {
        // Test request succeeded, close the circuit
        circuit.state = 'closed';
        console.log(`[CircuitBreaker] ${provider}: Half-Open → Closed (success)`);
    }

    // The threshold tracks consecutive failures. Any successful request
    // resets the streak, including while the circuit is already closed.
    circuit.failures = 0;
    circuit.lastSuccess = Date.now();
    await saveCircuitState(provider, circuit);
}

/**
 * Record a failed request to a provider
 */
export async function recordFailure(provider: string, config?: Partial<CircuitBreakerConfig>): Promise<void> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    if (!cfg.enabled) return;
    const circuit = await getCircuitState(provider);

    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.state === 'half-open') {
        // Test request failed, reopen circuit
        circuit.state = 'open';
        console.log(`[CircuitBreaker] ${provider}: Half-Open → Open (test failed)`);
    } else if (circuit.failures >= cfg.failureThreshold) {
        // Threshold reached, open circuit
        circuit.state = 'open';
        console.log(`[CircuitBreaker] ${provider}: Closed → Open (${circuit.failures} failures)`);
    }

    await saveCircuitState(provider, circuit);
}

/**
 * Get current circuit state for monitoring
 */
export async function getCircuitStatus(provider: string): Promise<CircuitState> {
    return getCircuitState(provider);
}

/**
 * Get health status for all known providers.
 * Reads from Redis first (cross-instance), falls back to in-memory.
 */
export async function getAllCircuitStates(): Promise<Record<string, CircuitState>> {
    await initRedis();

    const knownProviders = [
        'openai', 'anthropic', 'google', 'mistral', 'xai',
        'deepseek', 'cohere', 'groq', 'perplexity', 'together', 'qwen',
    ];

    const states: Record<string, CircuitState> = {};

    if (redisClient) {
        const pipeline = knownProviders.map(async (provider) => {
            try {
                const data = await redisClient!.get(`${CIRCUIT_PREFIX}${provider}`);
                if (data) {
                    return { provider, state: JSON.parse(data) as CircuitState };
                }
            } catch {
                // Redis read failed, fall through to memory
            }
            const memory = memoryCircuits.get(provider);
            if (memory) {
                return { provider, state: { ...memory } };
            }
            return null;
        });

        const results = await Promise.all(pipeline);
        for (const result of results) {
            if (result) {
                states[result.provider] = result.state;
            }
        }
    } else {
        memoryCircuits.forEach((state, provider) => {
            states[provider] = { ...state };
        });
    }

    return states;
}

/**
 * Reset circuit for a provider (manual intervention)
 */
export async function resetCircuit(provider: string): Promise<void> {
    const state: CircuitState = {
        failures: 0,
        lastFailure: 0,
        state: 'closed',
        lastSuccess: Date.now(),
    };
    await saveCircuitState(provider, state);
    console.log(`[CircuitBreaker] ${provider}: Reset to Closed`);
}

// Backwards compatibility - synchronous versions use memory only
export function isCircuitOpenSync(provider: string, config?: Partial<CircuitBreakerConfig>): boolean {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    if (!cfg.enabled) return false;

    const circuit = memoryCircuits.get(provider);
    if (!circuit) return false;

    if (circuit.state === 'open') {
        const timeSinceFailure = Date.now() - circuit.lastFailure;
        if (timeSinceFailure >= cfg.timeoutMs) {
            circuit.state = 'half-open';
            return false;
        }
        return true;
    }
    return false;
}

export function recordSuccessSync(provider: string): void {
    const circuit = memoryCircuits.get(provider) || {
        failures: 0,
        lastFailure: 0,
        state: 'closed' as const,
        lastSuccess: Date.now(),
    };

    if (circuit.state === 'half-open') {
        circuit.state = 'closed';
    }
    circuit.failures = 0;
    circuit.lastSuccess = Date.now();
    memoryCircuits.set(provider, circuit);
}

export function recordFailureSync(provider: string, config?: Partial<CircuitBreakerConfig>): void {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    if (!cfg.enabled) return;
    const circuit = memoryCircuits.get(provider) || {
        failures: 0,
        lastFailure: 0,
        state: 'closed' as const,
        lastSuccess: Date.now(),
    };

    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.state === 'half-open') {
        circuit.state = 'open';
    } else if (circuit.failures >= cfg.failureThreshold) {
        circuit.state = 'open';
    }
    memoryCircuits.set(provider, circuit);
}
