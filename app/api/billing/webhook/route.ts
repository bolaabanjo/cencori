import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import {
  verifyBachsWebhook,
  getCharge,
  getProductTypeFromId,
  getSubscriptionTierFromProductId,
  getBillingInterval,
  getScanTierByProductId,
  getCreditTopupCreditsByProductId,
  getBasecodePlanByProductId,
  netCreditsAfterFee,
  computePeriodEnd,
  type BachsCollectionData,
  type BachsSubscriptionData,
  type BachsWebhookEvent,
} from '@/lib/bachsClient';
import {
  applyVerifiedBasecodePayment,
  majorAmountToMinor,
} from '@/lib/basecode-billing';
import { addCredits } from '@/lib/credits';
import {
  buildOrganizationSubscriptionUpdate,
  type SubscriptionLifecycleEventType,
} from '@/lib/billing/subscription-reconciliation';

export const runtime = 'nodejs';

async function handleCollectionSucceeded(
  data: BachsCollectionData,
  supabase: ReturnType<typeof createAdminClient>
) {
  const productId = data.product_cart?.[0]?.product_id;
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
          billing_provider: 'bachs',
          subscription_tier: tier,
          subscription_status: 'active',
          subscription_current_period_start: now.toISOString(),
          subscription_current_period_end: periodEnd.toISOString(),
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

    case 'basecode_subscription': {
      if (!data.charge_id) {
        throw new Error('Bachs Basecode collection is missing a charge ID');
      }
      const planCode = getBasecodePlanByProductId(productId);
      if (!planCode) {
        throw new Error(`Unknown Bachs Basecode product: ${productId}`);
      }

      // The signed webhook starts the workflow; the independently retrieved
      // charge is the only object allowed to grant the entitlement.
      const charge = await getCharge(data.charge_id);
      const amountMinor = majorAmountToMinor(charge.amount);
      if (
        !['succeeded', 'successful', 'paid'].includes(charge.status) ||
        !charge.reference ||
        charge.currency !== 'USD' ||
        !amountMinor
      ) {
        throw new Error('Bachs Basecode charge did not verify');
      }

      await applyVerifiedBasecodePayment(supabase, {
        provider: 'bachs',
        providerTransactionId: charge.charge_id,
        reference: charge.reference,
        amountMinor,
        currency: 'USD',
        paymentMethod: charge.payment_method,
        paidAt: charge.created_at,
        providerCustomerId: charge.customer.id,
        providerPayload: charge as unknown as Record<string, unknown>,
        planCode,
      });
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
  data: BachsCollectionData,
  supabase: ReturnType<typeof createAdminClient>
) {
  const customerId = data.customer.id;
  if (!customerId) return;

  const { data: org } = await supabase
    .from('organizations')
    .select('id, billing_provider')
    .eq('bachs_customer_id', customerId)
    .maybeSingle();

  if (org && org.billing_provider !== 'stripe') {
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

async function resolveSubscriptionOrganizationId(
  data: BachsSubscriptionData,
  supabase: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  if (data.metadata?.org_id) return data.metadata.org_id;

  const { data: subscriptionOrg } = await supabase
    .from('organizations')
    .select('id')
    .eq('subscription_id', data.subscription_id)
    .maybeSingle();
  if (subscriptionOrg?.id) return subscriptionOrg.id;

  const { data: customerOrg } = await supabase
    .from('organizations')
    .select('id')
    .eq('bachs_customer_id', data.customer.customer_id)
    .maybeSingle();

  return customerOrg?.id || null;
}

async function handleSubscriptionLifecycle(
  data: BachsSubscriptionData,
  eventType: SubscriptionLifecycleEventType,
  supabase: ReturnType<typeof createAdminClient>
) {
  const productType = getProductTypeFromId(data.product_id);

  if (productType === 'subscription') {
    const orgId = await resolveSubscriptionOrganizationId(data, supabase);
    if (!orgId) {
      console.warn('[Bachs Webhook] Could not resolve org for subscription event', {
        subscriptionId: data.subscription_id,
        eventType,
      });
      return;
    }

    const tier = getSubscriptionTierFromProductId(data.product_id);
    const update = buildOrganizationSubscriptionUpdate(data, eventType, tier);
    if (!update) {
      console.warn('[Bachs Webhook] Unknown subscription product', data.product_id);
      return;
    }

    const { data: organization } = await supabase
      .from('organizations')
      .select('billing_provider')
      .eq('id', orgId)
      .maybeSingle();

    if (organization?.billing_provider === 'stripe') {
      console.warn('[Bachs Webhook] Ignoring legacy subscription event for Stripe organization', {
        orgId,
        subscriptionId: data.subscription_id,
        eventType,
      });
      return;
    }

    const { error } = await supabase
      .from('organizations')
      .update(update)
      .eq('id', orgId);

    if (error) {
      console.error('[Bachs Webhook] Failed to reconcile subscription', error);
    }
    return;
  }

  if (productType === 'scan_subscription') {
    const scanTier = getScanTierByProductId(data.product_id);
    if (!scanTier) {
      console.warn('[Bachs Webhook] Unknown scan subscription product', data.product_id);
      return;
    }

    let userId = data.metadata?.user_id;
    if (!userId) {
      const { data: existing } = await supabase
        .from('scan_subscriptions')
        .select('user_id')
        .or(
          `subscription_id.eq.${data.subscription_id},bachs_customer_id.eq.${data.customer.customer_id}`
        )
        .maybeSingle();
      userId = existing?.user_id;
    }

    if (!userId) {
      console.warn('[Bachs Webhook] Could not resolve user for scan subscription event', {
        subscriptionId: data.subscription_id,
        eventType,
      });
      return;
    }

    const { error } = await supabase.from('scan_subscriptions').upsert(
      {
        user_id: userId,
        subscription_id: data.subscription_id,
        bachs_customer_id: data.customer.customer_id,
        scan_tier: scanTier,
        status: data.status,
        current_period_start: data.current_period_start,
        current_period_end: data.current_period_end,
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      console.error('[Bachs Webhook] Failed to reconcile scan subscription', error);
    }
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
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionLifecycle(event.data, event.type, supabase);
        break;
    }

    const chargeId = 'charge_id' in event.data ? event.data.charge_id : null;
    const checkoutId = 'checkout_id' in event.data ? event.data.checkout_id : null;

    await supabase.from('webhook_events').insert({
      event_id: event.id,
      event_type: event.type,
      charge_id: chargeId,
      checkout_id: checkoutId,
      processed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Bachs Webhook] Processing error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
