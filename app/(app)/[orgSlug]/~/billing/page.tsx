"use client";

import React, { useEffect, useState, use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from '@/lib/supabaseClient';
import { useSearchParams } from 'next/navigation';
import { getInvoices, getPaymentMethods } from './actions';
import { CreditCard, Info } from 'lucide-react';
import { motion, AnimatePresence } from "framer-motion";
import Link from 'next/link';
import { UpgradeDialog } from "@/components/billing/UpgradeDialog";
import { CENCORI_PAID_PLANS, isPaidPlanTier, type PaidPlanTier } from '@/lib/billing/plans';

import { PlanDetails } from "@/components/dashboard/billing/PlanDetails";
import { CostControl } from "@/components/dashboard/billing/CostControl";
import { CreditBalance } from "@/components/dashboard/billing/CreditBalance";
import { InvoiceHistory } from "@/components/dashboard/billing/InvoiceHistory";
import { BillingCommunication } from "@/components/dashboard/billing/BillingCommunication";
import { PaymentMethods } from "@/components/dashboard/billing/PaymentMethods";
import { OperationalControls } from "./OperationalControls";

interface Organization {
    id: string;
    slug: string;
    name: string;
    subscription_tier: 'free' | 'pro' | 'team' | 'enterprise';
    subscription_status: string;
    monthly_requests_used: number;
    monthly_request_limit: number;
    subscription_current_period_end: string | null;
    credits_balance: number;
    billing_email: string;
    billing_address_line1: string | null;
    billing_address_line2: string | null;
    billing_city: string | null;
    billing_state: string | null;
    billing_zip: string | null;
    billing_country: string | null;
    billing_tax_id: string | null;
}

interface ProjectData {
    id: string;
    slug: string;
    name: string;
    monthly_budget: number | null;
    spend_cap: number | null;
    enforce_spend_cap: boolean;
}

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

interface CreditTransaction {
    id: string;
    amount: number;
    transaction_type: string;
    description: string | null;
    created_at: string;
}

function useBillingData(orgSlug: string) {
    const orgQuery = useQuery({
        queryKey: ["orgBilling", orgSlug],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('organizations')
                .select('id, name, subscription_tier, subscription_status, monthly_requests_used, monthly_request_limit, subscription_current_period_end, credits_balance, billing_email, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip, billing_country, billing_tax_id')
                .eq('slug', orgSlug)
                .single();

            if (error || !data) throw new Error("Organization not found");
            return data as Organization;
        },
        staleTime: 30 * 1000,
    });

    const projectsQuery = useQuery({
        queryKey: ["orgProjectsBilling", orgQuery.data?.id],
        enabled: !!orgQuery.data?.id,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('projects')
                .select('id, slug, name, monthly_budget, spend_cap, enforce_spend_cap')
                .eq('organization_id', orgQuery.data!.id);

            if (error) throw error;
            return data as ProjectData[];
        },
    });

    const creditsQuery = useQuery({
        queryKey: ["orgCredits", orgQuery.data?.id],
        enabled: !!orgQuery.data?.id,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('credit_transactions')
                .select('*')
                .eq('organization_id', orgQuery.data!.id)
                .order('created_at', { ascending: false })
                .limit(5);

            if (error) return [];
            return (data || []) as CreditTransaction[];
        },
    });

    const invoicesQuery = useQuery({
        queryKey: ["orgInvoices", orgSlug],
        queryFn: () => getInvoices(orgSlug)
    });

    const paymentMethodsQuery = useQuery({
        queryKey: ["orgPaymentMethods", orgSlug],
        queryFn: () => getPaymentMethods(orgSlug)
    });

    return {
        org: orgQuery.data,
        projects: projectsQuery.data || [],
        transactions: creditsQuery.data || [],
        invoices: invoicesQuery.data || [],
        paymentMethods: paymentMethodsQuery.data || [],
        isLoading: orgQuery.isLoading
            || projectsQuery.isLoading
            || invoicesQuery.isLoading
            || paymentMethodsQuery.isLoading,
        refetchOrg: orgQuery.refetch,
        error: orgQuery.error
            || projectsQuery.error
            || invoicesQuery.error
            || paymentMethodsQuery.error
    };
}

