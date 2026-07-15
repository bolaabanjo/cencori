"use client";

import Link from "next/link";
import { PanelLeftIcon, Trash2, Plus, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PlaygroundSession } from "@/lib/playground-history";

interface PlaygroundSidebarProps {
    open: boolean;
    onToggle: () => void;
    sessions: PlaygroundSession[];
    activeSessionId: string | null;
    onSelect: (session: PlaygroundSession) => void;
    onNew: () => void;
    onDelete: (id: string) => void;
    showSignupPrompt?: boolean;
}

function timeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
}

const PROVIDER_COLORS: Record<string, string> = {
    openai: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    anthropic: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    google: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    groq: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    meta: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
};

function getProviderColor(id: string): string {
    return PROVIDER_COLORS[id] || "bg-muted/50 text-muted-foreground border-border/30";
}

export function PlaygroundSidebar({
    open,
    onToggle,
    sessions,
    activeSessionId,
    onSelect,
    onNew,
    onDelete,
    showSignupPrompt = false,
}: PlaygroundSidebarProps) {
    return (
        <>
            <button
                type="button"
                onClick={onToggle}
                className={cn(
                    "absolute left-4 top-16 md:top-1/2 md:-translate-y-1/2 z-50 flex items-center justify-center h-9 w-9 rounded-full border shadow-md transition-all cursor-pointer",
                    open
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background text-muted-foreground/70 border-border/40 hover:text-foreground hover:border-border/60"
                )}
                title="Chat history"
            >
                <PanelLeftIcon className="h-4 w-4" />
            </button>
            {open && (
                <div className="absolute left-[calc(1rem+2.25rem+0.75rem)] top-16 md:top-1/2 md:-translate-y-1/2 z-50 w-72 max-h-[75vh] rounded-2xl border border-border/40 bg-popover/95 backdrop-blur-xl shadow-2xl p-4 flex flex-col gap-3 overflow-y-auto animate-in fade-in slide-in-from-left-2 duration-150">
                    {showSignupPrompt ? (
                        <div className="flex flex-col items-center gap-3 py-8 text-center">
                            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-muted/50">
                                <LogIn className="h-5 w-5 text-muted-foreground/50" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-foreground">Sign in to save chat history</p>
                                <p className="text-xs text-muted-foreground/70 mt-1 leading-relaxed">
                                    Your conversations are stored locally. Create an account to keep them across devices.
                                </p>
                            </div>
                            <Button asChild size="sm" className="h-8 text-xs mt-1">
                                <Link href="/signup">Sign up free</Link>
                            </Button>
                        </div>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={onNew}
                                className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-xs font-medium bg-primary/10 text-primary hover:bg-primary/15 transition-all cursor-pointer"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                New Chat
                            </button>
                            {sessions.length === 0 ? (
                                <div className="text-center py-8 text-xs text-muted-foreground/50">
                                    No chat history yet
                                </div>
                            ) : (
                                <div className="flex flex-col gap-1">
                                    {sessions.map((session) => {
                                        const isActive = session.id === activeSessionId;
                                        return (
                                            <button
                                                key={session.id}
                                                type="button"
                                                onClick={() => onSelect(session)}
                                                className={cn(
                                                    "group w-full flex items-start gap-2 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer",
                                                    isActive
                                                        ? "bg-primary/10 text-foreground"
                                                        : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                                )}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className={cn(
                                                            "text-xs font-medium truncate",
                                                            isActive && "text-primary"
                                                        )}>
                                                            {session.title || "Untitled"}
                                                        </span>
                                                        <span className="text-[9px] text-muted-foreground/50 shrink-0">
                                                            {timeAgo(session.updatedAt)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                                                        {session.selectedModels.slice(0, 2).map((modelId) => {
                                                            const [provider] = modelId.includes("/") ? modelId.split("/") : ["unknown"];
                                                            return (
                                                                <Badge
                                                                    key={modelId}
                                                                    className={cn(
                                                                        "h-4 px-1 text-[7px] font-bold uppercase",
                                                                        getProviderColor(provider)
                                                                    )}
                                                                >
                                                                    {modelId.includes("/") ? modelId.split("/").pop() : modelId}
                                                                </Badge>
                                                            );
                                                        })}
                                                        {session.selectedModels.length > 2 && (
                                                            <Badge className="h-4 px-1 text-[7px] text-muted-foreground bg-muted/30 border-border/20">
                                                                +{session.selectedModels.length - 2}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDelete(session.id);
                                                    }}
                                                    className="p-1 rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all cursor-pointer shrink-0"
                                                    title="Delete session"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </>
    );
}
