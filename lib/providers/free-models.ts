/**
 * Cencori's free-model catalog — the single list of models the customer is never
 * charged for.
 *
 * This lives apart from pricing.ts on purpose. pricing.ts imports the Supabase
 * admin client, which throws at module load without a service-role key, so
 * anything that reaches for it from a client component takes the whole page
 * down. The free set is inert data that the browser legitimately needs (the
 * model catalog and playground both label rows from it), so it must stay free of
 * server-only imports. Keep it that way: no DB, no env, no Node built-ins.
 */

const EXPLICITLY_FREE_MODELS = new Set([
    // Cencori's public free-model catalog. These intentionally bypass the
    // database pricing lookup and are never charged to the customer.
    //
    // Membership here must match the `free: true` entries in config.ts —
    // pricing-catalog.test.ts asserts every catalog model tagged free resolves
    // to zero static pricing, and fails if the two drift apart.
    //
    // Cerebras used to hold half this list; its account is unfunded (402 on
    // every model, and zai-glm-4.7 archived outright), so the free tier moved to
    // Groq's Compound systems and OpenRouter's `:free` listings. All ids below
    // were verified live on 2026-08-20.
    'groq:groq/compound',
    'groq:groq/compound-mini',
    // OpenRouter zero-cost tier. Rate-limited and best treated as a pool: any
    // single id can 429 under load, so callers should be able to fall through to
    // another one rather than depend on a specific model.
    'openrouter:poolside/laguna-s-2.1:free',
    'openrouter:poolside/laguna-xs-2.1:free',
    'openrouter:nvidia/nemotron-nano-12b-v2-vl:free',
    'openrouter:nvidia/nemotron-nano-9b-v2:free',
    'openrouter:nvidia/nemotron-3-nano-30b-a3b:free',
    'openrouter:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    'openrouter:nvidia/nemotron-3-super-120b-a12b:free',
    'openrouter:nvidia/nemotron-3-ultra-550b-a55b:free',
    'openrouter:nvidia/nemotron-3.5-lightning:free',
    'openrouter:openai/gpt-oss-20b:free',
    'openrouter:cohere/north-mini-code:free',
    'openrouter:dots-studio/dots-3-note-preview:free',
    'openrouter:liquid/lfm-2.5-2.6b:free',
    // Stealth preview: OpenRouter serves `stealth/ox-alpha` at $0/$0 while the
    // anonymous-operator preview lasts. Free membership mirrors the `free: true`
    // tag in config.ts. Unlike the rest of this list it is not a permanent
    // zero-cost tier — when the preview ends the id 404s upstream and must be
    // removed from here and the catalog together.
    'openrouter:stealth/ox-alpha',
    // Centaur stealth preview, free for a one-week window agreed with the
    // partner lab (ends 2026-08-29). Two keys on purpose: the catalog id
    // (`centaur`, what pricing-catalog.test.ts iterates) and the upstream id
    // (`julian-origin`, what MODEL_ALIASES normalizes to before billing and
    // inference). When the window lifts, remove both and add real pricing rows.
    'centaur:centaur',
    'centaur:julian-origin',
    // Maximo Atlas ran here as a free preview until 2026-07-22. It is now
    // billed from the model_pricing row deployed in
    // 20260803_120000_maximo_atlas_paid_pricing.sql.
]);

export function isExplicitlyFree(provider: string, model: string): boolean {
    return EXPLICITLY_FREE_MODELS.has(`${provider}:${model}`);
}

export function hasStaticPricing(provider: string, model: string): boolean {
    return isExplicitlyFree(provider, model);
}
