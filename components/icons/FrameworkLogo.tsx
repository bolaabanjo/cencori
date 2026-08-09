import Image from "next/image";
import { CrewAI, LangGraph, OpenAI } from "@lobehub/icons";
import { Braces } from "lucide-react";

import { cn } from "@/lib/utils";

interface FrameworkLogoProps {
    framework: string;
    className?: string;
}

function EveLogo() {
    return (
        <svg
            viewBox="0 0 328 120"
            className="h-[7px] w-[19px]"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M327.612 19.1774H227.991L158.436 120H136.395L219.054 0H327.612V19.1774ZM327.612 100.777V119.955H238.691V100.755L327.612 100.777ZM88.9205 119.955H0V100.755H88.9205V119.955ZM74.9436 69.1698H0V49.9925H74.9436V69.1698Z" />
            <path d="M327.612 69.1698H252.668V49.9925H327.612V69.1698ZM146.398 19.1774H0V0H146.398V19.1774Z" />
        </svg>
    );
}

export function FrameworkLogo({ framework, className }: FrameworkLogoProps) {
    const mark = (() => {
        switch (framework) {
            case "langgraph":
                return <LangGraph size={16} />;
            case "crewai":
                return <CrewAI size={16} />;
            case "openai-agents":
                return <OpenAI size={16} />;
            case "mastra":
                return (
                    <Image
                        src="/logos/mastra.svg"
                        alt=""
                        width={20}
                        height={13}
                        className="h-[13px] w-5 object-contain opacity-80 brightness-0 dark:brightness-100"
                    />
                );
            case "vercel-eve":
                return <EveLogo />;
            case "custom":
                return <Braces className="size-3.5" strokeWidth={1.7} />;
            case "arcie":
                return (
                    <Image
                        src="/logos/arcie.svg"
                        alt=""
                        width={16}
                        height={16}
                        className="size-4 object-contain opacity-80 brightness-0 dark:brightness-100"
                    />
                );
            default:
                return <Braces className="size-3.5" strokeWidth={1.7} />;
        }
    })();

    return (
        <span
            className={cn("inline-flex h-4 w-5 shrink-0 items-center justify-center text-foreground/80", className)}
            aria-hidden="true"
        >
            {mark}
        </span>
    );
}
