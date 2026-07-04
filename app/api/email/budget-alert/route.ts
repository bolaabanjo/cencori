import { NextRequest, NextResponse } from 'next/server';

const SENDBYTE_API_KEY = process.env.SENDBYTE_API_KEY || process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_BUDGET_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || '';

interface BudgetAlertRequest {
    to: string[];
    projectName: string;
    threshold: number;
    currentSpend: number;
    budget: number;
    percentUsed: number;
}

export async function POST(req: NextRequest) {
    try {
        const body: BudgetAlertRequest = await req.json();
        const { to, projectName, threshold, currentSpend, budget, percentUsed } = body;

        if (!SENDBYTE_API_KEY) {
            console.warn('[Budget Alert] SENDBYTE_API_KEY not configured');
            return NextResponse.json({ error: 'Email not configured' }, { status: 500 });
        }

        if (!FROM_EMAIL) {
            console.warn('[Budget Alert] RESEND_BUDGET_FROM_EMAIL/RESEND_FROM_EMAIL not configured');
            return NextResponse.json({ error: 'Email not configured' }, { status: 500 });
        }

        const isOverBudget = threshold >= 100;
        const subject = isOverBudget
            ? `Budget exceeded for ${projectName}`
            : `Budget alert: ${projectName} at ${threshold}%`;

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
    <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="background: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="font-size: 32px; margin-bottom: 8px;">${isOverBudget ? '⚠️' : '📊'}</div>
                <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #18181b;">
                    ${isOverBudget ? 'Budget Exceeded' : 'Budget Alert'}
                </h1>
            </div>

            <p style="color: #52525b; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
                Your project <strong style="color: #18181b;">${projectName}</strong> has reached 
                <strong style="color: ${isOverBudget ? '#dc2626' : '#f59e0b'};">${Math.round(percentUsed)}%</strong> 
                of its monthly budget.
            </p>

            <div style="background: #f4f4f5; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <tr>
                        <td style="color: #71717a; padding: 4px 0;">Current spend</td>
                        <td style="text-align: right; font-weight: 600; color: #18181b;">$${currentSpend.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td style="color: #71717a; padding: 4px 0;">Monthly budget</td>
                        <td style="text-align: right; font-weight: 600; color: #18181b;">$${budget.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td style="color: #71717a; padding: 4px 0;">Usage</td>
                        <td style="text-align: right; font-weight: 600; color: ${isOverBudget ? '#dc2626' : '#f59e0b'};">${Math.round(percentUsed)}%</td>
                    </tr>
                </table>
            </div>

            ${isOverBudget ? `
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 13px; color: #dc2626;">
                    <strong>Action needed:</strong> Consider increasing your budget or enabling spend caps to prevent overage.
                </p>
            </div>
            ` : ''}

            <div style="text-align: center;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" 
                   style="display: inline-block; background: #18181b; color: white; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; font-weight: 500;">
                    View Dashboard
                </a>
            </div>

        </div>

        <p style="text-align: center; margin-top: 24px; font-size: 12px; color: #a1a1aa;">
            You're receiving this because budget alerts are enabled for ${projectName}.<br>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="color: #71717a;">Manage alert settings</a>
        </p>
    </div>
</body>
</html>
        `.trim();

        const response = await fetch('https://api.sendbyte.africa/v1/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SENDBYTE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to,
                subject,
                html,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[Budget Alert] SendByte error:', error);
            return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
        }

        const result = await response.json();
        console.log(`[Budget Alert] Email sent to ${to.length} recipients:`, result.id);

        return NextResponse.json({ success: true, id: result.id });
    } catch (error) {
        console.error('[Budget Alert] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
