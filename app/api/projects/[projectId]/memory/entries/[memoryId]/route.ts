/**
 * DELETE /api/projects/:projectId/memory/entries/:memoryId — hard-forget one
 * memory from the dashboard.
 *
 * Real deletion, not a status flag: "forget means gone" is the product
 * contract, and a memory the user asked us to drop must not survive as a
 * superseded row. The audit log keeps the receipt — the content does not.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/require-project-access';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { createServerClient } from '@/lib/supabaseServer';
import { writeAuditLog } from '@/lib/audit-log';
import { fromMemoryId } from '@/lib/memory';

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string; memoryId: string }> }
) {
    const { projectId, memoryId } = await params;
    const access = await requireProjectAccess(projectId);
    if (!access.ok) return access.response;

    const supabase = createAdminClient();
    const rawId = fromMemoryId(memoryId);

    try {
        // Read it back first: the org/project filter here is what stops a
        // foreign uuid in the URL from deleting another tenant's memory.
        const { data: memory, error: findError } = await supabase
            .from('gateway_memories')
            .select('id, content, scope, scope_key')
            .eq('id', rawId)
            .eq('organization_id', access.organizationId)
            .eq('project_id', projectId)
            .maybeSingle();

        if (findError) throw findError;
        if (!memory) {
            return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
        }

        const { error: deleteError } = await supabase
            .from('gateway_memories')
            .delete()
            .eq('id', rawId)
            .eq('organization_id', access.organizationId)
            .eq('project_id', projectId);

        if (deleteError) throw deleteError;

        const authClient = await createServerClient();
        const { data: { user } } = await authClient.auth.getUser();

        writeAuditLog({
            organizationId: access.organizationId,
            projectId,
            category: 'memory',
            action: 'deleted',
            resourceType: 'gateway_memory',
            resourceId: rawId,
            actorId: access.userId,
            actorEmail: user?.email ?? null,
            description: `Forgot a memory for ${memory.scope}:${memory.scope_key}`,
            // The receipt records that it happened and for whom — never the
            // content that was just deleted on request.
            metadata: { scope: memory.scope, scopeKey: memory.scope_key, source: 'dashboard' },
        });

        return NextResponse.json({ deleted: true, id: memoryId });
    } catch (error) {
        console.error('[Memory] Delete error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
