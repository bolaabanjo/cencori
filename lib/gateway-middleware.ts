/**
 * Shared Gateway Middleware
 * 
 * Central validation layer for all AI Gateway endpoints.
 * Handles: auth, rate limiting, spend caps, usage tracking,
 * request ID, CORS, domain validation, and geo/IP.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import crypto from 'crypto';
import { geolocation, ipAddress, waitUntil } from '@vercel/functions';
import { checkRateLimit } from '@/lib/rate-limit';
import { checkSpendCap } from '@/lib/budgets';
import { deductCredits } from '@/lib/credits';
import { extractCencoriApiKeyFromHeaders } from '@/lib/api-keys';
import { logGatewayEvent } from '@/lib/gateway-reliability';
import { getCachedApiKeyConfig, setCachedApiKeyConfig, invalidateApiKeyCache } from '@/lib/config-cache';
import { processUsageQueue } from '@/lib/queue';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface GatewayContext {
    supabase: ReturnType<typeof createAdminClient>;
    projectId: string;
    organizationId: string;
    apiKeyId: string | null;
    environment: string;
    keyType: string;
    tier: string;
    requestId: string;
    startTime: number;
    clientIp: string;
    countryCode: string | null;
    projectName: string;
    defaultModel: string | null;
    defaultProvider: string | null;
    endUserBillingEnabled: boolean;
    rateLimit?: {
        status: 'ok' | 'skipped' | 'failed_open' | 'failed_closed';
        limit: number;
        remaining: number;
        reset: number;
    };
}

export type GatewayValidationResult =
    | { success: true; context: GatewayContext }
    | { success: false; response: NextResponse };

export interface LogRequestParams {
    endpoint: string;
    model: string;
    provider: string;
    status: 'success' | 'error' | 'filtered' | 'blocked' | 'success_fallback' | 'blocked_output' | 'rate_limited';
    requestPayload?: Record<string, unknown>;
    responsePayload?: Record<string, unknown>;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    costUsd?: number;
    providerCostUsd?: number;
    cencoriChargeUsd?: number;
    markupPercentage?: number;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
    endUserId?: string;
    fallbackProvider?: string;
    fallbackModel?: string;
}

// ──────────────────────────────────────────────
// Domain Validation
// ──────────────────────────────────────────────

function validateDomain(origin: string | null, allowedDomains: string[] | null): boolean {
    if (!origin || !allowedDomains || allowedDomains.length === 0) {
        return false;
    }

    try {
        const url = new URL(origin);
        const hostname = url.hostname;

        return allowedDomains.some(pattern => {
            if (hostname === pattern) return true;

            if (pattern.startsWith('*.')) {
                const baseDomain = pattern.slice(2);
                return hostname === baseDomain || hostname.endsWith('.' + baseDomain);
            }

            if (pattern === 'localhost' && hostname === 'localhost') {
                return true;
            }

            return false;
        });
    } catch {
        return false;
    }
}

// ──────────────────────────────────────────────
// IP / Geolocation
// ──────────────────────────────────────────────

// NOTE: lookupCountryFromIp was removed — it made external HTTP calls to
// ipinfo.io and ipapi.co with 3s timeouts each, adding 0-6s of latency
// per request. We now rely on Vercel's geolocation() (free, zero-latency)
// and customer-provided X-Cencori-User-Country headers instead.

// ──────────────────────────────────────────────
// Main Validation
// ──────────────────────────────────────────────

/**
 * Validate a gateway request: auth, rate limit, spend cap, domain, geo.
 * Call this at the top of every AI endpoint POST handler.
 */
