import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import {
    getAIGatewayMetrics,
    getSecurityMetrics,
    getOrganizationsMetrics,
    getProjectsMetrics,
    getApiKeysMetrics,
    getUsersMetrics,
    getBillingMetrics,
    getScanMetrics,
    getPlatformEventsMetrics,
    getCaptureMetrics
} from '@/internal/analytics/lib/queries';
import type { TimePeriod } from '@/internal/analytics/lib/types';
import { isFounderEmail } from '@/lib/internal-admin-auth';

async function isAuthorizedAdmin(email: string): Promise<boolean> {
    if (isFounderEmail(email)) {
        return true;
    }

    const supabase = createAdminClient();
    const { data: admin } = await supabase
        .from('cencori_admins')
        .select('id')
        .eq('email', email.toLowerCase())
        .eq('status', 'active')
        .single();
    return !!admin;
}

export async function GET(req: NextRequest) {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAllowed = await isAuthorizedAdmin(user.email);

    if (!isAllowed) {
        return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const period = (searchParams.get('period') || '7d') as TimePeriod;

    try {
        const [aiGateway, capture, security, organizations, projects, apiKeys, users, billing, scan, platformEvents] = await Promise.all([
            getAIGatewayMetrics(period),
            getCaptureMetrics(period),
            getSecurityMetrics(period),
            getOrganizationsMetrics(period),
            getProjectsMetrics(period),
            getApiKeysMetrics(period),
            getUsersMetrics(period),
            getBillingMetrics(period),
            getScanMetrics(period),
            getPlatformEventsMetrics(period),
        ]);

        return NextResponse.json({
            aiGateway,
            capture,
            security,
            organizations,
            projects,
            apiKeys,
            users,
            billing,
            scan,
            platformEvents,
            period,
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[Platform Analytics] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
    }
}
