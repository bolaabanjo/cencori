import { SendByte } from '@sendbyte/node';
import { NextRequest, NextResponse } from 'next/server';

const SENDBYTE_API_KEY = process.env.SENDBYTE_API_KEY || process.env.RESEND_API_KEY;
const CONTACT_FROM_EMAIL = process.env.RESEND_CONTACT_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || '';

const emailRouting: Record<string, string> = {
    general: 'hello@cencori.com',
    support: 'support@cencori.com',
    enterprise: 'enterprise@cencori.com',
};

export async function POST(request: NextRequest) {
    try {
        if (!SENDBYTE_API_KEY || !CONTACT_FROM_EMAIL) {
            return NextResponse.json(
                { error: 'Email not configured' },
                { status: 500 }
            );
        }

        const sendbyte = new SendByte(SENDBYTE_API_KEY);
        const body = await request.json();
        const { name, email, company, type, subject, message } = body;

        if (!name || !email || !subject || !message) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const targetEmail = emailRouting[type] || emailRouting.general;

        let emailId: string | undefined;
        try {
            const result = await sendbyte.emails.send({
                from: CONTACT_FROM_EMAIL,
                to: [targetEmail],
                reply_to: email,
                subject: `[Contact Form] ${subject}`,
                html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Type:</strong> ${type?.charAt(0).toUpperCase() + type?.slice(1) || 'General'}</p>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Company:</strong> ${company || 'Not provided'}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <hr />
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br />')}</p>
      `,
            });
            emailId = result.id;
        } catch (err) {
            console.error('SendByte error:', err);
            return NextResponse.json(
                { error: 'Failed to send email' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, id: emailId });
    } catch (error) {
        console.error('Contact form error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
