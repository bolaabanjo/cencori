import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { createServerClient } from '@/lib/supabaseServer';
import { createPaymentSession } from '@/lib/coincircuit';

type CreditPack = 'starter' | 'growth' | 'scale';

type CryptoCheckoutRequestBody = {
  orgId?: string;
  pack?: CreditPack;
};

const CREDIT_PACKS: CreditPack[] = ['starter', 'growth', 'scale'];

const CREDIT_PACK_AMOUNTS: Record<CreditPack, number> = {
  starter: 10,
  growth: 50,
  scale: 200,
};

function isValidPack(value: unknown): value is CreditPack {
  return typeof value === 'string' && CREDIT_PACKS.includes(value as CreditPack);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId, pack } = await req.json() as CryptoCheckoutRequestBody;

    if (!orgId || !pack) {
      return NextResponse.json(
        { error: 'Missing required fields: orgId, pack' },
        { status: 400 }
      );
    }

    if (!isValidPack(pack)) {
      return NextResponse.json(
        { error: 'Invalid pack. Must be one of: starter, growth, scale' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id, slug, name, owner_id, billing_email')
      .eq('id', orgId)
      .maybeSingle();

    if (orgError || !org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    let hasOrgAccess = org.owner_id === user.id;
    if (!hasOrgAccess) {
      const { data: membership, error: membershipError } = await supabaseAdmin
        .from('organization_members')
        .select('role')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (membershipError) {
        console.error('[Crypto Checkout API] Membership check failed:', membershipError);
        return NextResponse.json(
          { error: 'Failed to verify organization access' },
          { status: 500 }
        );
      }

      hasOrgAccess = !!membership;
    }

    if (!hasOrgAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || req.nextUrl.origin).replace(/\/$/, '');
    const amount = String(CREDIT_PACK_AMOUNTS[pack]);
    const customerEmail = org.billing_email || user.email || '';

    const session = await createPaymentSession({
      title: 'Cencori Credits Top-Up',
      description: 'Prepaid credits for AI gateway usage',
      amount,
      currency: 'USD',
      customer: {
        email: customerEmail,
        firstName: org.name,
      },
      successUrl: `${appBaseUrl}/dashboard/organizations/${org.slug}/billing?success=true&topup=true`,
      webhookUrl: `${appBaseUrl}/api/billing/coincircuit-webhook`,
      metadata: {
        purchase_type: 'credits_topup',
        credit_pack: pack,
        credits_amount: amount,
        org_id: org.id,
        org_slug: org.slug,
      } as any,
    });

    return NextResponse.json({
      checkoutUrl: session.url,
      sessionReference: session.reference,
      sessionId: session.id,
      pack,
      credits: amount,
    });
  } catch (error: unknown) {
    console.error('[Crypto Checkout API] Error creating checkout:', error);

    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      {
        error: 'Failed to create crypto checkout session',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
