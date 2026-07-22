import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { writeAuditLog } from '@/lib/audit-log';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; promptId: string }> }
) {
    const { projectId, promptId } = await params;
    const projectAccess = await requireProjectAccess(projectId);
    if (!projectAccess.ok) return projectAccess.response;
    const body = await req.json();
    const supabase = createAdminClient();

    const gate = await requireTierFeatureForProject(projectId, 'promptRegistry');
    if (gate) return gate;

    const { version_id } = body;

    if (!version_id) {
        return NextResponse.json({ error: 'version_id is required' }, { status: 400 });
    }

    // Verify version belongs to this prompt
    const { data: version } = await supabase
        .from('prompt_versions')
        .select('id, version')
        .eq('id', version_id)
        .eq('prompt_id', promptId)
        .single();

    if (!version) {
        return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    // Update active version
    const { error } = await supabase
        .from('prompt_registry')
        .update({
            active_version_id: version_id,
            updated_at: new Date().toISOString(),
        })
        .eq('id', promptId)
        .eq('project_id', projectId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: proj } = await supabase.from('projects').select('organization_id').eq('id', projectId).single();
    if (proj?.organization_id) {
        writeAuditLog({
            organizationId: proj.organization_id,
            projectId,
            category: 'prompt',
            action: 'deployed',
            resourceType: 'prompt_version',
            resourceId: version_id,
            actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            description: `Prompt version ${version.version} deployed for prompt ${promptId}`,
            metadata: { promptId, versionNumber: version.version },
        });
    }

    return NextResponse.json({ deployed: true, version: version.version, version_id });
}
