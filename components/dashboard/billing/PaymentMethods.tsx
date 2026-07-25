"use client";

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentMethodDialog } from "./PaymentMethodDialog";

interface PaymentMethod {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
}

interface PaymentMethodsProps {
    orgSlug: string;
    methods: PaymentMethod[];
    portalUrl?: string | null;
    billingAddress: {
        name: string;
        line1: string;
        line2?: string;
        city: string;
        state: string;
        zip: string;
        country: string;
    };
}

export function PaymentMethods({ orgSlug, methods, portalUrl, billingAddress }: PaymentMethodsProps) {
    const queryClient = useQueryClient();
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

    const openPortal = () => {
        if (portalUrl) window.open(portalUrl, "_blank", "noopener,noreferrer");
    };

    return (
        <section className="grid gap-6 border-t border-border/30 py-9 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
            <div>
                <h2 className="text-sm font-medium">Payment methods</h2>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    Cards used for subscriptions and prepaid credits.
                </p>
            </div>

            <div className="overflow-hidden rounded-lg border border-border/40 bg-muted/20">
                {methods.length > 0 ? (
                    <div className="divide-y divide-border/30 bg-muted/40">
                        {methods.map((method) => (
                            <button
                                key={method.id}
                                type="button"
                                onClick={openPortal}
                                disabled={!portalUrl}
                                className="grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/70 disabled:cursor-default sm:px-5"
                            >
                                <span className="flex size-8 items-center justify-center rounded-md border border-border/40 bg-background">
                                    <CreditCard className="size-3.5 text-muted-foreground" />
                                </span>
                                <span className="min-w-0">
                                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="text-xs font-medium capitalize">{method.brand}</span>
                                        <span className="font-mono text-xs text-muted-foreground">•••• {method.last4}</span>
                                        {method.isDefault && (
                                            <span className="text-[10px] text-muted-foreground">Default</span>
                                        )}
                                    </span>
                                    <span className="mt-1 block text-[10px] text-muted-foreground">
                                        Expires {String(method.expMonth).padStart(2, "0")} / {method.expYear}
                                    </span>
                                </span>
                                {portalUrl && <span className="text-[11px] text-muted-foreground">Manage</span>}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="bg-muted/50 px-5 py-7">
                        <div className="text-xs font-medium">No saved payment method</div>
                        <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                            A card will appear here after your first subscription or credit purchase.
                        </div>
                    </div>
                )}

                <div className="flex justify-end border-t border-border/30 px-4 py-3 sm:px-5">
                    <Button
                        className="h-7 rounded-md px-3 text-[11px] font-medium shadow-none"
                        onClick={() => setIsAddDialogOpen(true)}
                    >
                        Add payment method
                    </Button>
                </div>
            </div>

            <PaymentMethodDialog
                open={isAddDialogOpen}
                onOpenChange={setIsAddDialogOpen}
                orgSlug={orgSlug}
                billingAddress={billingAddress}
                onAdded={() => Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["orgPaymentMethods", orgSlug] }),
                    queryClient.invalidateQueries({ queryKey: ["orgBilling", orgSlug] }),
                ]).then(() => undefined)}
            />
        </section>
    );
}
