import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
    parseCreditsBalance,
    shouldEnforceProjectCredits,
} from "@/lib/project-credit-billing";
import { invalidateCreditsBalance } from '@/lib/config-cache';
import { decryptApiKey } from '@/lib/encryption';
import { getPricingFromDB } from '@/lib/providers/pricing';
import { calculateProviderTokenCost } from '@/lib/providers/base';
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

// Chunk text into smaller pieces
function chunkText(text: string, chunkSize: number = 1000, overlap: number = 100): string[] {
    const chunks: string[] = [];
    let start = 0;

    // Clean the text
    text = text.replace(/\s+/g, ' ').trim();

    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        let chunk = text.slice(start, end);

        // Try to break at sentence boundary
        if (end < text.length) {
            const lastPeriod = chunk.lastIndexOf('.');
            const lastQuestion = chunk.lastIndexOf('?');
            const lastExclaim = chunk.lastIndexOf('!');
            const lastBreak = Math.max(lastPeriod, lastQuestion, lastExclaim);

            if (lastBreak > chunkSize * 0.5) {
                chunk = chunk.slice(0, lastBreak + 1);
            }
        }

        chunks.push(chunk.trim());
        start = start + chunk.length - overlap;

        // Prevent infinite loop
        if (start <= 0 && chunks.length > 1) break;
        if (chunks.length > 100) break; // Max 100 chunks per document
    }

    return chunks.filter(c => c.length > 10);
}

