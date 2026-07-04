import { NextRequest, NextResponse } from 'next/server';
import { SendByte } from '@sendbyte/node';
import { createServerClient } from '@/lib/supabaseServer';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { checkInternalAccess } from '@/lib/internal-access';
import { renderTemplate } from '@/lib/email-templates';
import { buildUnsubscribeUrl, getBaseUrl } from '@/lib/newsletter';
import {
    buildUserUnsubscribeUrl,
    generateUserUnsubscribeToken,
    isUserMarketingOptedOut,
} from '@/lib/user-unsubscribe';

const SENDBYTE_API_KEY = process.env.SENDBYTE_API_KEY || process.env.RESEND_API_KEY;
const FALLBACK_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || '';
const FALLBACK_REPLY_TO = process.env.RESEND_REPLY_TO_EMAIL || '';
const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || 'send.cencori.com';

function validReplyTo(): string | string[] | undefined {
    const value = FALLBACK_REPLY_TO.trim();
    if (!value) return undefined;
    const addresses = value.split(',').map((s) => s.trim()).filter((s) => s.includes('@'));
    if (addresses.length === 0) return undefined;
    return addresses.length === 1 ? addresses[0] : addresses;
}

const SEND_CONCURRENCY = 5;
const SEND_BATCH_PAUSE_MS = 120;
const USERS_PAGE_SIZE = 200;
const HARD_MAX_RECIPIENTS = 2000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}


interface SendEmailRequest {
    subject: string;
    htmlBody: string;
    textBody?: string;
    category: string;
    senderProfileId?: string;
    audienceType: 'bulk' | 'single' | 'newsletter';
    singleRecipient?: string;
    maxRecipients?: number;
}

async function getSenderFrom(profileId?: string): Promise<string> {
    if (!profileId) return FALLBACK_FROM_EMAIL;

    const admin = createAdminClient();
    const { data } = await admin
        .from('email_sender_profiles')
        .select('display_name, email_handle')
        .eq('id', profileId)
        .single();

    if (!data) return FALLBACK_FROM_EMAIL;

    return `${data.display_name} <${data.email_handle}@${EMAIL_DOMAIN}>`;
}

interface Recipient {
    email: string;
    fullName: string;
    firstName: string;
    // Newsletter subscribers use a stored unsubscribe_token; auth users
    // use an HMAC-derived token bound to their userId.
    unsubscribeToken?: string;
    userId?: string;
}

async function getNewsletterRecipients(maxRecipients: number): Promise<Recipient[]> {
    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin
        .from('newsletter_subscribers')
        .select('email, unsubscribe_token')
        .eq('status', 'confirmed')
        .order('confirmed_at', { ascending: true })
        .limit(maxRecipients);

    if (error) throw new Error(error.message);

    return (data || []).map((row) => {
        const email = (row.email as string).trim().toLowerCase();
        const firstName = email.split('@')[0];
        return {
            email,
            fullName: '',
            firstName,
            unsubscribeToken: row.unsubscribe_token as string,
        };
    });
}

async function getAllRecipients(maxRecipients: number): Promise<Recipient[]> {
    const supabaseAdmin = createAdminClient();
    const dedupe = new Set<string>();
    const recipients: Recipient[] = [];
    let page = 1;

    while (recipients.length < maxRecipients) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage: USERS_PAGE_SIZE,
        });

        if (error) throw new Error(error.message);

        const users = data?.users ?? [];
        for (const user of users) {
            const email = user.email?.trim().toLowerCase();
            if (!email || dedupe.has(email)) continue;
            if (!user.email_confirmed_at) continue;

            const meta = (user.user_metadata || {}) as Record<string, unknown>;

            // Skip users who have opted out of marketing/bulk emails.
            if (isUserMarketingOptedOut(meta)) continue;

            const fullName = (
                (meta.full_name as string | undefined) ||
                (meta.name as string | undefined) ||
                ''
            ).trim();
            const firstName = fullName.split(/\s+/)[0] || email.split('@')[0];

            dedupe.add(email);
            recipients.push({
                email,
                fullName,
                firstName,
                userId: user.id,
            });
            if (recipients.length >= maxRecipients) break;
        }

        if (!data?.nextPage || users.length === 0) break;
        page = data.nextPage;
    }

    return recipients;
}