type CheckoutNotice =
    | { kind: 'confirming'; expectedTier: PaidPlanTier | null }
    | { kind: 'cancelled' }
    | null;

export default function BillingPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    const searchParams = useSearchParams();
    const [checkoutNotice, setCheckoutNotice] = useState<CheckoutNotice>(null);
    const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
    const { org, projects, transactions, invoices, paymentMethods, isLoading, error, refetchOrg } = useBillingData(orgSlug);
    const checkoutId = searchParams.get('checkout_session_id') || searchParams.get('checkout_id');
    const checkoutCancelled = searchParams.get('checkout') === 'cancelled';
    const checkoutConfirmed = checkoutNotice?.kind === 'confirming'
        && checkoutNotice.expectedTier !== null
        && org?.subscription_tier === checkoutNotice.expectedTier
        && org.subscription_status === 'active';

    useEffect(() => {
        if (checkoutId) {
            const storedTier = sessionStorage.getItem(`cencori:stripe-checkout:${checkoutId}`)
                || sessionStorage.getItem(`cencori:checkout:${checkoutId}`);
            setCheckoutNotice({
                kind: 'confirming',
                expectedTier: isPaidPlanTier(storedTier) ? storedTier : null,
            });

            void refetchOrg();
            const refreshTimer = window.setInterval(() => void refetchOrg(), 2_000);
            const stopTimer = window.setTimeout(() => window.clearInterval(refreshTimer), 10_000);
            window.history.replaceState({}, '', window.location.pathname);

            return () => {
                window.clearInterval(refreshTimer);
                window.clearTimeout(stopTimer);
            };
        }

        if (checkoutCancelled) {
            setCheckoutNotice({ kind: 'cancelled' });
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [checkoutCancelled, checkoutId, refetchOrg]);

    useEffect(() => {
        if (checkoutConfirmed && checkoutId) {
            sessionStorage.removeItem(`cencori:stripe-checkout:${checkoutId}`);
            sessionStorage.removeItem(`cencori:checkout:${checkoutId}`);
        }
    }, [checkoutConfirmed, checkoutId]);

    if (isLoading) {
        return (
            <div className="mx-auto w-full max-w-[1120px] animate-pulse space-y-6 px-4 py-8 text-current/[0.1] sm:px-6 lg:px-8">
                <div className="space-y-3">
                    <Skeleton className="h-3 w-20 rounded-full bg-current/5" />
                    <Skeleton className="h-8 w-36 rounded bg-current/10" />
                    <Skeleton className="h-4 w-80 max-w-full rounded bg-current/5" />
                </div>
                <Skeleton className="h-72 rounded-[18px] bg-current/5" />
                <Skeleton className="h-72 rounded-[18px] bg-current/5" />
                <Skeleton className="h-56 rounded-[18px] bg-current/5" />
                <Skeleton className="h-64 rounded-[18px] bg-current/5" />
                <Skeleton className="h-80 rounded-[18px] bg-current/5" />
            </div>
        );
    }

    if (error || !org) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/[0.03] text-destructive/60">
                    <CreditCard className="h-8 w-8" />
                </div>
                <h2 className="text-lg font-medium tracking-tight">Billing unavailable</h2>
                <p className="max-w-[280px] text-center text-xs leading-5 text-muted-foreground">
                    Cencori could not load this organization&apos;s billing data. Check your connection and try again.
                </p>
                <Button
                    variant="outline"
                    className="h-7 rounded-md px-3 text-[11px] font-medium shadow-none"
                    onClick={() => window.location.reload()}
                >
                    Try again
                </Button>
            </div>
        );
    }

    // Mapping for project budget format
    const formattedProjects = projects.map(p => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        monthlyBudget: p.monthly_budget,
        spendCap: p.spend_cap,
        enforceSpendCap: p.enforce_spend_cap,
        currentSpend: 0
    }));

    // Mapping for credits format
    const formattedTransactions = transactions.map((t) => ({
        id: t.id,
        amount: t.amount,
        type: t.transaction_type,
        description: t.description || 'No description',
        createdAt: t.created_at
    }));

    return (
        <main className="mx-auto w-full max-w-[1120px] px-4 py-8 pb-28 sm:px-6 sm:py-10 lg:px-8">
            <header className="mb-9">
                <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Finance</div>
                <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em]">Billing</h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                    Plans, prepaid capacity, and spend controls for {org.name}.
                </p>
            </header>
            <AnimatePresence>
                {checkoutNotice && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className="mb-6"
                    >
                        <div className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 ${
                            checkoutNotice.kind === 'cancelled'
                                ? 'border-border bg-secondary/20 text-muted-foreground'
                                : checkoutConfirmed
                                    ? 'border-emerald-500/20 bg-emerald-500/[0.03] text-emerald-600 dark:text-emerald-400'
                                    : 'border-amber-500/20 bg-amber-500/[0.03] text-amber-600 dark:text-amber-400'
                        }`}>
                            <div className="text-xs font-medium">
                                {checkoutNotice.kind === 'cancelled'
                                    ? 'Checkout cancelled — no changes were made'
                                    : checkoutConfirmed
                                        ? 'Subscription active — your new plan is ready'
                                        : 'Payment submitted — activating your subscription'}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div>
                <PlanDetails
                    tier={org.subscription_tier}
                    status={org.subscription_status}
                    currentPeriodEnd={org.subscription_current_period_end}
                    price={isPaidPlanTier(org.subscription_tier) ? CENCORI_PAID_PLANS[org.subscription_tier].prices.month / 100 : 0}
                    monthlyRequestsUsed={org.monthly_requests_used}
                    monthlyRequestLimit={org.monthly_request_limit}
                    projectCount={projects.length}
                    projectLimit={org.subscription_tier === 'free' ? 1 : 999999}
                    creditBalance={org.credits_balance || 0}
                    actionLabel={org.subscription_tier === 'free' ? 'Upgrade Plan' : 'Current Plan'}
                    onAction={org.subscription_tier === 'free' ? () => setShowUpgradeDialog(true) : undefined}
                />

                <CreditBalance
                    orgId={org.id}
                    balance={org.credits_balance || 0}
                    transactions={formattedTransactions}
                />

                <PaymentMethods
                    orgSlug={orgSlug}
                    methods={paymentMethods}
                    billingAddress={{
                        name: org.name,
                        line1: org.billing_address_line1 || '',
                        line2: org.billing_address_line2 || '',
                        city: org.billing_city || '',
                        state: org.billing_state || '',
                        zip: org.billing_zip || '',
                        country: org.billing_country || '',
                    }}
                />

                <BillingCommunication
                    orgSlug={orgSlug}
                    email={org.billing_email || ''}
                    address={{
                        name: org.name,
                        line1: org.billing_address_line1 || '',
                        line2: org.billing_address_line2 || '',
                        city: org.billing_city || '',
                        state: org.billing_state || '',
                        zip: org.billing_zip || '',
                        country: org.billing_country || '',
                        taxId: org.billing_tax_id || ''
                    }}
                />

                <CostControl orgSlug={orgSlug} projects={formattedProjects} />

                <InvoiceHistory invoices={invoices} />

                <OperationalControls orgSlug={orgSlug} />

                <UpgradeDialog
                    open={showUpgradeDialog}
                    onOpenChange={setShowUpgradeDialog}
                    orgId={org.id}
                    orgSlug={orgSlug}
                    orgName={org.name}
                    currentTier={org.subscription_tier === 'pro' || org.subscription_tier === 'team' ? org.subscription_tier : 'free'}
                />

                <div className="flex flex-col gap-4 border-t border-border/30 py-8 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div>
                            <div className="text-xs font-medium">Need a custom billing arrangement?</div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Talk to us about enterprise contracts, annual billing, and custom invoicing.
                            </p>
                        </div>
                    </div>
                    <Button asChild className="h-7 rounded-md px-3 text-[11px] font-medium shadow-none">
                        <Link href="mailto:support@cencori.com">Contact billing</Link>
                    </Button>
                </div>
            </div>
        </main>
    );
}