export async function validateGatewayRequest(req: NextRequest): Promise<GatewayValidationResult> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const supabase = createAdminClient();

    // ── Extract IP / Geo ──
    const customerProvidedIp = req.headers.get('x-cencori-user-ip');
    const vercelIp = ipAddress(req);
    const fallbackIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const clientIp = customerProvidedIp || vercelIp || fallbackIp || 'unknown';
    // Use customer-provided country header first, then Vercel's free geolocation
    let countryCode = req.headers.get('x-cencori-user-country');
    if (!countryCode) {
        const geo = geolocation(req);
        countryCode = geo.country || null;
    }

    // ── Public Playground (no auth required) ──
    const publicPlaygroundHeader = req.headers.get('x-public-playground');
    const playgroundProjectId = req.headers.get('x-playground-project-id');

    if (publicPlaygroundHeader === 'true' && playgroundProjectId) {
        const demoProjectId = process.env.NEXT_PUBLIC_DEMO_PROJECT_ID;
        if (!demoProjectId || playgroundProjectId !== demoProjectId) {
            return {
                success: false,
                response: addGatewayHeaders(
                    NextResponse.json(
                        { error: 'Invalid or missing public playground configuration' },
                        { status: 403 }
                    ),
                    { requestId }
                ),
            };
        }

        const { data: project, error: pError } = await supabase
            .from('projects')
            .select(`
                id,
                name,
                organization_id,
                default_model,
                default_provider,
                end_user_billing_enabled,
                organizations!inner(
                    id,
                    subscription_tier,
                    monthly_requests_used,
                    monthly_request_limit,
                    credits_balance,
                    billing_frozen
                )
            `)
            .eq('id', demoProjectId)
            .single();

        if (!project || pError) {
            return {
                success: false,
                response: addGatewayHeaders(
                    NextResponse.json(
                        { error: 'Public playground demo project not found' },
                        { status: 500 }
                    ),
                    { requestId }
                ),
            };
        }

        const organization = project.organizations as unknown as {
            id: string;
            subscription_tier: string;
            monthly_requests_used: number;
            monthly_request_limit: number;
            credits_balance: string | number | null;
            billing_frozen: boolean | null;
        };

        // IP-based rate limiting for public playground (per IP, not per project)
        const ipRateLimit = await checkRateLimit(`public_playground:${clientIp}`, {
            requestId,
            route: req.nextUrl.pathname,
        });

        if (!ipRateLimit.allowed) {
            if (ipRateLimit.reason === 'backend_unavailable') {
                return {
                    success: false,
                    response: addGatewayHeaders(
                        NextResponse.json(
                            { error: 'Rate limit unavailable' },
                            { status: 503 }
                        ),
                        { requestId }
                    ),
                };
            }
            return {
                success: false,
                response: addGatewayHeaders(
                    NextResponse.json(
                        {
                            error: 'Rate limit exceeded',
                            message: 'Too many requests. Sign up for a free account to increase your limits.',
                            retry_after_ms: ipRateLimit.reset - Date.now(),
                        },
                        { status: 429 }
                    ),
                    { requestId, rateLimit: ipRateLimit }
                ),
            };
        }

        const context: GatewayContext = {
            supabase,
            projectId: project.id,
            organizationId: organization.id,
            apiKeyId: null,
            environment: 'production',
            keyType: 'public_playground',
            tier: 'free',
            requestId,
            startTime,
            clientIp,
            countryCode,
            projectName: project.name,
            defaultModel: project.default_model,
            defaultProvider: project.default_provider,
            endUserBillingEnabled: Boolean(project.end_user_billing_enabled),
            rateLimit: {
                status: ipRateLimit.status,
                limit: ipRateLimit.limit,
                remaining: ipRateLimit.remaining,
                reset: ipRateLimit.reset,
            },
        };

        return { success: true, context };
    }

    // ── Extract API Key ──
    const apiKey = extractCencoriApiKeyFromHeaders(req.headers);

    if (!apiKey) {
        try {
            // Check if there is an authenticated dashboard user via cookies/session
            const { createServerClient } = await import('@/lib/supabaseServer');
            const userSupabase = await createServerClient();
            const { data: { user } } = await userSupabase.auth.getUser();

            if (user) {
                // Check if they passed a Project ID via header
                const playgroundProjectId = req.headers.get('x-playground-project-id');
                const playgroundEnv = req.headers.get('x-playground-environment') || 'production';

                if (playgroundProjectId) {
                    // Verify the user has access to this project
                    const { data: project, error: pError } = await userSupabase
                        .from('projects')
                        .select(`
                            id,
                            name,
                            organization_id,
                            default_model,
                            default_provider,
                            end_user_billing_enabled,
                            organizations!inner(
                                id,
                                subscription_tier,
                                monthly_requests_used,
                                monthly_request_limit,
                                credits_balance,
                                billing_frozen
                            )
                        `)
                        .eq('id', playgroundProjectId)
                        .single();

                    if (project && !pError) {
                        // Find an active API key for this project and environment to use as a logging reference
                        const { data: activeKey } = await supabase
                            .from('api_keys')
                            .select('id')
                            .eq('project_id', project.id)
                            .eq('environment', playgroundEnv)
                            .is('revoked_at', null)
                            .limit(1)
                            .maybeSingle();

                        const organization = project.organizations as unknown as {
                            id: string;
                            subscription_tier: string;
                            monthly_requests_used: number;
                            monthly_request_limit: number;
                            credits_balance: string | number | null;
                            billing_frozen: boolean | null;
                        };

                        const organizationId = organization.id;
                        const tier = organization.subscription_tier || 'free';

                        const context: GatewayContext = {
                            supabase,
                            projectId: project.id,
                            organizationId,
                            apiKeyId: activeKey?.id || null,
                            environment: playgroundEnv,
                            keyType: 'session',
                            tier,
                            requestId,
                            startTime,
                            clientIp,
                            countryCode,
                            projectName: project.name,
                            defaultModel: project.default_model,
                            defaultProvider: project.default_provider,
                            endUserBillingEnabled: Boolean(project.end_user_billing_enabled),
                            rateLimit: {
                                status: 'ok',
                                limit: 120,
                                remaining: 119,
                                reset: Date.now() + 60000,
                            },
                        };

                        return { success: true, context };
                    }
                }
            }
        } catch (err) {
            console.error('[GatewayMiddleware] Playground auth check error:', err);
        }

        return {
            success: false,
            response: addGatewayHeaders(
                NextResponse.json(
                    { error: 'Missing API key. Provide CENCORI_API_KEY header or Authorization: Bearer <key>' },
                    { status: 401 }
                ),
                { requestId }
            ),
        };
    }

    // ── Look up key (with Redis cache) ──
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Try cache first for performance
    const cachedKey = await getCachedApiKeyConfig(keyHash);
    let keyData = cachedKey?.data;
    let keyError = null;

    if (!keyData) {
        const result = await supabase
            .from('api_keys')
            .select(`
                id,
                project_id,
                environment,
                key_type,
                allowed_domains,
                projects!inner(
                    id,
                    name,
                    organization_id,
                    default_model,
                    default_provider,
                    end_user_billing_enabled,
                    organizations!inner(
                        id,
                        subscription_tier,
                        monthly_requests_used,
                        monthly_request_limit,
                        credits_balance,
                        billing_frozen
                    )
                )
            `)
            .eq('key_hash', keyHash)
            .is('revoked_at', null)
            .single();
        
        keyData = result.data;
        keyError = result.error;

        // Cache the result for next time
        if (keyData) {
            await setCachedApiKeyConfig(keyHash, keyData);
        }
    }

    if (keyError || !keyData) {
        return {
            success: false,
            response: addGatewayHeaders(
                NextResponse.json({ error: 'Invalid API key' }, { status: 401 }),
                { requestId }
            ),
        };
    }

    // ── Domain validation for publishable keys ──
    if (keyData.key_type === 'publishable') {
        const origin = req.headers.get('origin') || req.headers.get('referer');
        const allowedDomains = keyData.allowed_domains as string[] | null;

        if (!validateDomain(origin, allowedDomains)) {
            return {
                success: false,
                response: addGatewayHeaders(
                    NextResponse.json(
                        { error: 'Domain not allowed for this API key' },
                        { status: 403 }
                    ),
                    { requestId }
                ),
            };
        }
    }

    // ── Project & Org data ──
    const project = keyData.projects as unknown as {
        id: string;
        name: string;
        organization_id: string;
        default_model: string | null;
        default_provider: string | null;
        end_user_billing_enabled: boolean | null;
        organizations: {
            id: string;
            subscription_tier: string;
            monthly_requests_used: number;
            monthly_request_limit: number;
            credits_balance: string | number | null;
            billing_frozen: boolean | null;
        };
    };

    const organization = project.organizations;
    const organizationId = organization.id;
    const tier = organization.subscription_tier || 'free';
    const billingFrozen = Boolean(organization.billing_frozen);
    
    // ── Credits Fast-Path (Redis) ──
    const shouldEnforceCredits = tier !== 'free' && tier !== 'enterprise';
    let creditsBalance = Number(organization.credits_balance ?? 0);

    if (shouldEnforceCredits) {
        const { getCachedCreditsBalance } = await import('@/lib/config-cache');
        const cachedBalance = await getCachedCreditsBalance(organizationId);
        if (cachedBalance !== null) {
            creditsBalance = cachedBalance;
        }
    }

    if (billingFrozen) {
        return {
            success: false,
            response: addGatewayHeaders(
                NextResponse.json(
                    {
                        error: 'Billing account frozen',
                        message: 'Billing is currently frozen for this organization. Contact support.',
                    },
                    { status: 403 }
                ),
                { requestId }
            ),
        };
    }

    if (shouldEnforceCredits && creditsBalance <= 0) {
        return {
            success: false,
            response: addGatewayHeaders(
                NextResponse.json(
                    {
                        error: 'Credit balance exhausted',
                        message: 'Your organization has run out of credits. Top up to continue.',
                        balance: 0,
                        top_up_url: '/dashboard',
                    },
                    { status: 403 }
                ),
                { requestId }
            ),
        };
    }

    // ── Monthly limit check ──
    const currentUsage = organization.monthly_requests_used || 0;
    const limit = organization.monthly_request_limit || 1000;

    if (currentUsage >= limit) {
        return {
            success: false,
            response: addGatewayHeaders(
                NextResponse.json(
                    {
                        error: 'Monthly request limit reached',
                        message: `You've used ${currentUsage.toLocaleString()} of ${limit.toLocaleString()} requests this month.`,
                        current_tier: tier,
                        usage: {
                            used: currentUsage,
                            limit: limit,
                            percentage: Math.round((currentUsage / limit) * 100)
                        },
                        upgrade_message: tier === 'free'
                            ? 'Upgrade to Pro for 50,000 requests/month'
                            : 'Upgrade your plan to get more requests',
                        upgrade_url: '/billing'
                    },
                    { status: 429 }
                ),
                { requestId }
            ),
        };
    }

    // ── Per-minute rate limit + Spend cap (parallel — these are independent) ──
    const route = req.nextUrl.pathname;
    const [rateLimitResult, spendCapResult] = await Promise.all([
        checkRateLimit(project.id, { requestId, route }),
        checkSpendCap(project.id),
    ]);

    if (!rateLimitResult.allowed) {
        if (rateLimitResult.reason === 'backend_unavailable') {
            return {
                success: false,
                response: addGatewayHeaders(
                    NextResponse.json(
                        {
                            error: 'Rate limit unavailable',
                            message: 'Rate limiting backend is unavailable and fail-open mode is disabled.',
                        },
                        { status: 503 }
                    ),
                    { requestId, rateLimit: rateLimitResult }
                ),
            };
        }

        return {
            success: false,
            response: addGatewayHeaders(
                NextResponse.json(
                    {
                        error: 'Rate limit exceeded',
                        message: `${rateLimitResult.limit} requests per minute allowed. Try again shortly.`,
                        retry_after_ms: rateLimitResult.reset - Date.now(),
                    },
                    { status: 429 }
                ),
                { requestId, rateLimit: rateLimitResult }
            ),
        };
    }

    if (!spendCapResult.allowed) {
        return {
            success: false,
            response: addGatewayHeaders(
                NextResponse.json(
                    {
                        error: 'Spend cap reached',
                        message: spendCapResult.reason || 'Monthly spend cap has been reached.',
                        spend: {
                            current: spendCapResult.status.currentSpend,
                            cap: spendCapResult.status.spendCap,
                        },
                        upgrade_url: '/billing'
                    },
                    { status: 402 }
                ),
                { requestId }
            ),
        };
    }

    // ── Build context ──
    const context: GatewayContext = {
        supabase,
        projectId: project.id,
        organizationId,
        apiKeyId: keyData.id,
        environment: keyData.environment || 'production',
        keyType: keyData.key_type || 'secret',
        tier,
        requestId,
        startTime,
        clientIp,
        countryCode,
        projectName: project.name,
        defaultModel: project.default_model,
        defaultProvider: project.default_provider,
        endUserBillingEnabled: Boolean(project.end_user_billing_enabled),
        rateLimit: {
            status: rateLimitResult.status,
            limit: rateLimitResult.limit,
            remaining: rateLimitResult.remaining,
            reset: rateLimitResult.reset,
        },
    };

    logGatewayEvent('gateway.validation', {
        requestId,
        route,
        projectId: project.id,
        rateLimit: {
            status: rateLimitResult.status,
        },
    });

    // ── Passive Queue Drain (Vercel Free Plan Workaround) ──
    // Every ~20 requests (5% probability), trigger a background drain of the usage queue.
    // This ensures logs are processed without needing a paid Cron job.
    if (Math.random() < 0.05) {
        waitUntil(processUsageQueue(50).catch(err => {
            console.error('[Gateway] Failed to drain usage queue:', err);
        }));
    }

    return { success: true, context };
}