/**
 * Replace merge tags in content.
 * Supported: {first_name}, {full_name}, {email}, {unsubscribe_url}
 */
function personalize(content: string, recipient: Recipient, unsubscribeUrl?: string): string {
    return content
        .replace(/\{first_name\}/gi, recipient.firstName)
        .replace(/\{full_name\}/gi, recipient.fullName || recipient.firstName)
        .replace(/\{email\}/gi, recipient.email)
        .replace(/\{unsubscribe_url\}/gi, unsubscribeUrl || '');
}

/**
 * Append a one-click unsubscribe footer to an HTML body before </body>.
 * Used for both newsletter sends (with the stored subscriber token) and
 * bulk sends to all auth users (with an HMAC-derived per-user token).
 */
function appendUnsubscribeFooter(
    html: string,
    unsubscribeUrl: string,
    kind: 'newsletter' | 'bulk' = 'newsletter',
): string {
    const reason =
        kind === 'newsletter'
            ? "You're receiving this because you subscribed to the Cencori newsletter."
            : "You're receiving this because you have a Cencori account.";
    const footer = `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #dadce0;text-align:center;font-size:11px;color:#5f6368;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${reason} <a href="${unsubscribeUrl}" style="color:#5f6368;text-decoration:underline;">Unsubscribe</a></div>`;
    if (html.includes('</body>')) {
        return html.replace('</body>', `${footer}</body>`);
    }
    return html + footer;
}

