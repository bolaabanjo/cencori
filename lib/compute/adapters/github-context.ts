/**
 * A DetectionContext backed by the GitHub Contents API — reads the specific
 * files an adapter needs (manifests, entry points) at a pinned ref, WITHOUT
 * cloning or executing the repo. This is how "detection is a product, not
 * executed untrusted code" (COMPUTE_UNIVERSAL_DEPLOY.md §2).
 */

import type { Octokit } from '@octokit/rest';
import type { DetectionContext } from './types';

function statusOf(e: unknown): number | undefined {
    return (e as { status?: number } | null)?.status;
}

export function createGithubDetectionContext(opts: {
    octokit: Octokit;
    owner: string;
    repo: string;
    ref: string;
    rootDir: string;
}): DetectionContext {
    const { octokit, owner, repo, ref } = opts;
    const root = opts.rootDir.replace(/^\/+|\/+$/g, '');
    const full = (p: string) => [root, p.replace(/^\/+/, '')].filter(Boolean).join('/');

    async function readFile(path: string): Promise<string | null> {
        try {
            const { data } = await octokit.rest.repos.getContent({ owner, repo, path: full(path), ref });
            if (Array.isArray(data) || data.type !== 'file' || typeof (data as { content?: string }).content !== 'string') {
                return null;
            }
            return Buffer.from((data as { content: string }).content, 'base64').toString('utf8');
        } catch (e) {
            if (statusOf(e) === 404) return null;
            throw e;
        }
    }

    async function exists(path: string): Promise<boolean> {
        try {
            await octokit.rest.repos.getContent({ owner, repo, path: full(path), ref });
            return true;
        } catch (e) {
            if (statusOf(e) === 404) return false;
            throw e;
        }
    }

    async function list(dir = ''): Promise<string[]> {
        try {
            const { data } = await octokit.rest.repos.getContent({ owner, repo, path: full(dir), ref });
            return Array.isArray(data) ? data.map((d) => d.name) : [];
        } catch (e) {
            if (statusOf(e) === 404) return [];
            throw e;
        }
    }

    async function json<T = unknown>(path: string): Promise<T | null> {
        const text = await readFile(path);
        if (!text) return null;
        try {
            return JSON.parse(text) as T;
        } catch {
            return null;
        }
    }

    return { rootDir: opts.rootDir, readFile, exists, list, json };
}
