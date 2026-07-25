"use client";

import React from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface Invoice {
    id: string;
    orderId?: string;
    date: string;
    amount: number;
    status: "paid" | "pending" | "failed" | "refunded";
    pdfUrl: string | null;
    currency?: string;
}

interface InvoiceHistoryProps {
    invoices: Invoice[];
}

const STATUS_STYLES: Record<Invoice["status"], string> = {
    paid: "text-emerald-600 dark:text-emerald-400",
    pending: "text-amber-600 dark:text-amber-400",
    failed: "text-red-600 dark:text-red-400",
    refunded: "text-muted-foreground",
};

export function InvoiceHistory({ invoices }: InvoiceHistoryProps) {
    const [query, setQuery] = React.useState("");

    const filteredInvoices = React.useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return invoices;

        return invoices.filter((invoice) => {
            const date = new Date(invoice.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
            }).toLowerCase();

            return invoice.id.toLowerCase().includes(normalizedQuery)
                || (invoice.orderId || "").toLowerCase().includes(normalizedQuery)
                || invoice.status.toLowerCase().includes(normalizedQuery)
                || date.includes(normalizedQuery);
        });
    }, [invoices, query]);

    const openInvoice = (url: string | null) => {
        if (!url) return;
        window.open(url, "_blank", "noopener,noreferrer");
    };

    return (
        <section className="grid gap-6 border-t border-border/30 py-9 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
            <div>
                <h2 className="text-sm font-medium">Invoices</h2>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    Receipts and subscription charges for this organization.
                </p>
            </div>

            <div className="min-w-0 overflow-hidden rounded-lg border border-border/40 bg-muted/20">
                <div className="border-b border-border/30 p-3">
                    <div className="relative w-full sm:ml-auto sm:w-64">
                        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search invoices"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            className="h-8 rounded-md border-border/60 bg-background pl-9 text-xs shadow-none"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <Table className="min-w-[650px]">
                    <TableHeader>
                        <TableRow className="border-border/30 hover:bg-transparent">
                            <TableHead className="h-9 px-4 text-xs font-normal text-muted-foreground">Reference</TableHead>
                            <TableHead className="h-9 text-xs font-normal text-muted-foreground">Issued</TableHead>
                            <TableHead className="h-9 text-right text-xs font-normal text-muted-foreground">Amount</TableHead>
                            <TableHead className="h-9 text-right text-xs font-normal text-muted-foreground">Status</TableHead>
                            <TableHead className="h-9 px-4 text-right text-xs font-normal text-muted-foreground">Receipt</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody className={filteredInvoices.length === 0 ? "bg-muted/50" : "bg-transparent"}>
                        {filteredInvoices.map((invoice) => (
                            <TableRow key={invoice.id} className="border-border/30 hover:bg-muted/30">
                                <TableCell className="px-4 py-3.5">
                                    <div className="max-w-64 truncate text-xs font-medium" title={invoice.id}>
                                        {invoice.orderId || invoice.id}
                                    </div>
                                    {invoice.orderId && (
                                        <div className="mt-1 max-w-64 truncate text-[10px] text-muted-foreground">{invoice.id}</div>
                                    )}
                                </TableCell>
                                <TableCell className="py-4 text-xs text-muted-foreground">
                                    {new Date(invoice.date).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                    })}
                                </TableCell>
                                <TableCell className="py-4 text-right font-mono text-xs tabular-nums">
                                    {formatCurrency(invoice.amount, invoice.currency || "USD")}
                                </TableCell>
                                <TableCell className="py-4 text-right">
                                    <span className={cn("text-xs capitalize", STATUS_STYLES[invoice.status])}>
                                        {invoice.status}
                                    </span>
                                </TableCell>
                                <TableCell className="px-4 py-3.5 text-right">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-7 rounded-md text-muted-foreground shadow-none hover:text-foreground"
                                        onClick={() => openInvoice(invoice.pdfUrl)}
                                        disabled={!invoice.pdfUrl}
                                        aria-label={`Open invoice ${invoice.id}`}
                                    >
                                        <ArrowUpRight className="size-3" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filteredInvoices.length === 0 && (
                            <TableRow className="hover:bg-muted/70">
                                <TableCell colSpan={5} className="h-36 text-center text-xs text-muted-foreground">
                                    {invoices.length === 0 ? "Your first invoice will appear here." : "No invoices match that search."}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                    </Table>
                </div>
            </div>
        </section>
    );
}
