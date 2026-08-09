/**
 * Resolve a project UUID from the shapes historically stored in the shared
 * React Query cache. The object branches are temporary compatibility for
 * sessions populated before project-id and project-details keys were split.
 */
export function normalizeProjectId(value: unknown): string | undefined {
    if (typeof value === "string") {
        return value || undefined;
    }

    if (!value || typeof value !== "object") {
        return undefined;
    }

    const candidate = value as { id?: unknown; projectId?: unknown };
    if (typeof candidate.projectId === "string") {
        return candidate.projectId || undefined;
    }

    if (typeof candidate.id === "string") {
        return candidate.id || undefined;
    }

    return undefined;
}
