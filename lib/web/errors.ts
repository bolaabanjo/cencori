export class WebRuntimeError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly status = 400,
        public readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'WebRuntimeError';
    }
}
