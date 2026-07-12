"use client";

import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { MessageSquareText, Book, ArrowUpRight } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
} from "@/components/ui/dropdown-menu";

export function FeedbackMenu() {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md p-2 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors outline-hidden"
                >
                    <MessageSquareText className="size-3.5 shrink-0" />
                    <span className="flex-1">Feedback</span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" sideOffset={4} className="w-80 p-3 font-mono border dark:border-[#1a1a1a] border-[#eee]">
                <div className="space-y-3">
                    <textarea
                        placeholder="My idea for improving Cencori is..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="w-full h-24 text-xs font-inter bg-secondary/50 border border-border/40 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring/20"
                    />
                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            className="h-7 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                            disabled={!text.trim()}
                            onClick={async () => {
                                try {
                                    const response = await fetch('/api/feedback', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            type: 'general',
                                            content: text
                                        })
                                    });
                                    if (response.ok) {
                                        toast.success("Thanks for your feedback!");
                                    }
                                } catch {
                                    // ignore
                                }
                                setText("");
                                setOpen(false);
                            }}
                        >
                            Send
                        </button>
                    </div>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
