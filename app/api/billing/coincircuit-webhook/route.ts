import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { addCredits } from '@/lib/credits';
import { trackEvent } from '@/lib/track-event';
import { writeAuditLog } from '@/lib/audit-log';
import { verifyWebhookSignature, type CoinCircuitWebhookPayload } from '@/lib/coincircuit';
import { CREDIT_TOPUP_PACKS } from '@/lib/bachsClient';

const TOTAL_FEE_PERCENT = 0.065;

const PACK_CREDITS: Record<string, number> = Object.fromEntries(
  CREDIT_TOPUP_PACKS.map((p) => [p.label.toLowerCase(), p.credits])
);

async function hasExistingTopup(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  sessionReference: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('credit_transactions')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('transaction_type', 'topup')
    .eq('reference_id', sessionReference)
    .maybeSingle();

  if (error) {
    console.error('[CoinCircuit Webhook] Failed checking existing top-up:', error);
    return false;
  }

  return !!data?.id;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const headers = Object.fromEntries(req.headers.entries());
    const signature = req.headers.get('x-coincircuit-signature')
      || req.headers.get('x-signature')
      || req.headers.get('authorization')
      || null;

    if (!process.env.COINCIRCUIT_WEBHOOK_SECRET) {
      console.error('[CoinCircuit Webhook] Missing COINCIRCUIT_WEBHOOK_SECRET env var');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const valid = verifyWebhookSignature(rawBody, signature);
    if (!valid) {
      console.error('[CoinCircuit Webhook] Invalid signature. Headers:', JSON.stringify(headers));
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload: CoinCircuitWebhookPayload = JSON.parse(rawBody);
    console.log('[CoinCircuit Webhook] Received event:', payload.event);

    if (payload.event !== 'payment.completed') {
      console.log(`[CoinCircuit Webhook] Ignoring event: ${payload.event}`);
      return NextResponse.json({ received: true });
    }

    const session = payload.data.session;
    const metadata = session.metadata || {};

    if (metadata.purchase_type !== 'credits_topup') {
      console.log('[CoinCircuit Webhook] Payment for non-topup session, ignoring.');
      return NextResponse.json({ received: true });
    }

    const orgId = metadata.org_id;
    if (!orgId) {
      console.warn('[CoinCircuit Webhook] Missing org_id in session metadata');
      return NextResponse.json(
        { received: true, warning: 'org_not_resolved' },
        { status: 200 }
      );
    }

    const existingTopup = await hasExistingTopup(
      createAdminClient(),
      orgId,
      session.reference
    );

    if (existingTopup) {
      console.log(`[CoinCircuit Webhook] Top-up already applied for session ${session.reference}, skipping`);
      return NextResponse.json({ received: true });
    }

    const grossCredits = PACK_CREDITS[metadata.credit_pack as string];
    if (!grossCredits || grossCredits <= 0) {
      console.warn('[CoinCircuit Webhook] Unknown credit pack:', metadata.credit_pack);
      return NextResponse.json({ received: true, warning: 'unknown_pack' });
    }

    const netCredits = Math.floor(grossCredits * (1 - TOTAL_FEE_PERCENT));
    const feeCredits = grossCredits - netCredits;

    const credited = await addCredits(
      orgId,
      netCredits,
      'topup',
      `Crypto top-up session ${session.reference}`,
      {
        coincircuit_session_id: session.id,
        coincircuit_reference: session.reference,
        gross_credits: grossCredits,
        net_credits: netCredits,
        fee_credits: feeCredits,
        fee_percent: TOTAL_FEE_PERCENT,
        credit_pack: metadata.credit_pack,
        settlements: session.settlements,
      }
    );

    if (!credited) {
      throw new Error(`Failed to apply credits for session ${session.reference}`);
    }

    trackEvent({
      event_type: 'credits.topup',
      product: 'billing',
      organization_id: orgId,
      metadata: {
        provider: 'coincircuit',
        session_id: session.id,
        gross_credits: grossCredits,
        net_credits: netCredits,
        fee_credits: feeCredits,
      },
    });

    writeAuditLog({
      organizationId: orgId,
      category: 'billing',
      action: 'topup',
      resourceType: 'credits',
      resourceId: session.reference,
      actorType: 'webhook',
      description: `Crypto credits topped up: ${grossCredits.toLocaleString()} credits (${netCredits.toLocaleString()} after ${(TOTAL_FEE_PERCENT * 100).toFixed(1)}% total fee)`,
      metadata: {
        provider: 'coincircuit',
        session_id: session.id,
        gross_credits: grossCredits,
        net_credits: netCredits,
        fee_credits: feeCredits,
      },
    });

    console.log(
      `[CoinCircuit Webhook] Credited org ${orgId} with ${netCredits.toLocaleString()} credits (gross: ${grossCredits.toLocaleString()}) from session ${session.reference}`
    );

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    console.error('[CoinCircuit Webhook] Error processing webhook:', error);

    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { error: 'Webhook processing failed', details: errorMessage },
      { status: 500 }
    );
  }
}
