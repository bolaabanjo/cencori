"use client";

/**
 * Provider Key Manager Component
 * 
 * Allows users to manage their API keys for supported AI providers (BYOK).
 * Part of project settings.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { AudioLines, Check, ChevronRight, Eye, EyeOff, Key, Loader2, Plus, Trash2, X } from "lucide-react";
import { OpenAI, Anthropic, Google, Mistral, Cohere, Perplexity, OpenRouter, Groq, XAI, Together, Meta, HuggingFace, Qwen, DeepSeek, ZAI } from "@lobehub/icons";
import { SUPPORTED_PROVIDERS, getModelsForProvider, getChatModelsForProvider, getImageModelsForProvider, type AIProviderConfig } from "@/lib/providers/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import Image from "next/image";

// Provider logo mapping
const PROVIDER_LOGOS: Record<string, React.ReactNode> = {
    openai: <OpenAI size={20} />,
    anthropic: <Anthropic size={20} />,
    google: <Google.Color size={20} />,
    mistral: <Mistral.Color size={20} />,
    cohere: <Cohere.Color size={20} />,
    perplexity: <Perplexity.Color size={20} />,
    groq: <Groq size={20} />,
    together: <Together.Color size={20} />,
    openrouter: <OpenRouter size={20} />,
    xai: <XAI size={20} />,
    meta: <Meta.Color size={20} />,
    huggingface: <HuggingFace.Color size={20} />,
    qwen: <Qwen.Color size={20} />,
    deepseek: <DeepSeek.Color size={20} />,
    zai: <ZAI size={20} />,
    // Voice providers (no brand icons in the icon set) — neutral voice glyph
    deepgram: <AudioLines size={18} />,
    cartesia: <AudioLines size={18} />,
    spitch: <AudioLines size={18} />,
    assemblyai: <AudioLines size={18} />,
    elevenlabs: <AudioLines size={18} />,
};

function getProviderLogo(providerId: string, size: 'sm' | 'md' = 'md') {
    const logo = PROVIDER_LOGOS[providerId];
    const baseClass = size === 'sm'
        ? "w-5 h-5 flex items-center justify-center rounded-md bg-muted/50"
        : "w-8 h-8 flex items-center justify-center rounded-lg bg-muted/50";
    return <div className={baseClass}>{logo}</div>;
}

interface ProviderKeyData {
    provider: string;
    providerName: string;
    hasKey: boolean;
    keyHint?: string;
    apiKey?: string;
    isActive: boolean;
    defaultModel?: string;
    defaultImageModel?: string;
    createdAt?: string;
}

interface ProviderKeysResponse {
    providers: ProviderKeyData[];
    defaults: {
        provider: string;
        model: string;
        imageModel?: string;
    };
}

interface ProviderKeyManagerProps {
    projectId?: string;
}

export function ProviderKeyManager({ projectId }: ProviderKeyManagerProps) {
    const queryClient = useQueryClient();
    const [selectedProvider, setSelectedProvider] = useState<AIProviderConfig | null>(null);
    const [apiKey, setApiKey] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [selectedModel, setSelectedModel] = useState("");
    const [selectedImageModel, setSelectedImageModel] = useState("");
    const [setAsDefault, setSetAsDefault] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [existingKeyHint, setExistingKeyHint] = useState<string | null>(null);
    const [isProviderActive, setIsProviderActive] = useState(true);

    // Fetch provider keys
    const { data, isLoading } = useQuery<ProviderKeysResponse>({
        queryKey: ["provider-keys", projectId],
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/provider-keys`);
            if (!res.ok) throw new Error("Failed to fetch provider keys");
            return res.json();
        },
        enabled: !!projectId,
    });

    // Add/update key mutation
    const addKeyMutation = useMutation({
        mutationFn: async (payload: { provider: string; apiKey: string; setAsDefault?: boolean; defaultModel?: string; defaultImageModel?: string }) => {
            const res = await fetch(`/api/projects/${projectId}/provider-keys`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                // Surface the server's actual reason — a generic message hides
                // whether it's auth, permissions, validation, or a server bug.
                const body = await res.json().catch(() => null) as { error?: unknown; message?: string } | null;
                const serverError =
                    typeof body?.error === 'string' ? body.error
                    : body?.message
                    || (typeof body?.error === 'object' && body?.error && 'message' in body.error
                        ? String((body.error as { message?: unknown }).message)
                        : `HTTP ${res.status}`);
                throw new Error(serverError);
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["provider-keys", projectId] });
            toast.success("Provider key saved");
            resetDialog();
        },
        onError: (error) =>
            toast.error(`Failed to save provider key: ${error instanceof Error ? error.message : 'unknown error'}`),
    });

    // Delete key mutation
    const deleteKeyMutation = useMutation({
        mutationFn: async (provider: string) => {
            const res = await fetch(`/api/projects/${projectId}/provider-keys/${provider}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete key");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["provider-keys", projectId] });
            toast.success("Provider key removed");
        },
        onError: () => toast.error("Failed to remove provider key"),
    });

    // Toggle active mutation
    const toggleMutation = useMutation({
        mutationFn: async ({ provider, isActive }: { provider: string; isActive: boolean }) => {
            const res = await fetch(`/api/projects/${projectId}/provider-keys/${provider}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive }),
            });
            if (!res.ok) throw new Error("Failed to update");
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["provider-keys", projectId] });
            toast.success(variables.isActive ? "Provider enabled" : "Provider disabled");
        },
    });

    // Update existing key mutation
    const updateKeyMutation = useMutation({
        mutationFn: async (payload: { provider: string; apiKey?: string; setAsDefault?: boolean; defaultModel?: string; defaultImageModel?: string }) => {
            const res = await fetch(`/api/projects/${projectId}/provider-keys/${payload.provider}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    apiKey: payload.apiKey || undefined,
                    setAsDefault: payload.setAsDefault,
                    defaultModel: payload.defaultModel || undefined,
                    defaultImageModel: payload.defaultImageModel || undefined,
                }),
            });
            if (!res.ok) throw new Error("Failed to update key settings");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["provider-keys", projectId] });
            toast.success("Provider settings updated");
            resetDialog();
        },
        onError: () => toast.error("Failed to update provider settings"),
    });

    const resetDialog = () => {
        setDialogOpen(false);
        setSelectedProvider(null);
        setApiKey("");
        setShowKey(false);
        setSelectedModel("");
        setSelectedImageModel("");
        setSetAsDefault(false);
        setExistingKeyHint(null);
    };

    const handleAddKey = () => {
        if (!selectedProvider) return;

        const existingKey = data?.providers.find(p => p.provider === selectedProvider.id);

        if (existingKeyHint) {
            updateKeyMutation.mutate({
                provider: selectedProvider.id,
                // Only send apiKey if the user typed something new and it's different from the already saved one
                apiKey: apiKey && apiKey !== existingKey?.apiKey ? apiKey : undefined,
                setAsDefault: setAsDefault,
                defaultModel: selectedModel || undefined,
                defaultImageModel: selectedImageModel || undefined,
            });
        } else {
            if (!apiKey) return;
            addKeyMutation.mutate({
                provider: selectedProvider.id,
                apiKey,
                setAsDefault: setAsDefault,
                defaultModel: selectedModel || undefined,
                defaultImageModel: selectedImageModel || undefined,
            });
        }
    };

    const openAddDialog = (provider: AIProviderConfig) => {
        setSelectedProvider(provider);
        const chatModels = getChatModelsForProvider(provider.id);
        const imageModels = getImageModelsForProvider(provider.id);

        // Check if provider already has a key
        const existingKey = data?.providers.find(p => p.provider === provider.id);

        // Initialize Set as Default tracking based on global defaults
        setSetAsDefault(data?.defaults?.provider === provider.id);

        // Initializing model selections:
        // Priority: 1. Per-provider default model, 2. Global project default (if this provider matches), 3. First available
        if (existingKey?.defaultModel) {
            setSelectedModel(existingKey.defaultModel);
        } else if (existingKey?.hasKey && data?.defaults?.provider === provider.id && data?.defaults?.model) {
            setSelectedModel(data.defaults.model);
        } else if (chatModels.length > 0) {
            setSelectedModel(chatModels[0].id);
        }

        // Set default image model
        if (existingKey?.defaultImageModel) {
            setSelectedImageModel(existingKey.defaultImageModel);
        } else if (existingKey?.hasKey && data?.defaults?.provider === provider.id && data?.defaults?.imageModel) {
            setSelectedImageModel(data.defaults.imageModel);
        } else if (imageModels.length > 0) {
            setSelectedImageModel(imageModels[0].id);
        } else {
            setSelectedImageModel("");
        }

        if (existingKey?.hasKey) {
            setExistingKeyHint(existingKey.keyHint || '***');
            if (existingKey.apiKey) {
                setApiKey(existingKey.apiKey);
            }
            setIsProviderActive(existingKey.isActive);
        } else {
            setExistingKeyHint(null);
            setIsProviderActive(true);
        }

        setDialogOpen(true);
    };

    if (!projectId || isLoading) {
        return (
            <div className="space-y-1">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-3 rounded-lg">
                        <div className="flex items-center gap-3">
                            <Skeleton className="w-8 h-8 rounded-lg" />
                            <Skeleton className="h-4 w-24" />
                        </div>
                        <Skeleton className="h-5 w-20 rounded-md" />
                    </div>
                ))}
            </div>
        );
    }

    const configuredProviders = data?.providers.filter(p => p.hasKey) || [];
    const availableProviders = SUPPORTED_PROVIDERS.filter(p => !data?.providers.find(dp => dp.provider === p.id && dp.hasKey));

    return (
        <div className="space-y-1">
            {/* All Providers as a List */}
            {SUPPORTED_PROVIDERS.map((provider) => {
                const keyData = data?.providers.find(p => p.provider === provider.id);
                const hasKey = keyData?.hasKey ?? false;
                const isActive = keyData?.isActive ?? false;
                const isDefault = data?.defaults?.provider === provider.id;

                return (
                    <button
                        key={provider.id}
                        onClick={() => openAddDialog(provider)}
                        className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors group"
                    >
                        {/* Left: Logo + Name */}
                        <div className="flex items-center gap-3">
                            {getProviderLogo(provider.id)}
                            <span className="text-sm font-medium">{provider.name}</span>
                            {isDefault && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 rounded-md border-border/50">
                                    Default
                                </Badge>
                            )}
                        </div>

                        {/* Right: Status + Chevron */}
                        <div className="flex items-center gap-2">
                            {hasKey ? (
                                <Badge className={`text-[10px] px-2 py-0.5 rounded-md ${isActive ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-muted text-muted-foreground'}`}>
                                    {isActive ? (
                                        <span className="flex items-center gap-1">
                                            <Check className="h-3 w-3" />
                                            Enabled
                                        </span>
                                    ) : 'Disabled'}
                                </Badge>
                            ) : (
                                <Badge variant="secondary" className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                                    Not configured
                                </Badge>
                            )}
                            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    </button>
                );
            })}

            {/* Add/Edit Dialog - Cenpact Design */}
            <Dialog open={dialogOpen} onOpenChange={(open) => {
                if (!open) resetDialog();
                else setDialogOpen(true);
            }}>
                <DialogContent className="rounded-xl sm:max-w-sm p-0 gap-0 border-border/50">
                    <DialogHeader className="px-4 py-3 border-b border-border/40">
                        <div className="flex items-center gap-2">
                            {selectedProvider && getProviderLogo(selectedProvider.id)}
                            <DialogTitle className="text-sm font-medium">
                                {selectedProvider?.name}
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-[11px] text-muted-foreground">
                            Get your key from{" "}
                            <a href={selectedProvider?.website} target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">
                                {selectedProvider?.website?.replace('https://', '')}
                            </a>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="px-4 py-3 space-y-3">
                        {/* API Key Input */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">API Key</Label>
                            <div className="relative">
                                <Input
                                    type={showKey ? "text" : "password"}
                                    placeholder={selectedProvider?.keyPrefix || "sk-..."}
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    className="h-8 pr-8 rounded-lg text-[11px] font-mono bg-muted/30 border-border/50"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-0 top-0 h-8 w-8 p-0"
                                    onClick={() => setShowKey(!showKey)}
                                >
                                    {showKey ? <EyeOff className="h-3 w-3 text-muted-foreground" /> : <Eye className="h-3 w-3 text-muted-foreground" />}
                                </Button>
                            </div>
                        </div>

                        {/* Model Selection — hidden for voice providers, which have no default chat model */}
                        {selectedProvider && getChatModelsForProvider(selectedProvider.id).length > 0 && (
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Default Model</Label>
                                <Select value={selectedModel} onValueChange={setSelectedModel}>
                                    <SelectTrigger className="h-8 rounded-lg text-[11px] bg-muted/30 border-border/50">
                                        <SelectValue placeholder="Select..." />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-lg">
                                        {getChatModelsForProvider(selectedProvider.id).map((model) => (
                                            <SelectItem key={model.id} value={model.id} className="text-[11px] py-1.5">
                                                <span>{model.name}</span>
                                                <span className="ml-1.5 text-muted-foreground">({model.type})</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Image Model Selection - only for providers with image models */}
                        {selectedProvider && getImageModelsForProvider(selectedProvider.id).length > 0 && (
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Default Image Model</Label>
                                <Select value={selectedImageModel} onValueChange={setSelectedImageModel}>
                                    <SelectTrigger className="h-8 rounded-lg text-[11px] bg-muted/30 border-border/50">
                                        <SelectValue placeholder="Select..." />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-lg">
                                        {getImageModelsForProvider(selectedProvider.id).map((model) => (
                                            <SelectItem key={model.id} value={model.id} className="text-[11px] py-1.5">
                                                <span>{model.name}</span>
                                                <span className="ml-1.5 text-muted-foreground">{model.description}</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Set as Default */}
                        <div className="flex items-center gap-2 pt-1">
                            <Switch
                                id="set-default"
                                checked={setAsDefault}
                                onCheckedChange={setSetAsDefault}
                                className="scale-75 data-[state=checked]:bg-foreground"
                            />
                            <Label htmlFor="set-default" className="text-[11px] cursor-pointer text-muted-foreground">
                                Set as project default
                            </Label>
                        </div>

                        {/* Enable/Disable toggle for existing keys */}
                        {existingKeyHint && (
                            <div className="flex items-center gap-2 pt-1">
                                <Switch
                                    id="provider-enabled"
                                    checked={isProviderActive}
                                    onCheckedChange={(checked) => {
                                        setIsProviderActive(checked);
                                        if (selectedProvider) {
                                            toggleMutation.mutate({ provider: selectedProvider.id, isActive: checked });
                                        }
                                    }}
                                    className="scale-75 data-[state=checked]:bg-emerald-500"
                                />
                                <Label htmlFor="provider-enabled" className="text-[11px] cursor-pointer text-muted-foreground">
                                    Provider enabled
                                </Label>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="px-4 py-3 border-t border-border/40 bg-muted/20">
                        <div className="w-full flex items-center justify-between">
                            {/* Delete button on the left */}
                            <div>
                                {existingKeyHint && selectedProvider && (
                                    <Button
                                        variant="ghost"
                                        onClick={() => {
                                            if (selectedProvider) {
                                                deleteKeyMutation.mutate(selectedProvider.id);
                                            }
                                        }}
                                        disabled={deleteKeyMutation.isPending}
                                        className="h-7 px-3 rounded-lg text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10"
                                    >
                                        {deleteKeyMutation.isPending ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <>
                                                <Trash2 className="h-3 w-3 mr-1" />
                                                Remove
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>
                            {/* Cancel and Save on the right */}
                            <div className="flex gap-2">
                                <Button variant="ghost" onClick={resetDialog} className="h-7 px-3 rounded-lg text-[11px]">
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleAddKey}
                                    disabled={(addKeyMutation.isPending || updateKeyMutation.isPending) || (!existingKeyHint && !apiKey)}
                                    className="h-7 px-3 rounded-lg text-[11px] bg-foreground text-background hover:bg-foreground/90"
                                >
                                    {addKeyMutation.isPending || updateKeyMutation.isPending ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        'Save'
                                    )}
                                </Button>
                            </div>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
