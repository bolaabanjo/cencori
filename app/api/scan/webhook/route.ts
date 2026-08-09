/**
 * GitHub Webhook Receiver
 *
 * POST /api/scan/webhook
 *
 * Receives GitHub webhook events and triggers diff-aware scans
 * on pull_request events. Verifies HMAC-SHA256 signatures.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { verifyWebhookSignature } from '@/lib/scan/webhook-verify';
import { scanPullRequest } from '@/lib/scan/pr-scan';
import { handleComputePush, handleComputePullRequest, handleComputeRepository } from '@/lib/compute/webhook';

// Allow up to 5 minutes for PR scans
export const maxDuration = 300;

// Disable body parsing — we need the raw body for signature verification
export const dynamic = 'force-dynamic';

interface PRWebhookPayload {
    action: string;
    number: number;
    pull_request: {
        number: number;
        head: {
            sha: string;
            ref: string;
        };
        base: {
            sha: string;
            ref: string;
        };
        draft: boolean;
    };
    repository: {
        id: number;
        full_name: string;
        name: string;
        owner: {
            login: string;
        };
    };
    installation?: {
        id: number;
    };
}

export async function POST(req: NextRequest) {
    const rawBody = await req.text();

    // 1. Verify webhook signature
    const signature = req.headers.get('x-hub-signature-256');
    if (!verifyWebhookSignature(rawBody, signature)) {
        console.warn('[Webhook] Invalid signature — rejecting request');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 2. Parse event type
    const eventType = req.headers.get('x-github-event');
    const deliveryId = req.headers.get('x-github-delivery');

    console.log(`[Webhook] Received event: ${eventType} (delivery: ${deliveryId})`);

    // 3. Handle ping (GitHub sends this when webhook is first configured)
    if (eventType === 'ping') {
        return NextResponse.json({ message: 'pong' });
    }

    // Compute — push → auto-deploy any agent watching this repo+branch.
    if (eventType === 'push') {
        let payload;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        }
        const tasks = await handleComputePush(payload);
        after(() =>
            Promise.all(tasks.map((run) => run().catch((e) => console.error('[compute push] build error:', e)))),
        );
        return NextResponse.json({ message: `Compute: ${tasks.length} agent(s) redeploying` });
    }

    // Compute — repo rename/transfer keeps the agent's binding in sync; delete archives it.
    if (eventType === 'repository') {
        let payload;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        }
        const result = await handleComputeRepository(payload);
        return NextResponse.json({ message: `Compute repo: synced ${result.synced}, archived ${result.archived}` });
    }

    // 4. Handle pull_request events
    if (eventType === 'pull_request') {
        let payload: PRWebhookPayload;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        }

        // Compute — preview deploys run independently of Scan's PR handling.
        const previewTasks = await handleComputePullRequest(JSON.parse(rawBody));
        if (previewTasks.length > 0) {
            after(() =>
                Promise.all(previewTasks.map((run) => run().catch((e) => console.error('[compute preview] build error:', e)))),
            );
        }

        const { action, pull_request: pr, repository, installation } = payload;

        // Only scan on opened, synchronize (new push), or reopened
        if (!['opened', 'synchronize', 'reopened'].includes(action)) {
            return NextResponse.json({
                message: `Ignoring pull_request.${action}`,
            });
        }

        // Skip draft PRs
        if (pr.draft) {
            return NextResponse.json({
                message: 'Skipping draft PR',
            });
        }

        if (!installation?.id) {
            console.warn('[Webhook] No installation ID in payload');
            return NextResponse.json({ error: 'Missing installation' }, { status: 400 });
        }

        const repoFullName = repository.full_name;
        const [owner, repo] = repoFullName.split('/');

        if (!owner || !repo) {
            return NextResponse.json({ error: 'Invalid repository' }, { status: 400 });
        }

        // 5. Find matching scan project
        const supabaseAdmin = createAdminClient();
        const { data: project, error: projectError } = await supabaseAdmin
            .from('scan_projects')
            .select('id, user_id')
            .eq('github_repo_full_name', repoFullName)
            .eq('github_installation_id', installation.id)
            .maybeSingle();

        if (projectError) {
            console.error('[Webhook] Error looking up project:', projectError);
            return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

        if (!project) {
            // No scan project configured for this repo — ignore silently
            return NextResponse.json({
                message: `No scan project found for ${repoFullName}`,
            });
        }

        // 6. Trigger diff-aware scan (async — respond immediately)
        console.log(`[Webhook] Triggering PR scan for ${repoFullName}#${pr.number} (${pr.head.sha.slice(0, 7)})`);

        // Run scan in background — don't block the webhook response
        scanPullRequest({
            installationId: installation.id,
            owner,
            repo,
            pullNumber: pr.number,
            headSha: pr.head.sha,
            baseSha: pr.base.sha,
            projectId: project.id,
        }).catch(error => {
            console.error(`[Webhook] PR scan failed for ${repoFullName}#${pr.number}:`, error);
        });

        return NextResponse.json({
            message: `Scan triggered for PR #${pr.number}`,
            project_id: project.id,
            pr: pr.number,
        });
    }

    // 5. Handle installation events (logging only)
    if (eventType === 'installation') {
        let payload: { action: string; installation?: { id: number; account?: { login: string } } };
        try {
            payload = JSON.parse(rawBody);
        } catch {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
        }

        console.log(`[Webhook] Installation ${payload.action}: ${payload.installation?.id} (${payload.installation?.account?.login})`);
        return NextResponse.json({ message: `Installation ${payload.action}` });
    }

    // Unhandled event type
    return NextResponse.json({
        message: `Event type '${eventType}' not handled`,
    });
}
