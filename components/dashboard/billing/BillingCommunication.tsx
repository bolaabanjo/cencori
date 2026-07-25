"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BillingEditDialog } from "./BillingEditDialog";

interface BillingCommunicationProps {
    orgSlug: string;
    email: string;
    address: {
        name: string;
        line1: string;
        line2?: string;
        city: string;
        state: string;
        zip: string;
        country: string;
        taxId?: string;
    };
}

export function BillingCommunication({ orgSlug, email, address }: BillingCommunicationProps) {
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const hasAddress = Boolean(address.line1 || address.city || address.country);
    const locality = [address.city, address.state, address.zip].filter(Boolean).join(", ");

    return (
        <>
            <section className="grid gap-6 border-t border-border/30 py-9 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
                <div>
                    <h2 className="text-sm font-medium">Billing details</h2>
                    <p className="mt-1.5 max-w-[30ch] text-sm leading-6 text-muted-foreground">
                        The identity and address shown on receipts, invoices, and tax records.
                    </p>
                </div>

                <div className="overflow-hidden rounded-lg border border-border/40 bg-muted/20">
                    <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
                        <div className="text-sm font-medium">Invoice information</div>
                        <Button
                            className="h-7 rounded-md px-3 text-[11px] font-medium shadow-none"
                            onClick={() => setIsEditDialogOpen(true)}
                        >
                            Edit
                        </Button>
                    </div>
                    <dl className="divide-y divide-border/30 border-t border-border/30 bg-muted/50">
                        <div className="grid gap-1 px-4 py-3 text-sm transition-colors hover:bg-muted/80 sm:grid-cols-[140px_minmax(0,1fr)] sm:px-5">
                            <dt className="text-muted-foreground">Billing email</dt>
                            <dd className="min-w-0 break-words sm:text-right">{email || "Not provided"}</dd>
                        </div>
                        <div className="grid gap-1 px-4 py-3 text-sm transition-colors hover:bg-muted/80 sm:grid-cols-[140px_minmax(0,1fr)] sm:px-5">
                            <dt className="text-muted-foreground">Legal name</dt>
                            <dd className="sm:text-right">{address.name || "Not provided"}</dd>
                        </div>
                        <div className="grid gap-1 px-4 py-3 text-sm transition-colors hover:bg-muted/80 sm:grid-cols-[140px_minmax(0,1fr)] sm:px-5">
                            <dt className="text-muted-foreground">Billing address</dt>
                            <dd className="leading-5 sm:text-right">
                                {hasAddress ? (
                                    <>
                                        {address.line1 && <div>{address.line1}</div>}
                                        {address.line2 && <div>{address.line2}</div>}
                                        {locality && <div>{locality}</div>}
                                        {address.country && <div>{address.country}</div>}
                                    </>
                                ) : (
                                    "Not provided"
                                )}
                            </dd>
                        </div>
                        <div className="grid gap-1 px-4 py-3 text-sm transition-colors hover:bg-muted/80 sm:grid-cols-[140px_minmax(0,1fr)] sm:px-5">
                            <dt className="text-muted-foreground">Tax ID</dt>
                            <dd className="font-mono text-xs sm:text-right">{address.taxId || "Not provided"}</dd>
                        </div>
                    </dl>
                </div>
            </section>

            <BillingEditDialog
                open={isEditDialogOpen}
                onOpenChange={setIsEditDialogOpen}
                initialData={{ ...address, email }}
                orgSlug={orgSlug}
            />
        </>
    );
}
