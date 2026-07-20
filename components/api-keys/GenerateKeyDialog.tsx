"use client";

import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check, AlertCircle, Shield, X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { useEnvironment } from "@/lib/contexts/EnvironmentContext";
import { Badge } from "@/components/ui/badge";

interface GenerateKeyDialogProps {
    projectId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onKeyGenerated: () => void;
    defaultKeyType?: 'secret' | 'publishable';
}

export function GenerateKeyDialog({
    projectId,
    open,
    onOpenChange,
    onKeyGenerated,
    defaultKeyType = 'secret',
}: GenerateKeyDialogProps) {
    const { environment } = useEnvironment();
    const [keyName, setKeyName] = useState("");
    const [keyType, setKeyType] = useState<'secret' | 'publishable'>(defaultKeyType);
    const [domainInput, setDomainInput] = useState("");
    const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
    const [generatedKey, setGeneratedKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (open) {
            setKeyType(defaultKeyType);
        }
    }, [open, defaultKeyType]);

    const addDomain = () => {
        const domain = domainInput.trim().toLowerCase();
        if (domain && !allowedDomains.includes(domain)) {
            setAllowedDomains([...allowedDomains, domain]);
            setDomainInput("");
        }
    };

    const removeDomain = (domain: string) => {
        setAllowedDomains(allowedDomains.filter(d => d !== domain));
    };

    const handleGenerate = async () => {
        if (!keyName.trim()) {
            toast.error("Please enter a name for your API key");
            return;
        }

        if (keyType === "publishable" && allowedDomains.length === 0) {
            toast.error("Please add at least one allowed domain");
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/api-keys`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: keyName,
                    environment,
                    key_type: keyType,
                    allowed_domains: keyType === "publishable" ? allowedDomains : null,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
                throw new Error(errorData.error || "Failed to generate API key");
            }

            const data = await response.json();
            setGeneratedKey(data.apiKey.full_key);
            toast.success("API key generated!");
        } catch (error) {
            console.error("Error generating API key:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to generate API key";
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        if (generatedKey) {
            await navigator.clipboard.writeText(generatedKey);
            setCopied(true);
            toast.success("Copied!");
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleClose = () => {
        if (generatedKey) {
            onKeyGenerated();
        }
        setGeneratedKey(null);
        setKeyName("");
        setAllowedDomains([]);
        setDomainInput("");
        setCopied(false);
        onOpenChange(false);
    };

    const isPublishable = keyType === 'publishable';

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[420px] p-0">
                {!generatedKey ? (
                    <>
                        <DialogHeader className="px-4 pt-4 pb-0">
                            <DialogTitle className="text-sm font-medium">
                                {isPublishable ? "Create publishable key" : "Create secret key"}
                            </DialogTitle>
                            <DialogDescription className="text-[11px] text-muted-foreground mt-1">
                                {isPublishable
                                    ? "Safe for browser use. Requires domain whitelisting."
                                    : "For server-side use only. Never expose in client code."}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="px-4 py-3 space-y-3">
                            {/* Name Field */}
                            <div className="space-y-1">
                                <Label htmlFor="key-name" className="text-xs">Name</Label>
                                <Input
                                    id="key-name"
                                    placeholder={isPublishable ? "web_app_key" : "my_secret_key"}
                                    value={keyName}
                                    onChange={(e) => setKeyName(e.target.value)}
                                    className="h-8 text-xs"
                                />
                            </div>

                            {/* Allowed Domains (publishable only) */}
                            {isPublishable && (
                                <div className="space-y-1">
                                    <Label className="text-xs">Allowed domains</Label>
                                    <div className="flex gap-1.5">
                                        <Input
                                            placeholder="localhost, *.myapp.com"
                                            value={domainInput}
                                            onChange={(e) => setDomainInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    addDomain();
                                                }
                                            }}
                                            className="h-8 text-xs"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 px-2.5 text-xs"
                                            onClick={addDomain}
                                        >
                                            Add
                                        </Button>
                                    </div>
                                    {allowedDomains.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {allowedDomains.map((domain) => (
                                                <Badge key={domain} variant="secondary" className="text-[10px] px-1.5 py-0.5 gap-0.5">
                                                    {domain}
                                                    <button type="button" onClick={() => removeDomain(domain)} className="hover:text-destructive">
                                                        <X className="h-2.5 w-2.5" />
                                                    </button>
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Security Warning (secret only) */}
                            {!isPublishable && (
                                <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2.5">
                                    <div className="flex gap-2">
                                        <Shield className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                                        <div className="space-y-1">
                                            <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Keep this key secret</p>
                                            <ul className="text-[10px] text-amber-600/80 dark:text-amber-400/80 space-y-0.5 list-disc list-inside">
                                                <li>Don't use in browser or commit to source control</li>
                                                <li>If leaked, revoke and create a new key</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <DialogFooter className="px-4 pb-4 pt-0 gap-2">
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={handleGenerate}
                                disabled={loading || !keyName.trim() || (isPublishable && allowedDomains.length === 0)}
                            >
                                {loading ? "Creating..." : "Create key"}
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    <>
                        <DialogHeader className="px-4 pt-4 pb-0">
                            <DialogTitle className="text-sm font-medium">Key created</DialogTitle>
                        </DialogHeader>
                        <div className="px-4 py-3">
                            <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 mb-3">
                                <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                                <span className="text-[10px] text-amber-600 dark:text-amber-400">
                                    Copy now. You won&apos;t see this again.
                                </span>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Your API key</Label>
                                <div className="flex gap-1.5">
                                    <Input
                                        value={generatedKey}
                                        readOnly
                                        className="h-8 font-mono text-[10px] bg-secondary/50"
                                    />
                                    <Button variant="outline" size="icon" onClick={handleCopy} className="h-8 w-8 shrink-0">
                                        {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="px-4 pb-4 pt-0">
                            <Button size="sm" className="h-7 text-xs" onClick={handleClose}>Done</Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
