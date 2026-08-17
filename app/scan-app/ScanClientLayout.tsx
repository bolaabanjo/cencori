"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
    ExternalLink,
    LogOut,
    CircleUserRound,
    HelpCircle,
    Book,
    Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useTheme } from "next-themes";
import { ScanPaywallDialog } from "@/components/scan/ScanPaywallDialog";
import {
    SCAN_PAYWALL_EVENT,
    type ScanPaywallPayload,
} from "@/lib/scan/paywall-client";

interface ScanLayoutProps {
    children: ReactNode;
}

interface User {
    email?: string | null;
    user_metadata?: Record<string, unknown>;
}

export default function ScanLayout({ children }: ScanLayoutProps) {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const [user, setUser] = useState<User | null>(null);
    const [paywallDialogOpen, setPaywallDialogOpen] = useState(false);
    const [paywallPayload, setPaywallPayload] = useState<ScanPaywallPayload | null>(null);
    const [mounted, setMounted] = useState(false);

    // Check auth
    useEffect(() => {
        const checkAuth = async () => {
            const { data, error } = await supabase.auth.getUser();
            if (!error && data.user) {
                setUser(data.user as User);
            } else {
                setUser(null);
            }
        };
        checkAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event: AuthChangeEvent, session: Session | null) => {
                if (session?.user) {
                    setUser(session.user as User);
                } else {
                    setUser(null);
                }
            }
        );

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const handlePaywall = (event: Event) => {
            const customEvent = event as CustomEvent<ScanPaywallPayload>;
            setPaywallPayload(customEvent.detail || null);
            setPaywallDialogOpen(true);
        };

        window.addEventListener(SCAN_PAYWALL_EVENT, handlePaywall as EventListener);
        return () => {
            window.removeEventListener(SCAN_PAYWALL_EVENT, handlePaywall as EventListener);
        };
    }, []);

    // Extract current project from URL (handles both /scan/projects/... and /projects/...)
    const projectId = pathname.match(/(?:\/scan)?\/projects\/([^/]+)/)?.[1];

    // Build breadcrumb items
    const getBreadcrumbItems = () => {
        const items: { label: string; href?: string }[] = [];

        const isRoot = pathname === '/scan' || pathname === '/scan/' || pathname === '/';
        const isImport = pathname === '/scan/import' || pathname === '/import';

        if (isRoot) {
            // No breadcrumbs on main page - "Scan" is the wordmark
        } else if (isImport) {
            items.push({ label: 'Import' });
        } else if (projectId) {
            items.push({ label: 'Project' });
        }

        return items;
    };

    const breadcrumbItems = getBreadcrumbItems();

    // User avatar
    const meta = user?.user_metadata ?? {};
    const avatar = (meta.avatar_url as string | null) ?? (meta.picture as string | null) ?? null;
    const name = (meta.name as string | null) ?? user?.email?.split?.("@")[0] ?? null;

    // Window-dependent logic must only run after mounting to avoid hydration mismatch
    const isScanSubdomainHost =
        mounted && /^(scan|scaan)(\.|$)/i.test(window.location.hostname);
    
    const scanEntryUrl =
        mounted
            ? `${window.location.pathname}${window.location.search}${window.location.hash}`
            : "/scan";

    const signInHref = isScanSubdomainHost
        ? `/login?redirect=${encodeURIComponent(scanEntryUrl)}`
        : "/login?redirect=/scan";

    const dashboardHref = isScanSubdomainHost
        ? "https://cencori.com/dashboard"
        : "/dashboard";

    const docsHref = isScanSubdomainHost
        ? "https://cencori.com/docs/security/scan/web-dashboard"
        : "/docs/security/scan/web-dashboard";

    const logoutHref = "/login";

    return (
        <div className="flex h-screen w-full flex-col">
            {/* Navbar */}
            <header className="fixed top-0 left-0 right-0 z-50 h-12 border-b border-border/40 bg-background px-4 md:px-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {/* Logo + Wordmark */}
                    <Link href="/" className="flex items-center gap-2">
                        <Image
                            src="/logo white.svg"
                            alt="Cencori"
                            width={16}
                            height={16}
                            className="dark:block hidden"
                        />
                        <Image
                            src="/logo black.svg"
                            alt="Cencori"
                            width={16}
                            height={16}
                            className="dark:hidden block"
                        />
                        <span className="text-xs font-medium text-foreground">Scan</span>
                    </Link>

                    {/* Breadcrumbs (only show if there are items) */}
                    {breadcrumbItems.length > 0 && (
                        <>
                            <span className="text-muted-foreground/50 select-none text-sm" aria-hidden>/</span>
                            <Breadcrumb>
                                <BreadcrumbList>
                                    {breadcrumbItems.map((item, index) => (
                                        <span key={index} className="contents">
                                            {index > 0 && (
                                                <BreadcrumbSeparator className="text-muted-foreground/50 text-xs">/</BreadcrumbSeparator>
                                            )}
                                            <BreadcrumbItem>
                                                {item.href ? (
                                                    <BreadcrumbLink asChild className="text-xs font-medium hover:text-foreground/80">
                                                        <Link href={item.href}>{item.label}</Link>
                                                    </BreadcrumbLink>
                                                ) : (
                                                    <BreadcrumbPage className="text-xs font-medium">
                                                        {item.label}
                                                    </BreadcrumbPage>
                                                )}
                                            </BreadcrumbItem>
                                        </span>
                                    ))}
                                </BreadcrumbList>
                            </Breadcrumb>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Help Button */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="w-7 h-7 inline-flex items-center justify-center rounded-full border border-border/40 bg-transparent hover:bg-secondary transition-colors cursor-pointer"
                                aria-label="Help"
                            >
                                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 p-2">
                            <div className="px-2 py-1.5">
                                <p className="text-xs font-medium">Need help?</p>
                                <p className="text-[11px] text-muted-foreground">Check our docs or contact support.</p>
                            </div>
                            <DropdownMenuSeparator className="my-1" />
                            <DropdownMenuItem asChild className="text-xs py-1.5 cursor-pointer">
                                <a href={docsHref} className="flex items-center gap-2">
                                    <Book className="h-3.5 w-3.5" />
                                    Scan Documentation
                                </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="text-xs py-1.5 cursor-pointer">
                                <a href="mailto:support@cencori.com" className="flex items-center gap-2">
                                    <Mail className="h-3.5 w-3.5" />
                                    Contact support
                                </a>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* User Avatar Menu */}
                    {user ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className="w-7 h-7 cursor-pointer inline-flex items-center justify-center rounded-full border border-border/40 bg-transparent hover:bg-secondary transition-colors overflow-hidden"
                                    aria-label="User menu"
                                >
                                    <UserAvatar
                                        src={avatar}
                                        name={name}
                                        email={user.email}
                                        size={28}
                                        className="border-0"
                                    />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56 p-1" align="end" forceMount>
                                <div className="px-2 py-1.5 border-b border-border/40 mb-1">
                                    <p className="text-xs font-medium truncate">{user.email}</p>
                                </div>
                                <p className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">Theme</p>
                                <DropdownMenuItem className="text-xs py-1.5 cursor-pointer" onClick={() => setTheme("light")}>
                                    {theme === "light" && <span className="mr-2 h-1.5 w-1.5 rounded-full bg-foreground" />}
                                    {theme !== "light" && <span className="mr-2 h-1.5 w-1.5" />}
                                    Light
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-xs py-1.5 cursor-pointer" onClick={() => setTheme("dark")}>
                                    {theme === "dark" && <span className="mr-2 h-1.5 w-1.5 rounded-full bg-foreground" />}
                                    {theme !== "dark" && <span className="mr-2 h-1.5 w-1.5" />}
                                    Dark
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-xs py-1.5 cursor-pointer" onClick={() => setTheme("system")}>
                                    {theme === "system" && <span className="mr-2 h-1.5 w-1.5 rounded-full bg-foreground" />}
                                    {theme !== "system" && <span className="mr-2 h-1.5 w-1.5" />}
                                    System
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="my-1" />
                                <DropdownMenuItem
                                    className="text-xs py-1.5 cursor-pointer"
                                    onClick={() => {
                                        window.location.href = dashboardHref;
                                    }}
                                >
                                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                                    Main Dashboard
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="text-xs py-1.5 cursor-pointer text-red-500 focus:text-red-500"
                                    onClick={async () => {
                                        await supabase.auth.signOut({ scope: "local" });
                                        window.location.href = logoutHref;
                                    }}
                                >
                                    <LogOut className="mr-2 h-3.5 w-3.5" />
                                    Log out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <Button asChild size="sm" variant="outline" className="h-7 text-xs px-3">
                            <a href={signInHref}>Sign In</a>
                        </Button>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto bg-background pt-12">
                {children}
            </main>

            <ScanPaywallDialog
                open={paywallDialogOpen}
                onOpenChange={setPaywallDialogOpen}
                payload={paywallPayload}
            />
        </div>
    );
}
