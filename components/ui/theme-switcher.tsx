"use client";

import * as React from "react";
import { Monitor, MoonStar, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function ThemeSwitcher({ className }: { className?: string }) {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    // `next-themes` cannot know the saved browser theme during SSR. Keep the
    // server and first client render identical, then show the active theme.
    const activeTheme = mounted ? theme : undefined;

    return (
        <div
            className={cn("flex w-fit rounded-full bg-white p-1 border border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800", className)}
        >
            <button
                onClick={() => setTheme("system")}
                className={cn(
                    "relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors",
                    activeTheme === "system"
                        ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
                )}
                title="System Theme"
                aria-label="System Theme"
            >
                <Monitor className="h-3.5 w-3.5" strokeWidth={2} />
            </button>

            <button
                onClick={() => setTheme("light")}
                className={cn(
                    "relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors",
                    activeTheme === "light"
                        ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
                )}
                title="Light Theme"
                aria-label="Light Theme"
            >
                <Sun className="h-3.5 w-3.5" strokeWidth={2} />
            </button>

            <button
                onClick={() => setTheme("dark")}
                className={cn(
                    "relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors",
                    activeTheme === "dark"
                        ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
                )}
                title="Dark Theme"
                aria-label="Dark Theme"
            >
                <MoonStar className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
        </div>
    );
}
