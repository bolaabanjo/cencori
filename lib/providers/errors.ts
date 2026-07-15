/**
 * Provider Error Classes
 * 
 * Unified error handling for all AI providers
 */

export class ProviderError extends Error {
    constructor(
        public provider: string,
        message: string,
        public originalError?: unknown,
        public retryable: boolean = false
    ) {
        super(`[${provider}] ${message}`);
        this.name = 'ProviderError';
    }
}

export class AuthenticationError extends ProviderError {
    constructor(provider: string, originalError?: unknown) {
        super(provider, 'Authentication failed. Check API key configuration.', originalError, false);
        this.name = 'AuthenticationError';
    }
}

export class RateLimitError extends ProviderError {
    constructor(
        provider: string,
        public retryAfter?: number,
        originalError?: unknown
    ) {
        super(provider, 'Rate limit exceeded.', originalError, true);
        this.name = 'RateLimitError';
    }
}

export class InvalidRequestError extends ProviderError {
    constructor(provider: string, message: string, originalError?: unknown) {
        super(provider, `Invalid request: ${message}`, originalError, false);
        this.name = 'InvalidRequestError';
    }
}

export class ModelNotFoundError extends ProviderError {
    constructor(provider: string, modelName: string, originalError?: unknown) {
        super(provider, `Model '${modelName}' not found or not accessible.`, originalError, false);
        this.name = 'ModelNotFoundError';
    }
}

export class ServiceUnavailableError extends ProviderError {
    constructor(provider: string, originalError?: unknown) {
        super(provider, 'Service temporarily unavailable.', originalError, true);
        this.name = 'ServiceUnavailableError';
    }
}

export class ContentFilterError extends ProviderError {
    constructor(provider: string, originalError?: unknown) {
        super(provider, 'Content filtered by provider safety system.', originalError, false);
        this.name = 'ContentFilterError';
    }
}

export class PricingUnavailableError extends ProviderError {
    constructor(provider: string, model: string, detail?: string) {
        super(
            provider,
            `Pricing is not configured for ${provider}/${model}${detail ? `: ${detail}` : ''}`,
            undefined,
            false
        );
        this.name = 'PricingUnavailableError';
    }
}

/**
 * Convert provider-specific errors to unified error types
 */
export function normalizeProviderError(provider: string, error: unknown): ProviderError {
    if (error instanceof ProviderError) {
        return error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorLower = errorMessage.toLowerCase();

    // Authentication errors
    if (errorLower.includes('unauthorized') ||
        errorLower.includes('invalid api key') ||
        errorLower.includes('authentication')) {
        return new AuthenticationError(provider, error);
    }

    // Rate limit errors
    if (errorLower.includes('rate limit') ||
        errorLower.includes('too many requests') ||
        errorLower.includes('429')) {
        return new RateLimitError(provider, undefined, error);
    }

    // Model not found
    if (errorLower.includes('model not found') ||
        errorLower.includes('model_not_found') ||
        errorLower.includes('unsupported model')) {
        return new ModelNotFoundError(provider, 'unknown', error);
    }

    // Service unavailable
    if (errorLower.includes('service unavailable') ||
        errorLower.includes('503') ||
        errorLower.includes('timeout')) {
        return new ServiceUnavailableError(provider, error);
    }

    // Content filter
    if (errorLower.includes('content_filter') ||
        errorLower.includes('safety') ||
        errorLower.includes('blocked')) {
        return new ContentFilterError(provider, error);
    }

    // Invalid request
    if (errorLower.includes('invalid') ||
        errorLower.includes('bad request') ||
        errorLower.includes('400')) {
        return new InvalidRequestError(provider, errorMessage, error);
    }

    // Generic provider error
    return new ProviderError(provider, errorMessage, error, false);
}
