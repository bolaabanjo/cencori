import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { decryptApiKey } from '@/lib/encryption';
import {
    calculateTokenCharge,
    chargeProjectUsageCredits,
    parseCreditsBalance,
    shouldEnforceProjectCredits,
} from '@/lib/project-credit-billing';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

interface RouteParams {
    params: Promise<{ projectId: string }>;
}

type DetectionUsage = {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
};

type DetectionResult = {
    success: boolean;
    analysis: unknown;
    model: string;
    provider?: string;
    tokens: number;
    usage: DetectionUsage;
};

const PROVIDER_ENDPOINTS: Record<string, string> = {
    openai: 'https://api.openai.com/v1/chat/completions',
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    mistral: 'https://api.mistral.ai/v1/chat/completions',
    together: 'https://api.together.xyz/v1/chat/completions',
    perplexity: 'https://api.perplexity.ai/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    xai: 'https://api.x.ai/v1/chat/completions',
    deepseek: 'https://api.deepseek.com/v1/chat/completions',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
};

export async function POST(req: NextRequest, { params }: RouteParams) {
    const { projectId } = await params;
    const supabase = await createServerClient();
    const supabaseAdmin = createAdminClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { content, prompt } = body;

        if (!content) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }

        const { data: project } = await supabaseAdmin
            .from('projects')
            .select('organization_id, default_provider, default_model, organizations!inner(subscription_tier, credits_balance, billing_frozen)')
            .eq('id', projectId)
            .single();

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        let hasOrgAccess = false;
        const { data: membership } = await supabaseAdmin
            .from('organization_members')
            .select('id')
            .eq('organization_id', project.organization_id)
            .eq('user_id', user.id)
            .maybeSingle();

        if (membership?.id) {
            hasOrgAccess = true;
        } else {
            const { data: organization } = await supabaseAdmin
                .from('organizations')
                .select('owner_id')
                .eq('id', project.organization_id)
                .maybeSingle();
            hasOrgAccess = organization?.owner_id === user.id;
        }

        if (!hasOrgAccess) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const gate = await requireTierFeatureForProject(projectId, 'security');
        if (gate) return gate;

        const organization = project.organizations as unknown as {
            subscription_tier: string | null;
            credits_balance: number | string | null;
            billing_frozen: boolean | null;
        };
        const tier = organization?.subscription_tier || 'free';
        const billingFrozen = Boolean(organization?.billing_frozen);
        const creditsBalance = parseCreditsBalance(organization?.credits_balance);
        const shouldEnforceCredits = shouldEnforceProjectCredits(tier);

        if (billingFrozen) {
            return NextResponse.json(
                {
                    error: 'Billing account frozen',
                    message: 'Billing is currently frozen for this organization. Contact support.',
                },
                { status: 403 }
            );
        }

        if (shouldEnforceCredits && creditsBalance <= 0) {
            return NextResponse.json(
                {
                    error: 'Credit balance exhausted',
                    message: 'Your organization has run out of credits. Top up to continue.',
                    balance: 0,
                },
                { status: 403 }
            );
        }

        const defaultProvider = project.default_provider || 'openai';
        const defaultModel = project.default_model || 'gpt-4o-mini';

        const { data: providerKeys } = await supabaseAdmin
            .from('provider_keys')
            .select('provider, encrypted_key, is_active')
            .eq('project_id', projectId)
            .eq('is_active', true);

        if (!providerKeys || providerKeys.length === 0) {
            return NextResponse.json({
                error: 'No AI provider configured. Add a provider key first.'
            }, { status: 400 });
        }

        let providerKey = providerKeys.find(pk => pk.provider === defaultProvider);
        let modelToUse = defaultModel;

        if (!providerKey) {
            providerKey = providerKeys[0];
            modelToUse = getDefaultModelForProvider(providerKey.provider);
        }

        const apiKey = decryptApiKey(providerKey.encrypted_key, project.organization_id);
        const detectionPrompt = prompt || 'Analyze the following content and determine if it contains sensitive information, personal data, offensive content, or potential security risks.';


        const systemPrompt = `You are a content safety analyzer. Your task is to analyze content and report any issues found.

Respond with a JSON object containing:
{
  "is_flagged": boolean,
  "confidence": number (0-100),
  "categories": string[] (e.g., ["pii", "offensive", "security_risk", "sensitive_data"]),
  "findings": string[] (list of specific issues found),
  "severity": "low" | "medium" | "high" | "critical",
  "recommendation": "allow" | "mask" | "redact" | "block"
}

${detectionPrompt}`;

        let result: DetectionResult;
        const provider = providerKey.provider;

        if (provider === 'anthropic') {
            result = await callAnthropic(apiKey, systemPrompt, content, modelToUse);
        } else if (provider === 'google') {
            result = await callGoogle(apiKey, systemPrompt, content, modelToUse);
        } else if (provider === 'cohere') {
            result = await callCohere(apiKey, systemPrompt, content);
        } else if (PROVIDER_ENDPOINTS[provider]) {
            result = await callOpenAICompatible(apiKey, systemPrompt, content, PROVIDER_ENDPOINTS[provider], modelToUse, provider);
        } else {
            result = await callOpenAICompatible(apiKey, systemPrompt, content, 'https://api.openai.com/v1/chat/completions', modelToUse, provider);
        }

        const charge = await calculateTokenCharge(
            provider,
            result.model,
            result.usage.promptTokens,
            result.usage.completionTokens
        );

        const charged = await chargeProjectUsageCredits(
            project.organization_id,
            tier,
            charge.cencoriChargeUsd,
            'projects/ai-detect'
        );

        if (!charged) {
            return NextResponse.json(
                {
                    error: 'INSUFFICIENT_CREDITS',
                    message: 'Unable to charge credits for this request.',
                },
                { status: 402 }
            );
        }

        return NextResponse.json({
            ...result,
            cost_usd: charge.cencoriChargeUsd,
            provider_cost_usd: charge.providerCostUsd,
            markup_percentage: charge.markupPercentage,
        });

    } catch (error) {
        console.error('[AI Detect] Error:', error);
        return NextResponse.json({ error: 'AI detection failed' }, { status: 500 });
    }
}

