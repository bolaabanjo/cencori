/**
 * Bulk send of the Documents launch email.
 *
 * Replicates the internal /api/internal/emails/send bulk path:
 *   - Pages through Supabase confirmed users.
 *   - Filters out marketing opt-outs.
 *   - Personalizes greeting + unsubscribe URL per recipient.
 *   - Sends via SendByte in batches of SEND_CONCURRENCY with a small pause.
 *   - Records the campaign in the email_sends table for observability.
 *
 * Mandatory dry-run: this script REFUSES to send unless invoked with `--send`.
 *
 * Usage:
 *   npx tsx scripts/send-documents-bulk.ts                    # dry-run (default)
 *   npx tsx scripts/send-documents-bulk.ts --send             # actually blast
 *   npx tsx scripts/send-documents-bulk.ts --send --max=100   # cap audience
 */

import fs from 'node:fs';
import path from 'node:path';

// Load env before anything reads process.env
for (const filename of ['.env', '.env.local']) {
    const envPath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(envPath)) continue;
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eq = trimmed.indexOf('=');
        if (eq === -1) return;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (!(key in process.env)) process.env[key] = value;
    });
}

const SEND_CONCURRENCY = 25;
const SEND_BATCH_PAUSE_MS = 50;
const USERS_PAGE_SIZE = 200;
const HARD_MAX_RECIPIENTS = 10000;

interface Recipient {
    email: string;
    firstName: string;
    fullName: string;
    userId: string;
}

function parseArgs() {
    const args = process.argv.slice(2);
    const send = args.includes('--send');
    const maxArg = args.find(a => a.startsWith('--max='));
    const max = maxArg ? Math.min(Math.max(parseInt(maxArg.slice('--max='.length), 10) || 500, 1), HARD_MAX_RECIPIENTS) : 500;
    return { send, max };
}

const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

