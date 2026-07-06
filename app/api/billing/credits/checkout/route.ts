import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabaseServer';
import {
  createCheckoutSession,
  BACHS_CONFIG,
  getCreditTopupPackConfig,
} from '@/lib/bachsClient';

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orgId, productId } = await req.json();
  if (!orgId || !productId) {
    return NextResponse.json(
      { error: 'Missing orgId or productId' },
      { status: 400 }
    );
  }

  const pack = getCreditTopupPackConfig(productId);
  if (!pack) {
    return NextResponse.json({ error: 'Invalid product' }, { status: 400 });
  }

  const { data: member } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!member) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const returnUrl = new URL(
    `/dashboard/organizations/${orgId}/billing`,
    req.url
  );
  const cancelUrl = new URL('/pricing', req.url);

  const session = await createCheckoutSession({
    product_cart: [{ product_id: productId, quantity: 1 }],
    customer: {
      email: user.email,
      name: user.user_metadata?.full_name,
    },
    return_url: returnUrl.toString(),
    cancel_url: cancelUrl.toString(),
    metadata: {
      org_id: orgId,
      purchase_type: 'credits_topup',
    },
  });

  return NextResponse.json({ url: session.checkout_url });
}
