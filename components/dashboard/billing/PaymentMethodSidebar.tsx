"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CreditCard, Lock, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';

interface PaymentMethodSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    portalUrl?: string | null;
}

export function PaymentMethodSidebar({ isOpen, onClose, portalUrl }: PaymentMethodSidebarProps) {
    const [isPending, setIsPending] = React.useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        console.log("PaymentMethodSidebar submit. Portal URL:", portalUrl);
        e.preventDefault();
        setIsPending(true);

        // If we have a portal URL, redirect there
        if (portalUrl) {
            window.open(portalUrl, '_blank', 'noopener,noreferrer');
            setIsPending(false);
            onClose();
            return;
        }

        // Fallback simulation
        await new Promise(resolve => setTimeout(resolve, 1000));
        setIsPending(false);
        toast.info("Please use the Customer Portal to manage payment methods.");
        onClose();
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
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm font-medium uppercase tracking-wider text-foreground">Add Payment Method</h2>
                                <Lock className="h-3 w-3 text-muted-foreground/60" />
                            </div>
                            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-muted-foreground/40 hover:text-foreground">
                                <X size={16} />
                            </Button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-6">
                            <div className="p-4 rounded-full bg-secondary/10 text-primary mb-2">
                                <CreditCard size={32} />
                            </div>

                            <div className="space-y-2 max-w-xs">
                                <h3 className="text-lg font-medium">Manage via Secure Portal</h3>
                                <p className="text-sm text-muted-foreground">
                                    To ensure the highest security, payment methods are managed through our secure billing portal.
                                </p>
                            </div>

                            <Button
                                onClick={handleSubmit}
                                disabled={isPending}
                                className="w-full max-w-xs h-10 gap-2 text-xs font-medium uppercase tracking-wider"
                            >
                                <span>{isPending ? 'Opening Portal...' : 'Go to Billing Portal'}</span>
                                <ExternalLink size={12} />
                            </Button>
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-border/20 flex items-center justify-between bg-secondary/5">
                            <Button variant="ghost" onClick={onClose} className="h-8 text-[11px] font-medium uppercase tracking-wider text-foreground/70 hover:text-foreground">
                                Close
                            </Button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