// ──────────────────────────────────────────────
// Response Headers
// ──────────────────────────────────────────────

interface HeaderOptions {
    requestId: string;
    rateLimit?: {
        limit: number;
        remaining: number;
        reset: number;
    };
}

/**
 * Add standard gateway headers to every response:
 * request ID, rate limit info, and CORS.
 */
export function addGatewayHeaders(response: NextResponse, options: HeaderOptions): NextResponse {
    // Request ID
    response.headers.set('X-Request-Id', options.requestId);

    // Rate limit headers
    if (options.rateLimit) {
        response.headers.set('X-RateLimit-Limit', String(options.rateLimit.limit));
        response.headers.set('X-RateLimit-Remaining', String(options.rateLimit.remaining));
        response.headers.set('X-RateLimit-Reset', String(options.rateLimit.reset));
    }

    // CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, CENCORI_API_KEY, X-Cencori-User-IP, X-Cencori-User-Country, X-Cencori-Prompt, X-Cencori-Prompt-Vars');
    response.headers.set('Access-Control-Expose-Headers', 'X-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Cache, X-Cencori-Cache, X-Cache-Similarity');

    return response;
}

/**
 * Create a standard OPTIONS response for CORS preflight.
 */
export function handleCorsPreFlight(): NextResponse {
    const response = new NextResponse(null, { status: 204 });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, CENCORI_API_KEY, X-Cencori-User-IP, X-Cencori-User-Country, X-Cencori-Prompt, X-Cencori-Prompt-Vars');
    response.headers.set('Access-Control-Max-Age', '86400');
    return response;
}