// POST: Upload and process a document
export async function POST(request: NextRequest, context: RouteParams) {
    try {
        const user = await getAuthUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { projectId } = await context.params;
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const namespaceId = formData.get("namespace_id") as string | null;

        if (!file) {
            return NextResponse.json({ error: "File is required" }, { status: 400 });
        }

        if (!namespaceId) {
            return NextResponse.json({ error: "Namespace ID is required" }, { status: 400 });
        }

        // Check file type
        const allowedTypes = ["text/plain", "text/markdown"];
        if (!allowedTypes.includes(file.type) && !file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
            return NextResponse.json({ error: "Only TXT and Markdown files are supported" }, { status: 400 });
        }

        // Check file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            return NextResponse.json({ error: "File size exceeds 2MB limit" }, { status: 400 });
        }

        // Verify user has access to project
        const { data: project } = await adminClient
            .from("projects")
            .select("id, organization_id, organizations!inner(subscription_tier, credits_balance, billing_frozen)")
            .eq("id", projectId)
            .single();

        if (!project) {
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
        const { data: membership } = await adminClient
            .from("organization_members")
            .select("id")
            .eq("organization_id", project.organization_id)
            .eq("user_id", user.id)
            .single();

        if (!membership) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Verify namespace belongs to project
        const { data: namespace } = await adminClient
            .from("memory_namespaces")
            .select("id")
            .eq("id", namespaceId)
            .eq("project_id", projectId)
            .single();

        if (!namespace) {
            return NextResponse.json({ error: "Namespace not found" }, { status: 404 });
        }

        // Extract text from file
        let text: string;
        text = await file.text();

        if (!text.trim()) {
            return NextResponse.json({ error: "File appears to be empty" }, { status: 400 });
        }

        const inputPipeline = await runGatewayInputPipeline({
            supabase: adminClient as never,
            projectId,
            environment: 'production',
            tier: tier as SubscriptionTier,
            messages: [{ role: 'user', content: text }],
        });
        if (!inputPipeline.ok) {
            return NextResponse.json(
                { error: inputPipeline.code, message: inputPipeline.message },
                { status: inputPipeline.status },
            );
        }
        text = inputPipeline.messages[0]?.content ?? text;

        // Chunk the document
        const chunks = chunkText(text);

        if (chunks.length === 0) {
            return NextResponse.json({ error: "Could not extract text from file" }, { status: 400 });
        }

        // Generate embeddings and atomically persist/bill each completed batch.
        const pricing = await getPricingFromDB('openai', 'text-embedding-3-small');
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

        const uploadId = crypto.randomUUID();
        let storedChunks = 0;

        // Process chunks in batches of 10. Each provider call is followed by a
        // single DB transaction that stores that batch and charges its exact
        // token usage, so partial failures remain internally consistent.
        for (let i = 0; i < chunks.length; i += 10) {
            const batch = chunks.slice(i, i + 10);
            let embeddingResponse;
            try {
                embeddingResponse = await openai.embeddings.create({
                    model: "text-embedding-3-small",
                    input: batch,
                });
            } catch (error) {
                console.error('Embedding provider failed during memory upload:', error);
                return NextResponse.json(
                    {
                        error: 'Embedding provider unavailable',
                        partial: storedChunks > 0,
                        chunks_created: storedChunks,
                        upload_id: uploadId,
                    },
                    { status: 502 }
                );
            }

            const memories: Array<{
                content: string;
                metadata: object;
                embedding: number[];
            }> = [];

            for (let j = 0; j < batch.length; j++) {
                const embedding = embeddingResponse.data[j]?.embedding;
                if (!embedding || embedding.length !== 1536) {
                    return NextResponse.json(
                        {
                            error: 'Embedding provider returned an invalid response',
                            partial: storedChunks > 0,
                            chunks_created: storedChunks,
                            upload_id: uploadId,
                        },
                        { status: 502 }
                    );
                }

                memories.push({
                    content: batch[j],
                    metadata: {
                        source: file.name,
                        chunk_index: i + j,
                        total_chunks: chunks.length,
                        upload_id: uploadId,
                    },
                    embedding,
                });
            }

            const embeddingTokens = embeddingResponse.usage?.total_tokens;
            if (!Number.isSafeInteger(embeddingTokens) || embeddingTokens < 0) {
                return NextResponse.json(
                    {
                        error: 'Embedding provider did not return billable token usage',
                        partial: storedChunks > 0,
                        chunks_created: storedChunks,
                        upload_id: uploadId,
                    },
                    { status: 502 }
                );
            }

            const providerCostUsd = calculateProviderTokenCost(embeddingTokens, 0, pricing);
            const cencoriChargeUsd = shouldEnforceCredits
                ? providerCostUsd * (1 + pricing.cencoriMarkupPercentage / 100)
                    + (i === 0 ? pricing.fixedFeePerRequest ?? 0 : 0)
                : 0;
            const batchNumber = Math.floor(i / 10);
            const { data: rpcData, error: rpcError } = await adminClient.rpc(
                'store_memory_batch_and_charge',
                {
                    p_organization_id: project.organization_id,
                    p_project_id: projectId,
                    p_namespace_id: namespaceId,
                    p_amount: cencoriChargeUsd,
                    p_description: 'Usage charge: projects/memory/upload',
                    p_reference_id: `memory-upload:${uploadId}:${batchNumber}`,
                    p_memories: memories,
                }
            );
            const rpcResult = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
                success?: boolean;
                error_message?: string | null;
                inserted_count?: number;
            } | null;

            if (rpcError || !rpcResult?.success) {
                console.error('Atomic memory upload batch failed:', rpcError || rpcResult?.error_message);
                const insufficient = rpcResult?.error_message === 'Insufficient balance';
                return NextResponse.json(
                    {
                        error: insufficient ? 'INSUFFICIENT_CREDITS' : 'Failed to store memory batch',
                        message: insufficient
                            ? 'Unable to charge credits for this batch.'
                            : 'The completed batch was not stored or charged.',
                        partial: storedChunks > 0,
                        chunks_created: storedChunks,
                        upload_id: uploadId,
                    },
                    { status: insufficient ? 402 : 500 }
                );
            }

            storedChunks += rpcResult.inserted_count ?? memories.length;
            if (cencoriChargeUsd > 0) {
                await invalidateCreditsBalance(project.organization_id);
            }
        }

        return NextResponse.json({
            success: true,
            file_name: file.name,
            chunks_created: storedChunks,
            upload_id: uploadId,
            message: `Successfully created ${storedChunks} memories from "${file.name}"`,
        }, { status: 201 });

    } catch (error) {
        console.error("Error in document upload:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
