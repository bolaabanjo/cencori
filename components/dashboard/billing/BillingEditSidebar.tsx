"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateBillingDetails } from '@/app/(app)/[orgSlug]/~/billing/actions';
import { toast } from 'sonner';
import { useTransition } from 'react';
import { CountrySelector } from './CountrySelector';
import { useQueryClient } from '@tanstack/react-query';

interface BillingEditSidebarProps {
    isOpen: boolean;
    onClose: () => void;
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

export function BillingEditSidebar({ isOpen, onClose, initialData, orgSlug }: BillingEditSidebarProps) {
    const [country, setCountry] = React.useState(initialData.country || "");
    const [isPending, startTransition] = useTransition();
    const queryClient = useQueryClient();

    React.useEffect(() => {
        setCountry(initialData.country || "");
    }, [initialData.country]);

    const handleSubmit = (formData: FormData) => {
        startTransition(async () => {
            const result = await updateBillingDetails(orgSlug, formData);
            if (result.error) {
                toast.error(result.error);
            } else {
                const getString = (key: string) => String(formData.get(key) || '').trim();
                const getNullableString = (key: string) => {
                    const value = getString(key);
                    return value.length > 0 ? value : null;
                };

                queryClient.setQueryData(
                    ['orgBilling', orgSlug],
                    (previous: unknown) => {
                        if (!previous || typeof previous !== 'object') {
                            return previous;
                        }

                        return {
                            ...previous,
                            name: getString('name'),
                            billing_email: getString('email'),
                            billing_address_line1: getNullableString('line1'),
                            billing_address_line2: getNullableString('line2'),
                            billing_city: getNullableString('city'),
                            billing_state: getNullableString('state'),
                            billing_zip: getNullableString('zip'),
                            billing_country: getNullableString('country'),
                            billing_tax_id: getNullableString('taxId'),
                        };
                    }
                );

                queryClient.invalidateQueries({ queryKey: ['orgBilling', orgSlug] });
                queryClient.invalidateQueries({ queryKey: ['orgPortalUrl', orgSlug] });

                toast.success('Billing details updated');
                onClose();
            }
        });
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[100]"
                    />

                    {/* Sidebar */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed top-0 right-0 h-full w-full max-w-[450px] bg-card border-l border-border/40 z-[101] shadow-2xl flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border/20">
                            <h2 className="text-sm font-medium uppercase tracking-wider text-foreground">Edit Billing Details</h2>
                            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-muted-foreground/40 hover:text-foreground">
                                <X size={16} />
                            </Button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <form id="billing-form" action={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="org-name" className="text-[11px] font-medium uppercase tracking-widest text-foreground/70">
                                        Organization name
                                    </Label>
                                    <Input
                                        id="org-name"
                                        name="name"
                                        defaultValue={initialData.name}
                                        placeholder="Organization name"
                                        className="h-9 bg-secondary/5 border-border/40 focus:border-border/80 transition-colors"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="org-email" className="text-[11px] font-medium uppercase tracking-widest text-foreground/70">
                                        Notification Email
                                    </Label>
                                    <Input
                                        id="org-email"
                                        name="email"
                                        type="email"
                                        defaultValue={initialData.email}
                                        placeholder="billing@example.com"
                                        className="h-9 bg-secondary/5 border-border/40 focus:border-border/80 transition-colors"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="address-1" className="text-[11px] font-medium uppercase tracking-widest text-foreground/70">
                                        Address line 1
                                    </Label>
                                    <Input
                                        id="address-1"
                                        name="line1"
                                        defaultValue={initialData.line1}
                                        placeholder="Street address"
                                        className="h-9 bg-secondary/5 border-border/40 focus:border-border/80 transition-colors"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="address-2" className="text-[11px] font-medium uppercase tracking-widest text-foreground/70">
                                        Address line 2 (optional)
                                    </Label>
                                    <Input
                                        id="address-2"
                                        name="line2"
                                        defaultValue={initialData.line2}
                                        placeholder="Apartment, suite, unit, building, floor, etc."
                                        className="h-9 bg-secondary/5 border-border/40 focus:border-border/80 transition-colors"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="country" className="text-[11px] font-medium uppercase tracking-widest text-foreground/70">
                                            Country
                                        </Label>
                                        <CountrySelector
                                            value={country}
                                            onValueChange={setCountry}
                                        />
                                        <input type="hidden" name="country" value={country} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="postal-code" className="text-[11px] font-medium uppercase tracking-widest text-foreground/70">
                                            Postal code
                                        </Label>
                                        <Input
                                            id="postal-code"
                                            name="zip"
                                            defaultValue={initialData.zip}
                                            className="h-9 bg-secondary/5 border-border/40 focus:border-border/80 transition-colors"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="city" className="text-[11px] font-medium uppercase tracking-widest text-foreground/70">
                                            City
                                        </Label>
                                        <Input
                                            id="city"
                                            name="city"
                                            defaultValue={initialData.city}
                                            className="h-9 bg-secondary/5 border-border/40 focus:border-border/80 transition-colors"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="state" className="text-[11px] font-medium uppercase tracking-widest text-foreground/70">
                                            State / Province
                                        </Label>
                                        <Input
                                            id="state"
                                            name="state"
                                            defaultValue={initialData.state}
                                            className="h-9 bg-secondary/5 border-border/40 focus:border-border/80 transition-colors"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="tax-id" className="text-[11px] font-medium uppercase tracking-widest text-foreground/70">
                                        Tax ID
                                    </Label>
                                    <Input
                                        id="tax-id"
                                        name="taxId"
                                        defaultValue={initialData.taxId}
                                        placeholder="Select tax ID"
                                        className="h-9 bg-secondary/5 border-border/40 focus:border-border/80 transition-colors"
                                    />
                                </div>
                            </form>
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-border/20 flex items-center justify-between bg-secondary/5">
                            <Button variant="ghost" onClick={onClose} className="h-8 text-[11px] font-medium uppercase tracking-wider text-foreground/70 hover:text-foreground">
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                form="billing-form"
                                disabled={isPending}
                                className="h-8 px-6 text-[11px] font-medium uppercase tracking-wider bg-foreground text-background hover:bg-foreground/90 transition-colors shadow-none rounded"
                            >
                                {isPending ? 'Saving...' : 'Save'}
                            </Button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
