import "server-only";

import type Stripe from "stripe";

import { getStripeBillingClient } from "@/lib/stripe-billing";
import type { BillingTaxIdType } from "@/lib/billing/tax-id-types";

export interface BillingProfileAddress {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
}

interface StripeCustomerProfileInput {
    customerId: string | null;
    organizationId: string;
    organizationSlug: string;
    name: string;
    email: string;
    address: BillingProfileAddress;
    clearEmptyAddress?: boolean;
    preserveEmptyEmail?: boolean;
    validateTaxLocation?: boolean;
}

interface StripeCustomerTaxIdInput {
    customer: Stripe.Customer;
    previousTaxId: string | null;
    taxId: string | null;
    taxType: BillingTaxIdType | null;
}

function hasAddress(address: BillingProfileAddress): boolean {
    return Object.values(address).some((value) => value.trim().length > 0);
}

function toStripeAddress(address: BillingProfileAddress): Stripe.AddressParam {
    return {
        line1: address.line1 || undefined,
        line2: address.line2 || undefined,
        city: address.city || undefined,
        state: address.state || undefined,
        postal_code: address.postalCode || undefined,
        country: address.country ? address.country.toUpperCase() : undefined,
    };
}

function normalizeTaxId(value: string): string {
    return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export async function upsertStripeCustomerProfile(
    input: StripeCustomerProfileInput,
): Promise<Stripe.Customer> {
    const stripe = getStripeBillingClient();
    const address = hasAddress(input.address) ? toStripeAddress(input.address) : undefined;
    const tax = input.validateTaxLocation && input.address.country && input.address.postalCode
        ? { validate_location: "immediately" as const }
        : undefined;

    if (input.customerId) {
        return stripe.customers.update(input.customerId, {
            name: input.name,
            ...(!input.preserveEmptyEmail || input.email ? { email: input.email } : {}),
            ...(address
                ? { address }
                : input.clearEmptyAddress
                    ? { address: "" as const }
                    : {}),
            tax,
            metadata: {
                cencori_org_id: input.organizationId,
                cencori_org_slug: input.organizationSlug,
            },
        });
    }

    return stripe.customers.create(
        {
            name: input.name,
            email: input.email || undefined,
            address,
            tax,
            metadata: {
                cencori_org_id: input.organizationId,
                cencori_org_slug: input.organizationSlug,
            },
        },
        { idempotencyKey: `cencori-org-${input.organizationId}-customer` },
    );
}

export async function syncStripeCustomerTaxId({
    customer,
    previousTaxId,
    taxId,
    taxType,
}: StripeCustomerTaxIdInput): Promise<void> {
    const stripe = getStripeBillingClient();
    const existingTaxIds = await stripe.customers.listTaxIds(customer.id, { limit: 100 });
    const managedTaxIdId = customer.metadata.cencori_tax_id_id || null;
    const previousNormalized = previousTaxId ? normalizeTaxId(previousTaxId) : null;
    const managedTaxId = existingTaxIds.data.find((item) => item.id === managedTaxIdId)
        ?? existingTaxIds.data.find((item) => (
            previousNormalized && normalizeTaxId(item.value) === previousNormalized
        ));

    if (!taxId || !taxType) {
        if (managedTaxId) {
            await stripe.customers.deleteTaxId(customer.id, managedTaxId.id);
        }
        await stripe.customers.update(customer.id, {
            metadata: {
                cencori_tax_id_id: "",
                cencori_tax_id_type: "",
            },
        });
        return;
    }

    const normalizedTarget = normalizeTaxId(taxId);
    const matchingTaxId = existingTaxIds.data.find((item) => (
        item.type === taxType && normalizeTaxId(item.value) === normalizedTarget
    ));
    const targetTaxId = matchingTaxId ?? await stripe.customers.createTaxId(customer.id, {
        type: taxType as Stripe.CustomerCreateTaxIdParams.Type,
        value: taxId,
    });

    if (managedTaxId && managedTaxId.id !== targetTaxId.id) {
        await stripe.customers.deleteTaxId(customer.id, managedTaxId.id);
    }

    await stripe.customers.update(customer.id, {
        metadata: {
            cencori_tax_id_id: targetTaxId.id,
            cencori_tax_id_type: taxType,
        },
    });
}
