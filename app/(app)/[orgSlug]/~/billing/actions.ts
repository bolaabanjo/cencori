'use server'

import { createServerClient } from "@/lib/supabaseServer";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adjustCredits } from "@/lib/credits";
import { revalidatePath } from "next/cache";
import { listPayins } from "@/lib/bachsClient";
import type { BachsPayin } from "@/lib/bachsClient";
import { getStripeBillingClient } from "@/lib/stripe-billing";
import {
    upsertStripeCustomerProfile,
    syncStripeCustomerTaxId,
    type BillingProfileAddress,
} from "@/lib/billing/stripe-customer-profile";
import {
    getBillingTaxIdOptions,
    isBillingTaxIdType,
    type BillingTaxIdType,
} from "@/lib/billing/tax-id-types";

type OrgBillingDetails = {
    id: string;
    slug: string;
    name: string;
    owner_id: string;
    billing_email: string | null;
    billing_address_line1: string | null;
    billing_address_line2: string | null;
    billing_city: string | null;
    billing_state: string | null;
    billing_zip: string | null;
    billing_country: string | null;
    billing_tax_id: string | null;
    bachs_customer_id: string | null;
    stripe_customer_id: string | null;
    billing_provider: 'stripe' | 'bachs' | 'polar' | null;
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
    status: 'paid' | 'pending' | 'failed' | 'refunded';
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

async function getAuthorizedOrgBillingDetails(orgSlug: string): Promise<{ org: OrgBillingDetails } | { error: string }> {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        return { error: 'Unauthorized' };
    }

    const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, slug, name, owner_id, billing_email, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip, billing_country, billing_tax_id, bachs_customer_id, stripe_customer_id, billing_provider, subscription_id, subscription_tier')
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
        .select('id, slug, name, owner_id, billing_email, bachs_customer_id, stripe_customer_id, billing_provider, subscription_id, subscription_tier, billing_frozen, billing_freeze_reason, billing_frozen_at')
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

        const stripeCustomerId = orgResult.org.stripe_customer_id;
        if (stripeCustomerId) {
            try {
                const stripe = getStripeBillingClient();
                const invoices = await stripe.invoices.list({
                    customer: stripeCustomerId,
                    limit: 20,
                });

                return invoices.data.map((invoice): BillingInvoice => {
                    const status: BillingInvoice['status'] = invoice.status === 'paid'
                        ? 'paid'
                        : invoice.status === 'open' || invoice.status === 'draft'
                            ? 'pending'
                            : invoice.status === 'void'
                                ? 'refunded'
                                : 'failed';

                    return {
                        id: invoice.number || invoice.id,
                        orderId: invoice.id,
                        date: new Date(invoice.created * 1000).toISOString(),
                        amount: (invoice.amount_paid || invoice.amount_due) / 100,
                        status,
                        pdfUrl: invoice.invoice_pdf || invoice.hosted_invoice_url || null,
                    };
                });
            } catch (stripeError) {
                console.error("Error fetching Stripe invoices:", stripeError);
            }
        }

        const customerId = orgResult.org.bachs_customer_id;
        if (!customerId) return [];

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
    orgSlug: string
): Promise<BillingPaymentMethod[]> {
    try {
        const orgResult = await getAuthorizedOrgBillingDetails(orgSlug);
        if ('error' in orgResult || !orgResult.org.stripe_customer_id) {
            return [];
        }

        const stripe = getStripeBillingClient();
        const customerId = orgResult.org.stripe_customer_id;
        const [customer, methods] = await Promise.all([
            stripe.customers.retrieve(customerId),
            stripe.paymentMethods.list({ customer: customerId, type: 'card' }),
        ]);
        const defaultPaymentMethod = !customer.deleted
            ? customer.invoice_settings.default_payment_method
            : null;
        const defaultPaymentMethodId = typeof defaultPaymentMethod === 'string'
            ? defaultPaymentMethod
            : defaultPaymentMethod?.id || null;

        return methods.data.flatMap((method): BillingPaymentMethod[] => {
            if (!method.card) return [];
            return [{
                id: method.id,
                brand: method.card.brand,
                last4: method.card.last4,
                expMonth: method.card.exp_month,
                expYear: method.card.exp_year,
                isDefault: method.id === defaultPaymentMethodId,
            }];
        });
    } catch (error) {
        console.error("Error fetching Stripe payment methods:", error);
        return [];
    }
}

export type BillingAddressProfileUpdate = {
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
};

function normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function toNullableText(value: unknown): string | null {
    const normalized = normalizeText(value);
    return normalized.length > 0 ? normalized : null;
}

function toBillingProfileAddress(input: BillingAddressProfileUpdate): BillingProfileAddress {
    return {
        line1: normalizeText(input.line1),
        line2: normalizeText(input.line2),
        city: normalizeText(input.city),
        state: normalizeText(input.state),
        postalCode: normalizeText(input.postalCode),
        country: normalizeText(input.country).toUpperCase(),
    };
}

async function persistStripeCustomerId(organizationId: string, customerId: string): Promise<string | null> {
    const admin = createAdminClient();
    const { error } = await admin
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', organizationId);

    if (error) {
        console.error('[Billing Actions] Failed to persist Stripe customer ID:', error);
        return 'Stripe was updated, but its customer reference could not be saved locally.';
    }

    return null;
}