// ──────────────────────────────────────────────
// Logging
// ──────────────────────────────────────────────

/**
 * Log a request to the ai_requests table with full cost tracking.
 * Returns the inserted row id (used by post-success hooks like RagMetrics),
 * or null when the insert fails — logging must never throw.
 */
export async function logGatewayRequest(context: GatewayContext, params: LogRequestParams): Promise<string | null> {
    const latencyMs = Date.now() - context.startTime;

    try {
        const { data } = await context.supabase.from('ai_requests').insert({
            project_id: context.projectId,
            api_key_id: context.apiKeyId,
            environment: context.environment === 'test' ? 'test' : 'production',
            endpoint: params.endpoint,
            model: params.model,
            provider: params.provider,
            status: params.status,
            prompt_tokens: params.promptTokens || 0,
            completion_tokens: params.completionTokens || 0,
            total_tokens: params.totalTokens || 0,
            cost_usd: params.costUsd || 0,
            provider_cost_usd: params.providerCostUsd || 0,
            cencori_charge_usd: params.cencoriChargeUsd || 0,
            markup_percentage: params.markupPercentage || 0,
            latency_ms: latencyMs,
            ip_address: context.clientIp,
            country_code: context.countryCode,
            end_user_id: params.endUserId,
            error_message: params.errorMessage,
            metadata: params.metadata || {},
            // request_payload is NOT NULL in the live schema — omitting it makes
            // the whole insert fail silently (see catch below), losing the log.
            request_payload: params.requestPayload || {},
            response_payload: params.responsePayload,
            request_id: context.requestId,
            fallback_provider: params.fallbackProvider,
            fallback_model: params.fallbackModel,
        }).select('id').single();

        return data?.id ?? null;
    } catch (error) {
        console.error(`[Gateway] Failed to log request ${context.requestId}:`, error);
        return null;
    }
}