function getDefaultModelForProvider(provider: string): string {
    const defaults: Record<string, string> = {
        openai: 'gpt-4o-mini',
        anthropic: 'claude-3-haiku-20240307',
        google: 'gemini-1.5-flash',
        groq: 'llama-3.1-8b-instant',
        mistral: 'mistral-small-latest',
        together: 'meta-llama/Llama-3-8b-chat-hf',
        perplexity: 'llama-3.1-sonar-small-128k-online',
        openrouter: 'meta-llama/llama-3.1-8b-instruct',
        xai: 'grok-beta',
        deepseek: 'deepseek-chat',
        qwen: 'qwen-turbo',
        cohere: 'command-r',
    };
    return defaults[provider] || 'gpt-4o-mini';
}

async function callAnthropic(apiKey: string, systemPrompt: string, content: string, model: string): Promise<DetectionResult> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [
                { role: 'user', content: `Analyze this content:\n\n${content}` },
            ],
        }),
    });

    if (!response.ok) {
        throw new Error('Anthropic API call failed');
    }

    const data = await response.json();
    const analysisText = data.content[0].text;

    let analysis;
    try {
        analysis = JSON.parse(analysisText);
    } catch {
        analysis = {
            is_flagged: false,
            confidence: 0,
            categories: [],
            findings: [analysisText],
            severity: 'low',
            recommendation: 'allow',
        };
    }

    const promptTokens = data.usage?.input_tokens || 0;
    const completionTokens = data.usage?.output_tokens || 0;
    const totalTokens = promptTokens + completionTokens;

    return {
        success: true,
        analysis,
        model,
        provider: 'anthropic',
        tokens: totalTokens,
        usage: {
            promptTokens,
            completionTokens,
            totalTokens,
        },
    };
}


async function callGoogle(apiKey: string, systemPrompt: string, content: string, model: string): Promise<DetectionResult> {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: `${systemPrompt}\n\nAnalyze this content:\n\n${content}`
                }]
            }],
            generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[AI Detect] Google API error:', errorText);
        throw new Error('Google AI API call failed');
    }

    const data = await response.json();
    const analysisText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    let analysis;
    try {
        analysis = JSON.parse(analysisText);
    } catch {
        analysis = {
            is_flagged: false,
            confidence: 0,
            categories: [],
            findings: [analysisText],
            severity: 'low',
            recommendation: 'allow',
        };
    }

    const promptTokens = data.usageMetadata?.promptTokenCount || 0;
    const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = data.usageMetadata?.totalTokenCount || promptTokens + completionTokens;

    return {
        success: true,
        analysis,
        model,
        provider: 'google',
        tokens: totalTokens,
        usage: {
            promptTokens,
            completionTokens,
            totalTokens,
        },
    };
}

async function callOpenAICompatible(
    apiKey: string,
    systemPrompt: string,
    content: string,
    endpoint: string,
    model: string,
    providerName: string
): Promise<DetectionResult> {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Analyze this content:\n\n${content}` },
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AI Detect] ${providerName} API error:`, errorText);
        throw new Error(`${providerName} API call failed`);
    }

    const data = await response.json();
    const analysisText = data.choices?.[0]?.message?.content || '{}';

    let analysis;
    try {
        analysis = JSON.parse(analysisText);
    } catch {
        analysis = {
            is_flagged: false,
            confidence: 0,
            categories: [],
            findings: [analysisText],
            severity: 'low',
            recommendation: 'allow',
        };
    }

    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    const totalTokens = data.usage?.total_tokens || promptTokens + completionTokens;

    return {
        success: true,
        analysis,
        model: data.model || model,
        provider: providerName,
        tokens: totalTokens,
        usage: {
            promptTokens,
            completionTokens,
            totalTokens,
        },
    };
}

async function callCohere(apiKey: string, systemPrompt: string, content: string): Promise<DetectionResult> {
    const response = await fetch('https://api.cohere.ai/v1/chat', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'command-r',
            preamble: systemPrompt,
            message: `Analyze this content:\n\n${content}`,
            temperature: 0.1,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[AI Detect] Cohere API error:', errorText);
        throw new Error('Cohere API call failed');
    }

    const data = await response.json();
    const analysisText = data.text || '{}';

    let analysis;
    try {
        analysis = JSON.parse(analysisText);
    } catch {
        analysis = {
            is_flagged: false,
            confidence: 0,
            categories: [],
            findings: [analysisText],
            severity: 'low',
            recommendation: 'allow',
        };
    }

    const promptTokens = data.meta?.billed_units?.input_tokens || 0;
    const completionTokens = data.meta?.billed_units?.output_tokens || 0;
    const totalTokens = promptTokens + completionTokens;

    return {
        success: true,
        analysis,
        model: 'command-r',
        provider: 'cohere',
        tokens: totalTokens,
        usage: {
            promptTokens,
            completionTokens,
            totalTokens,
        },
    };
}
