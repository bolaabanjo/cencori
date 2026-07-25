"use client";

import React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { AddressElement, Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type StripeElementsOptions } from "@stripe/stripe-js";
import {
    updateBillingAddressFromPaymentMethod,
    type BillingAddressProfileUpdate,
} from "@/app/(app)/[orgSlug]/~/billing/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";

interface BillingAddressDefaults {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
}

interface PaymentMethodDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orgSlug: string;
    billingAddress: BillingAddressDefaults;
    onAdded: () => Promise<void> | void;
}

type SetupResponse = {
    clientSecret?: string;
    error?: string;
};

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

function getReturnUrl(orgSlug: string): string {
    const returnUrl = new URL(
        `/${encodeURIComponent(orgSlug)}/~/billing`,
        window.location.origin,
    );
    returnUrl.searchParams.set("payment_method_added", "1");
    return returnUrl.toString();
}

function PaymentMethodForm({
    billingAddress,
    orgSlug,
    onAdded,
    onOpenChange,
}: {
    billingAddress: BillingAddressDefaults;
    orgSlug: string;
    onAdded: () => Promise<void> | void;
    onOpenChange: (open: boolean) => void;
}) {
    const stripe = useStripe();
    const elements = useElements();
    const [paymentComplete, setPaymentComplete] = React.useState(false);
    const [addressComplete, setAddressComplete] = React.useState(false);
    const [useAddressForInvoices, setUseAddressForInvoices] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const addressOptions = React.useMemo(() => {
        const hasCountry = billingAddress.country.trim().length > 0;
        return {
            mode: "billing" as const,
            display: { name: "full" as const },
            fields: { phone: "never" as const },
            defaultValues: {
                name: billingAddress.name || undefined,
                ...(hasCountry
                    ? {
                        address: {
                            line1: billingAddress.line1 || undefined,
                            line2: billingAddress.line2 || undefined,
                            city: billingAddress.city || undefined,
                            state: billingAddress.state || undefined,
                            postal_code: billingAddress.zip || undefined,
                            country: billingAddress.country,
                        },
                    }
                    : {}),
            },
        };
    }, [billingAddress]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!stripe || !elements || isSubmitting) return;

        setIsSubmitting(true);
        setError(null);

        let invoiceAddress: BillingAddressProfileUpdate | null = null;
        if (useAddressForInvoices) {
            const addressElement = elements.getElement("address");
            let addressResult;
            try {
                addressResult = await addressElement?.getValue();
            } catch {
                setError("The billing address could not be read. Please check it and try again.");
                setIsSubmitting(false);
                return;
            }

            if (!addressResult?.complete) {
                setError("Complete the billing address before using it for invoices.");
                setIsSubmitting(false);
                return;
            }

            invoiceAddress = {
                line1: addressResult.value.address.line1,
                line2: addressResult.value.address.line2,
                city: addressResult.value.address.city,
                state: addressResult.value.address.state,
                postalCode: addressResult.value.address.postal_code,
                country: addressResult.value.address.country,
            };
        }

        let result;
        try {
            result = await stripe.confirmSetup({
                elements,
                confirmParams: {
                    return_url: getReturnUrl(orgSlug),
                },
                redirect: "if_required",
            });
        } catch {
            setError("Stripe could not be reached. Please try again.");
            setIsSubmitting(false);
            return;
        }

        if (result.error) {
            setError(result.error.message || "Your payment method could not be saved.");
            setIsSubmitting(false);
            return;
        }

        const setupStatus = result.setupIntent?.status;
        if (setupStatus !== "succeeded" && setupStatus !== "processing") {
            setError("Stripe could not finish saving this payment method. Please try again.");
            setIsSubmitting(false);
            return;
        }

        let invoiceAddressWarning: string | undefined;
        if (invoiceAddress) {
            try {
                const addressUpdate = await updateBillingAddressFromPaymentMethod(orgSlug, invoiceAddress);
                invoiceAddressWarning = addressUpdate.error || addressUpdate.warning;
            } catch {
                invoiceAddressWarning = "The card was saved, but the invoice address could not be updated.";
            }
        }

        try {
            await onAdded();
        } catch {
            invoiceAddressWarning = invoiceAddressWarning
                ? `${invoiceAddressWarning} Refresh the page to see the saved card.`
                : "The card was saved. Refresh the page if it does not appear immediately.";
        }
        toast.success(
            setupStatus === "processing"
                ? "Payment method is being verified."
                : "Payment method added.",
        );
        if (invoiceAddressWarning) {
            toast.warning(invoiceAddressWarning);
        } else if (invoiceAddress) {
            toast.success("Invoice address updated.");
        }
        onOpenChange(false);
    };

    const canSubmit = Boolean(
        stripe &&
        elements &&
        paymentComplete &&
        addressComplete &&
        !isSubmitting,
    );

    return (
        <form onSubmit={handleSubmit}>
            <div className="max-h-[min(70vh,44rem)] space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
                <section aria-labelledby="card-details-heading">
                    <div className="mb-3 flex items-center justify-between gap-4">
                        <h3 id="card-details-heading" className="text-xs font-medium">Card details</h3>
                        <span className="text-[10px] text-muted-foreground">Required</span>
                    </div>
                    <PaymentElement
                        options={{
                            layout: "tabs",
                            paymentMethodOrder: ["card"],
                            fields: {
                                billingDetails: {
                                    name: "never",
                                    email: "never",
                                    phone: "never",
                                    address: "never",
                                },
                            },
                            wallets: {
                                applePay: "never",
                                googlePay: "never",
                                link: "never",
                            },
                        }}
                        onChange={(event) => {
                            setPaymentComplete(event.complete);
                            setError(null);
                        }}
                        onLoadError={(event) =>
                            setError(event.error.message || "The card form could not be loaded.")
                        }
                    />
                </section>

                <section aria-labelledby="billing-address-heading" className="border-t border-border/60 pt-5">
                    <div className="mb-3 flex items-center justify-between gap-4">
                        <h3 id="billing-address-heading" className="text-xs font-medium">Billing address</h3>
                        <span className="text-[10px] text-muted-foreground">Required</span>
                    </div>
                    <AddressElement
                        options={addressOptions}
                        onChange={(event) => {
                            setAddressComplete(event.complete);
                            setError(null);
                        }}
                        onLoadError={(event) =>
                            setError(event.error.message || "The billing address form could not be loaded.")
                        }
                    />
                    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-3 transition-colors hover:bg-muted/35">
                        <Checkbox
                            checked={useAddressForInvoices}
                            onCheckedChange={(checked) => setUseAddressForInvoices(checked === true)}
                            className="mt-0.5"
                        />
                        <span className="min-w-0">
                            <span className="block text-[11px] font-medium text-foreground">
                                Use this address for invoices
                            </span>
                            <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                                Update the organization billing profile with this address. Existing saved cards will not be changed.
                            </span>
                        </span>
                    </label>
                </section>

                {error && (
                    <div role="alert" className="rounded-md border border-red-500/20 bg-red-500/[0.04] px-3 py-2.5 text-[11px] leading-5 text-red-500">
                        {error}
                    </div>
                )}
            </div>

            <div className="border-t border-border/60 px-5 py-4 sm:px-6">
                <Button
                    type="submit"
                    className="h-7 w-full rounded-md px-3 text-[11px] font-medium shadow-none"
                    disabled={!canSubmit}
                >
                    {isSubmitting ? "Saving…" : "Save payment method"}
                </Button>
                <p className="mt-3 text-center text-[10px] leading-4 text-muted-foreground">
                    Card data is encrypted and handled by Stripe. Cencori never receives your card number. By saving it, you agree to our{" "}
                    <Link href="/terms-of-service" className="underline underline-offset-2 hover:text-foreground">terms</Link>.
                </p>
            </div>
        </form>
    );
}

