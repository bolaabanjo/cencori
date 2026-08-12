export type GatewayRoutingProfile = 'balanced' | 'speed';

export type SpeedProfileMessage = {
    role: string;
    content: unknown;
};

export type SpeedProfileResult<T extends SpeedProfileMessage> = {
    model: string;
    maxTokens: number | undefined;
    messages: T[];
    trimmedMessages: number;
    hedgeDelayMs: number;
};

function positiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function serializedContent(content: unknown): string {
    return typeof content === 'string' ? content : JSON.stringify(content ?? '');
}

export function resolveGatewayRoutingProfile(
    bodyProfile: unknown,
    headerProfile: string | null
): GatewayRoutingProfile {
    const candidate = typeof bodyProfile === 'string' ? bodyProfile : headerProfile;
    return candidate?.trim().toLowerCase() === 'speed' ? 'speed' : 'balanced';
}

/**
 * Speed mode is intentionally opt-in. It bounds output and old conversation
 * context, and can route to a deployment-selected fast model. System messages
 * and the newest conversation turn are always retained.
 */
export function applySpeedProfile<T extends SpeedProfileMessage>(params: {
    model: string;
    maxTokens?: number;
    messages: T[];
}): SpeedProfileResult<T> {
    const outputLimit = positiveInteger(process.env.CENCORI_SPEED_MAX_TOKENS, 256);
    const inputTokenLimit = positiveInteger(process.env.CENCORI_SPEED_MAX_INPUT_TOKENS, 4096);
    const inputCharacterBudget = inputTokenLimit * 4;
    const configuredModel = process.env.CENCORI_SPEED_MODEL?.trim();

    const systemMessages = params.messages.filter((message) => message.role === 'system');
    const conversation = params.messages.filter((message) => message.role !== 'system');
    const retained: T[] = [];
    let usedCharacters = systemMessages.reduce(
        (total, message) => total + serializedContent(message.content).length,
        0
    );

    for (let index = conversation.length - 1; index >= 0; index--) {
        const message = conversation[index];
        const messageCharacters = serializedContent(message.content).length;
        const isNewestMessage = index === conversation.length - 1;
        if (!isNewestMessage && usedCharacters + messageCharacters > inputCharacterBudget) {
            continue;
        }
        retained.push(message);
        usedCharacters += messageCharacters;
    }
    retained.reverse();

    return {
        model: configuredModel || params.model,
        maxTokens: Math.min(params.maxTokens ?? outputLimit, outputLimit),
        messages: [...systemMessages, ...retained],
        trimmedMessages: Math.max(0, params.messages.length - systemMessages.length - retained.length),
        hedgeDelayMs: positiveInteger(process.env.CENCORI_HEDGE_DELAY_MS, 350),
    };
}
