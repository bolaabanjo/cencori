/**
 * Regulator-ready evidence packs (PRD M2).
 *
 * For a given framework (CBN-AML, NDPR, ISO-42001, SR-11-7, PCI-DSS…), produce
 * machine-generated proof from the immutable ledger: the chain is complete &
 * verified, and here is every control, how many times it was enforced, broken
 * down by decision, which policies enforce it, with sample proof entries. This
 * is what an auditor / regulator gets — and what no observe-only competitor can
 * produce, because they don't enforce in-path.
 */

import type { createAdminClient } from '@/lib/supabaseAdmin';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export interface EvidenceControl {
    control: string;
    enforcements: number;
    byDecision: Record<string, number>;
    policies: string[];
    samples: Array<{ seq: number; ts: string; decision: string | null; rationale: string | null }>;
}

export interface EvidencePack {
    orgId: string;
    framework: string;
    generatedAt: string;
    period: { from: string | null; to: string | null };
    chain: { ok: boolean; entries: number; pendingDeadletter: number; complete: boolean };
    controls: EvidenceControl[];
    summary: { totalEnforcements: number; byDecision: Record<string, number> };
    /** True when the fetch hit the row cap (report is partial — narrow the period). */
    truncated: boolean;
}

const MAX_ROWS = 5000;

/** A control tag belongs to a framework if it equals it or is namespaced under it. */
export function controlMatchesFramework(control: string, framework: string): boolean {
    return control === framework || control.startsWith(`${framework}:`);
}

export async function generateEvidencePack(
    supabase: SupabaseAdmin,
    p: { orgId: string; framework: string; from?: string | null; to?: string | null },
): Promise<EvidencePack> {
    // 1. Chain health — completeness + integrity for the whole org.
    const { data: healthData } = await supabase.rpc('governance_ledger_health', { p_org_id: p.orgId });
    const health = (Array.isArray(healthData) ? healthData[0] : healthData) as
        | { chain_ok?: boolean; entries?: number | string; pending_deadletter?: number | string; complete?: boolean }
        | null;

    // 2. Ledger entries in the period.
    let query = supabase
        .from('governance_audit_ledger')
        .select('seq, ts, decision, rationale, event_type, payload')
        .eq('org_id', p.orgId)
        .order('seq', { ascending: false })
        .limit(MAX_ROWS);
    if (p.from) query = query.gte('ts', p.from);
    if (p.to) query = query.lte('ts', p.to);
    const { data: rows } = await query;
    const allRows = (rows ?? []) as Array<{
        seq: number; ts: string; decision: string | null; rationale: string | null;
        event_type: string; payload: { controls?: string[] } | null;
    }>;

    const controlsOf = (r: { payload: { controls?: string[] } | null }): string[] =>
        (r.payload?.controls ?? []).filter(c => controlMatchesFramework(c, p.framework));

    const matches = allRows.filter(r => controlsOf(r).length > 0);

    const byControl = new Map<string, EvidenceControl & { _policies: Set<string> }>();
    const summaryByDecision: Record<string, number> = {};

    for (const r of matches) {
        const decision = r.decision ?? r.event_type;
        summaryByDecision[decision] = (summaryByDecision[decision] ?? 0) + 1;
        for (const c of controlsOf(r)) {
            let e = byControl.get(c);
            if (!e) {
                e = { control: c, enforcements: 0, byDecision: {}, policies: [], samples: [], _policies: new Set() };
                byControl.set(c, e);
            }
            e.enforcements++;
            e.byDecision[decision] = (e.byDecision[decision] ?? 0) + 1;
            if (e.samples.length < 5) e.samples.push({ seq: r.seq, ts: r.ts, decision: r.decision, rationale: r.rationale });
        }
    }

    // 3. Active policies tagged with the framework → attribute to controls.
    const { data: policies } = await supabase
        .from('governance_policies')
        .select('name, version, spec')
        .eq('org_id', p.orgId)
        .eq('status', 'active');
    for (const pol of (policies ?? []) as Array<{ name: string; version: number; spec: { controls?: string[] } }>) {
        for (const c of pol.spec?.controls ?? []) {
            if (controlMatchesFramework(c, p.framework) && byControl.has(c)) {
                byControl.get(c)!._policies.add(`${pol.name} v${pol.version}`);
            }
        }
    }

    return {
        orgId: p.orgId,
        framework: p.framework,
        generatedAt: new Date().toISOString(),
        period: { from: p.from ?? null, to: p.to ?? null },
        chain: {
            ok: !!health?.chain_ok,
            entries: Number(health?.entries ?? 0),
            pendingDeadletter: Number(health?.pending_deadletter ?? 0),
            complete: !!health?.complete,
        },
        controls: [...byControl.values()].map(({ _policies, ...e }) => ({ ...e, policies: [..._policies] })),
        summary: { totalEnforcements: matches.length, byDecision: summaryByDecision },
        truncated: allRows.length >= MAX_ROWS,
    };
}
