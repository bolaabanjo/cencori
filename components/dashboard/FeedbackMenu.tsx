"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import ThumbsUpIcon from "@hugeicons/core-free-icons/ThumbsUpIcon";
import ThumbsDownIcon from "@hugeicons/core-free-icons/ThumbsDownIcon";
import ChatFeedbackIcon from "@hugeicons/core-free-icons/ChatFeedbackIcon";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
} from "@/components/ui/dropdown-menu";

export function FeedbackMenu() {
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<"positive" | "negative" | null>(null);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);

    const handleSubmit = async () => {
        setSending(true);
        try {
            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: selected || "general",
                    content: text,
                })
            });
            if (response.ok) {
                toast.success("Thanks for your feedback!");
            }
        } catch {
            // ignore
        }
        setSending(false);
        setText("");
        setSelected(null);
        setOpen(false);
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md p-2 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors outline-hidden"
                >
                    <HugeiconsIcon icon={ChatFeedbackIcon} className="size-3.5 shrink-0" />
                    <span className="flex-1">Feedback</span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" sideOffset={4} className="w-80 p-3 font-mono">
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Rate your experience</span>
                        <div className="flex items-center gap-1.5 ml-auto">
                            <button
                                onClick={() => setSelected(selected === "negative" ? null : "negative")}
                                className={`flex size-8 items-center justify-center rounded-full transition-colors cursor-pointer ${
                                    selected === "negative" ? "bg-foreground/20" : "bg-foreground/10 hover:bg-foreground/20"
                                }`}
                            >
                                <HugeiconsIcon icon={ThumbsDownIcon} className="!h-4 !w-4 text-foreground" />
                            </button>
                            <button
                                onClick={() => setSelected(selected === "positive" ? null : "positive")}
                                className={`flex size-8 items-center justify-center rounded-full transition-colors cursor-pointer ${
                                    selected === "positive" ? "bg-foreground/20" : "bg-foreground/10 hover:bg-foreground/20"
                                }`}
                            >
                                <HugeiconsIcon icon={ThumbsUpIcon} className="!h-4 !w-4 text-foreground" />
                            </button>
                        </div>
                    </div>
                    <textarea
                        placeholder="My idea for improving Cencori is..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="w-full h-20 text-xs font-inter bg-secondary/50 border border-border/40 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring/20"
                    />
                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            className="h-7 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
                            disabled={!text.trim() || sending}
                            onClick={handleSubmit}
                        >
                            {sending && <Loader2 className="size-3 animate-spin" />}
                            {sending ? "Sending" : "Send"}
                        </button>
                    </div>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
