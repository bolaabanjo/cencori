'use server'

import { createServerClient } from "@/lib/supabaseServer";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adjustCredits } from "@/lib/credits";
import { revalidatePath } from "next/cache";
import { listPayins, getProductId } from "@/lib/bachsClient";
import type { BachsPayin } from "@/lib/bachsClient";

type OrgBillingDetails = {
    id: string;
    slug: string;
    name: string;
    owner_id: string;
    billing_email: string | null;
    bachs_customer_id: string | null;
    subscription_id: string | null;
    subscription_tier: 'free' | 'pro' | 'team' | 'enterprise';
    billing_frozen?: boolean | null;
    billing_freeze_reason?: string | null;
    billing_frozen_at?: string | null;
};

type OperatorContext = {
    org: OrgBillingDetails;
    actor: {
        userId: string;
        email: string | null;
    };
};

export type BillingInvoice = {
    id: string;
    orderId: string;
    date: string;
    amount: number;
    status: 'paid' | 'pending' | 'refunded';
    pdfUrl: string | null;
};

export type BillingPaymentMethod = {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
};

export type BillingAuditEvent = {
    id: string;
    action: 'manual_refund' | 'manual_adjustment' | 'freeze' | 'unfreeze';
    amount: number | null;
    reason: string | null;
    actorEmail: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
};

export type BillingOperationsState = {
    allowed: boolean;
    frozen: boolean;
    freezeReason: string | null;
    frozenAt: string | null;
    events: BillingAuditEvent[];
};

function getAppBaseUrl() {
    return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
}

async function getAuthorizedOrgBillingDetails(orgSlug: string): Promise<{ org: OrgBillingDetails } | { error: string }> {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return { error: 'Unauthorized' };
    }

    const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, slug, name, owner_id, billing_email, bachs_customer_id, subscription_id, subscription_tier')
        .eq('slug', orgSlug)
        .maybeSingle();

    if (orgError || !org) {
        return { error: 'Organization not found' };
    }

    let hasAccess = org.owner_id === user.id;
    if (!hasAccess) {
        const { data: membership, error: membershipError } = await supabase
            .from('organization_members')
            .select('role')
            .eq('organization_id', org.id)
            .eq('user_id', user.id)
            .maybeSingle();

        if (membershipError) {
            console.error('[Billing Actions] Membership check failed:', membershipError);
            return { error: 'Failed to verify organization access' };
        }

        hasAccess = !!membership;
    }

    if (!hasAccess) {
        return { error: 'Forbidden' };
    }

    return {
        org: org as OrgBillingDetails
    };
}

async function getAuthorizedOrgOperatorContext(orgSlug: string): Promise<OperatorContext | { error: string }> {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return { error: 'Unauthorized' };
    }

    const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, slug, name, owner_id, billing_email, bachs_customer_id, subscription_id, subscription_tier, billing_frozen, billing_freeze_reason, billing_frozen_at')
        .eq('slug', orgSlug)
        .maybeSingle();

    if (orgError || !org) {
        return { error: 'Organization not found' };
    }

    if (org.owner_id === user.id) {
        return {
            org: org as OrgBillingDetails,
            actor: {
                userId: user.id,
                email: user.email ?? null,
            },
        };
    }

    const { data: membership, error: membershipError } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .maybeSingle();

    if (membershipError) {
        console.error('[Billing Actions] Operator membership check failed:', membershipError);
        return { error: 'Failed to verify organization access' };
    }

    if (membership?.role !== 'admin') {
        return { error: 'Forbidden' };
    }

    return {
        org: org as OrgBillingDetails,
        actor: {
            userId: user.id,
            email: user.email ?? null,
        },
    };
}

async function writeBillingAuditEvent(params: {
    organizationId: string;
    actorUserId: string;
    actorEmail: string | null;
    action: 'manual_refund' | 'manual_adjustment' | 'freeze' | 'unfreeze';
    amount?: number | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
}) {
    const adminClient = createAdminClient();
    const { error } = await adminClient
        .from('billing_audit_events')
        .insert({
            organization_id: params.organizationId,
            actor_user_id: params.actorUserId,
            actor_email: params.actorEmail,
            action: params.action,
            amount: params.amount ?? null,
            reason: params.reason ?? null,
            metadata: params.metadata ?? {},
        });

    if (error) {
        console.error('[Billing Actions] Failed to write billing audit event:', error);
    }
}

