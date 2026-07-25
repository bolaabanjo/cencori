"use client";

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
    getBillingTaxIdType,
    updateBillingDetails,
} from "@/app/(app)/[orgSlug]/~/billing/actions";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
    getBillingTaxIdOptions,
    type BillingTaxIdType,
} from "@/lib/billing/tax-id-types";

import { BillingChoiceSelect } from "./BillingChoiceSelect";
import { CountrySelector } from "./CountrySelector";

interface BillingEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialData: {
        name: string;
        email: string;
        line1: string;
        line2?: string;
        city: string;
        state: string;
        zip: string;
        country: string;
        taxId?: string;
    };
    orgSlug: string;
}

const inputClassName = "h-9 rounded-md border-border/60 bg-muted/20 text-xs shadow-none transition-colors focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/10";
const labelClassName = "text-[11px] font-medium text-foreground/80";

export function BillingEditDialog({
    open,
    onOpenChange,
    initialData,
    orgSlug,
}: BillingEditDialogProps) {
    const [country, setCountry] = React.useState(initialData.country || "");
    const [taxType, setTaxType] = React.useState<BillingTaxIdType>();
    const [isPending, startTransition] = React.useTransition();
    const titleRef = React.useRef<HTMLHeadingElement>(null);
    const queryClient = useQueryClient();
    const taxTypeOptions = React.useMemo(
        () => getBillingTaxIdOptions(country),
        [country],
    );
    const { data: savedTaxType } = useQuery({
        queryKey: ["orgBillingTaxIdType", orgSlug],
        queryFn: () => getBillingTaxIdType(orgSlug),
        enabled: open && Boolean(initialData.taxId),
        staleTime: 60_000,
    });

    React.useEffect(() => {
        if (open) {
            setCountry(initialData.country || "");
        }
    }, [initialData.country, open]);

    React.useEffect(() => {
        if (!open) return;

        if (savedTaxType && taxTypeOptions.some((option) => option.value === savedTaxType)) {
            setTaxType(savedTaxType);
            return;
        }

        setTaxType(taxTypeOptions.length === 1 ? taxTypeOptions[0].value : undefined);
    }, [open, savedTaxType, taxTypeOptions]);

    const handleCountryChange = (nextCountry: string) => {
        const nextOptions = getBillingTaxIdOptions(nextCountry);
        setCountry(nextCountry);
        setTaxType((current) => {
            if (current && nextOptions.some((option) => option.value === current)) {
                return current;
            }
            return nextOptions.length === 1 ? nextOptions[0].value : undefined;
        });
    };

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen && isPending) return;
        onOpenChange(nextOpen);
    };

    const handleSubmit = (formData: FormData) => {
        startTransition(async () => {
            const result = await updateBillingDetails(orgSlug, formData);
            if (result.error) {
                toast.error(result.error);
                return;
            }

            const getString = (key: string) => String(formData.get(key) || "").trim();
            const getNullableString = (key: string) => {
                const value = getString(key);
                return value.length > 0 ? value : null;
            };

            queryClient.setQueryData(
                ["orgBilling", orgSlug],
                (previous: unknown) => {
                    if (!previous || typeof previous !== "object") {
                        return previous;
                    }

                    return {
                        ...previous,
                        name: getString("name"),
                        billing_email: getString("email"),
                        billing_address_line1: getNullableString("line1"),
                        billing_address_line2: getNullableString("line2"),
                        billing_city: getNullableString("city"),
                        billing_state: getNullableString("state"),
                        billing_zip: getNullableString("zip"),
                        billing_country: getNullableString("country"),
                        billing_tax_id: getNullableString("taxId"),
                    };
                },
            );

            void queryClient.invalidateQueries({ queryKey: ["orgBilling", orgSlug] });
            void queryClient.invalidateQueries({ queryKey: ["orgPortalUrl", orgSlug] });
            void queryClient.invalidateQueries({ queryKey: ["orgBillingTaxIdType", orgSlug] });

            toast.success("Billing details updated");
            if (result.warning) {
                toast.warning(result.warning);
            }
            onOpenChange(false);
        });
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                className="grid max-h-[min(48rem,calc(100dvh-2rem))] w-full grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-lg border-border/60 bg-background p-0 sm:max-w-[42rem]"
                onEscapeKeyDown={(event) => {
                    if (isPending) event.preventDefault();
                }}
                onPointerDownOutside={(event) => {
                    if (isPending) event.preventDefault();
                }}
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    titleRef.current?.focus();
                }}
            >
                <DialogHeader className="border-b border-border/60 px-5 py-4 pr-12 sm:px-6">
                    <DialogTitle
                        ref={titleRef}
                        tabIndex={-1}
                        className="text-sm font-medium tracking-normal outline-none"
                    >
                        Edit invoice information
                    </DialogTitle>
                    <DialogDescription className="max-w-[58ch] text-[11px] leading-5">
                        Update the identity and address used on invoices, receipts, and tax records.
                    </DialogDescription>
                </DialogHeader>

                <form action={handleSubmit} className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
                    <div className="space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
                        <section aria-labelledby="billing-identity-heading" className="space-y-3">
                            <div>
                                <h3 id="billing-identity-heading" className="text-xs font-medium">Identity</h3>
                                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                                    The organization and contact shown on billing documents.
                                </p>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="billing-org-name" className={labelClassName}>
                                        Organization name
                                    </Label>
                                    <Input
                                        id="billing-org-name"
                                        name="name"
                                        defaultValue={initialData.name}
                                        placeholder="Organization name"
                                        autoComplete="organization"
                                        required
                                        className={inputClassName}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="billing-email" className={labelClassName}>
                                        Billing email
                                    </Label>
                                    <Input
                                        id="billing-email"
                                        name="email"
                                        type="email"
                                        defaultValue={initialData.email}
                                        placeholder="billing@example.com"
                                        autoComplete="email"
                                        required
                                        className={inputClassName}
                                    />
                                </div>
                            </div>
                        </section>

                        <section aria-labelledby="billing-address-heading" className="space-y-3 border-t border-border/60 pt-5">
                            <div>
                                <h3 id="billing-address-heading" className="text-xs font-medium">Billing address</h3>
                                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                                    The legal address associated with this account.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="billing-address-1" className={labelClassName}>
                                    Address line 1
                                </Label>
                                <Input
                                    id="billing-address-1"
                                    name="line1"
                                    defaultValue={initialData.line1}
                                    placeholder="Street address"
                                    autoComplete="address-line1"
                                    className={inputClassName}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="billing-address-2" className={labelClassName}>
                                    Address line 2 <span className="font-normal text-muted-foreground">(optional)</span>
                                </Label>
                                <Input
                                    id="billing-address-2"
                                    name="line2"
                                    defaultValue={initialData.line2}
                                    placeholder="Apartment, suite, unit, or floor"
                                    autoComplete="address-line2"
                                    className={inputClassName}
                                />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label className={labelClassName}>
                                        Country
                                    </Label>
                                    <CountrySelector value={country} onValueChange={handleCountryChange} />
                                    <input type="hidden" name="country" value={country} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="billing-postal-code" className={labelClassName}>
                                        Postal code
                                    </Label>
                                    <Input
                                        id="billing-postal-code"
                                        name="zip"
                                        defaultValue={initialData.zip}
                                        autoComplete="postal-code"
                                        className={inputClassName}
                                    />
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="billing-city" className={labelClassName}>
                                        City
                                    </Label>
                                    <Input
                                        id="billing-city"
                                        name="city"
                                        defaultValue={initialData.city}
                                        autoComplete="address-level2"
                                        className={inputClassName}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="billing-state" className={labelClassName}>
                                        State or province
                                    </Label>
                                    <Input
                                        id="billing-state"
                                        name="state"
                                        defaultValue={initialData.state}
                                        autoComplete="address-level1"
                                        className={inputClassName}
                                    />
                                </div>
                            </div>
                        </section>

                        <section aria-labelledby="billing-tax-heading" className="space-y-3 border-t border-border/60 pt-5">
                            <div>
                                <h3 id="billing-tax-heading" className="text-xs font-medium">Tax information</h3>
                                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                                    Optional tax identifier printed on applicable documents.
                                </p>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="billing-tax-id" className={labelClassName}>
                                    Tax ID
                                </Label>
                                <div className={taxTypeOptions.length > 0 ? "grid gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" : undefined}>
                                    {taxTypeOptions.length > 0 && (
                                        <BillingChoiceSelect
                                            value={taxType}
                                            options={taxTypeOptions}
                                            onValueChange={setTaxType}
                                            ariaLabel="Tax ID type"
                                            menuLabel="Tax ID type"
                                            placeholder="Select tax ID type"
                                        />
                                    )}
                                    <Input
                                        id="billing-tax-id"
                                        name="taxId"
                                        defaultValue={initialData.taxId}
                                        placeholder="Tax identifier"
                                        className={inputClassName}
                                    />
                                </div>
                                <input type="hidden" name="taxType" value={taxType || ""} />
                                {country && taxTypeOptions.length === 0 && (
                                    <p className="text-[10px] leading-4 text-muted-foreground">
                                        This country does not currently have a supported Stripe tax ID type. The value will remain in your Cencori billing profile only.
                                    </p>
                                )}
                            </div>
                        </section>
                    </div>

                    <div className="flex flex-col-reverse gap-2 border-t border-border/60 bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => handleOpenChange(false)}
                            disabled={isPending}
                            className="h-7 rounded-md px-3 text-[11px] font-medium shadow-none"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isPending}
                            className="h-7 rounded-md px-3 text-[11px] font-medium shadow-none"
                        >
                            {isPending ? "Saving…" : "Save changes"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