export async function POST(req: NextRequest) {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await checkInternalAccess(user.id, user.email))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: SendEmailRequest;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { subject, htmlBody, textBody, category, senderProfileId, audienceType, singleRecipient } = body;

    if (!subject?.trim()) {
        return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
    }

    if (!htmlBody?.trim()) {
        return NextResponse.json({ error: 'Email body is required' }, { status: 400 });
    }

    if (!SENDBYTE_API_KEY) {
        return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    const fromAddress = await getSenderFrom(senderProfileId);
    if (!fromAddress) {
        return NextResponse.json({ error: 'No sender email configured' }, { status: 500 });
    }

    // Wrap the editor HTML in the branded email template
    const styledHtml = renderTemplate(category || 'transactional', {
        subject: subject.trim(),
        body: htmlBody,
    });

    const admin = createAdminClient();
    const sendbyte = new SendByte(SENDBYTE_API_KEY);

    // === Single Send (test / individual) ===
    if (audienceType === 'single') {
        const recipientEmail = singleRecipient?.trim().toLowerCase();
        if (!recipientEmail || !recipientEmail.includes('@')) {
            return NextResponse.json({ error: 'Valid recipient email is required for single send' }, { status: 400 });
        }

        // Try to find the user's name for personalization
        const recipient: Recipient = { email: recipientEmail, fullName: '', firstName: recipientEmail.split('@')[0] };
        try {
            const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
            const found = users?.find(u => u.email?.toLowerCase() === recipientEmail);
            if (found) {
                const meta = found.user_metadata || {};
                recipient.fullName = (meta.full_name || meta.name || '').trim();
                recipient.firstName = recipient.fullName.split(/\s+/)[0] || recipient.firstName;
            }
        } catch { /* fallback to email-based name */ }

        const personalizedHtml = personalize(styledHtml, recipient);
        const personalizedSubject = personalize(subject.trim(), recipient);

        // Record in DB
        const { data: sendRecord, error: insertError } = await admin
            .from('email_sends')
            .insert({
                category: category || 'transactional',
                subject: personalizedSubject,
                html_body: htmlBody,
                text_body: textBody || null,
                sender_profile_id: senderProfileId || null,
                sent_by: user.id,
                audience_type: 'single',
                single_recipient: recipientEmail,
                recipient_count: 1,
                status: 'sending',
            })
            .select('id')
            .single();

        if (insertError) {
            console.error('[Email Send] Failed to record send:', insertError);
        }

        try {
            await sendbyte.emails.send({
                from: fromAddress,
                to: recipientEmail,
                reply_to: validReplyTo(),
                subject: personalizedSubject,
                html: personalizedHtml,
                text: textBody || undefined,
            });

            if (sendRecord?.id) {
                await admin.from('email_sends').update({
                    status: 'sent', success_count: 1, sent_at: new Date().toISOString(),
                }).eq('id', sendRecord.id);
            }

            return NextResponse.json({ success: true, recipient: recipientEmail, mode: 'single' });
        } catch (err) {
            if (sendRecord?.id) {
                await admin.from('email_sends').update({
                    status: 'failed', failure_count: 1, sent_at: new Date().toISOString(),
                }).eq('id', sendRecord.id);
            }
            const message = err instanceof Error ? err.message : 'Send failed';
            return NextResponse.json({ error: message }, { status: 500 });
        }
    }

    // === Bulk / Newsletter Send ===
    const isNewsletter = audienceType === 'newsletter';
    const maxRecipients = Math.min(
        Math.max(Number(body.maxRecipients) || 500, 1),
        HARD_MAX_RECIPIENTS
    );

    let recipients: Recipient[];
    try {
        recipients = isNewsletter
            ? await getNewsletterRecipients(maxRecipients)
            : await getAllRecipients(maxRecipients);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch audience';
        return NextResponse.json({ error: message }, { status: 500 });
    }

    if (recipients.length === 0) {
        return NextResponse.json({
            success: true,
            sent: 0,
            message: isNewsletter ? 'No confirmed newsletter subscribers' : 'No eligible recipients found',
        });
    }

    // Record in DB
    const { data: sendRecord } = await admin
        .from('email_sends')
        .insert({
            category: category || (isNewsletter ? 'newsletter' : 'announcement'),
            subject: subject.trim(),
            html_body: htmlBody,
            text_body: textBody || null,
            sender_profile_id: senderProfileId || null,
            sent_by: user.id,
            audience_type: isNewsletter ? 'newsletter' : 'bulk',
            recipient_count: recipients.length,
            status: 'sending',
        })
        .select('id')
        .single();

    const baseUrl = getBaseUrl();
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < recipients.length; i += SEND_CONCURRENCY) {
        const slice = recipients.slice(i, i + SEND_CONCURRENCY);
        const results = await Promise.all(
            slice.map(async (recipient) => {
                // Newsletter recipients use the stored subscriber token;
                // bulk auth users use an HMAC-derived per-user token.
                let unsubscribeUrl: string | undefined;
                if (recipient.unsubscribeToken) {
                    unsubscribeUrl = buildUnsubscribeUrl(baseUrl, recipient.unsubscribeToken);
                } else if (recipient.userId) {
                    const token = generateUserUnsubscribeToken(recipient.userId);
                    unsubscribeUrl = buildUserUnsubscribeUrl(baseUrl, recipient.userId, token);
                }

                let personalizedHtml = personalize(styledHtml, recipient, unsubscribeUrl);
                if (unsubscribeUrl) {
                    personalizedHtml = appendUnsubscribeFooter(
                        personalizedHtml,
                        unsubscribeUrl,
                        isNewsletter ? 'newsletter' : 'bulk',
                    );
                }
                const personalizedSubject = personalize(subject.trim(), recipient, unsubscribeUrl);

                try {
                    await sendbyte.emails.send({
                        from: fromAddress,
                        to: recipient.email,
                        reply_to: validReplyTo(),
                        subject: personalizedSubject,
                        html: personalizedHtml,
                        text: textBody || undefined,
                        list_unsubscribe: unsubscribeUrl
                            ? { url: unsubscribeUrl }
                            : undefined,
                    });
                    return { ok: true, email: recipient.email };
                } catch {
                    return { ok: false, email: recipient.email };
                }
            })
        );

        for (const r of results) {
            if (r.ok) sent++;
            else failed++;
        }

        if (i + SEND_CONCURRENCY < recipients.length) {
            await sleep(SEND_BATCH_PAUSE_MS);
        }
    }

    if (sendRecord?.id) {
        await admin.from('email_sends').update({
            status: failed === 0 ? 'sent' : 'sent',
            success_count: sent,
            failure_count: failed,
            sent_at: new Date().toISOString(),
        }).eq('id', sendRecord.id);
    }

    return NextResponse.json({
        success: true,
        mode: isNewsletter ? 'newsletter' : 'bulk',
        recipientCount: recipients.length,
        sent,
        failed,
    });
}
