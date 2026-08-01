/**
 * Fast Config Cache using Redis
 * Caches frequently accessed configs to reduce DB roundtrips
 */

import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const CONFIG_PREFIX = 'cfg:';

// TTLs - balance between freshness and speed
const TTL = {
    API_KEY: 60,           // 1 minute for API key + project config
    CACHE_CONFIG: 300,     // 5 minutes for cache config
    SECURITY_CONFIG: 60,   // 1 minute for security config
    NETWORK_CONFIG: 60,    // 1 minute for project ingress policy
    CREDITS: 300,          // 5 minutes for balance (invalidated on spend)
    MEMORY_CONFIG: 300,    // 5 minutes for project memory settings
};

/**
 * Cache organization credits balance
 */
export async function getCachedCreditsBalance(organizationId: string): Promise<number | null> {
    const cacheKey = `${CONFIG_PREFIX}credits:${organizationId}`;
    try {
        const cached = await redis.get(cacheKey);
        return cached !== null ? Number(cached) : null;
    } catch {
        return null;
    }
}

export async function setCachedCreditsBalance(organizationId: string, balance: number): Promise<void> {
    const cacheKey = `${CONFIG_PREFIX}credits:${organizationId}`;
    try {
        await redis.set(cacheKey, balance, { ex: TTL.CREDITS });
    } catch {
        // Silently fail
    }
}

export async function invalidateCreditsBalance(organizationId: string): Promise<void> {
    const cacheKey = `${CONFIG_PREFIX}credits:${organizationId}`;
    try {
        await redis.del(cacheKey);
    } catch {
        // Silently fail
    }
}

/**
 * Cache API key + project config lookup
 * This is the most frequent DB call - caching it will save ~100-200ms per request
 */
export async function getCachedApiKeyConfig(keyHash: string): Promise<{
    data: any;
    fromCache: boolean;
} | null> {
    const cacheKey = `${CONFIG_PREFIX}key:${keyHash}`;
    
    try {
        const cached = await redis.get(cacheKey);
        if (cached) {
            return { data: cached, fromCache: true };
        }
        return null;
    } catch {
        return null;
    }
}

export async function setCachedApiKeyConfig(keyHash: string, data: any): Promise<void> {
    const cacheKey = `${CONFIG_PREFIX}key:${keyHash}`;
    try {
        await redis.set(cacheKey, data, { ex: TTL.API_KEY });
    } catch {
        // Silently fail - don't block requests
    }
}

export async function invalidateApiKeyCache(keyHash: string): Promise<void> {
    const cacheKey = `${CONFIG_PREFIX}key:${keyHash}`;
    try {
        await redis.del(cacheKey);
    } catch {
        // Silently fail
    }
}

/**
 * Cache project cache settings
 */
export async function getCachedCacheConfig(projectId: string): Promise<{
    data: any;
    fromCache: boolean;
} | null> {
    const cacheKey = `${CONFIG_PREFIX}cache:${projectId}`;
    
    try {
        const cached = await redis.get(cacheKey);
        if (cached) {
            return { data: cached, fromCache: true };
        }
        return null;
    } catch {
        return null;
    }
}

export async function setCachedCacheConfig(projectId: string, data: any): Promise<void> {
    const cacheKey = `${CONFIG_PREFIX}cache:${projectId}`;
    try {
        await redis.set(cacheKey, data, { ex: TTL.CACHE_CONFIG });
    } catch {
        // Silently fail
    }
}

export async function invalidateCacheConfig(projectId: string): Promise<void> {
    const cacheKey = `${CONFIG_PREFIX}cache:${projectId}`;
    try {
        await redis.del(cacheKey);
    } catch {
        // Silently fail
    }
}

/**
 * Cache project memory settings
 */
