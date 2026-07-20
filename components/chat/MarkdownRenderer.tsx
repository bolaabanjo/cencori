/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { Copy } from "lucide-react";
import React from "react";
import { toast } from "@/components/ui/toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Simple syntax highlighter
function highlightCode(code: string, lang: string) {
    if (!code) return code?.toString() || "";

    // Basic tokens for JS/TS/Python/Go
    const keywords = /\b(const|let|var|function|return|if|else|for|while|import|export|from|async|await|class|processed|interface|type|public|private|protected|try|catch|finally|def|class|return|in|is|not|and|or|print)\b/g;
    const strings = /("[^"]*"|'[^']*'|`[^`]*`)/g;
    const numbers = /\b\d+\b/g;
    const comments = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)/g;
    const functions = /\b([a-zA-Z_]\w*)(?=\()/g;
    const brackets = /([{}[\],])/g;

    // Minimal tokenizer with light/dark mode support
    const tokenizers = [
        { type: "comment", regex: comments, color: "text-slate-500 dark:text-slate-400" },
        { type: "string", regex: strings, color: "text-green-600 dark:text-green-400" },
        { type: "keyword", regex: keywords, color: "text-purple-600 dark:text-purple-400" },
        { type: "function", regex: functions, color: "text-blue-600 dark:text-blue-400" },
        { type: "number", regex: numbers, color: "text-orange-600 dark:text-orange-400" },
        { type: "bracket", regex: brackets, color: "text-yellow-600 dark:text-yellow-500" },
    ];

    let segments: { text: string; color?: string }[] = [{ text: code }];

    for (const token of tokenizers) {
        const newSegments: { text: string; color?: string }[] = [];
        for (const segment of segments) {
            if (segment.color) {
                newSegments.push(segment);
                continue;
            }

            let lastIndex = 0;
            // Reset regex state
            token.regex.lastIndex = 0;

            const text = segment.text;
            const matches = Array.from(text.matchAll(token.regex));

            if (matches.length === 0) {
                newSegments.push(segment);
                continue;
            }

            for (const m of matches) {
                if (m.index! > lastIndex) {
                    newSegments.push({ text: text.slice(lastIndex, m.index!) });
                }
                newSegments.push({ text: m[0], color: token.color });
                lastIndex = m.index! + m[0].length;
            }
            if (lastIndex < text.length) {
                newSegments.push({ text: text.slice(lastIndex) });
            }
        }
        segments = newSegments;
    }

    return segments.map((s, i) => (
        <span key={i} className={s.color || "text-foreground"}>{s.text}</span>
    ));
}

export function MarkdownRenderer({ content, className }: { content: string; className?: string }) {
    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        toast.success("Code copied", { duration: 2000 });
    };

    return (
        <div className={cn("prose prose-xs prose-headings:text-foreground dark:prose-invert max-w-none break-words", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    code({ className, children, node: _node, ...props }) {
                        const match = /language-(\w+)/.exec(className || "");
                        const isInline = !match && !className?.includes("language-");

                        if (!isInline && match) {
                            const language = match[1];
                            const codeString = String(children).replace(/\n$/, "");

                            return (
                                <div className="my-3 rounded-lg overflow-hidden border border-border/50 bg-muted/30 not-prose">
                                    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border/50">
                                        <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{language}</span>
                                        <button onClick={() => copyCode(codeString)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                                            <Copy className="h-3 w-3" />
                                        </button>
                                    </div>
                                    <pre className="p-3 overflow-x-auto text-xs font-mono leading-relaxed bg-transparent m-0 border-0">
                                        <code>{highlightCode(codeString, language)}</code>
                                    </pre>
                                </div>
                            );
                        }

                        return (
                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-primary font-medium" {...props}>
                                {children}
                            </code>
                        );
                    },
                    table: ({ node: _node, ...props }) => (
                        <div className="my-4 w-full overflow-x-auto rounded-lg border border-border/50">
                            <table className="w-full border-collapse text-sm" {...props} />
                        </div>
                    ),
                    thead: ({ node: _node, ...props }) => (
                        <thead className="bg-muted/50 border-b border-border/50" {...props} />
                    ),
                    tbody: ({ node: _node, ...props }) => (
                        <tbody className="divide-y divide-border/50" {...props} />
                    ),
                    tr: ({ node: _node, ...props }) => (
                        <tr className="hover:bg-muted/30 transition-colors" {...props} />
                    ),
                    th: ({ node: _node, ...props }) => (
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap" {...props} />
                    ),
                    td: ({ node: _node, ...props }) => (
                        <td className="px-4 py-3 align-top" {...props} />
                    ),
                    strong: ({ node: _node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
                    em: ({ node: _node, ...props }) => <em className="text-foreground/90" {...props} />,
                    a: ({ node: _node, ...props }) => (
                        <a className="text-primary hover:underline font-medium cursor-pointer" target="_blank" rel="noopener noreferrer" {...props} />
                    ),
                    blockquote: ({ node: _node, ...props }) => (
                        <blockquote className="border-l-4 border-primary/30 pl-4 py-1 my-4 italic text-muted-foreground bg-muted/10 rounded-r" {...props} />
                    ),
                    hr: ({ node: _node, ...props }) => <hr className="my-6 border-border/50" {...props} />,
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
