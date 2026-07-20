"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowUp, Square, Trash2 } from "lucide-react";

import { Logo } from "@/components/logo";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import {
    Sheet,
    SheetContent,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type AgentMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
};

type AgentProject = {
    id: string;
    name: string;
    slug: string;
} | null;

type AgentOrganization = {
    id: string;
    name: string;
    slug: string;
} | null;

interface CencoriAgentSidebarProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    project: AgentProject;
    organization: AgentOrganization;
    environment: "production" | "test";
    userName?: string | null;
}

const DEFAULT_PROMPTS = [
    "What changed in this project?",
    "Which model is most efficient?",
    "Where are the reliability risks?",
    "What should I optimize next?",
];

const AGENT_MARKDOWN_STYLES = cn(
    "text-[13px] leading-5 text-foreground/85",
    "[&_p]:my-2 [&_p]:text-[13px] [&_p]:leading-5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
    "[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:leading-5",
    "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:leading-5",
    "[&_h3]:mb-1.5 [&_h3]:mt-3.5 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:leading-5",
    "[&_ul]:my-2.5 [&_ul]:space-y-1 [&_ul]:pl-4 [&_ol]:my-2.5 [&_ol]:space-y-1 [&_ol]:pl-4",
    "[&_li]:my-0 [&_li]:pl-0.5 [&_li]:text-[13px] [&_li]:leading-5 [&_li>p]:my-0 [&_li::marker]:text-muted-foreground/70",
    "[&_strong]:font-semibold [&_blockquote]:my-3 [&_hr]:my-4 [&_.not-prose]:my-2",
    "[&_table]:text-xs [&_th]:px-2.5 [&_th]:py-2 [&_td]:px-2.5 [&_td]:py-2",
);

function getSurfaceLabel(pathname: string, section: string | null) {
    if (pathname.includes("/observability")) {
        const label = section && section !== "overview" ? section : "overview";
        return `Observability / ${label.charAt(0).toUpperCase()}${label.slice(1)}`;
    }
    if (pathname.includes("/ai-gateway/playground")) return "AI Gateway / Playground";
    if (pathname.includes("/ai-gateway")) return "AI Gateway";
    if (pathname.includes("/logs")) return "Logs";
    if (pathname.includes("/security")) return "Security";
    if (pathname.includes("/billing")) return "Billing";
    if (pathname.includes("/settings")) return "Settings";
    return "Overview";
}

function ThinkingState() {
    return (
        <div className="py-3 text-xs" role="status" aria-live="polite">
            <span className="agent-thinking-shimmer">Thinking</span>
        </div>
    );
}

