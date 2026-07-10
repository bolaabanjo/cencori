export const READ_ONLY_ANNOTATIONS = {
    title: 'Read-only',
    readOnlyHint: true,
    destructiveHint: false,
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
