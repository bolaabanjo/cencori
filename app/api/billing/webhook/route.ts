import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import {
  verifyBachsWebhook,
  getProductTypeFromId,
  getSubscriptionTierFromProductId,
  getBillingInterval,
  getScanTierByProductId,
  getCreditTopupCreditsByProductId,
  netCreditsAfterFee,
  computePeriodEnd,
  type BachsWebhookEvent,
} from '@/lib/bachsClient';
import { addCredits } from '@/lib/credits';

export const runtime = 'nodejs';

async function handleCollectionSucceeded(
  data: BachsWebhookEvent['data'],
  supabase: ReturnType<typeof createAdminClient>
) {
  const productId = data.product_cart[0]?.product_id;
  if (!productId) {
    console.warn('[Bachs Webhook] No product_id in product_cart', data.charge_id);
    return;
  }

  const productType =
    data.metadata?.purchase_type || getProductTypeFromId(productId);

  switch (productType) {
    case 'subscription': {
      let orgId: string | undefined = data.metadata?.org_id;

      if (!orgId) {
        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('bachs_customer_id', data.customer.id)
          .maybeSingle();
        if (!org) {
          console.warn(
            '[Bachs Webhook] Could not resolve org for subscription',
            data.charge_id
          );
          return;
        }
        orgId = org.id;
      }

      const tier = getSubscriptionTierFromProductId(productId);
      if (!tier) {
        console.warn('[Bachs Webhook] Unknown subscription product', productId);
        return;
      }

      const interval = getBillingInterval(productId);
      const now = new Date();
      const periodEnd = interval
        ? computePeriodEnd(interval, now)
        : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const { error } = await supabase
        .from('organizations')
        .update({
          subscription_tier: tier,
          subscription_status: 'active',
          subscription_current_period_start: now.toISOString(),
          subscription_current_period_end: periodEnd.toISOString(),
          subscription_id: data.checkout_id,
          bachs_customer_id: data.customer.id,
        })
        .eq('id', orgId);

      if (error) {
        console.error('[Bachs Webhook] Failed to update org subscription', error);
      }
      break;
    }

    case 'credits_topup': {
      const orgId = data.metadata?.org_id;
      if (!orgId) {
        console.warn(
          '[Bachs Webhook] Missing org_id in metadata for credits topup',
          data.charge_id
        );
        return;
      }

      const grossCredits = getCreditTopupCreditsByProductId(productId);
      if (!grossCredits) {
        console.warn('[Bachs Webhook] Unknown credits product', productId);
        return;
      }

      await addCredits(
        orgId,
        netCreditsAfterFee(grossCredits),
        'topup',
        'Bachs credits top-up'
      );

      await supabase
        .from('organizations')
        .update({ bachs_customer_id: data.customer.id })
        .eq('id', orgId);
      break;
    }

    case 'scan_subscription': {
      let userId: string | undefined = data.metadata?.user_id;

      if (!userId) {
        const { data: sub } = await supabase
          .from('scan_subscriptions')
          .select('user_id')
          .eq('bachs_customer_id', data.customer.id)
          .maybeSingle();
        if (sub) {
          userId = sub.user_id;
        } else {
          console.warn(
            '[Bachs Webhook] Could not resolve user for scan subscription',
            data.charge_id
          );
          return;
        }
      }

      const scanTier = getScanTierByProductId(productId);
      if (!scanTier) {
        console.warn('[Bachs Webhook] Unknown scan product', productId);
        return;
      }

      const now = new Date();
      const { error } = await supabase.from('scan_subscriptions').upsert(
        {
          user_id: userId,
          scan_tier: scanTier,
          status: 'active',
          bachs_customer_id: data.customer.id,
          current_period_start: now.toISOString(),
          current_period_end: new Date(
            now.getTime() + 30 * 24 * 60 * 60 * 1000
          ).toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (error) {
        console.error(
          '[Bachs Webhook] Failed to upsert scan subscription',
          error
        );
      }
      break;
    }

    default:
      console.warn('[Bachs Webhook] Unhandled purchase type', {
        productType,
        productId,
      });
  }
}

async function handleCollectionFailed(
  data: BachsWebhookEvent['data'],
  supabase: ReturnType<typeof createAdminClient>
) {
  const customerId = data.customer.id;
  if (!customerId) return;

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('bachs_customer_id', customerId)
    .maybeSingle();

  if (org) {
    await supabase
      .from('organizations')
      .update({ subscription_status: 'past_due' })
      .eq('id', org.id);
  }

  const { data: scanSub } = await supabase
    .from('scan_subscriptions')
    .select('user_id')
    .eq('bachs_customer_id', customerId)
    .maybeSingle();

  if (scanSub) {
    await supabase
      .from('scan_subscriptions')
      .update({ status: 'past_due' })
      .eq('user_id', scanSub.user_id);
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  let event: BachsWebhookEvent;
  try {
    event = verifyBachsWebhook(
      rawBody,
      req.headers.get('X-Bachs-Timestamp') || '',
      req.headers.get('X-Bachs-Signature') || ''
    );
  } catch (err) {
    console.error('[Bachs Webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('event_id', event.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {
      case 'collection.succeeded':
        await handleCollectionSucceeded(event.data, supabase);
        break;
      case 'collection.failed':
        await handleCollectionFailed(event.data, supabase);
        break;
      case 'collection.abandoned':
      case 'collection.underpaid':
        break;
    }

    await supabase.from('webhook_events').insert({
      event_id: event.id,
      event_type: event.type,
      charge_id: event.data.charge_id || null,
      checkout_id: event.data.checkout_id || null,
      processed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Bachs Webhook] Processing error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
