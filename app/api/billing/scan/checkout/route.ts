import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createCheckoutSession, getScanProductId } from '@/lib/bachsClient';

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { tier = 'scan' } = await req.json();

  const returnUrl = new URL('/dashboard/scan', req.url);
  const cancelUrl = new URL('/pricing', req.url);

  const session = await createCheckoutSession({
    product_cart: [
      { product_id: getScanProductId(tier as 'scan' | 'scan_team'), quantity: 1 },
    ],
    customer: {
      email: user.email,
      name: user.user_metadata?.full_name,
    },
    return_url: returnUrl.toString(),
    cancel_url: cancelUrl.toString(),
    metadata: {
      user_id: user.id,
      purchase_type: 'scan_subscription',
    },
  });

  return NextResponse.json({ url: session.checkout_url });
}