async function main() {
    const { send, max } = parseArgs();

    const apiKey = process.env.SENDBYTE_API_KEY || process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('SENDBYTE_API_KEY or RESEND_API_KEY must be set');

    const from = process.env.RESEND_UPDATES_FROM_EMAIL || process.env.RESEND_FROM_EMAIL;
    if (!from) throw new Error('RESEND_UPDATES_FROM_EMAIL or RESEND_FROM_EMAIL must be set');

    const replyToRaw = (
        process.env.RESEND_UPDATES_REPLY_TO_EMAIL ||
        process.env.RESEND_REPLY_TO_EMAIL ||
        ''
    ).trim();
    const replyToList = replyToRaw
        ? replyToRaw.split(',').map(s => s.trim()).filter(s => s.includes('@'))
        : undefined;
    const replyTo = replyToList?.length === 1 ? replyToList[0] : replyToList;

    // ── Fetch audience ──────────────────────────────────────
    const { createAdminClient } = await import('../lib/supabaseAdmin');
    const { isUserMarketingOptedOut, generateUserUnsubscribeToken, buildUserUnsubscribeUrl } = await import('../lib/user-unsubscribe');
    const { getBaseUrl } = await import('../lib/newsletter');
    const admin = createAdminClient();

    console.log(`Fetching up to ${max} confirmed, opted-in users...`);
    const recipients: Recipient[] = [];
    const dedupe = new Set<string>();
    let page = 1;
    let scanned = 0;

    while (recipients.length < max) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USERS_PAGE_SIZE });
        if (error) throw new Error(error.message);
        const users = data?.users ?? [];
        scanned += users.length;

        for (const u of users) {
            const email = u.email?.trim().toLowerCase();
            if (!email || dedupe.has(email)) continue;
            if (!u.email_confirmed_at) continue;

            const meta = (u.user_metadata || {}) as Record<string, unknown>;
            if (isUserMarketingOptedOut(meta)) continue;

            const fullName = ((meta.full_name as string) || (meta.name as string) || '').trim();
            const firstName = fullName.split(/\s+/)[0] || email.split('@')[0];
            dedupe.add(email);
            recipients.push({ email, firstName, fullName, userId: u.id });
            if (recipients.length >= max) break;
        }

        if (!data?.nextPage || users.length === 0) break;
        page = data.nextPage;
    }

    console.log(`\n=== Audience preview ===`);
    console.log(`Scanned: ${scanned} users`);
    console.log(`Eligible: ${recipients.length}`);
    console.log(`Cap: ${max}`);
    console.log(`\nFirst 5 recipients:`);
    for (const r of recipients.slice(0, 5)) {
        console.log(`  ${r.email.padEnd(40)} → Hi ${r.firstName},`);
    }
    if (recipients.length > 5) console.log(`  … and ${recipients.length - 5} more`);

    if (recipients.length === 0) {
        console.log('\nNo eligible recipients. Nothing to send.');
        return;
    }

    if (!send) {
        console.log(`\nDry run — no emails sent.`);
        console.log(`Re-run with:  npx tsx scripts/send-documents-bulk.ts --send`);
        return;
    }

    // ── Actual send ────────────────────────────────────────
    console.log(`\n=== SENDING ===`);
    console.log(`From: ${from}`);
    console.log(`Reply-To: ${Array.isArray(replyTo) ? replyTo.join(', ') : replyTo ?? '(none)'}`);
    console.log(`Recipients: ${recipients.length}`);
    console.log(`Concurrency: ${SEND_CONCURRENCY}`);
    console.log(``);

    const { launchTemplate } = await import('../lib/email-templates');
    const { SendByte } = await import('@sendbyte/node');
    const sendbyte = new SendByte(apiKey);
    const baseUrl = getBaseUrl();
    const preferencesUrl = `${baseUrl}/dashboard`;

    // Record the campaign for observability
    const { data: sendRecord } = await admin
        .from('email_sends')
        .insert({
            category: 'announcement',
            subject: 'Documents is live on Cencori',
            html_body: '(bulk script — see recipient-personalized html)',
            text_body: null,
            sent_by: null,
            audience_type: 'bulk',
            recipient_count: recipients.length,
            status: 'sending',
        })
        .select('id')
        .single();

    function buildHtmlFor(recipient: Recipient, unsubscribeUrl: string): string {
        return launchTemplate({
            bannerUrl: 'https://raw.githubusercontent.com/cencori/cencori/master/public/blog/images/covers/docs.png',
            bannerAlt: 'Cencori Documents',
            preheader: 'Extract, summarize, and query PDFs — text-based PDFs are free.',
            greeting: `Hi ${recipient.firstName},`,
            paragraphs: [
                'Documents is live on Cencori.',
                'Extract text from PDFs, summarize contracts, and answer questions about any document — all through one API. Text-based PDFs use native parsing, so there are no LLM tokens billed for the extract step.',
                'Under the hood, extract checks first and calls the LLM second. If your contracts, invoices, or reports have embedded text (they almost always do), you pay nothing to read them.',
                'Available today in all five SDKs: TypeScript, Python, Go, PHP, and Rust.',
            ],
            linksHeader: 'To get started:',
            links: [
                { label: 'Read the Documents API reference', url: 'https://cencori.com/docs/ai/endpoints/documents' },
                { label: 'Build a contract analyzer in twenty minutes', url: 'https://cencori.com/docs/guides/build-a-contract-analyzer' },
                { label: 'See the launch post', url: 'https://cencori.com/blog/documents' },
            ],
            ctaText: 'Read the launch post',
            ctaUrl: 'https://cencori.com/blog/documents',
            signOff: 'Build different.',
            preferencesUrl,
            unsubscribeUrl,
            footerContext: 'You received this because you signed up for Cencori.',
        });
    }

    let sent = 0;
    let failed = 0;
    const failures: string[] = [];

    for (let i = 0; i < recipients.length; i += SEND_CONCURRENCY) {
        const slice = recipients.slice(i, i + SEND_CONCURRENCY);
        const results = await Promise.all(slice.map(async (r) => {
            const token = generateUserUnsubscribeToken(r.userId);
            const unsubscribeUrl = buildUserUnsubscribeUrl(baseUrl, r.userId, token);
            const html = buildHtmlFor(r, unsubscribeUrl);
            try {
                await sendbyte.emails.send({
                    from,
                    to: r.email,
                    reply_to: replyTo,
                    subject: 'Documents is live on Cencori',
                    html,
                    list_unsubscribe: { url: unsubscribeUrl },
                });
                return { ok: true as const, email: r.email };
            } catch (err) {
                return { ok: false as const, email: r.email, message: err instanceof Error ? err.message : String(err) };
            }
        }));

        for (const r of results) {
            if (r.ok) sent++;
            else { failed++; failures.push(`${r.email}: ${r.message}`); }
        }

        const done = i + slice.length;
        process.stdout.write(`\r  Progress: ${done} / ${recipients.length}  (sent: ${sent}, failed: ${failed})`);

        if (i + SEND_CONCURRENCY < recipients.length) await sleep(SEND_BATCH_PAUSE_MS);
    }

    process.stdout.write('\n');

    if (sendRecord?.id) {
        await admin.from('email_sends').update({
            status: 'sent',
            success_count: sent,
            failure_count: failed,
            sent_at: new Date().toISOString(),
        }).eq('id', sendRecord.id);
    }

    console.log(`\n=== Done ===`);
    console.log(`Sent:   ${sent}`);
    console.log(`Failed: ${failed}`);
    if (failures.length > 0) {
        console.log(`\nFirst 10 failures:`);
        for (const f of failures.slice(0, 10)) console.log(`  ${f}`);
    }
}

main().catch(err => {
    console.error('\nBulk send failed:', err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
});
