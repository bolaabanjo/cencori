/**
 * Sends the Documents launch test email to a single recipient via SendByte.
 *
 * Uses the shared `launchTemplate()` from lib/email-templates — same design
 * as the welcome email.
 *
 * Usage:
 *   npx tsx scripts/send-documents-test.ts [recipient@example.com]
 */

import fs from 'node:fs';
import path from 'node:path';

// Load env before importing anything that reads process.env
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

async function main() {
    const recipient = process.argv[2] || 'bolaabanjo@gmail.com';

    const apiKey = process.env.SENDBYTE_API_KEY || process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('SENDBYTE_API_KEY or RESEND_API_KEY must be set');

    // Prefer a dedicated "updates" sender for product-life-cycle emails.
    // Never uses welcome@ — that's reserved for new-user onboarding.
    const from = process.env.RESEND_UPDATES_FROM_EMAIL || process.env.RESEND_FROM_EMAIL;
    if (!from) throw new Error('RESEND_UPDATES_FROM_EMAIL or RESEND_FROM_EMAIL must be set');

    const replyToRaw = (
        process.env.RESEND_UPDATES_REPLY_TO_EMAIL ||
        process.env.RESEND_REPLY_TO_EMAIL ||
        ''
    ).trim();
    const replyTo = replyToRaw
        ? replyToRaw.split(',').map(s => s.trim()).filter(s => s.includes('@'))
        : undefined;

    const { lookupRecipientName } = await import('../lib/email/recipient');
    const { firstName, resolved } = await lookupRecipientName(recipient);

    const unsubscribeUrl = 'https://cencori.com/account/email-preferences';
    const preferencesUrl = 'https://cencori.com/dashboard/organizations';

    const { launchTemplate } = await import('../lib/email-templates');
    const { SendByte } = await import('@sendbyte/node');

    const html = launchTemplate({
        bannerUrl: 'https://raw.githubusercontent.com/cencori/cencori/master/public/blog/images/covers/docs.png',
        bannerAlt: 'Cencori Documents',
        preheader: 'Extract, summarize, and query PDFs — text-based PDFs are free.',
        greeting: `Hi ${firstName},`,
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

    const sendbyte = new SendByte(apiKey);

    console.log(`Sending Documents launch test to ${recipient}...`);
    console.log(`From:    ${from}`);
    if (replyTo) console.log(`Reply-To: ${replyTo.join(', ')}`);
    console.log(`Greeting: Hi ${firstName},${resolved ? '' : '  (fell back to email prefix)'}`);

    const result = await sendbyte.emails.send({
        from,
        to: recipient,
        reply_to: replyTo?.length === 1 ? replyTo[0] : replyTo,
        subject: 'Documents is live on Cencori',
        html,
    });

    console.log('\nSent successfully. Response:');
    console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
    console.error('\nSend failed:', err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
});
