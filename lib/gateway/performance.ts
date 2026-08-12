export type GatewayPerformanceMetrics = {
    gatewayPreflightMs: number | null;
    providerTtftMs: number | null;
    clientTtftMs: number | null;
    totalCompletionMs: number | null;
    tokensPerSecond: number | null;
};

/**
 * Request-scoped latency tracker shared by the route, provider executor, and
 * stream encoder. Date.now() is intentional: the recorded values need to be
 * comparable with persisted request timestamps, not just process-local marks.
 */
export class GatewayPerformanceTracker {
    private readonly requestStartedAt: number;
    private preflightCompletedAt: number | null = null;
    private providerStartedAt: number | null = null;
    private providerFirstTokenAt: number | null = null;
    private clientFirstByteAt: number | null = null;
    private completedAt: number | null = null;
    private completionTokens: number | null = null;

    constructor(requestStartedAt: number = Date.now()) {
        this.requestStartedAt = requestStartedAt;
    }

    markPreflightComplete(at: number = Date.now()): void {
        this.preflightCompletedAt ??= at;
    }

    markProviderStart(at: number = Date.now()): void {
        this.providerStartedAt ??= at;
    }

    markProviderFirstToken(at: number = Date.now()): void {
        this.providerFirstTokenAt ??= at;
    }

    markClientFirstByte(at: number = Date.now()): void {
        this.clientFirstByteAt ??= at;
    }

    markComplete(completionTokens?: number, at: number = Date.now()): void {
        this.completedAt ??= at;
        if (completionTokens !== undefined && Number.isFinite(completionTokens)) {
            this.completionTokens = Math.max(0, completionTokens);
        }
    }

    snapshot(): GatewayPerformanceMetrics {
        const outputDurationMs = this.completedAt !== null && this.providerFirstTokenAt !== null
            ? Math.max(0, this.completedAt - this.providerFirstTokenAt)
            : null;
        const tokensPerSecond = outputDurationMs !== null
            && outputDurationMs > 0
            && this.completionTokens !== null
                ? this.completionTokens / (outputDurationMs / 1000)
                : null;

        return {
            gatewayPreflightMs: this.preflightCompletedAt === null
                ? null
                : Math.max(0, this.preflightCompletedAt - this.requestStartedAt),
            providerTtftMs: this.providerStartedAt === null || this.providerFirstTokenAt === null
                ? null
                : Math.max(0, this.providerFirstTokenAt - this.providerStartedAt),
            clientTtftMs: this.clientFirstByteAt === null
                ? null
                : Math.max(0, this.clientFirstByteAt - this.requestStartedAt),
            totalCompletionMs: this.completedAt === null
                ? null
                : Math.max(0, this.completedAt - this.requestStartedAt),
            tokensPerSecond,
        };
    }
}
