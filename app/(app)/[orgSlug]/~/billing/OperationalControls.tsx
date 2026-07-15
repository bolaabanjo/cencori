"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
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
        <div className="rounded-md border border-border/40 bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border/40">
                <h3 className="text-sm font-medium tracking-tight">Operational Controls</h3>
                <p className="text-[11px] text-muted-foreground mt-1">
                    Manual credit operations and billing freeze controls with audit history.
                </p>
            </div>

            <div className="p-6 grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Billing Freeze</div>
                        <Badge variant={data.frozen ? "destructive" : "outline"} className="text-[10px] uppercase tracking-wider">
                            {data.frozen ? "Frozen" : "Active"}
                        </Badge>
                    </div>
                    {data.frozen && (
                        <div className="text-xs text-muted-foreground">
                            {data.freezeReason || "No freeze reason provided"}
                        </div>
                    )}
                    <Textarea
                        value={freezeReason}
                        onChange={(event) => setFreezeReason(event.target.value)}
                        placeholder={data.frozen ? "Optional note for unfreeze..." : "Reason for freeze (required)"}
                        className="min-h-[80px] text-xs"
                        disabled={isBusy}
                    />
                    <Button
                        variant={data.frozen ? "outline" : "destructive"}
                        className="h-8 text-xs"
                        disabled={isBusy || (!data.frozen && freezeReason.trim().length === 0)}
                        onClick={() => freezeMutation.mutate(!data.frozen)}
                    >
                        {freezeMutation.isPending ? "Saving..." : data.frozen ? "Unfreeze Billing" : "Freeze Billing"}
                    </Button>
                </div>

                <div className="space-y-3">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Manual Credit Operation
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <select
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                            value={operation}
                            onChange={(event) => setOperation(event.target.value as OperationType)}
                            disabled={isBusy}
                        >
                            <option value="adjustment">Adjustment</option>
                            <option value="refund">Refund</option>
                        </select>
                        <select
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                            value={direction}
                            onChange={(event) => setDirection(event.target.value as AdjustmentDirection)}
                            disabled={isBusy || operation === "refund"}
                        >
                            <option value="credit">Credit (+)</option>
                            <option value="debit">Debit (-)</option>
                        </select>
                    </div>
                    <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder="Amount in USD"
                        className="h-8 text-xs"
                        disabled={isBusy}
                    />
                    <Input
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Reason"
                        className="h-8 text-xs"
                        disabled={isBusy}
                    />
                    <Button
                        className="h-8 text-xs"
                        disabled={isBusy || Number(amount) <= 0 || reason.trim().length === 0}
                        onClick={() => applyOperationMutation.mutate()}
                    >
                        {applyOperationMutation.isPending ? "Applying..." : "Apply Operation"}
                    </Button>
                </div>
            </div>

            <div className="border-t border-border/40">
                <div className="px-6 py-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Audit Trail
                </div>
                <div className="max-h-64 overflow-y-auto">
                    {data.events.length === 0 ? (
                        <div className="px-6 py-6 text-xs text-muted-foreground">
                            No audit events yet.
                        </div>
                    ) : (
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-y border-border/30 bg-muted/20">
                                    <th className="px-6 py-2 text-left font-medium text-muted-foreground uppercase tracking-wider">Action</th>
                                    <th className="px-6 py-2 text-left font-medium text-muted-foreground uppercase tracking-wider">Reason</th>
                                    <th className="px-6 py-2 text-right font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                                    <th className="px-6 py-2 text-right font-medium text-muted-foreground uppercase tracking-wider">When</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.events.map((event) => (
                                    <tr key={event.id} className="border-b border-border/20">
                                        <td className="px-6 py-2">
                                            <div className="font-medium">{formatActionLabel(event.action)}</div>
                                            <div className="text-[10px] text-muted-foreground">{event.actorEmail || "Unknown actor"}</div>
                                        </td>
                                        <td className="px-6 py-2 text-muted-foreground">{event.reason || "—"}</td>
                                        <td className="px-6 py-2 text-right tabular-nums">
                                            {event.amount === null
                                                ? "—"
                                                : `${Number(event.amount) >= 0 ? "+" : "-"}$${Math.abs(Number(event.amount)).toFixed(2)}`}
                                        </td>
                                        <td className="px-6 py-2 text-right text-muted-foreground tabular-nums">
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
    );
}
