/**
 * Session-scoped memory — Redis list with TTL, no embeddings.
 *
 * Session memories are few and recent, so they're injected wholesale
 * (capped) rather than vector-ranked. Silent-fail throughout: session
 * memory degrading to nothing must never affect a chat request.
 */

import { Redis } from '@upstash/redis';
import { MEMORY_CONTENT_MAX_CHARS, type RetrievedMemory } from './types';

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
    if (redis !== undefined) return redis;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    redis = url && token ? new Redis({ url, token }) : null;
    return redis;
}

/** Hard cap on entries kept per session. */
export const SESSION_MEMORY_CAP = 20;

interface SessionMemoryEntry {
    content: string;
    importance: number;
    createdAt: string;
}

function sessionKey(orgId: string, projectId: string, scopeKey: string): string {
    // Org id in the key = defense in depth on top of ctx-derived lookups.
    return `mem:sess:${orgId}:${projectId}:${scopeKey}`;
}

export async function appendSessionMemories(
    orgId: string,
    projectId: string,
    scopeKey: string,
    items: { content: string; importance: number }[],
    ttlSeconds: number
): Promise<boolean> {
    if (items.length === 0) return true;

    const client = getRedis();
    if (!client) return false;

    const key = sessionKey(orgId, projectId, scopeKey);
    const entries: SessionMemoryEntry[] = items.map(item => ({
        content: item.content.slice(0, MEMORY_CONTENT_MAX_CHARS),
        importance: item.importance,
        createdAt: new Date().toISOString(),
    }));

    try {
        await client.lpush(key, ...entries.map(e => JSON.stringify(e)));
        await client.ltrim(key, 0, SESSION_MEMORY_CAP - 1);
        await client.expire(key, ttlSeconds);
        return true;
    } catch (error) {
        console.warn('[Memory] Failed to append session memory:', error);
        return false;
    }
}

export async function listSessionMemories(
    orgId: string,
    projectId: string,
    scopeKey: string,
    cap: number = SESSION_MEMORY_CAP
): Promise<RetrievedMemory[]> {
    const key = sessionKey(orgId, projectId, scopeKey);
    const client = getRedis();
    if (!client) return [];

    try {
        const raw = await client.lrange(key, 0, cap - 1);
        return raw
            .map((item): RetrievedMemory | null => {
                try {
                    const parsed = (typeof item === 'string' ? JSON.parse(item) : item) as SessionMemoryEntry;
                    if (!parsed || typeof parsed.content !== 'string') return null;
                    return {
                        id: 'mem_session',
                        content: parsed.content,
                        similarity: 1,
                        namespace: null,
                        importance: typeof parsed.importance === 'number' ? parsed.importance : 0.5,
                        createdAt: parsed.createdAt ?? null,
                    };
                } catch {
                    return null;
                }
            })
            .filter((m): m is RetrievedMemory => m !== null);
    } catch {
        return [];
    }
}

export async function clearSessionMemories(
    orgId: string,
    projectId: string,
    scopeKey: string
): Promise<void> {
    const client = getRedis();
    if (!client) return;
    try {
        await client.del(sessionKey(orgId, projectId, scopeKey));
    } catch {
        // Silently fail
    }
}