export async function getBillingTaxIdType(orgSlug: string): Promise<BillingTaxIdType | null> {
    const orgResult = await getAuthorizedOrgBillingDetails(orgSlug);
    if ('error' in orgResult || !orgResult.org.stripe_customer_id || !orgResult.org.billing_tax_id) {
        return null;
    }

    try {
        const stripe = getStripeBillingClient();
        const taxIds = await stripe.customers.listTaxIds(orgResult.org.stripe_customer_id, { limit: 100 });
        const normalizedValue = orgResult.org.billing_tax_id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const matchingTaxId = taxIds.data.find((item) => (
            item.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() === normalizedValue
        ));

        return matchingTaxId && isBillingTaxIdType(matchingTaxId.type)
            ? matchingTaxId.type
            : null;
    } catch (error) {
        console.error('[Billing Actions] Failed to read Stripe tax ID type:', error);
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
    const address = toBillingProfileAddress({
        line1: normalizeText(formData.get('line1')),
        line2: normalizeText(formData.get('line2')),
        city: normalizeText(formData.get('city')),
        state: normalizeText(formData.get('state')),
        postalCode: normalizeText(formData.get('zip')),
        country: normalizeText(formData.get('country')),
    });
    const taxId = normalizeText(formData.get('taxId'));
    const requestedTaxType = normalizeText(formData.get('taxType'));

    if (!name || !email) {
        return { error: 'Organization name and billing email are required.' };
    }

    const taxTypeOptions = getBillingTaxIdOptions(address.country);
    const requestedTypeIsValid = requestedTaxType
        && isBillingTaxIdType(requestedTaxType)
        && taxTypeOptions.some((option) => option.value === requestedTaxType);
    const taxType = taxId
        ? requestedTypeIsValid
            ? requestedTaxType as BillingTaxIdType
            : taxTypeOptions.length === 1
                ? taxTypeOptions[0].value
                : null
        : null;

    if (taxId && taxTypeOptions.length > 0 && !taxType) {
        return { error: 'Select the tax ID type before saving.' };
    }

    const { error } = await supabase
        .from('organizations')
        .update({
            name,
            billing_email: email,
            billing_address_line1: toNullableText(address.line1),
            billing_address_line2: toNullableText(address.line2),
            billing_city: toNullableText(address.city),
            billing_state: toNullableText(address.state),
            billing_zip: toNullableText(address.postalCode),
            billing_country: toNullableText(address.country),
            billing_tax_id: toNullableText(taxId),
        })
        .eq('id', orgResult.org.id);

    if (error) {
        console.error('Error updating billing details:', error);
        return { error: error.message };
    }

    const warnings: string[] = [];
    try {
        const customer = await upsertStripeCustomerProfile({
            customerId: orgResult.org.stripe_customer_id,
            organizationId: orgResult.org.id,
            organizationSlug: orgResult.org.slug,
            name,
            email,
            address,
            clearEmptyAddress: true,
            validateTaxLocation: true,
        });

        if (!orgResult.org.stripe_customer_id) {
            const persistenceWarning = await persistStripeCustomerId(orgResult.org.id, customer.id);
            if (persistenceWarning) warnings.push(persistenceWarning);
        }

        if (!taxId || taxType) {
            await syncStripeCustomerTaxId({
                customer,
                previousTaxId: orgResult.org.billing_tax_id,
                taxId: taxId || null,
                taxType,
            });
        } else {
            warnings.push('The billing profile was saved, but Stripe does not support a tax ID type for the selected country.');
        }
    } catch (stripeError) {
        console.error('[Billing Actions] Stripe billing profile sync failed:', stripeError);
        warnings.push('Billing details were saved locally, but Stripe could not be updated.');
    }

    revalidatePath(`/${orgSlug}/~/billing`);
    return {
        success: true,
        warning: warnings.length > 0 ? warnings.join(' ') : undefined,
    };
}

export async function updateBillingAddressFromPaymentMethod(
    orgSlug: string,
    input: BillingAddressProfileUpdate,
) {
    const orgResult = await getAuthorizedOrgBillingDetails(orgSlug);
    if ('error' in orgResult) {
        return { error: orgResult.error };
    }

    const address = toBillingProfileAddress(input);
    if (!address.country || !/^[A-Z]{2}$/.test(address.country)) {
        return { error: 'A valid billing country is required.' };
    }

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('organizations')
        .update({
            billing_address_line1: toNullableText(address.line1),
            billing_address_line2: toNullableText(address.line2),
            billing_city: toNullableText(address.city),
            billing_state: toNullableText(address.state),
            billing_zip: toNullableText(address.postalCode),
            billing_country: address.country,
        })
        .eq('id', orgResult.org.id);

    if (error) {
        console.error('[Billing Actions] Failed to update the billing address:', error);
        return { error: error.message };
    }

    let warning: string | undefined;
    try {
        const customer = await upsertStripeCustomerProfile({
            customerId: orgResult.org.stripe_customer_id,
            organizationId: orgResult.org.id,
            organizationSlug: orgResult.org.slug,
            name: orgResult.org.name,
            email: orgResult.org.billing_email || '',
            address,
            preserveEmptyEmail: true,
            validateTaxLocation: true,
        });

        if (!orgResult.org.stripe_customer_id) {
            warning = await persistStripeCustomerId(orgResult.org.id, customer.id) || undefined;
        }
    } catch (stripeError) {
        console.error('[Billing Actions] Stripe address sync failed:', stripeError);
        warning = 'The invoice address was saved locally, but Stripe could not be updated.';
    }

    revalidatePath(`/${orgSlug}/~/billing`);
    return { success: true, warning };
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

    revalidatePath(`/${orgSlug}/~/billing`);
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

    revalidatePath(`/${orgSlug}/~/billing`);
    return { success: true };
}