async function chargeCreditsForRequest(context: GatewayContext, costUsd?: number): Promise<void> {
    // Free and enterprise tiers are not credit-gated by default.
    if (context.tier === 'free' || context.tier === 'enterprise') {
        return;
    }

    // Use the cost passed directly from the caller (avoids re-querying ai_requests)
    const amount = costUsd ?? 0;
    if (!(amount > 0)) {
        return;
    }

    // Idempotency: deduct_organization_credits inserts blindly, so a retried
    // request (or a double-fired logging path) would double-charge without
    // this reference pre-check.
    try {
        const { data: existingCharge } = await context.supabase
            .from('credit_transactions')
            .select('id')
            .eq('organization_id', context.organizationId)
            .eq('transaction_type', 'usage')
            .eq('reference_id', context.requestId)
            .maybeSingle();
        if (existingCharge?.id) {
            return;
        }
    } catch (error) {
        console.warn(`[Gateway] Charge idempotency check failed for ${context.requestId}:`, error);
    }

    const description = `Usage charge: gateway`;
    const charged = await deductCredits(context.organizationId, amount, description, context.requestId);
    if (!charged) {
        console.warn(`[Gateway] Credit deduction failed for request ${context.requestId}. org=${context.organizationId} amount=${amount}`);
    }
}

/**
 * Increment the monthly usage counter for the organization.
 * Called after a successful request.
 * @param costUsd - The cencori charge for this request (passed directly to avoid re-querying)
 */
export async function incrementUsage(context: GatewayContext, costUsd?: number): Promise<void> {
    try {
        // Update Redis spend counter for fast spend cap checks (fire-and-forget)
        if (costUsd && costUsd > 0) {
            const { incrementSpendCounter } = await import('@/lib/budgets');
            incrementSpendCounter(context.projectId, costUsd);
        }

        await chargeCreditsForRequest(context, costUsd);

        // Try RPC first (atomic increment)
        const { error } = await context.supabase.rpc('increment_monthly_usage', {
            org_id: context.organizationId,
        });

        if (error) {
            // Fallback: read-then-write (less safe but works without RPC)
            const { data } = await context.supabase
                .from('organizations')
                .select('monthly_requests_used')
                .eq('id', context.organizationId)
                .single();

            if (data) {
                await context.supabase
                    .from('organizations')
                    .update({ monthly_requests_used: (data.monthly_requests_used || 0) + 1 })
                    .eq('id', context.organizationId);
            }
        }
    } catch (error) {
        console.error('[Gateway] Failed to increment usage:', error);
    }
}
