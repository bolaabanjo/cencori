"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { BillingChoiceSelect } from "@/components/dashboard/billing/BillingChoiceSelect";
import { ChevronDown, ShieldAlert } from "lucide-react";
import {
    applyManualCreditOperation,
    getBillingOperationsState,
    setBillingFreezeState,
} from "./actions";

interface OperationalControlsProps {
    orgSlug: string;
}

type OperationType = "refund" | "adjustment";
type AdjustmentDirection = "credit" | "debit";

const OPERATION_OPTIONS: Array<{ value: OperationType; label: string }> = [
    { value: "adjustment", label: "Adjustment" },
    { value: "refund", label: "Refund" },
];

const DIRECTION_OPTIONS: Array<{ value: AdjustmentDirection; label: string }> = [
    { value: "credit", label: "Credit (+)" },
    { value: "debit", label: "Debit (−)" },
];

function formatActionLabel(action: string): string {
    switch (action) {
        case "manual_refund":
            return "Manual Refund";
        case "manual_adjustment":
            return "Manual Adjustment";
        case "freeze":
            return "Freeze";
        case "unfreeze":
            return "Unfreeze";
        default:
            return action;
    }
}

export function OperationalControls({ orgSlug }: OperationalControlsProps) {
    const queryClient = useQueryClient();
    const [operation, setOperation] = React.useState<OperationType>("adjustment");
    const [direction, setDirection] = React.useState<AdjustmentDirection>("credit");
    const [amount, setAmount] = React.useState<string>("");
    const [reason, setReason] = React.useState<string>("");
    const [freezeReason, setFreezeReason] = React.useState<string>("");

    const operationsQuery = useQuery({
        queryKey: ["billingOperationsState", orgSlug],
        queryFn: () => getBillingOperationsState(orgSlug),
        staleTime: 30 * 1000,
    });

    const applyOperationMutation = useMutation({
        mutationFn: async () => {
            const parsedAmount = Number(amount);
            return applyManualCreditOperation(orgSlug, {
                operation,
                amount: parsedAmount,
                reason,
                direction,
            });
        },
        onSuccess: (result) => {
            if (result?.error) {
                toast.error(result.error);
                return;
            }
            toast.success("Credit operation applied.");
            setAmount("");
            setReason("");
            void queryClient.invalidateQueries({ queryKey: ["billingOperationsState", orgSlug] });
            void queryClient.invalidateQueries({ queryKey: ["orgBilling", orgSlug] });
            void queryClient.invalidateQueries({ queryKey: ["orgCredits"] });
        },
        onError: () => {
            toast.error("Failed to apply credit operation.");
        },
    });

    const freezeMutation = useMutation({
        mutationFn: async (frozen: boolean) => {
            return setBillingFreezeState(orgSlug, {
                frozen,
                reason: freezeReason,
            });
        },
        onSuccess: (result, frozen) => {
            if (result?.error) {
                toast.error(result.error);
                return;
            }
            toast.success(frozen ? "Billing frozen." : "Billing unfrozen.");
            setFreezeReason("");
            void queryClient.invalidateQueries({ queryKey: ["billingOperationsState", orgSlug] });
            void queryClient.invalidateQueries({ queryKey: ["orgBilling", orgSlug] });
        },
        onError: () => {
            toast.error("Failed to update freeze state.");
        },
    });

    const data = operationsQuery.data;

    if (!data?.allowed) {
        return null;
    }

    const isBusy = applyOperationMutation.isPending || freezeMutation.isPending;

    return (
        <section className="grid gap-6 border-t border-border/30 py-9 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
            <div>
                <h2 className="text-sm font-medium">Administration</h2>
                <p className="mt-1.5 max-w-[30ch] text-sm leading-6 text-muted-foreground">
                    Restricted tools for billing support and account operations.
                </p>
            </div>

            <details className="group min-w-0 overflow-hidden rounded-lg border border-border/40 bg-muted/20">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-muted/20 p-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5 [&::-webkit-details-marker]:hidden">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-red-500/20 text-red-500">
                            <ShieldAlert className="size-3.5" />
                        </span>
                        <div>
                            <div className="text-sm font-medium">Operational controls</div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                Manual credits, refunds, billing freezes, and audit history.
                            </p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                        <Badge
                            variant={data.frozen ? "destructive" : "outline"}
                            className="rounded-full px-2.5 text-[9px] uppercase tracking-[0.12em]"
                        >
                            {data.frozen ? "Frozen" : "Restricted"}
                        </Badge>
                        <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                    </div>
                </summary>

                <div className="border-t border-border/30">
                <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-border/30">
                    <div className="space-y-4 p-5 sm:p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-xs font-medium">Billing availability</div>
                                <div className="mt-1 text-[10px] text-muted-foreground">
                                    Prevent new credit usage and billing activity.
                                </div>
                            </div>
                            <span className={data.frozen ? "text-xs text-red-500" : "text-xs text-emerald-500"}>
                                {data.frozen ? "Frozen" : "Active"}
                            </span>
                        </div>
                        {data.frozen && (
                            <div className="rounded-lg border border-red-500/15 bg-red-500/[0.03] p-3 text-xs text-muted-foreground">
                                {data.freezeReason || "No freeze reason provided"}
                            </div>
                        )}
                        <Textarea
                            value={freezeReason}
                            onChange={(event) => setFreezeReason(event.target.value)}
                            placeholder={data.frozen ? "Optional note for unfreeze…" : "Reason for freeze (required)"}
                            className="min-h-24 rounded-md border-border/50 bg-background text-xs shadow-none"
                            disabled={isBusy}
                        />
                        <Button
                            variant={data.frozen ? "outline" : "destructive"}
                            className="h-7 rounded-md px-3 text-[11px] font-medium shadow-none"
                            disabled={isBusy || (!data.frozen && freezeReason.trim().length === 0)}
                            onClick={() => freezeMutation.mutate(!data.frozen)}
                        >
                            {freezeMutation.isPending ? "Saving…" : data.frozen ? "Unfreeze billing" : "Freeze billing"}
                        </Button>
                    </div>

                    <div className="space-y-4 border-t border-border/30 p-5 sm:p-6 lg:border-t-0">
                        <div>
                            <div className="text-xs font-medium">Manual credit operation</div>
                            <div className="mt-1 text-[10px] text-muted-foreground">
                                Apply a documented adjustment to this organization.
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <BillingChoiceSelect
                                value={operation}
                                options={OPERATION_OPTIONS}
                                onValueChange={setOperation}
                                ariaLabel="Credit operation type"
                                menuLabel="Operation type"
                                disabled={isBusy}
                            />
                            <BillingChoiceSelect
                                value={direction}
                                options={DIRECTION_OPTIONS}
                                onValueChange={setDirection}
                                ariaLabel="Credit adjustment direction"
                                menuLabel="Adjustment direction"
                                disabled={isBusy || operation === "refund"}
                            />
                        </div>
                        <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            placeholder="Amount in USD"
                            className="h-9 rounded-md border-border/50 bg-background px-4 text-xs shadow-none"
                            disabled={isBusy}
                        />
                        <Input
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Reason for this operation"
                            className="h-9 rounded-md border-border/50 bg-background px-4 text-xs shadow-none"
                            disabled={isBusy}
                        />
                        <Button
                            className="h-7 rounded-md px-3 text-[11px] font-medium shadow-none"
                            disabled={isBusy || Number(amount) <= 0 || reason.trim().length === 0}
                            onClick={() => applyOperationMutation.mutate()}
                        >
                            {applyOperationMutation.isPending ? "Applying…" : "Apply operation"}
                        </Button>
                    </div>
                </div>

                <div className="border-t border-border/30">
                    <div className="px-5 py-3 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:px-6">
                        Audit trail
                    </div>
                    <div className="max-h-64 overflow-auto">
                        {data.events.length === 0 ? (
                            <div className="border-t border-border/30 bg-muted/20 px-6 py-8 text-xs text-muted-foreground">
                                No administrative billing events yet.
                            </div>
                        ) : (
                            <table className="w-full min-w-[720px] border-t border-border/30 text-xs">
                                <thead>
                                    <tr className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                                        <th className="px-6 py-3 text-left font-medium">Action</th>
                                        <th className="px-6 py-3 text-left font-medium">Reason</th>
                                        <th className="px-6 py-3 text-right font-medium">Amount</th>
                                        <th className="px-6 py-3 text-right font-medium">When</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.events.map((event) => (
                                        <tr key={event.id} className="border-t border-border/30">
                                            <td className="px-6 py-3">
                                                <div className="font-medium">{formatActionLabel(event.action)}</div>
                                                <div className="mt-1 text-[10px] text-muted-foreground">{event.actorEmail || "Unknown actor"}</div>
                                            </td>
                                            <td className="px-6 py-3 text-muted-foreground">{event.reason || "—"}</td>
                                            <td className="px-6 py-3 text-right font-mono tabular-nums">
                                                {event.amount === null
                                                    ? "—"
                                                    : `${Number(event.amount) >= 0 ? "+" : "−"}$${Math.abs(Number(event.amount)).toFixed(2)}`}
                                            </td>
                                            <td className="px-6 py-3 text-right font-mono text-muted-foreground tabular-nums">
                                                {new Date(event.createdAt).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
                </div>
            </details>
        </section>
    );
}
