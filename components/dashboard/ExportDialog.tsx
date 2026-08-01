"use client";

import React, { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface ExportDialogProps {
    projectId: string;
    type: "logs" | "analytics" | "security-incidents";
    environment?: string;
    triggerClassName?: string;
    showTriggerIcon?: boolean;
}

export function ExportDialog({
    projectId,
    type,
    environment = "production",
    triggerClassName,
    showTriggerIcon = true,
}: ExportDialogProps) {
    const [open, setOpen] = useState(false);
    const [format, setFormat] = useState<"csv" | "json">("csv");
    const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "all">("7d");
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);

        try {
            // Calculate date range
            const now = new Date();
            let from: string | undefined;

            switch (dateRange) {
                case "7d":
                    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
                    break;
                case "30d":
                    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                    break;
                case "90d":
                    from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
                    break;
                case "all":
                    from = undefined;
                    break;
            }

            // Build URL
            let url = `/api/projects/${projectId}/export?type=${type}&format=${format}&environment=${environment}`;
            if (from) url += `&from=${from}`;

            // Fetch and download
            const response = await fetch(url);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "Export failed");
            }

            // Get filename from Content-Disposition or generate one
            const contentDisposition = response.headers.get("Content-Disposition");
            let filename = `${type}-export.${format}`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/);
                if (match) filename = match[1];
            }

            // Download file
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);

            toast.success("Export downloaded");
            setOpen(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Export failed");
        } finally {
            setIsExporting(false);
        }
    };

    const typeLabels = {
        logs: "Request Logs",
        analytics: "Observability Data",
        "security-incidents": "Security Incidents",
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 text-xs", triggerClassName)}>
                    {showTriggerIcon && <Download className="mr-1.5 h-3.5 w-3.5" />}
                    Export
                </Button>
            </DialogTrigger>
            <DialogContent className="border-black/[0.06] bg-[#f3f3f1] shadow-[0_28px_80px_rgba(0,0,0,0.28)] dark:border-white/[0.06] dark:bg-[#111111] sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle className="text-base">Export {typeLabels[type]}</DialogTitle>
                    <DialogDescription className="text-xs">
                        Download your data as CSV or JSON
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="format" className="text-xs text-right">
                            Format
                        </Label>
                        <Select value={format} onValueChange={(v) => setFormat(v as "csv" | "json")}>
                            <SelectTrigger id="format" className="col-span-3 h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="csv" className="text-xs">CSV (Excel compatible)</SelectItem>
                                <SelectItem value="json" className="text-xs">JSON</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="range" className="text-xs text-right">
                            Period
                        </Label>
                        <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
                            <SelectTrigger id="range" className="col-span-3 h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="7d" className="text-xs">Last 7 days</SelectItem>
                                <SelectItem value="30d" className="text-xs">Last 30 days</SelectItem>
                                <SelectItem value="90d" className="text-xs">Last 90 days</SelectItem>
                                <SelectItem value="all" className="text-xs">All time</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        className="h-8 text-xs"
                        onClick={handleExport}
                        disabled={isExporting}
                    >
                        {isExporting ? (
                            <>
                                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                                Exporting...
                            </>
                        ) : (
                            "Download"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
