import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; promptId: string; versionId: string }> }
) {
    const { projectId, promptId, versionId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const supabase = createAdminClient();

    const gate = await requireTierFeatureForProject(projectId, 'promptRegistry');
    if (gate) return gate;

    const { data, error } = await supabase
        .from('prompt_versions')
        .select('*')
        .eq('id', versionId)
        .eq('prompt_id', promptId)
        .single();

    if (error || !data) {
        return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    return NextResponse.json(data);
}
