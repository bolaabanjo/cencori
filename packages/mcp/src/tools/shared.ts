export const READ_ONLY_ANNOTATIONS = {
    title: 'Read-only',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
} as const;

/**
 * Non-destructive write / action (create, run inference). Mutates state or
 * incurs cost but does not delete or irreversibly change existing resources.
 * Gated behind CENCORI_MCP_WRITE.
 */
export const WRITE_ANNOTATIONS = {
    title: 'Write',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
} as const;

/**
 * Destructive action (delete, approve/reject). Gated behind
 * CENCORI_MCP_DESTRUCTIVE. Clients should surface a confirmation.
 */
export const DESTRUCTIVE_ANNOTATIONS = {
    title: 'Destructive',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
} as const;

export function jsonResult(data: unknown) {
    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(data, null, 2),
            },
        ],
    };
}
