"use client";

import { ReactNode, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ChevronLeft, Check, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { UserAvatar } from "@/components/ui/user-avatar";

export interface CourseStep {
    id: string;
    title: string;
    description: string;
    href: string;
    duration: string;
    section?: string;
}

interface CourseLayoutProps {
    children: ReactNode;
    hero?: ReactNode;
    courseId: string;
    courseTitle: string;
    steps: CourseStep[];
}

function getStorageKey(courseId: string) {
    return `cencori-academy-${courseId}`;
}

function getCompletedSteps(courseId: string): string[] {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem(getStorageKey(courseId));
    return stored ? JSON.parse(stored) : [];
}

function saveCompletedSteps(courseId: string, steps: string[]) {
    localStorage.setItem(getStorageKey(courseId), JSON.stringify(steps));
}

export function CourseLayout({ children, hero, courseId, courseTitle, steps }: CourseLayoutProps) {
    const pathname = usePathname();
    const [completedSteps, setCompletedSteps] = useState<string[]>([]);
    const [mounted, setMounted] = useState(false);
    const [user, setUser] = useState<{ email?: string; avatar_url?: string } | null>(null);
    const [tocHeadings, setTocHeadings] = useState<{ id: string; text: string; level: number }[]>([]);
    const [activeTocId, setActiveTocId] = useState<string>("");
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    const currentStepIndex = steps.findIndex(step => pathname.includes(step.href));
    const currentStep = steps[currentStepIndex];
    const prevStep = currentStepIndex > 0 ? steps[currentStepIndex - 1] : null;
    const nextStep = currentStepIndex < steps.length - 1 ? steps[currentStepIndex + 1] : null;

    // Group steps by section
    const sections: { name: string; steps: (CourseStep & { globalIndex: number })[] }[] = [];
    let currentSection = "";
    steps.forEach((step, i) => {
        const sectionName = step.section || "Lessons";
        if (sectionName !== currentSection) {
            sections.push({ name: sectionName, steps: [] });
            currentSection = sectionName;
        }
        sections[sections.length - 1].steps.push({ ...step, globalIndex: i });
    });

    useEffect(() => {
        setMounted(true);
        setCompletedSteps(getCompletedSteps(courseId));
    }, [courseId, pathname]);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }: { data: any }) => {
            if (data.user) {
                setUser({
                    email: data.user.email,
                    avatar_url: data.user.user_metadata?.avatar_url,
                });
            }
        });
    }, []);

    // Build TOC from headings
    useEffect(() => {
        if (!contentRef.current) return;
        const scanHeadings = () => {
            const headings = contentRef.current?.querySelectorAll("h2[id], h3[id]");
            if (!headings) return;
            const items: { id: string; text: string; level: number }[] = [];
            headings.forEach((h) => {
                items.push({
                    id: h.id,
                    text: h.textContent || "",
                    level: h.tagName === "H2" ? 2 : 3,
                });
            });
            setTocHeadings(items);
        };
        const observer = new MutationObserver(scanHeadings);
        observer.observe(contentRef.current, { childList: true, subtree: true });
        scanHeadings();
        return () => observer.disconnect();
    }, [pathname]);

    // Scroll spy
    useEffect(() => {
        if (tocHeadings.length === 0) return;
        const handleScroll = () => {
            let current = "";
            for (const heading of tocHeadings) {
                const el = document.getElementById(heading.id);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    if (rect.top <= 120) current = heading.id;
                }
            }
            setActiveTocId(current);
        };
        window.addEventListener("scroll", handleScroll, { passive: true });
        handleScroll();
        return () => window.removeEventListener("scroll", handleScroll);
    }, [tocHeadings]);

    useEffect(() => {
        setMobileMenuOpen(false);
    }, [pathname]);

    const markComplete = () => {
        if (currentStep && !completedSteps.includes(currentStep.id)) {
            const newCompleted = [...completedSteps, currentStep.id];
            setCompletedSteps(newCompleted);
            saveCompletedSteps(courseId, newCompleted);
        }
    };

    const isCompleted = (stepId: string) => completedSteps.includes(stepId);
    const isCurrent = (stepHref: string) => pathname.includes(stepHref);
    const isIntroPage = pathname === `/academy/${courseId}`;

    const SidebarContent = (
        <>
            {/* Header */}
            <div className="px-4 pt-5 pb-4">
                <Link
                    href="/academy"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    Academy
                </Link>
                <p className="text-sm font-medium mt-2">{courseTitle}</p>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto px-2 pb-4">
                <Link
                    href={`/academy/${courseId}`}
                    className={cn(
                        "block px-3 py-1.5 rounded-md text-[13px] transition-colors",
                        isIntroPage
                            ? "text-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    Introduction
                </Link>

                {sections.map((section) => (
                    <div key={section.name} className="mt-4">
                        <p className="px-3 mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                            {section.name}
                        </p>
                        {section.steps.map((step) => {
                            const active = isCurrent(step.href);
                            const completed = isCompleted(step.id);
                            return (
                                <Link
                                    key={step.id}
                                    href={step.href}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] transition-colors",
                                        active
                                            ? "text-foreground font-medium"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {completed && (
                                        <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                                    )}
                                    <span className="truncate">{step.title}</span>
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>

            {/* User */}
            {user && (
                <div className="px-4 py-3 border-t border-border/40">
                    <div className="flex items-center gap-2">
                        <UserAvatar
                            src={user.avatar_url}
                            email={user.email}
                            size={24}
                        />
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                </div>
            )}
        </>
    );

    return (
        <div className="min-h-screen flex">
            {/* Sidebar — Desktop */}
            <aside className="hidden lg:flex flex-col w-56 border-r border-border/40 fixed top-0 left-0 h-screen overflow-hidden bg-background z-50">
                {SidebarContent}
            </aside>

            {/* Mobile sidebar */}
            {mobileMenuOpen && (
                <div className="lg:hidden fixed inset-0 z-50">
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
                    <aside className="relative w-64 max-w-[80vw] h-full flex flex-col bg-background border-r border-border/40">
                        <button
                            onClick={() => setMobileMenuOpen(false)}
                            className="absolute top-4 right-4 p-1 rounded-md hover:bg-muted transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                        {SidebarContent}
                    </aside>
                </div>
            )}

            {/* Main */}
            <div className="flex-1 lg:ml-56">
                {/* Mobile header */}
                <div className="lg:hidden sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur-sm px-4 py-3 flex items-center gap-3">
                    <button
                        onClick={() => setMobileMenuOpen(true)}
                        className="p-1 -ml-1"
                    >
                        <Menu className="h-4 w-4" />
                    </button>
                    <p className="text-sm font-medium truncate flex-1">
                        {currentStep?.title || "Introduction"}
                    </p>
                </div>

                {/* Hero (full-width, above TOC) */}
                {hero && (
                    <div className="max-w-3xl mx-auto px-6 md:px-12 pt-10 md:pt-16">
                        {hero}
                    </div>
                )}

                {/* Content + TOC */}
                <div className="flex justify-center">
                    <div className="flex-1 min-w-0 max-w-3xl px-6 md:px-12 lg:pl-16 py-10 md:py-16" ref={contentRef}>
                        <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-24">
                            {children}
                        </div>

                        {/* Nav footer */}
                        {!isIntroPage && (
                            <div className="mt-16 pt-8 border-t border-border/40">
                                <div className="flex items-center justify-between gap-4">
                                    {prevStep ? (
                                        <Link href={prevStep.href}>
                                            <Button variant="ghost" size="sm" className="gap-2 text-xs">
                                                <ChevronLeft className="h-3.5 w-3.5" />
                                                {prevStep.title}
                                            </Button>
                                        </Link>
                                    ) : (
                                        <div />
                                    )}

                                    <div className="flex items-center gap-2">
                                        {currentStep && !isCompleted(currentStep.id) && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={markComplete}
                                                className="gap-2 text-xs"
                                            >
                                                <Check className="h-3.5 w-3.5" />
                                                Mark Complete
                                            </Button>
                                        )}
                                        {nextStep ? (
                                            <Link href={nextStep.href}>
                                                <Button size="sm" className="gap-2 text-xs" onClick={markComplete}>
                                                    {nextStep.title}
                                                    <ChevronRight className="h-3.5 w-3.5" />
                                                </Button>
                                            </Link>
                                        ) : (
                                            <Link href={`/academy/${courseId}/complete`}>
                                                <Button size="sm" className="gap-2 text-xs" onClick={markComplete}>
                                                    Complete Course
                                                    <ChevronRight className="h-3.5 w-3.5" />
                                                </Button>
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right TOC — starts below hero */}
                    {tocHeadings.length > 0 && (
                        <aside className="hidden xl:block w-48 shrink-0 py-16 pr-4 pl-4">
                            <div className="sticky top-16">
                                <p className="text-[11px] font-medium text-muted-foreground/60 mb-3">
                                    On this page
                                </p>
                                <nav className="space-y-1">
                                    {tocHeadings.map((heading) => (
                                        <a
                                            key={heading.id}
                                            href={`#${heading.id}`}
                                            className={cn(
                                                "block text-xs leading-relaxed transition-colors",
                                                heading.level === 3 && "pl-3",
                                                activeTocId === heading.id
                                                    ? "text-foreground"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {heading.text}
                                        </a>
                                    ))}
                                </nav>
                            </div>
                        </aside>
                    )}
                </div>
            </div>
        </div>
    );
}
