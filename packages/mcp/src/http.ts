/** Default timeout for outbound MCP → Cencori HTTP calls. */
export const FETCH_TIMEOUT_MS = 15_000;

export function fetchSignal(): AbortSignal {
    return AbortSignal.timeout(FETCH_TIMEOUT_MS);
}

/**
 * Extract a useful error message from a failed HTTP response.
 * Prefers JSON `error` / `error.message` over bare statusText.
 */
export async function readHttpErrorMessage(response: Response): Promise<string> {
    const errorData = (await response.json().catch(() => null)) as
        | { error?: string | { message?: string; code?: string } }
        | null;

    if (typeof errorData?.error === 'string') {
        return errorData.error;
    }

    if (errorData?.error && typeof errorData.error === 'object' && errorData.error.message) {
        return errorData.error.message;
    }

    return response.statusText || `HTTP ${response.status}`;
}