export async function getInvoices(orgSlug: string) {
    try {
        const orgResult = await getAuthorizedOrgBillingDetails(orgSlug);
        if ('error' in orgResult) {
            return [];
        }

        const customerId = orgResult.org.bachs_customer_id;
        if (!customerId) {
            return [];
        }

        const response = await listPayins({ customer_id: customerId, per_page: 20 });

        const payins = response.payins || [];

        return payins.map((payin: BachsPayin): BillingInvoice => {
            const status: BillingInvoice['status'] =
                payin.status === 'SUCCEEDED' || payin.status === 'SETTLED'
                    ? 'paid'
                    : payin.status === 'PENDING'
                        ? 'pending'
                        : 'refunded';

            return {
                id: payin.id,
                orderId: payin.charge_id || payin.id,
                date: payin.created_at,
                amount: Math.round(parseFloat(payin.amount) * 100) / 100,
                status,
                pdfUrl: null,
            };
        });
    } catch (error) {
        console.error("Error fetching invoices:", error);
        return [];
    }
}

export async function getPaymentMethods(
    _orgSlug: string
): Promise<BillingPaymentMethod[]> {
    return [];
}

export async function getCustomerPortalUrl(orgSlug: string) {
    try {
        const orgResult = await getAuthorizedOrgBillingDetails(orgSlug);
        if ('error' in orgResult) {
            return null;
        }

        const billingReturnUrl = `${getAppBaseUrl()}/dashboard/organizations/${orgResult.org.slug}/billing`;

        if (orgResult.org.subscription_tier === 'pro' || orgResult.org.subscription_tier === 'team' || orgResult.org.subscription_tier === 'free') {
            const checkoutTier = orgResult.org.subscription_tier === 'team' ? 'team' : 'pro';
            const { checkout_url } = await fetch(
                `${process.env.BACHS_API_BASE || (process.env.NODE_ENV === 'production' ? 'https://api.bachs.io/v1' : 'https://sandbox-api.bachs.io/v1')}/checkout-sessions`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.BACHS_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        product_cart: [{ product_id: getProductId(checkoutTier, 'month'), quantity: 1 }],
                        customer: { email: orgResult.org.billing_email || '', name: orgResult.org.name || orgResult.org.slug },
                        return_url: billingReturnUrl,
                        cancel_url: billingReturnUrl,
                        metadata: { org_id: orgResult.org.id, org_slug: orgResult.org.slug, purchase_type: 'subscription' },
                    }),
                }
            ).then(r => r.json()).catch(() => ({ checkout_url: null }));

            return checkout_url || null;
        }

        return null;
    } catch (error) {
        console.error("Error creating billing session:", error);
        return null;
    }
}

export async function updateBillingDetails(orgSlug: string, formData: FormData) {
    const orgResult = await getAuthorizedOrgBillingDetails(orgSlug);
    if ('error' in orgResult) {
        return { error: orgResult.error };
    }

    const supabase = await createServerClient();
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim();

    if (!name || !email) {
        return { error: 'Organization name and billing email are required.' };
    }

    const toNullable = (value: FormDataEntryValue | null) => {
        const normalized = typeof value === 'string' ? value.trim() : '';
        return normalized.length > 0 ? normalized : null;
    };

    const { error } = await supabase
        .from('organizations')
        .update({
            name,
            billing_email: email,
            billing_address_line1: toNullable(formData.get('line1')),
            billing_address_line2: toNullable(formData.get('line2')),
            billing_city: toNullable(formData.get('city')),
            billing_state: toNullable(formData.get('state')),
            billing_zip: toNullable(formData.get('zip')),
            billing_country: toNullable(formData.get('country')),
            billing_tax_id: toNullable(formData.get('taxId')),
        })
        .eq('id', orgResult.org.id);

    if (error) {
        console.error('Error updating billing details:', error);
        return { error: error.message };
    }

    revalidatePath(`/dashboard/organizations/${orgSlug}/billing`);
    return { success: true };
}

