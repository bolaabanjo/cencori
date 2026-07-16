"use client";
import React from "react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Search, Download, Eye } from "lucide-react";
import { formatCurrency } from '@/lib/currency';

interface Invoice {
    id: string;
    orderId?: string;
    date: string;
    amount: number;
    status: 'paid' | 'pending' | 'failed' | 'refunded';
    pdfUrl: string | null;
    currency?: string;
}

interface InvoiceHistoryProps {
    invoices: Invoice[];
}

export function InvoiceHistory({ invoices }: InvoiceHistoryProps) {
    const [query, setQuery] = React.useState('');

    const filteredInvoices = React.useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
            return invoices;
        }

        return invoices.filter((invoice) => {
            const date = new Date(invoice.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            }).toLowerCase();

            return (
                invoice.id.toLowerCase().includes(normalizedQuery)
                || (invoice.orderId || '').toLowerCase().includes(normalizedQuery)
                || invoice.status.toLowerCase().includes(normalizedQuery)
                || date.includes(normalizedQuery)
            );
        });
    }, [invoices, query]);

    const openInvoice = (url: string | null) => {
        if (!url) return;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 mb-2">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                        placeholder="Search for an invoice..."
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="w-48 sm:w-64 h-7 pl-7 text-xs rounded border-border/50 bg-transparent placeholder:text-muted-foreground/60"
                    />
                </div>
            </div>

            <div className="bg-card border border-border/40 rounded-md overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent border-b border-border/40">
                            <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8 px-4">Invoice ID</TableHead>
                            <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">Date</TableHead>
                            <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">Amount</TableHead>
                            <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8">Status</TableHead>
                            <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8 text-right pr-4">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredInvoices.map((invoice) => (
                            <TableRow
                                key={invoice.id}
                                className="cursor-default hover:bg-secondary/30 border-b border-border/40 last:border-b-0 transition-colors"
                            >
                                <TableCell className="py-3 px-4">
                                    <div
                                        className="text-[13px] font-medium max-w-[180px] truncate"
                                        title={`#${invoice.id}`}
                                    >
                                        #{invoice.id}
                                    </div>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground py-3">
                                    {new Date(invoice.date).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric"
                                    })}
                                </TableCell>
                                <TableCell className="text-xs font-medium py-3 tabular-nums">
                                    {formatCurrency(invoice.amount, invoice.currency || 'USD')}
                                </TableCell>
                                <TableCell className="py-3">
                                    <Badge
                                        variant="outline"
                                        className="text-[11px] px-2 py-0.5 border-foreground/20 text-foreground capitalize"
                                    >
                                        {invoice.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="py-3 pr-4 text-right">
                                    <div className="flex items-center justify-end gap-3">
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                                onClick={() => openInvoice(invoice.pdfUrl)}
                                                disabled={!invoice.pdfUrl}
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                                onClick={() => openInvoice(invoice.pdfUrl)}
                                                disabled={!invoice.pdfUrl}
                                            >
                                                <Download className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filteredInvoices.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="py-16 text-center text-xs text-muted-foreground font-medium">
                                    No financial records found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
