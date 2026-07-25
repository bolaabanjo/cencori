"use client";

import React from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { CreditPackSelect, type CreditPackId } from "./CreditPackSelect";

interface Transaction {
    id: string;
    amount: number;
    type: string;
    description: string;
    createdAt: string;
}

interface CreditProps {
    orgId: string;
    balance: number;
    transactions: Transaction[];
    currency?: string;
}

type PaymentMethod = "card" | "crypto";

export function CreditBalance({ orgId, balance, transactions, currency = "USD" }: CreditProps) {
    const [selectedPack, setSelectedPack] = React.useState<CreditPackId>("growth");
    const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>("card");
    const [isRecharging, setIsRecharging] = React.useState(false);

    const handleRecharge = async () => {
        if (isRecharging) return;
        setIsRecharging(true);

        try {
            const endpoint = paymentMethod === "card"
                ? "/api/billing/credits/checkout"
                : "/api/billing/credits/crypto-checkout";

            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orgId, pack: selectedPack }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.checkoutUrl) {
                throw new Error(data?.error || data?.details || "Failed to start credits checkout");
            }

            window.location.href = data.checkoutUrl;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to start credits checkout");
            setIsRecharging(false);
        }
    };

    return (
        <section className="grid gap-6 border-t border-border/30 py-9 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
            <div>
                <h2 className="text-sm font-medium">Prepaid credits</h2>
                <p className="mt-1.5 max-w-[30ch] text-sm leading-6 text-muted-foreground">
                    Add balance for on-demand model usage outside your monthly plan.
                </p>
            </div>

            <div className="overflow-hidden rounded-lg border border-border/40 bg-muted/20">
                <div className="flex flex-col gap-5 bg-muted/50 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                    <div>
                        <div className="text-xs text-muted-foreground">Available balance</div>
                        <div className="mt-1 font-mono text-2xl font-medium tracking-[-0.03em] tabular-nums">
                            {formatCurrency(balance, currency, { maximumFractionDigits: 8, minimumFractionDigits: 2 })}
                        </div>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={paymentMethod === "crypto"}
                        aria-label={`Payment method: ${paymentMethod}. Switch to ${paymentMethod === "card" ? "crypto" : "card"}`}
                        onClick={() => setPaymentMethod((current) => current === "card" ? "crypto" : "card")}
                        className="group inline-flex w-fit items-center gap-2.5 rounded-md px-1 py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                        <span className={cn(
                            "min-w-10 text-right transition-colors",
                            paymentMethod === "card" ? "font-medium text-foreground" : "text-muted-foreground group-hover:text-foreground/70",
                        )}>
                            Card
                        </span>
                        <span className="relative h-5 w-9 shrink-0 rounded-full border border-foreground/20 bg-foreground/[0.06] shadow-inner transition-colors group-hover:border-foreground/30">
                            <span className={cn(
                                "absolute left-0.5 top-0.5 size-3.5 rounded-full bg-foreground shadow-sm transition-transform duration-200 ease-out",
                                paymentMethod === "crypto" && "translate-x-4",
                            )} />
                        </span>
                        <span className={cn(
                            "min-w-10 text-left transition-colors",
                            paymentMethod === "crypto" ? "font-medium text-foreground" : "text-muted-foreground group-hover:text-foreground/70",
                        )}>
                            Crypto
                        </span>
                    </button>
                </div>

                <div className="flex flex-col gap-2 border-t border-border/30 p-4 sm:flex-row sm:items-center sm:p-5">
                    <CreditPackSelect
                        value={selectedPack}
                        onValueChange={setSelectedPack}
                        disabled={isRecharging}
                    />
                    <Button
                        className="h-7 rounded-md px-3 text-[11px] font-medium shadow-none"
                        onClick={handleRecharge}
                        disabled={isRecharging}
                    >
                        {isRecharging ? "Opening checkout…" : "Add credits"}
                    </Button>
                </div>

                <div className="border-t border-border/30">
                    <div className="grid grid-cols-[1fr_auto] bg-muted/30 px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:px-5">
                        <span>Recent activity</span>
                        <span>Amount</span>
                    </div>
                    {transactions.length > 0 ? (
                        transactions.slice(0, 5).map((transaction) => {
                            const amount = Number(transaction.amount) || 0;
                            const isCredit = amount >= 0;
                            return (
                                <div
                                    key={transaction.id}
                                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t border-border/30 px-4 py-3 sm:px-5"
                                >
                                    <div className="min-w-0">
                                        <div className="truncate text-xs font-medium">{transaction.description}</div>
                                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                                            {new Date(transaction.createdAt).toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                            })}
                                        </div>
                                    </div>
                                    <div className={cn(
                                        "font-mono text-xs tabular-nums",
                                        isCredit && "text-emerald-500",
                                    )}>
                                        {isCredit ? "+" : "−"}
                                        {formatCurrency(Math.abs(amount), currency, { maximumFractionDigits: 6 })}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="border-t border-border/30 px-5 py-6 text-xs text-muted-foreground">
                            No credit activity yet.
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
