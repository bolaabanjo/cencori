'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileText, FileJson, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/toast';

interface ExportButtonProps {
    projectId: string;
    filters: {
        status?: string;
        model?: string;
        time_range?: string;
        search?: string;
    };
    environment?: string;
}

export function ExportButton({ projectId, filters, environment = 'production' }: ExportButtonProps) {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async (format: 'csv' | 'json') => {
        setIsExporting(true);
        try {
            // Calculate date range from time_range filter
            const now = new Date();
            let from: string | undefined;

            switch (filters.time_range) {
                case '1h':
                    from = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
                    break;
                case '24h':
                    from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
                    break;
                case '7d':
                    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
                    break;
                case '30d':
                    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                    break;
                case '90d':
                    from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
                    break;
                case 'all':
                    from = undefined;
                    break;
                default:
                    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
            }

            // Build URL using unified export API
            let url = `/api/projects/${projectId}/export?type=logs&format=${format}&environment=${environment}`;
            if (from) url += `&from=${from}`;

            const response = await fetch(url);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Export failed');
            }

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;

            const contentDisposition = response.headers.get('Content-Disposition');
            const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
            a.download = filenameMatch ? filenameMatch[1] : `logs-export.${format}`;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);

            toast.success(`Exported logs as ${format.toUpperCase()}`);
        } catch (error) {
            console.error('Export error:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to export logs');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={isExporting}>
                    {isExporting ? (
                        <>
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                            Exporting...
                        </>
                    ) : (
                        <>
                            <Download className="mr-1.5 h-3 w-3" />
                            Export
                        </>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => handleExport('csv')} className="text-xs cursor-pointer">
                    <FileText className="mr-2 h-3 w-3" />
                    Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('json')} className="text-xs cursor-pointer">
                    <FileJson className="mr-2 h-3 w-3" />
                    Export as JSON
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
