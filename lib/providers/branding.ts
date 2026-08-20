/**
 * Public provider identity.
 *
 * Cencori's free tier runs on Cencori's own upstream accounts — Groq's Compound
 * systems and OpenRouter's `:free` listings — not on a key the customer brought.
 * From the customer's side Cencori genuinely is the provider: it owns the
 * account, eats the cost, and picks the upstream. Reporting `openrouter` there
 * exposes an implementation detail the customer has no relationship with and
 * cannot act on.
 *
 * Paid models are deliberately NOT relabelled. A customer calling `gpt-5` knows
 * they are calling OpenAI and may have compliance reasons to care; renaming that
 * would be misdirection rather than white-labelling. The model id is also left
 * alone throughout — only the provider label changes.
 *
 * This is presentation only. Internal records — `ai_requests.provider`, gateway
 * logs, cost attribution, circuit-breaker state — keep the real upstream name,
 * because debugging an outage and attributing spend both need to know which
 * account actually served the request.
 */

// Deliberately from free-models, not pricing: this module is imported by
// client components (ModelCatalog, PlaygroundChat) and pricing.ts would drag the
// Supabase admin client into the browser bundle.
import { isExplicitlyFree } from './free-models';

export const CENCORI_PROVIDER_LABEL = 'cencori';

/** Human-readable form of {@link CENCORI_PROVIDER_LABEL}, for UI. */
export const CENCORI_PROVIDER_DISPLAY_NAME = 'Cencori';

/**
 * True when Cencori serves this model on its own account and should be named as
 * the provider. Tracks the free tier exactly: `isExplicitlyFree` is the same
 * predicate that decides the customer is charged nothing, and pricing-catalog
 * tests keep it in sync with the `free: true` flags in the catalog.
 */
export function isCencoriServed(provider: string, model: string): boolean {
    return isExplicitlyFree(provider, model);
}

/** The provider name to show a customer for this model. */
export function publicProviderLabel(provider: string, model: string): string {
    return isCencoriServed(provider, model) ? CENCORI_PROVIDER_LABEL : provider;
}

/**
 * The failover aggregate ("All providers exhausted. Primary (groq): ...") names
 * every upstream tried and quotes their raw errors — which for a Cencori-served
 * model means leaking both the vendor chain and Cencori's own account state
 * (an upstream billing message, for instance). Replace it on the way out; the
 * unabridged text is still written to ai_requests.error_message.
 */
export function publicFailureMessage(
    message: string,
    provider: string,
    model: string | undefined,
): string {
    if (!model || !isCencoriServed(provider, model)) return message;
    if (!message.startsWith('All providers exhausted')) return message;
    return 'No capacity is currently available for this model. Retry shortly, or use a different model.';
}

/**
 * Display name to show beside a model in the console and public catalog. Takes
 * the provider's own name (`OpenRouter`, `Groq`) for everything Cencori does
 * not serve itself.
 */
export function publicProviderDisplayName(
    provider: string,
    providerName: string,
    model: string,
): string {
    return isCencoriServed(provider, model) ? CENCORI_PROVIDER_DISPLAY_NAME : providerName;
}
