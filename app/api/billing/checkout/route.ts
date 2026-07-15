import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import { createCheckoutSession, getProductId } from '@/lib/bachsClient';

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orgId, interval, tier = 'pro' } = await req.json();
  if (!orgId || !interval) {
    return NextResponse.json(
      { error: 'Missing orgId or interval' },
      { status: 400 }
    );
  }

  const { data: member, error: memberError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberError || !member) {
    console.error('[Checkout] Membership check error:', memberError);
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const returnUrl = new URL(
    `/${orgId}/billing`,
    req.url
  );
  const cancelUrl = new URL('/pricing', req.url);

  try {
    const session = await createCheckoutSession({
      product_cart: [
        { product_id: getProductId(tier, interval), quantity: 1 },
      ],
      customer: {
        email: user.email,
        name: user.user_metadata?.full_name || user.email.split('@')[0] || 'Customer',
      },
      return_url: returnUrl.toString(),
      cancel_url: cancelUrl.toString(),
      metadata: {
        org_id: orgId,
        purchase_type: 'subscription',
      },
    });

    return NextResponse.json({ checkoutUrl: session.checkout_url });
  } catch (err) {
    console.error('[Checkout] Bachs API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Checkout creation failed' },
      { status: 502 }
    );
  }
}
