"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
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
import { Plus, Trash2, Search, Upload, Loader2, ArrowRightLeft } from "lucide-react";
import { toast } from "@/components/ui/toast";

interface ModelMapping {
    id: string;
    source_model: string;
    target_provider: string;
    target_model: string;
    created_at: string;
    updated_at: string;
}

const PROVIDERS = [
    "openai",
    "anthropic",
    "google",
    "mistral",
    "groq",
    "cohere",
    "together",
    "perplexity",
    "openrouter",
    "xai",
    "meta",
    "huggingface",
    "qwen",
    "deepseek",
];

function useMappings() {
    return useQuery({
        queryKey: ["model-mappings"],
        queryFn: async () => {
            const res = await fetch("/api/internal/model-mappings");
            if (!res.ok) throw new Error("Failed to load mappings");
            const data = await res.json();
            return data.mappings as ModelMapping[];
        },
    });
}

export default function ModelMappingsPage() {
    const queryClient = useQueryClient();
    const { data: mappings, isLoading } = useMappings();
    const [search, setSearch] = useState("");
    const [filterProvider, setFilterProvider] = useState<string>("all");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [newSourceModel, setNewSourceModel] = useState("");
    const [newTargetProvider, setNewTargetProvider] = useState("");
    const [newTargetModel, setNewTargetModel] = useState("");

    const createMutation = useMutation({
        mutationFn: async (body: { source_model: string; target_provider: string; target_model: string }) => {
            const res = await fetch("/api/internal/model-mappings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to create mapping");
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["model-mappings"] });
            toast.success("Mapping created");
            setDialogOpen(false);
            setNewSourceModel("");
            setNewTargetProvider("");
            setNewTargetModel("");
        },
        onError: (err: Error) => toast.error(err.message),
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch("/api/internal/model-mappings", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            if (!res.ok) throw new Error("Failed to delete mapping");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["model-mappings"] });
            toast.success("Mapping deleted");
        },
        onError: (err: Error) => toast.error(err.message),
    });

    const seedMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/internal/model-mappings/seed", { method: "POST" });
            if (!res.ok) throw new Error("Failed to seed mappings");
            return res.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["model-mappings"] });
            toast.success(`Seeded ${data.seeded} mappings from defaults`);
        },
        onError: (err: Error) => toast.error(err.message),
    });

    // Group mappings by source_model
    const grouped = useMemo(() => {
        if (!mappings) return {};
        const filtered = mappings.filter((m) => {
            const matchesSearch =
                !search ||
                m.source_model.toLowerCase().includes(search.toLowerCase()) ||
                m.target_model.toLowerCase().includes(search.toLowerCase()) ||
                m.target_provider.toLowerCase().includes(search.toLowerCase());
            const matchesProvider = filterProvider === "all" || m.target_provider === filterProvider;
            return matchesSearch && matchesProvider;
        });

        const groups: Record<string, ModelMapping[]> = {};
        for (const m of filtered) {
            if (!groups[m.source_model]) groups[m.source_model] = [];
            groups[m.source_model].push(m);
        }
        return groups;
    }, [mappings, search, filterProvider]);

    const sourceModels = Object.keys(grouped).sort();
    const totalMappings = mappings?.length || 0;
    const uniqueSources = new Set(mappings?.map((m) => m.source_model) || []).size;

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5 sm:space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-base font-medium">Model Mappings</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {totalMappings} mappings across {uniqueSources} models
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] px-2.5"
                        onClick={() => seedMutation.mutate()}
                        disabled={seedMutation.isPending}
                    >
                        {seedMutation.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                            <Upload className="h-3 w-3 mr-1" />
                        )}
                        Seed Defaults
                    </Button>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="h-7 text-[10px] px-2.5">
                                Add Mapping
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle className="text-sm">Add Model Mapping</DialogTitle>
                            </DialogHeader>
                            <form
                                className="space-y-4 mt-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    createMutation.mutate({
                                        source_model: newSourceModel.trim(),
                                        target_provider: newTargetProvider,
                                        target_model: newTargetModel.trim(),
                                    });
                                }}
                            >
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                                        Source Model
                                    </label>
                                    <Input
                                        placeholder="e.g. gpt-5.4"
                                        value={newSourceModel}
                                        onChange={(e) => setNewSourceModel(e.target.value)}
                                        className="h-8 text-xs"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                                        Target Provider
                                    </label>
                                    <Select value={newTargetProvider} onValueChange={setNewTargetProvider}>
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue placeholder="Select provider" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PROVIDERS.map((p) => (
                                                <SelectItem key={p} value={p} className="text-xs capitalize">
                                                    {p}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                                        Target Model
                                    </label>
                                    <Input
                                        placeholder="e.g. claude-opus-4"
                                        value={newTargetModel}
                                        onChange={(e) => setNewTargetModel(e.target.value)}
                                        className="h-8 text-xs"
                                    />
                                </div>
                                <Button
                                    type="submit"
                                    size="sm"
                                    className="w-full h-8 text-xs"
                                    disabled={
                                        !newSourceModel.trim() ||
                                        !newTargetProvider ||
                                        !newTargetModel.trim() ||
                                        createMutation.isPending
                                    }
                                >
                                    {createMutation.isPending ? (
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    ) : null}
                                    Create Mapping
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="Search models..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-8 text-xs pl-8"
                    />
                </div>
                <Select value={filterProvider} onValueChange={setFilterProvider}>
                    <SelectTrigger className="h-8 text-xs w-full sm:w-40">
                        <SelectValue placeholder="All providers" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all" className="text-xs">All providers</SelectItem>
                        {PROVIDERS.map((p) => (
                            <SelectItem key={p} value={p} className="text-xs capitalize">
                                {p}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-20 rounded-md border border-border/40 bg-card/30 animate-pulse" />
                    ))}
                </div>
            ) : totalMappings === 0 ? (
                <div className="rounded-md border border-border/40 bg-card/30 p-12 text-center">
                    <ArrowRightLeft className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm font-medium">No mappings yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Click &quot;Seed Defaults&quot; to import the built-in mappings, or add them manually.
                    </p>
                </div>
            ) : sourceModels.length === 0 ? (
                <div className="rounded-md border border-border/40 bg-card/30 p-8 text-center">
                    <p className="text-xs text-muted-foreground">No mappings match your search.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {sourceModels.map((sourceModel) => (
                        <div
                            key={sourceModel}
                            className="rounded-md border border-border/40 bg-card/30 overflow-hidden"
                        >
                            <div className="px-4 py-2.5 border-b border-border/20 bg-muted/20">
                                <span className="text-xs font-medium font-mono">{sourceModel}</span>
                            </div>
                            <div className="divide-y divide-border/20">
                                {grouped[sourceModel].map((mapping) => (
                                    <div
                                        key={mapping.id}
                                        className="flex items-center justify-between px-3 sm:px-4 py-2 group hover:bg-muted/10 transition-colors"
                                    >
                                        <div className="flex items-center gap-2 sm:gap-3 text-xs min-w-0">
                                            <span className="text-muted-foreground capitalize shrink-0">{mapping.target_provider}</span>
                                            <ArrowRightLeft className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                                            <span className="font-mono truncate">{mapping.target_model}</span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 shrink-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                                            onClick={() => deleteMutation.mutate(mapping.id)}
                                            disabled={deleteMutation.isPending}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
