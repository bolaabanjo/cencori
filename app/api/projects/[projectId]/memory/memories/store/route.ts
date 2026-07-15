import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
    calculateTokenCharge,
    chargeProjectUsageCredits,
    parseCreditsBalance,
    shouldEnforceProjectCredits,
} from "@/lib/project-credit-billing";
import { decryptApiKey } from '@/lib/encryption';
import { getPricingFromDB } from '@/lib/providers/pricing';
import { runGatewayInputPipeline } from '@/lib/gateway/input-guard';
import type { SubscriptionTier } from '@/lib/entitlements';

interface RouteParams {
    params: Promise<{ projectId: string }>;
}

// Helper to get authenticated user
async function getAuthUser() {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

// Admin client for DB operations
const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST: Store a new memory
export async function POST(request: NextRequest, context: RouteParams) {
    try {
        const user = await getAuthUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { projectId } = await context.params;
        const body = await request.json();
        const { namespace_id, content, metadata } = body;

        if (!namespace_id) {
            return NextResponse.json({ error: "Namespace ID is required" }, { status: 400 });
        }

        if (!content || typeof content !== "string" || content.length > 32_000) {
            return NextResponse.json({ error: "Content is required" }, { status: 400 });
        }

        // Verify user has access to project
        const { data: project, error: projectError } = await adminClient
            .from("projects")
            .select("id, organization_id, organizations!inner(subscription_tier, credits_balance, billing_frozen)")
            .eq("id", projectId)
            .single();

        if (projectError || !project) {
            console.error("Project lookup failed:", projectError);
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        const organization = project.organizations as unknown as {
            subscription_tier: string | null;
            credits_balance: number | string | null;
            billing_frozen: boolean | null;
        };
        const tier = organization?.subscription_tier || "free";
        const billingFrozen = Boolean(organization?.billing_frozen);
        const creditsBalance = parseCreditsBalance(organization?.credits_balance);
        const shouldEnforceCredits = shouldEnforceProjectCredits(tier);

        if (billingFrozen) {
            return NextResponse.json(
                {
                    error: "Billing account frozen",
                    message: "Billing is currently frozen for this organization. Contact support.",
                },
                { status: 403 }
            );
        }

        if (shouldEnforceCredits && creditsBalance <= 0) {
            return NextResponse.json(
                {
                    error: "Credit balance exhausted",
                    message: "Your organization has run out of credits. Top up to continue.",
                    balance: 0,
                },
                { status: 403 }
            );
        }

        // Check user is member of organization
        const { data: member } = await adminClient
            .from("organization_members")
            .select("role")
            .eq("organization_id", project.organization_id)
            .eq("user_id", user.id)
            .single();

        if (!member) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Verify namespace belongs to project
        const { data: namespace } = await adminClient
            .from("memory_namespaces")
            .select("id")
            .eq("id", namespace_id)
            .eq("project_id", projectId)
            .single();

        if (!namespace) {
            return NextResponse.json({ error: "Namespace not found" }, { status: 404 });
        }

        const inputPipeline = await runGatewayInputPipeline({
            supabase: adminClient as never,
            projectId,
            environment: 'production',
            tier: tier as SubscriptionTier,
            messages: [{ role: 'user', content }],
        });
        if (!inputPipeline.ok) {
            return NextResponse.json(
                { error: inputPipeline.code, message: inputPipeline.message },
                { status: inputPipeline.status },
            );
        }
        const guardedContent = inputPipeline.messages[0]?.content ?? content;

        // Generate embedding using OpenAI
        await getPricingFromDB('openai', 'text-embedding-3-small');
        const { data: providerKey } = await adminClient
            .from('provider_keys')
            .select('encrypted_key')
            .eq('project_id', projectId)
            .eq('provider', 'openai')
            .eq('is_active', true)
            .maybeSingle();
        const openaiKey = providerKey?.encrypted_key
            ? decryptApiKey(providerKey.encrypted_key, project.organization_id)
            : process.env.OPENAI_API_KEY;
        if (!openaiKey) {
            return NextResponse.json({ error: 'No OpenAI API key configured' }, { status: 400 });
        }
        const openai = new OpenAI({ apiKey: openaiKey, timeout: 55_000, maxRetries: 0 });
        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: guardedContent,
        });
        const embedding = embeddingResponse.data[0].embedding;

        const promptTokens = embeddingResponse.usage?.prompt_tokens ?? 0;
        const totalTokens = embeddingResponse.usage?.total_tokens ?? promptTokens;
        const { cencoriChargeUsd } = await calculateTokenCharge(
            "openai",
            "text-embedding-3-small",
            totalTokens,
            0
        );

        const charged = await chargeProjectUsageCredits(
            project.organization_id,
            tier,
            cencoriChargeUsd,
            "projects/memory/memories/store"
        );

        if (!charged) {
            return NextResponse.json(
                {
                    error: "INSUFFICIENT_CREDITS",
                    message: "Unable to charge credits for this request.",
                },
                { status: 402 }
            );
        }

        // Store the memory
        const { data: memory, error } = await adminClient
            .from("memories")
            .insert({
                namespace_id,
                content: guardedContent,
                metadata: metadata || {},
                embedding,
            })
            .select("id, content, metadata, created_at")
            .single();

        if (error) {
            console.error("Error storing memory:", error);
            return NextResponse.json({ error: "Failed to store memory" }, { status: 500 });
        }

        return NextResponse.json({ memory }, { status: 201 });

    } catch (error) {
        console.error("Error in memories POST:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