export async function getBillingOperationsState(orgSlug: string): Promise<BillingOperationsState> {
    const operatorContext = await getAuthorizedOrgOperatorContext(orgSlug);
    if ('error' in operatorContext) {
        return {
            allowed: false,
            frozen: false,
            freezeReason: null,
            frozenAt: null,
            events: [],
        };
    }

    const adminClient = createAdminClient();
    const { data: events, error } = await adminClient
        .from('billing_audit_events')
        .select('id, action, amount, reason, actor_email, metadata, created_at')
        .eq('organization_id', operatorContext.org.id)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('[Billing Actions] Failed to load billing audit events:', error);
    }

    return {
        allowed: true,
        frozen: Boolean(operatorContext.org.billing_frozen),
        freezeReason: operatorContext.org.billing_freeze_reason ?? null,
        frozenAt: operatorContext.org.billing_frozen_at ?? null,
        events: (events || []).map((event) => ({
            id: event.id,
            action: event.action,
            amount: event.amount !== null ? Number(event.amount) : null,
            reason: event.reason,
            actorEmail: event.actor_email,
            metadata: (event.metadata ?? {}) as Record<string, unknown>,
            createdAt: event.created_at,
        })),
    };
}

export async function applyManualCreditOperation(
    orgSlug: string,
    input: {
        operation: 'refund' | 'adjustment';
        amount: number;
        reason: string;
        direction?: 'credit' | 'debit';
    }
) {
    const operatorContext = await getAuthorizedOrgOperatorContext(orgSlug);
    if ('error' in operatorContext) {
        return { error: operatorContext.error };
    }

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { error: 'Amount must be greater than 0.' };
    }

    const reason = input.reason?.trim();
    if (!reason) {
        return { error: 'Reason is required.' };
    }

    let delta = amount;
    if (input.operation === 'adjustment' && input.direction === 'debit') {
        delta = -amount;
    }

    const transactionType = input.operation === 'refund' ? 'refund' : 'adjustment';
    const action = input.operation === 'refund' ? 'manual_refund' : 'manual_adjustment';

    const description = input.operation === 'refund'
        ? `Manual refund: ${reason}`
        : `Manual adjustment: ${reason}`;

    const success = await adjustCredits(
        operatorContext.org.id,
        delta,
        transactionType,
        description,
        {
            operator_user_id: operatorContext.actor.userId,
            operator_email: operatorContext.actor.email,
            direction: delta >= 0 ? 'credit' : 'debit',
            source: 'billing_operational_controls',
        }
    );

    if (!success) {
        return { error: 'Unable to apply this credit operation. Check balance and try again.' };
    }

    await writeBillingAuditEvent({
        organizationId: operatorContext.org.id,
        actorUserId: operatorContext.actor.userId,
        actorEmail: operatorContext.actor.email,
        action,
        amount: delta,
        reason,
        metadata: {
            operation: input.operation,
            direction: delta >= 0 ? 'credit' : 'debit',
            source: 'billing_operational_controls',
        },
    });

    revalidatePath(`/dashboard/organizations/${orgSlug}/billing`);
    return { success: true };
}

export async function setBillingFreezeState(
    orgSlug: string,
    input: {
        frozen: boolean;
        reason?: string;
    }
) {
    const operatorContext = await getAuthorizedOrgOperatorContext(orgSlug);
    if ('error' in operatorContext) {
        return { error: operatorContext.error };
    }

    const reason = input.reason?.trim() || null;
    if (input.frozen && !reason) {
        return { error: 'Freeze reason is required.' };
    }

    const adminClient = createAdminClient();
    const nowIso = new Date().toISOString();

    const { error } = await adminClient
        .from('organizations')
        .update({
            billing_frozen: input.frozen,
            billing_freeze_reason: input.frozen ? reason : null,
            billing_frozen_at: input.frozen ? nowIso : null,
            billing_frozen_by: input.frozen ? operatorContext.actor.userId : null,
        })
        .eq('id', operatorContext.org.id);

    if (error) {
        console.error('[Billing Actions] Failed to update billing freeze state:', error);
        return { error: 'Failed to update billing freeze state.' };
    }

    await writeBillingAuditEvent({
        organizationId: operatorContext.org.id,
        actorUserId: operatorContext.actor.userId,
        actorEmail: operatorContext.actor.email,
        action: input.frozen ? 'freeze' : 'unfreeze',
        reason: reason ?? (input.frozen ? 'Manual freeze applied' : 'Manual freeze removed'),
        metadata: {
            source: 'billing_operational_controls',
            frozen: input.frozen,
        },
    });

    revalidatePath(`/dashboard/organizations/${orgSlug}/billing`);
    return { success: true };
}