export async function getCachedMemoryConfig(projectId: string): Promise<{
    data: any;
    fromCache: boolean;
} | null> {
    const cacheKey = `${CONFIG_PREFIX}memory:${projectId}`;

    try {
        const cached = await redis.get(cacheKey);
        if (cached) {
            return { data: cached, fromCache: true };
        }
        return null;
    } catch {
        return null;
    }
}

export async function setCachedMemoryConfig(projectId: string, data: any): Promise<void> {
    const cacheKey = `${CONFIG_PREFIX}memory:${projectId}`;
    try {
        await redis.set(cacheKey, data, { ex: TTL.MEMORY_CONFIG });
    } catch {
        // Silently fail
    }
}

export async function invalidateMemoryConfig(projectId: string): Promise<void> {
    const cacheKey = `${CONFIG_PREFIX}memory:${projectId}`;
    try {
        await redis.del(cacheKey);
    } catch {
        // Silently fail
    }
}

/**
 * Cache agent config lookup
 */
export async function getCachedAgentConfig(agentId: string): Promise<{
    data: any;
    fromCache: boolean;
} | null> {
    const cacheKey = `${CONFIG_PREFIX}agent:${agentId}`;
    
    try {
        const cached = await redis.get(cacheKey);
        if (cached) {
            return { data: cached, fromCache: true };
        }
        return null;
    } catch {
        return null;
    }
}

export async function setCachedAgentConfig(agentId: string, data: any): Promise<void> {
    const cacheKey = `${CONFIG_PREFIX}agent:${agentId}`;
    try {
        await redis.set(cacheKey, data, { ex: TTL.API_KEY });
    } catch {
        // Silently fail
    }
}

export async function invalidateAgentConfig(agentId: string): Promise<void> {
    const cacheKey = `${CONFIG_PREFIX}agent:${agentId}`;
    try {
        await redis.del(cacheKey);
    } catch {
        // Silently fail
    }
}

/**
 * Cache security settings per project
 */
export async function getCachedSecurityConfig(projectId: string): Promise<{
    data: any;
    fromCache: boolean;
} | null> {
    const cacheKey = `${CONFIG_PREFIX}security:${projectId}`;
    
    try {
        const cached = await redis.get(cacheKey);
        if (cached) {
            return { data: cached, fromCache: true };
        }
        return null;
    } catch {
        return null;
    }
}

export async function setCachedSecurityConfig(projectId: string, data: any): Promise<void> {
    const cacheKey = `${CONFIG_PREFIX}security:${projectId}`;
    try {
        await redis.set(cacheKey, data, { ex: TTL.SECURITY_CONFIG });
    } catch {
        // Silently fail
    }
}

export async function invalidateSecurityConfig(projectId: string): Promise<void> {
    const cacheKey = `${CONFIG_PREFIX}security:${projectId}`;
    try {
        await redis.del(cacheKey);
    } catch {
        // Silently fail
    }
}

/**
 * Cache project ingress policy. Policy writes invalidate this key so gateway
 * enforcement changes take effect immediately instead of waiting for the TTL.
 */
export async function getCachedNetworkConfig<T = unknown>(projectId: string): Promise<{
    data: T;
    fromCache: boolean;
} | null> {
    const cacheKey = `${CONFIG_PREFIX}network:${projectId}`;

    try {
        const cached = await redis.get<T>(cacheKey);
        return cached ? { data: cached, fromCache: true } : null;
    } catch {
        return null;
    }
}

export async function setCachedNetworkConfig(projectId: string, data: unknown): Promise<void> {
    const cacheKey = `${CONFIG_PREFIX}network:${projectId}`;
    try {
        await redis.set(cacheKey, data, { ex: TTL.NETWORK_CONFIG });
    } catch {
        // Network policy must still work when Redis is unavailable.
    }
}

export async function invalidateNetworkConfig(projectId: string): Promise<void> {
    const cacheKey = `${CONFIG_PREFIX}network:${projectId}`;
    try {
        await redis.del(cacheKey);
    } catch {
        // The one-minute TTL remains the fallback.
    }
}
