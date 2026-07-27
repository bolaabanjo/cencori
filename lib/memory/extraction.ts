/**
 * Fact extraction — the "what should we remember from this exchange?" LLM
 * call. Runs post-response (async), uses the project's configured extraction
 * model via the internal chat executor (no second pass through gateway auth).
 *
 * Never throws: any failure returns zero facts.
 */

import type { createAdminClient } from '@/lib/supabaseAdmin';
import { callMemoryLlm } from './llm';
import type { SubscriptionTier } from '@/lib/entitlements';
import {
    MEMORY_CONTENT_MAX_CHARS,
    resolveMemoryModel,
    type ExtractedFact,
    type MemoryExtractOverride,
    type MemorySettings,
} from './types';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export const DEFAULT_EXTRACTION_PROMPT = `You extract durable facts about the user from a conversation exchange, for long-term memory.

Rules:
- Only extract facts worth remembering across future conversations: preferences, context about their work or projects, constraints, decisions, corrections.
- Skip small talk, one-off requests, and anything relevant only to this exchange.
- Never include secrets, passwords, API keys, or verbatim sensitive data (emails, phone numbers, government IDs) — describe the fact without the sensitive value if needed.
- Each fact must be a single, self-contained sentence.

Respond with ONLY a JSON array (no prose, no code fences):
[{"fact": "...", "importance": 0.0-1.0}]

importance: 0.9+ = core durable fact (name, role, main project), 0.7 = strong preference or decision, 0.5 = useful context, below 0.5 = trivia.

If nothing is worth remembering, respond with [].`;

export interface ExtractFactsResult {
    facts: ExtractedFact[];
    costUsd: number;
    model: string;
}

export async function extractFacts(params: {
    supabase: SupabaseAdmin;
    projectId: string;
    organizationId: string;
    tier: SubscriptionTier;
    settings: MemorySettings;
    extractOverride: MemoryExtractOverride | null;
    userText: string;
    assistantText: string;
    requestId?: string;
}): Promise<ExtractFactsResult> {
    const {
        supabase, projectId, organizationId, tier,
        settings, extractOverride, userText, assistantText, requestId,
    } = params;

    // Managed memory model preference (Gemini or open GPT-OSS) — pins the first
    // provider in the fan-out; callMemoryLlm falls across the rest if it fails.
    const preferModel = resolveMemoryModel(extractOverride?.model || settings.extractionModel);
    const minImportance = extractOverride?.minImportance ?? settings.minImportance;
    const systemPrompt =
        extractOverride?.prompt || settings.extractionPrompt || DEFAULT_EXTRACTION_PROMPT;

    try {
        // Fan out across Cerebras → Groq → Gemini; first provider to answer wins.
        const response = await callMemoryLlm({
            supabase,
            projectId,
            organizationId,
            tier,
            requestId,
            preferModel,
            maxTokens: 500,
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content:
                        `Exchange to analyze:\n\n` +
                        `USER:\n${userText.slice(0, 8000)}\n\n` +
                        `ASSISTANT:\n${assistantText.slice(0, 8000)}`,
                },
            ],
        });
        if (!response) {
            // Whole chain exhausted — fail open with zero facts.
            return { facts: [], costUsd: 0, model: preferModel };
        }

        const facts = parseExtractionOutput(response.content);
        const filtered = facts
            .filter(f => f.importance >= minImportance)
            .slice(0, settings.maxMemoriesPerExchange)
            .map(f => ({
                content: f.content.slice(0, MEMORY_CONTENT_MAX_CHARS),
                importance: f.importance,
            }));

        return {
            facts: filtered,
            costUsd: response.costUsd,
            model: response.model,
        };
    } catch (error) {
        console.warn('[Memory] Fact extraction failed:', error);
        return { facts: [], costUsd: 0, model: preferModel };
    }
}

/** Defensive parse of the extraction model's output. Exported for tests. */
export function parseExtractionOutput(raw: string): ExtractedFact[] {
    if (!raw) return [];

    // Strip code fences the model may add despite instructions.
    let text = raw.trim();
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
        text = fenceMatch[1].trim();
    }

    // Grab the first JSON array if the model added prose around it.
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        text = arrayMatch[0];
    }

    try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map(item => {
                if (!item || typeof item !== 'object') return null;
                const content =
                    typeof item.fact === 'string' ? item.fact.trim()
                    : typeof item.content === 'string' ? item.content.trim()
                    : '';
                if (!content) return null;

                const importanceRaw = typeof item.importance === 'number' ? item.importance : 0.5;
                const importance = Math.min(1, Math.max(0, importanceRaw));

                return { content, importance } satisfies ExtractedFact;
            })
            .filter((f): f is ExtractedFact => f !== null);
    } catch {
        return [];
    }
}
