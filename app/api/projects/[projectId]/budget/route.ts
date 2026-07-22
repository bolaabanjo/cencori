import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { getBudgetStatus, updateBudgetSettings } from '@/lib/budgets';
import { writeAuditLog } from '@/lib/audit-log';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;

    try {
        const supabase = createAdminClient();

        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .single();

        if (projectError || !project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const gate = await requireTierFeatureForProject(projectId, 'costTracking');
        if (gate) return gate;

        const status = await getBudgetStatus(projectId);

        return NextResponse.json({
            monthly_budget: status.monthlyBudget,
            spend_cap: status.spendCap,
            enforce_spend_cap: status.enforceSpendCap,
            budget_alerts_enabled: status.alertsEnabled,
            current_spend: status.currentSpend,
            percent_used: status.percentUsed,
            is_cap_reached: status.isCapReached,
        });
    } catch (error) {
        console.error('[Budget Settings] GET error:', error);
        return NextResponse.json({ error: 'Failed to fetch budget settings' }, { status: 500 });
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const supabase = createAdminClient();

    try {
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .single();

        if (projectError || !project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const gate = await requireTierFeatureForProject(projectId, 'costTracking');
        if (gate) return gate;

        const body = await req.json();

        const settings: {
            monthlyBudget?: number | null;
            spendCap?: number | null;
            enforceSpendCap?: boolean;
            alertsEnabled?: boolean;
        } = {};

        if ('monthly_budget' in body) {
            settings.monthlyBudget = body.monthly_budget === null ? null : parseFloat(body.monthly_budget);
            if (settings.monthlyBudget !== null && (isNaN(settings.monthlyBudget) || settings.monthlyBudget < 0)) {
                return NextResponse.json({ error: 'Invalid monthly_budget' }, { status: 400 });
            }
        }

        if ('spend_cap' in body) {
            settings.spendCap = body.spend_cap === null ? null : parseFloat(body.spend_cap);
            if (settings.spendCap !== null && (isNaN(settings.spendCap) || settings.spendCap < 0)) {
                return NextResponse.json({ error: 'Invalid spend_cap' }, { status: 400 });
            }
        }

        if ('enforce_spend_cap' in body) {
            settings.enforceSpendCap = Boolean(body.enforce_spend_cap);
        }

        if ('budget_alerts_enabled' in body) {
            settings.alertsEnabled = Boolean(body.budget_alerts_enabled);
        }

        const result = await updateBudgetSettings(projectId, settings);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        const status = await getBudgetStatus(projectId);

        const { data: budgetProject } = await supabase
            .from('projects')
            .select('organization_id')
            .eq('id', projectId)
            .single();

        writeAuditLog({
            organizationId: budgetProject?.organization_id || '',
            projectId,
            category: 'budget',
            action: 'updated',
            resourceType: 'budget_settings',
            resourceId: projectId,
            actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            actorType: 'user',
            description: 'Updated budget settings',
            metadata: { changes: settings },
        });

        return NextResponse.json({
            success: true,
            monthly_budget: status.monthlyBudget,
            spend_cap: status.spendCap,
            enforce_spend_cap: status.enforceSpendCap,
            budget_alerts_enabled: status.alertsEnabled,
            current_spend: status.currentSpend,
            percent_used: status.percentUsed,
            is_cap_reached: status.isCapReached,
        });
    } catch (error) {
        console.error('[Budget Settings] PUT error:', error);
        return NextResponse.json({ error: 'Failed to update budget settings' }, { status: 500 });
    }
}
