/**
 * Sends the Vision launch test email to a single recipient via SendByte.
 *
 * Uses the shared `launchTemplate()` from lib/email-templates — same design
 * as the welcome email so future launches (Documents, Sessions, etc.) can
 * follow this exact pattern by copying this script and swapping the copy.
 *
 * Usage:
 *   npx tsx scripts/send-vision-test.ts [recipient@example.com]
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
    const recipient = process.argv[2] || 'omogbolahanng@gmail.com';

    const apiKey = process.env.SENDBYTE_API_KEY || process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('SENDBYTE_API_KEY or RESEND_API_KEY must be set');

    // Prefer a dedicated "updates" sender for product-life-cycle emails
    // (Vision launch, Documents launch, feature announcements). Falls back
    // to the generic no-reply. Never uses welcome@ — that's reserved for
    // new-user onboarding.
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
    const preferencesUrl = 'https://cencori.com/dashboard';

    const { launchTemplate } = await import('../lib/email-templates');
    const { SendByte } = await import('@sendbyte/node');

    const html = launchTemplate({
        bannerUrl: 'https://raw.githubusercontent.com/cencori/cencori/master/public/blog/images/covers/vision.png',
        bannerAlt: 'Cencori Vision',
        preheader: 'Analyze, describe, OCR, and classify images across GPT-4o, Claude, and Gemini.',
        greeting: `Hi ${firstName},`,
        paragraphs: [
            'Vision is live on Cencori.',
            'Analyze, describe, OCR, and classify images across GPT-4o, Claude, and Gemini through one endpoint. Send an image through the regular chat endpoint with any model and Cencori auto-routes it — even models that don’t natively support vision.',
            'Ships with a drop-in React uploader and works in all five SDKs: TypeScript, Python, Go, PHP, and Rust.',
        ],
        linksHeader: 'To get started:',
        links: [
            { label: 'Read the Vision API reference', url: 'https://cencori.com/docs/ai/endpoints/vision' },
            { label: 'Build a receipt scanner in ten minutes', url: 'https://cencori.com/docs/guides/build-a-receipt-scanner' },
            { label: 'Embed the VisionUploader React component', url: 'https://cencori.com/docs/guides/vision-uploader' },
        ],
        ctaText: 'Read the launch post',
        ctaUrl: 'https://cencori.com/blog/vision',
        signOff: 'Build different.',
        preferencesUrl,
        unsubscribeUrl,
        footerContext: 'You received this because you signed up for Cencori.',
    });

    const sendbyte = new SendByte(apiKey);

    console.log(`Sending Vision launch test to ${recipient}...`);
    console.log(`From:    ${from}`);
    if (replyTo) console.log(`Reply-To: ${replyTo.join(', ')}`);
    console.log(`Greeting: Hi ${firstName},${resolved ? '' : '  (fell back to email prefix)'}`);

    const result = await sendbyte.emails.send({
        from,
        to: recipient,
        reply_to: replyTo?.length === 1 ? replyTo[0] : replyTo,
        subject: 'Vision is live on Cencori',
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
