"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";

interface BillingChoiceSelectProps<Value extends string> {
    value?: Value;
    options: ReadonlyArray<{ value: Value; label: string }>;
    onValueChange: (value: Value) => void;
    ariaLabel: string;
    menuLabel: string;
    placeholder?: string;
    disabled?: boolean;
}

export function BillingChoiceSelect<Value extends string>({
    value,
    options,
    onValueChange,
    ariaLabel,
    menuLabel,
    placeholder = "Select an option",
    disabled,
}: BillingChoiceSelectProps<Value>) {
    const selectedOption = options.find((option) => option.value === value);

    return (
        <SelectPrimitive.Root
            value={value}
            onValueChange={(nextValue) => onValueChange(nextValue as Value)}
            disabled={disabled}
        >
            <SelectPrimitive.Trigger
                aria-label={ariaLabel}
                className="group flex h-9 w-full min-w-0 items-center justify-between gap-3 rounded-md border border-border/45 bg-muted/30 px-3 text-left text-xs outline-none transition-[background-color,border-color,box-shadow] hover:bg-muted/45 focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/15 data-[state=open]:border-foreground/25 data-[state=open]:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-45"
            >
                <span className="truncate font-medium">
                    {selectedOption?.label ?? placeholder}
                </span>
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
                                {menuLabel}
                            </SelectPrimitive.Label>

                            {options.map((option) => (
                                <SelectPrimitive.Item
                                    key={option.value}
                                    value={option.value}
                                    className="relative grid w-full cursor-default grid-cols-[minmax(0,1fr)_16px] items-center gap-3 rounded-md px-2.5 py-2.5 text-xs outline-none transition-colors select-none data-[highlighted]:bg-muted/70 data-[state=checked]:bg-muted/50 data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
                                >
                                    <SelectPrimitive.ItemText asChild>
                                        <span className="truncate font-medium">{option.label}</span>
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