export function CencoriAgentSidebar({
    open,
    onOpenChange,
    project,
    organization,
    environment,
    userName,
}: CencoriAgentSidebarProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const surface = getSurfaceLabel(pathname, searchParams.get("section"));
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [input, setInput] = useState("");
    const [streamingContent, setStreamingContent] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const contextName = project?.name ?? organization?.name ?? "Cencori";
    const firstName = userName?.trim().split(/\s+/)[0];
    const displayFirstName = firstName
        ? `${firstName.charAt(0).toUpperCase()}${firstName.slice(1)}`
        : null;

    const suggestions = useMemo(() => {
        if (pathname.includes("/observability")) {
            return [
                "Explain the most important signal here",
                "Which model needs attention first?",
                "Where can I reduce spend safely?",
                "Summarize reliability risks",
            ];
        }
        if (pathname.includes("/ai-gateway")) {
            return [
                "Which models are active?",
                "How is gateway traffic performing?",
                "Where can I reduce latency?",
                "Show me recent delivery risks",
            ];
        }
        return DEFAULT_PROMPTS;
    }, [pathname]);

    useEffect(() => {
        if (!open) return;
        const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 350);
        return () => window.clearTimeout(focusTimer);
    }, [open]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, streamingContent, isLoading]);

    useEffect(() => {
        setMessages([]);
        setStreamingContent("");
        abortControllerRef.current?.abort();
        setIsLoading(false);
    }, [project?.id]);

    const sendMessage = useCallback(async (rawContent: string) => {
        const content = rawContent.trim();
        if (!content || isLoading) return;

        const userMessage: AgentMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content,
        };
        const nextMessages = [...messages, userMessage];

        setMessages(nextMessages);
        setInput("");
        setIsLoading(true);
        setStreamingContent("");

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const response = await fetch("/api/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: nextMessages.map(({ role, content: messageContent }) => ({
                        role,
                        content: messageContent,
                    })),
                    projectId: project?.id ?? null,
                    organizationId: organization?.id ?? null,
                    environment,
                    currentPath: `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`,
                    currentSurface: surface,
                    userName: firstName ?? null,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                throw new Error(payload?.error || "The agent could not answer right now.");
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("The agent returned an empty response.");

            const decoder = new TextDecoder();
            let buffer = "";
            let fullContent = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const chunks = buffer.split("\n\n");
                buffer = chunks.pop() ?? "";

                for (const chunk of chunks) {
                    const line = chunk.split("\n").find((item) => item.startsWith("data: "));
                    if (!line) continue;
                    const data = line.slice(6);
                    if (data === "[DONE]") continue;
                    const payload = JSON.parse(data) as { content?: string; error?: string };
                    if (payload.error) throw new Error(payload.error);
                    if (payload.content) {
                        fullContent += payload.content;
                        setStreamingContent(fullContent);
                    }
                }
            }

            if (!fullContent.trim()) throw new Error("The agent returned an empty response.");
            setMessages((current) => [
                ...current,
                { id: crypto.randomUUID(), role: "assistant", content: fullContent },
            ]);
            setStreamingContent("");
        } catch (error) {
            if ((error as Error).name !== "AbortError") {
                setMessages((current) => [
                    ...current,
                    {
                        id: crypto.randomUUID(),
                        role: "assistant",
                        content: `I couldn't complete that analysis. ${(error as Error).message}`,
                    },
                ]);
            }
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    }, [environment, firstName, isLoading, messages, organization?.id, pathname, project?.id, searchParams, surface]);

    const stopGeneration = () => {
        abortControllerRef.current?.abort();
        if (streamingContent.trim()) {
            setMessages((current) => [
                ...current,
                { id: crypto.randomUUID(), role: "assistant", content: streamingContent },
            ]);
        }
        setStreamingContent("");
        setIsLoading(false);
    };

    const clearConversation = () => {
        abortControllerRef.current?.abort();
        setMessages([]);
        setStreamingContent("");
        setInput("");
        setIsLoading(false);
        window.requestAnimationFrame(() => inputRef.current?.focus());
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void sendMessage(input);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
            <SheetContent
                side="right"
                showOverlay={false}
                className="!top-[60px] !right-3 !bottom-3 !h-auto !w-[calc(100%-1.5rem)] !max-w-[460px] gap-0 overflow-hidden rounded-[28px] !border border-border/65 bg-background p-0 !shadow-none dark:bg-black [&>button]:top-4 [&>button]:right-5 [&>button]:rounded-md [&>button]:border [&>button]:border-border/50 [&>button]:p-1.5 [&>button]:opacity-70 [&>button]:hover:border-border/80 [&>button]:hover:bg-muted"
            >
                <button
                    type="button"
                    onClick={clearConversation}
                    aria-label="Start a new analysis"
                    title="New analysis"
                    className="absolute !right-14 z-10 text-muted-foreground transition-colors hover:text-foreground"
                >
                    <Trash2 className="h-4 w-4" />
                </button>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-14">
                    {messages.length === 0 && !streamingContent ? (
                        <div className="flex min-h-full flex-col">
                            <div className="max-w-[350px] pt-3">
                                <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Cencori copilot</p>
                                <h2 className="mt-4 text-[26px] font-medium leading-[1.12] tracking-[-0.035em] text-foreground">
                                    {displayFirstName ? `What should we inspect, ${displayFirstName}?` : "What should we inspect?"}
                                </h2>
                                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                                    Ask about traffic, models, spend, latency, security, or anything visible in this workspace.
                                </p>
                            </div>

                            <div className="mt-10 border-t border-border/35">
                                {suggestions.map((suggestion, index) => (
                                    <button
                                        key={suggestion}
                                        type="button"
                                        onClick={() => void sendMessage(suggestion)}
                                        className="group flex w-full cursor-pointer items-center gap-4 border-b border-border/35 py-3.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                                    >
                                        <span className="font-mono text-[10px] text-muted-foreground/60">0{index + 1}</span>
                                        <span className="flex-1 text-xs text-foreground/85 transition-colors group-hover:text-foreground">{suggestion}</span>
                                        <ArrowUp className="h-3.5 w-3.5 rotate-45 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {messages.map((message) => (
                                <article key={message.id} className={cn(message.role === "user" && "flex justify-end")}>
                                    {message.role === "user" ? (
                                        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-sm leading-5 text-background">
                                            {message.content}
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-[20px_1fr] gap-2.5">
                                            <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border border-border/50 bg-muted/20">
                                                <Logo variant="mark" className="h-2" />
                                            </span>
                                            <div className="min-w-0">
                                                <MarkdownRenderer content={message.content} className={AGENT_MARKDOWN_STYLES} />
                                            </div>
                                        </div>
                                    )}
                                </article>
                            ))}

                            {streamingContent && (
                                <article className="grid grid-cols-[20px_1fr] gap-2.5">
                                    <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border border-border/50 bg-muted/20">
                                        <Logo variant="mark" className="h-2" />
                                    </span>
                                    <div className="min-w-0">
                                        <MarkdownRenderer content={streamingContent} className={AGENT_MARKDOWN_STYLES} />
                                    </div>
                                </article>
                            )}
                            {isLoading && !streamingContent && <ThinkingState />}
                            <div ref={endRef} />
                        </div>
                    )}
                </div>

                <div className="bg-background px-4 pb-4 pt-3 dark:bg-black">
                    <div className="rounded-xl border border-border/55 bg-muted/[0.16] p-2 transition-colors focus-within:border-foreground/30">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={`Ask about ${contextName}...`}
                            rows={3}
                            className="max-h-36 min-h-[64px] w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground/60"
                        />
                        <div className="flex items-center justify-end px-1 pb-0.5">
                            <button
                                type="button"
                                aria-label={isLoading ? "Stop response" : "Send message"}
                                onClick={isLoading ? stopGeneration : () => void sendMessage(input)}
                                disabled={!isLoading && !input.trim()}
                                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-background transition-[opacity,transform] hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-25"
                            >
                                {isLoading ? <Square className="h-3 w-3 fill-current" /> : <ArrowUp className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                    <p className="mt-2 text-center text-[9px] text-muted-foreground/70">
                        Answers are grounded in Cencori telemetry and may need verification.
                    </p>
                </div>
            </SheetContent>
        </Sheet>
    );
}
