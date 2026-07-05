import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { addCredits } from '@/lib/credits';
import { trackEvent } from '@/lib/track-event';
import { writeAuditLog } from '@/lib/audit-log';
import { verifyWebhookSignature, type CoinCircuitWebhookPayload } from '@/lib/coincircuit';

const TOTAL_FEE_PERCENT = 0.065;

function netAfterFee(gross: number): number {
  return Math.round(gross * (1 - TOTAL_FEE_PERCENT) * 100) / 100;
}

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
    const signature = req.headers.get('x-coincircuit-signature');

    const valid = verifyWebhookSignature(rawBody, signature);
    if (!valid) {
      console.error('[CoinCircuit Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload: CoinCircuitWebhookPayload = JSON.parse(rawBody);
    console.log('[CoinCircuit Webhook] Received event:', payload.event);

    if (payload.event !== 'PaymentCompleted') {
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

    const grossAmount = parseFloat(session.amount);
    if (!grossAmount || grossAmount <= 0) {
      console.warn('[CoinCircuit Webhook] Invalid amount:', session.amount);
      return NextResponse.json({ received: true, warning: 'invalid_amount' });
    }

    const netAmount = netAfterFee(grossAmount);
    const feeAmount = Math.round((grossAmount - netAmount) * 100) / 100;

    const credited = await addCredits(
      orgId,
      netAmount,
      'topup',
      `Crypto top-up session ${session.reference}`,
      {
        coincircuit_session_id: session.id,
        coincircuit_reference: session.reference,
        gross_amount: grossAmount,
        net_amount: netAmount,
        fee_amount: feeAmount,
        fee_percent: TOTAL_FEE_PERCENT,
        credit_pack: metadata.credit_pack || null,
        settlements: session.settlements || [],
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
        gross_amount: grossAmount,
        net_amount: netAmount,
        fee_amount: feeAmount,
      },
    });

    writeAuditLog({
      organizationId: orgId,
      category: 'billing',
      action: 'topup',
      resourceType: 'credits',
      resourceId: session.reference,
      actorType: 'webhook',
      description: `Crypto credits topped up: $${grossAmount.toFixed(2)} ($${netAmount.toFixed(2)} after ${(TOTAL_FEE_PERCENT * 100).toFixed(1)}% total fee)`,
      metadata: {
        provider: 'coincircuit',
        session_id: session.id,
        gross_amount: grossAmount,
        net_amount: netAmount,
        fee_amount: feeAmount,
      },
    });

    console.log(
      `[CoinCircuit Webhook] Credited org ${orgId} with $${netAmount.toFixed(2)} (gross: $${grossAmount.toFixed(2)}) from session ${session.reference}`
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
