"use client";
import React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency';

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

type CreditPackId = 'starter' | 'growth' | 'scale';

const CREDIT_PACK_OPTIONS: Array<{ id: CreditPackId; label: string }> = [
    { id: 'starter', label: '$10' },
    { id: 'growth', label: '$50' },
    { id: 'scale', label: '$200' },
];

type PaymentMethod = 'card' | 'crypto';

export function CreditBalance({ orgId, balance, transactions, currency = 'USD' }: CreditProps) {
    const [selectedPack, setSelectedPack] = React.useState<CreditPackId>('growth');
    const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>('card');
    const [isRecharging, setIsRecharging] = React.useState(false);

    const handleRecharge = async () => {
        if (isRecharging) return;
        setIsRecharging(true);

        try {
            const endpoint = paymentMethod === 'card'
                ? '/api/billing/credits/checkout'
                : '/api/billing/credits/crypto-checkout';

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orgId,
                    pack: selectedPack,
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.checkoutUrl) {
                throw new Error(data?.error || data?.details || 'Failed to start credits checkout');
            }

            if (paymentMethod === 'crypto') {
                window.open(data.checkoutUrl, '_blank');
                toast.info('Crypto checkout opened in a new tab. Credits will appear once payment is confirmed.');
            } else {
                window.location.href = data.checkoutUrl;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to start credits checkout';
            toast.error(message);
            setIsRecharging(false);
        }
    };

    return (
        <div className="rounded-md border border-border/40 bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Credit Balance
                </p>
                <div className="flex items-center gap-1 rounded-md border border-border/40 p-0.5">
                    <button
                        type="button"
                        onClick={() => setPaymentMethod('card')}
                        className={`px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider rounded transition-colors ${
                            paymentMethod === 'card'
                                ? 'bg-foreground text-background'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Card
                    </button>
                    <button
                        type="button"
                        onClick={() => setPaymentMethod('crypto')}
                        className={`px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider rounded transition-colors ${
                            paymentMethod === 'crypto'
                                ? 'bg-foreground text-background'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Crypto
                    </button>
                </div>
            </div>
            <div className="p-4">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className="text-2xl font-medium tabular-nums">
                            {formatCurrency(balance, currency, { maximumFractionDigits: 8, minimumFractionDigits: 8 })}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                            Available for on-demand generation
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={selectedPack}
                            onChange={(e) => setSelectedPack(e.target.value as CreditPackId)}
                            className="h-7 rounded border border-border bg-background px-2 text-xs"
                            disabled={isRecharging}
                        >
                            {CREDIT_PACK_OPTIONS.map((pack) => (
                                <option key={pack.id} value={pack.id}>
                                    {pack.label}
                                </option>
                            ))}
                        </select>
                        <Button
                            className="h-7 px-4 text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors shadow-none rounded"
                            onClick={handleRecharge}
                            disabled={isRecharging}
                        >
                            {isRecharging ? 'Opening...' : 'Recharge'}
                        </Button>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Recent Transactions
                    </div>
                    <div className="space-y-1">
                        {transactions.map((t) => {
                            const amount = Number(t.amount) || 0;
                            const isCredit = amount >= 0;
                            const formattedAmount = formatCurrency(Math.abs(amount), currency, { maximumFractionDigits: 8 });

                            return (
                                <div key={t.id} className="flex items-center justify-between py-2 text-xs border-b border-border/40 last:border-0">
                                    <span className={cn(
                                        "font-medium",
                                        isCredit ? "text-emerald-500" : "text-foreground"
                                    )}>
                                        {isCredit ? '+' : '-'}{formattedAmount}
                                    </span>
                                    <span className="text-muted-foreground">{t.description}</span>
                                    <span className="text-muted-foreground/50 tabular-nums">
                                        {new Date(t.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                            );
                        })}
                        {transactions.length === 0 && (
                            <div className="text-center py-4 text-xs text-muted-foreground">
                                No recent transactions
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="px-4 py-2 border-t border-border/20">
                <Button variant="link" className="w-full h-auto p-0 text-[10px] font-medium text-muted-foreground uppercase tracking-widest hover:text-foreground hover:no-underline transition-colors">
                    View Full History
                </Button>
            </div>
        </div>
    );
}
