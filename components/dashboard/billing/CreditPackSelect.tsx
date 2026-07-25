"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

export type CreditPackId = "starter" | "growth" | "scale";

const CREDIT_PACK_OPTIONS: Array<{
    id: CreditPackId;
    price: string;
    credits: string;
}> = [
    { id: "starter", price: "$10", credits: "50,000 credits" },
    { id: "growth", price: "$50", credits: "250,000 credits" },
    { id: "scale", price: "$200", credits: "1,000,000 credits" },
];

interface CreditPackSelectProps {
    value: CreditPackId;
    onValueChange: (value: CreditPackId) => void;
    disabled?: boolean;
}

export function CreditPackSelect({ value, onValueChange, disabled }: CreditPackSelectProps) {
    const selectedPack = CREDIT_PACK_OPTIONS.find((pack) => pack.id === value) ?? CREDIT_PACK_OPTIONS[0];

    return (
        <SelectPrimitive.Root
            value={value}
            onValueChange={(nextValue) => onValueChange(nextValue as CreditPackId)}
            disabled={disabled}
        >
            <SelectPrimitive.Trigger
                aria-label="Credit pack"
                className="group flex h-9 min-w-0 flex-1 items-center justify-between gap-3 rounded-md border border-border/45 bg-muted/30 px-3 text-left outline-none transition-[background-color,border-color,box-shadow] hover:bg-muted/45 focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/15 data-[state=open]:border-foreground/25 data-[state=open]:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <SelectPrimitive.Value asChild>
                    <span className="flex min-w-0 items-baseline gap-2.5">
                        <span className="shrink-0 font-mono text-xs font-medium tabular-nums">
                            {selectedPack.price}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                            {selectedPack.credits}
                        </span>
                    </span>
                </SelectPrimitive.Value>
                <SelectPrimitive.Icon asChild>
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </SelectPrimitive.Icon>
            </SelectPrimitive.Trigger>

            <SelectPrimitive.Portal>
                <SelectPrimitive.Content
                    position="popper"
                    sideOffset={6}
                    align="start"
                    collisionPadding={8}
                    className="z-50 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border/60 bg-popover text-popover-foreground shadow-[0_16px_48px_rgba(0,0,0,0.32)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
                >
                    <SelectPrimitive.Viewport className="p-1.5">
                        <SelectPrimitive.Group>
                            <SelectPrimitive.Label className="block px-2.5 pb-1.5 pt-1 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                Choose credit pack
                            </SelectPrimitive.Label>

                            {CREDIT_PACK_OPTIONS.map((pack) => (
                                <SelectPrimitive.Item
                                    key={pack.id}
                                    value={pack.id}
                                    className={cn(
                                        "relative grid w-full cursor-default grid-cols-[minmax(0,1fr)_16px] items-center gap-3 rounded-md px-2.5 py-2.5 outline-none transition-colors select-none",
                                        "data-[highlighted]:bg-muted/70 data-[state=checked]:bg-muted/50 data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
                                    )}
                                >
                                    <SelectPrimitive.ItemText asChild>
                                        <span className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] items-baseline gap-3">
                                            <span className="font-mono text-xs font-medium tabular-nums">
                                                {pack.price}
                                            </span>
                                            <span className="truncate text-[11px] text-muted-foreground">
                                                {pack.credits}
                                            </span>
                                        </span>
                                    </SelectPrimitive.ItemText>
                                    <span className="flex size-4 items-center justify-center text-foreground">
                                        <SelectPrimitive.ItemIndicator>
                                            <Check className="size-3.5" />
                                        </SelectPrimitive.ItemIndicator>
                                    </span>
                                </SelectPrimitive.Item>
                            ))}
                        </SelectPrimitive.Group>
                    </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
            </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
    );
}