function PaymentFormSkeleton() {
    return (
        <div className="space-y-6 px-5 py-5 sm:px-6" aria-label="Preparing secure payment form">
            <div className="space-y-3">
                <Skeleton className="h-3 w-24 rounded-sm" />
                <Skeleton className="h-11 w-full rounded-md" />
                <div className="grid grid-cols-2 gap-3">
                    <Skeleton className="h-11 rounded-md" />
                    <Skeleton className="h-11 rounded-md" />
                </div>
            </div>
            <div className="space-y-3 border-t border-border/60 pt-5">
                <Skeleton className="h-3 w-28 rounded-sm" />
                <Skeleton className="h-11 w-full rounded-md" />
                <Skeleton className="h-11 w-full rounded-md" />
                <div className="grid grid-cols-2 gap-3">
                    <Skeleton className="h-11 rounded-md" />
                    <Skeleton className="h-11 rounded-md" />
                </div>
            </div>
        </div>
    );
}

export function PaymentMethodDialog({
    open,
    onOpenChange,
    orgSlug,
    billingAddress,
    onAdded,
}: PaymentMethodDialogProps) {
    const { resolvedTheme } = useTheme();
    const [clientSecret, setClientSecret] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const prepareSetup = React.useCallback(async (signal?: AbortSignal) => {
        if (!stripePromise) {
            setError("Stripe is not configured. Add the Stripe publishable key to enable saved cards.");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const requestId = typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const response = await fetch("/api/billing/payment-methods/setup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orgSlug, requestId }),
                signal,
            });
            const contentType = response.headers.get("content-type") || "";
            const data: SetupResponse = contentType.includes("application/json")
                ? await response.json()
                : { error: "Payment setup returned an unexpected response." };

            if (!response.ok || !data.clientSecret) {
                throw new Error(data.error || "The secure payment form could not be prepared.");
            }

            setClientSecret(data.clientSecret);
        } catch (setupError) {
            if (setupError instanceof DOMException && setupError.name === "AbortError") return;
            setError(
                setupError instanceof Error
                    ? setupError.message
                    : "The secure payment form could not be prepared.",
            );
        } finally {
            if (!signal?.aborted) setIsLoading(false);
        }
    }, [orgSlug]);

    React.useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        void prepareSetup(controller.signal);
        return () => controller.abort();
    }, [open, prepareSetup]);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setClientSecret(null);
            setError(null);
            setIsLoading(false);
        }
        onOpenChange(nextOpen);
    };

    const elementsOptions = React.useMemo<StripeElementsOptions | null>(() => {
        if (!clientSecret) return null;
        const isLight = resolvedTheme === "light";

        return {
            clientSecret,
            loader: "auto",
            appearance: {
                theme: isLight ? "stripe" : "night",
                inputs: "spaced",
                labels: "above",
                variables: {
                    colorPrimary: isLight ? "#111111" : "#f5f5f5",
                    colorBackground: isLight ? "#ffffff" : "#050505",
                    colorText: isLight ? "#111111" : "#f5f5f5",
                    colorTextSecondary: isLight ? "#666666" : "#a1a1aa",
                    colorDanger: "#ef4444",
                    borderRadius: "6px",
                    fontFamily: "ui-sans-serif, system-ui, sans-serif",
                    fontSizeBase: "13px",
                    spacingUnit: "4px",
                },
                rules: {
                    ".Input": {
                        border: isLight ? "1px solid #dedede" : "1px solid #27272a",
                        boxShadow: "none",
                    },
                    ".Input:focus": {
                        borderColor: isLight ? "#111111" : "#d4d4d8",
                        boxShadow: "none",
                    },
                    ".Label": {
                        fontSize: "11px",
                        fontWeight: "500",
                    },
                },
            },
        };
    }, [clientSecret, resolvedTheme]);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                className="w-full gap-0 overflow-hidden rounded-lg border-border/60 bg-background p-0 sm:max-w-[36rem]"
            >
                <DialogHeader className="border-b border-border/60 px-5 py-4 pr-12 sm:px-6">
                    <DialogTitle className="text-sm font-medium tracking-normal">Add payment method</DialogTitle>
                    <DialogDescription className="text-[11px] leading-5">
                        Save a card for subscriptions and prepaid credit purchases.
                    </DialogDescription>
                </DialogHeader>

                {elementsOptions && stripePromise ? (
                    <Elements key={clientSecret} stripe={stripePromise} options={elementsOptions}>
                        <PaymentMethodForm
                            billingAddress={billingAddress}
                            orgSlug={orgSlug}
                            onAdded={onAdded}
                            onOpenChange={handleOpenChange}
                        />
                    </Elements>
                ) : isLoading ? (
                    <PaymentFormSkeleton />
                ) : error ? (
                    <div className="px-5 py-6 sm:px-6">
                        <div role="alert" className="rounded-md border border-red-500/20 bg-red-500/[0.04] px-3 py-2.5 text-[11px] leading-5 text-red-500">
                            {error}
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            className="mt-4 h-7 rounded-md px-3 text-[11px] font-medium shadow-none"
                            onClick={() => void prepareSetup()}
                        >
                            Try again
                        </Button>
                    </div>
                ) : (
                    <PaymentFormSkeleton />
                )}
            </DialogContent>
        </Dialog>
    );
}
