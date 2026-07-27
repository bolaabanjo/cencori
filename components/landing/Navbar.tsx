"use client";

import {
    AiBookIcon,
    AiBrain01Icon,
    AiBrain02Icon,
    AiMail01Icon,
    ApiIcon,
    BookOpen01Icon,
    Briefcase01Icon,
    Building06Icon,
    BulbIcon,
    ChartIcon,
    CodeCircleIcon,
    CodeSquareIcon,
    Compass01Icon,
    DeveloperIcon,
    DocumentValidationIcon,
    House01Icon,
    MoleculesIcon,
    NanoTechnologyIcon,
    Pulse01Icon,
    RocketIcon,
    StethoscopeIcon,
    VoiceIdIcon,
    WorkflowCircle01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChevronRight, Menu, Settings, LogOut } from "lucide-react";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { ReactNode } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { CircleUserRound } from "lucide-react";
import { useTheme } from "next-themes";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
    Navbar as NavbarComponent,
    NavbarLeft,
    NavbarRight,
} from "@/components/ui/navbar";
import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
    navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as React from "react";

type NavItem = NavDropdown | NavLink;

interface NavLink {
    title: string;
    href: string;
    description?: string;
    icon?: ReactNode;
}

interface NavDropdown {
    title: string;
    type: "mega" | "dropdown";
    columns?: NavLink[][];
    items?: NavLink[];
    listClassName?: string;
    footerCtaPrimary?: NavLink;
    footerCtaSecondary?: NavLink;
}

interface MobileNavLink {
    title: string;
    href?: string;
    icon?: ReactNode;
    sublinks?: MobileNavLink[];
}

interface NavbarActionProps {
    text: string;
    href: string;
    variant?: string;
    isButton?: boolean;
    isAvatar?: boolean;
    avatarSrc?: string | null;
    avatarFallback?: string;
}

interface NavbarProps {
    logo?: ReactNode;
    name?: string;
    homeUrl?: string;
    mobileNavItems?: MobileNavLink[];
    actions?: NavbarActionProps[];
    className?: string;
    isAuthenticated?: boolean;
    userProfile?: { name: string | null; avatar: string | null; email?: string | null };
    searchSlot?: ReactNode;
    containerClassName?: string;
}

function isNavDropdown(item: NavItem): item is NavDropdown {
    return "type" in item;
}

const menuIconProps = {
    size: 16,
    color: "currentColor",
    strokeWidth: 1.7,
} as const;

function renderMenuIcon(icon: React.ComponentProps<typeof HugeiconsIcon>["icon"]) {
    return <HugeiconsIcon icon={icon} {...menuIconProps} />;
}

const solutionsMenuColumns: NavLink[][] = [
    [
        { title: "Vibe Coders", href: "/solutions/vibe-coders", description: "Secure apps generated with AI.", icon: renderMenuIcon(CodeSquareIcon) },
        { title: "AI Builders", href: "/solutions/ai-builders", description: "Core infrastructure for AI teams.", icon: renderMenuIcon(AiBrain01Icon) },
        { title: "No-Code", href: "/solutions/no-code", description: "Safer workflows for no-code teams.", icon: renderMenuIcon(WorkflowCircle01Icon) },
        { title: "Startups", href: "/solutions/startups", description: "Move fast without security debt.", icon: renderMenuIcon(RocketIcon) },
    ],
    [
        { title: "Agencies", href: "/solutions/agencies", description: "Deliver client AI with guardrails.", icon: renderMenuIcon(Briefcase01Icon) },
        { title: "Agencies", href: "/solutions/agencies", description: "Deliver client AI with guardrails.", icon: renderMenuIcon(Briefcase01Icon) },
        { title: "Fintech", href: "/solutions/fintech", description: "Controls for regulated finance apps.", icon: renderMenuIcon(ChartIcon) },
        { title: "Healthcare", href: "/solutions/healthcare", description: "Protect PHI in clinical workflows.", icon: renderMenuIcon(StethoscopeIcon) },
        { title: "Hackathons", href: "/solutions/hackathons", description: "Safe defaults for fast launches.", icon: renderMenuIcon(BulbIcon) },
    ],
    [
        { title: "For Enterprises", href: "/enterprise", description: "Security, compliance, and scale for your organization.", icon: renderMenuIcon(Building06Icon) },
        { title: "For Developers", href: "/developers", description: "Ship AI features faster with the tools you already know.", icon: renderMenuIcon(DeveloperIcon) },
    ],
];

const mobileSolutionsLinks: MobileNavLink[] = solutionsMenuColumns
    .flat()
    .map(({ title, href, icon }) => ({ title, href, icon }));

const productMenuColumns: NavLink[][] = [
    [
        { title: "AI Gateway", href: siteConfig.links.products.aiGateway, description: "One API, 100+ models.", icon: renderMenuIcon(MoleculesIcon) },
        { title: "Models", href: siteConfig.links.products.models, description: "Hosted and mapped model catalog.", icon: renderMenuIcon(AiBrain01Icon) },
        { title: "Memory", href: "/memory", description: "Stateful chat in one line.", icon: renderMenuIcon(AiBrain02Icon) },
        { title: "Audit Logs", href: siteConfig.links.products.audit, description: "Immutable logs and compliance trails.", icon: renderMenuIcon(BookOpen01Icon) },
    ],
    [
        { title: "Observability", href: siteConfig.links.products.insights, description: "Analytics and risk dashboards.", icon: renderMenuIcon(ChartIcon) },
        { title: "Scan", href: siteConfig.links.products.scan, description: "AI security and vuln detection.", icon: renderMenuIcon(VoiceIdIcon) },
        { title: "Developer Tools", href: siteConfig.links.products.developerTools, description: "SDKs, CLI, and quickstarts.", icon: renderMenuIcon(CodeSquareIcon) },
    ],
];

const mobileProductLinks: MobileNavLink[] = productMenuColumns
    .flat()
    .map(({ title, href, icon }) => ({ title, href, icon }));

const ListItem = React.forwardRef<
    React.ElementRef<"a">,
    React.ComponentPropsWithoutRef<"a"> & { title: string; icon?: ReactNode }
>(({ className, title, icon, children, ...props }, ref) => {
    const hasIcon = Boolean(icon);

    return (
        <li>
            <NavigationMenuLink asChild>
                <a
                    ref={ref}
                    className={cn(
                        hasIcon
                            ? "group grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-2.5 rounded-md p-2.5 no-underline outline-none transition-colors duration-200 hover:bg-transparent focus:bg-transparent data-[active]:bg-transparent data-[active]:hover:bg-transparent data-[active]:focus:bg-transparent"
                            : "block select-none space-y-0.5 rounded-md p-2 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                        className
                    )}
                    {...props}
                >
                    {hasIcon ? (
                        <>
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/70 text-muted-foreground shadow-sm transition-[background-color,border-color,color,filter] duration-200 group-hover:border-border group-hover:bg-white/[0.03] group-hover:text-foreground group-hover:brightness-110">
                                {icon}
                            </span>
                            <span className="min-w-0">
                                <span className="flex items-center gap-0.5 text-xs font-medium leading-none text-foreground">
                                    <span>{title}</span>
                                    <ChevronRight className="size-3 -translate-x-0.5 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
                                </span>
                                <span className="mt-1 block truncate text-[10px] leading-none text-muted-foreground transition-colors duration-200 group-hover:text-muted-foreground/90">
                                    {children}
                                </span>
                            </span>
                        </>
                    ) : (
                        <>
                            <div className="text-xs font-medium leading-none">{title}</div>
                            <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground mt-0.5">
                                {children}
                            </p>
                        </>
                    )}
                </a>
            </NavigationMenuLink>
        </li>
    );
});
ListItem.displayName = "ListItem";

// ... imports
import { motion, MotionProps } from "framer-motion";

// ... [Keep existing interfaces]

interface NavbarProps extends React.HTMLAttributes<HTMLElement> {
    logo?: ReactNode;
    name?: string;
    homeUrl?: string;
    mobileNavItems?: MobileNavLink[];
    actions?: NavbarActionProps[];
    className?: string;
    isAuthenticated?: boolean;
    userProfile?: { name: string | null; avatar: string | null; email?: string | null };
    searchSlot?: ReactNode;
    containerClassName?: string;
    // Allow motion props
    layout?: boolean | "position" | "size";
    transition?: MotionProps["transition"];
}

// ... [Keep helper functions and components]

import { useAuth } from "@/lib/hooks/useAuth";

export default function Navbar({
    logo = <Logo variant="wordmark" className="h-4" />,
    name = "",
    homeUrl = siteConfig.url,
    mobileNavItems = [
        {
            title: "Products", sublinks: mobileProductLinks
        },
        {
            title: "Solutions", sublinks: mobileSolutionsLinks
        },
        {
            title: "Resources", sublinks: [
                { title: "Documentation", href: siteConfig.links.docs, icon: renderMenuIcon(BookOpen01Icon) },
                { title: "API Reference", href: "/docs/api/metrics", icon: renderMenuIcon(ApiIcon) },
                { title: "Academy", href: "/academy", icon: renderMenuIcon(AiBookIcon) },
                { title: "Newsletter", href: siteConfig.links.company.newsletter, icon: renderMenuIcon(AiMail01Icon) },
                { title: "SDKs & Quickstarts", href: siteConfig.links.products.developerTools, icon: renderMenuIcon(CodeCircleIcon) },
                { title: "Guides & Tutorials", href: "/resources/guides", icon: renderMenuIcon(Compass01Icon) },
                { title: "Changelog", href: siteConfig.links.company.changelog, icon: renderMenuIcon(ChartIcon) },
                { title: "Use Cases / Case Studies", href: siteConfig.links.company.customers, icon: renderMenuIcon(Briefcase01Icon) },
                { title: "Security & Compliance", href: "/security", icon: renderMenuIcon(DocumentValidationIcon) },
                { title: "Status & Incidents", href: "/status", icon: renderMenuIcon(Pulse01Icon) },
            ]
        },
        { title: "Pricing", href: "/pricing" },
        { title: "Documentation", href: siteConfig.links.docs },
        { title: "Blog", href: siteConfig.links.company.blog },
    ],
    actions: providedActions,
    className,
    isAuthenticated: providedIsAuthenticated,
    userProfile: providedUserProfile,
    searchSlot,
    containerClassName,
    ...props
}: NavbarProps) {
    const router = useRouter();
    const { theme, setTheme } = useTheme();

    const { isAuthenticated: hookIsAuthenticated, userProfile: hookUserProfile } = useAuth();
    
    const isAuthenticated = providedIsAuthenticated ?? hookIsAuthenticated;
    const userProfile = providedUserProfile ?? hookUserProfile;

    // Default actions based on auth state
    const actions = providedActions || (isAuthenticated ? [
        {
            text: "Dashboard",
            href: "/dashboard",
            isButton: true,
            variant: "default",
        },
        {
            text: userProfile.name || "User",
            href: "#",
            isButton: false,
            isAvatar: true,
            avatarSrc: userProfile.avatar,
            avatarFallback: (userProfile.name || "U").slice(0, 2).toUpperCase(),
        },
    ] : [
        { text: "Sign in", href: siteConfig.links.signInUrl, isButton: false },
        {
            text: "Get Started",
            href: siteConfig.links.getStartedUrl,
            isButton: true,
            variant: "default",
        },
    ]);

    const productsDropdown: NavDropdown = {
        title: "Products",
        type: "mega",
        columns: productMenuColumns,
        listClassName: "md:w-[400px] md:grid-cols-2 lg:w-[520px] lg:grid-cols-2",
    };

    const solutionsDropdown: NavDropdown = {
        title: "Solutions",
        type: "mega",
        columns: solutionsMenuColumns,
    };

    const resourcesDropdown: NavDropdown = {
        title: "Resources",
        type: "mega",
        columns: [
            [
                { title: "Documentation", href: siteConfig.links.docs, description: "Implementation guides and setup.", icon: renderMenuIcon(BookOpen01Icon) },
                { title: "API Reference", href: "/docs/api/metrics", description: "Endpoints, auth, and schemas.", icon: renderMenuIcon(ApiIcon) },
                { title: "Academy", href: "/academy", description: "Training for teams and operators.", icon: renderMenuIcon(AiBookIcon) },
            ],
            [
                { title: "Newsletter", href: siteConfig.links.company.newsletter, description: "Product notes from the builders.", icon: renderMenuIcon(AiMail01Icon) },
                { title: "SDKs & Quickstarts", href: siteConfig.links.products.developerTools, description: "Starter kits for every stack.", icon: renderMenuIcon(CodeCircleIcon) },
                { title: "Guides & Tutorials", href: "/resources/guides", description: "Deeper walkthroughs and patterns.", icon: renderMenuIcon(Compass01Icon) },
            ],
        ],
    };

    const navItems: NavItem[] = [
        productsDropdown,
        solutionsDropdown,
        resourcesDropdown,
        { title: "Pricing", href: "/pricing" },
        { title: "Documentation", href: siteConfig.links.docs },
        { title: "Blog", href: siteConfig.links.company.blog },
    ];

    return (
        <motion.header
            className={cn("fixed top-0 cursor-pointer left-0 right-0 z-50 bg-background/90 backdrop-blur-lg border-b border-border/30", className)}
            {...(props as MotionProps)}
        >
            <div className={cn("mx-auto px-4 md:px-6", containerClassName || "max-w-screen-xl")}>
                <NavbarComponent className="py-2">
                    {/* ... [Keep inner content exactly as is] ... */}
                    <NavbarLeft className="gap-6">
                        <Link
                            href={homeUrl}
                            className="flex items-center gap-1.5 text-sm font-semibold tracking-tight"
                        >
                            {logo}
                            {name}
                        </Link>

                        <NavigationMenu className="hidden md:flex">
                            <NavigationMenuList className="gap-1">
                                {navItems.map((item, index) => {
                                    if (isNavDropdown(item)) {
                                        return (
                                            <NavigationMenuItem key={index}>
                                                <NavigationMenuTrigger className="h-7 px-2.5 text-xs font-medium rounded-full bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 focus:bg-muted/50 data-[state=open]:bg-muted/50 data-[state=open]:text-foreground border-none">
                                                    {item.title}
                                                </NavigationMenuTrigger>
                                                <NavigationMenuContent className="rounded-xl border-border/40 shadow-none bg-background/95 backdrop-blur-xl">
                                                    {item.type === "mega" ? (
                                                        <div className="flex flex-col">
                                                            <ul className={cn("grid gap-x-3 gap-y-1 p-2.5 md:w-[400px] lg:w-[600px] lg:grid-cols-3", item.listClassName)}>
                                                                {item.columns?.map((col, colIndex) => (
                                                                    <div key={colIndex} className={cn("space-y-0.5", colIndex === item.columns!.length - 1 ? "border-l border-border/40 pl-4 self-start" : "")}>
                                                                        {col.map((link, linkIndex) => (
                                                                            <ListItem key={linkIndex} title={link.title} href={link.href} icon={link.icon}>
                                                                                {link.description}
                                                                            </ListItem>
                                                                        ))}
                                                                    </div>
                                                                ))}
                                                            </ul>
                                                            {(item.footerCtaPrimary || item.footerCtaSecondary) && (
                                                                <div className="flex justify-end p-4 border-t border-border/40 bg-muted/20">
                                                                    {item.footerCtaSecondary && (
                                                                        <Button variant="ghost" size="sm" className="mr-2 rounded-full" asChild>
                                                                            <Link href={item.footerCtaSecondary.href}>
                                                                                {item.footerCtaSecondary.title}
                                                                            </Link>
                                                                        </Button>
                                                                    )}
                                                                    {item.footerCtaPrimary && (
                                                                        <Button size="sm" className="rounded-full" asChild>
                                                                            <Link href={item.footerCtaPrimary.href}>
                                                                                {item.footerCtaPrimary.title}
                                                                            </Link>
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <ul className="grid w-[180px] gap-0.5 p-1.5 md:w-[260px]">
                                                            {item.items?.map((link, linkIndex) => (
                                                                <ListItem key={linkIndex} title={link.title} href={link.href}>
                                                                    {link.description}
                                                                </ListItem>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </NavigationMenuContent>
                                            </NavigationMenuItem>
                                        );
                                    } else {
                                        return (
                                            <NavigationMenuItem key={index}>
                                                <NavigationMenuLink asChild className={cn(navigationMenuTriggerStyle(), "h-7 px-2.5 text-xs font-medium rounded-full bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50 focus:bg-muted/50")}>
                                                    <Link href={item.href}>
                                                        {item.title}
                                                    </Link>
                                                </NavigationMenuLink>
                                            </NavigationMenuItem>
                                        );
                                    }
                                })}
                            </NavigationMenuList>
                        </NavigationMenu>
                    </NavbarLeft>

                    <NavbarRight>
                        {searchSlot}
                        {actions.map((action, index) => {
                            if (action.isAvatar && isAuthenticated) {
                                return (
                                    <DropdownMenu key="authenticated-avatar-menu">
                                        <DropdownMenuTrigger asChild>
                                            <UserAvatar
                                                src={userProfile?.avatar}
                                                name={userProfile?.name}
                                                email={userProfile?.email}
                                                size={32}
                                                className="cursor-pointer border border-border/40 transition-opacity hover:opacity-80"
                                            />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-66 p-1 font-mono bg-black border dark:border-[#1a1a1a] border-[#eee]" align="end" forceMount>
                                            <div className="px-2 py-2 border-b border-border/40 mb-1 space-y-0.5">
                                                <p className="text-xs font-semibold truncate text-white leading-tight">{userProfile?.name || "User"}</p>
                                            </div>
                                            <p className="px-2 py-1 text-[10px] text-muted-foreground/70 uppercase tracking-wider">Account</p>
                                            <DropdownMenuItem className="text-xs py-1.5 cursor-pointer flex justify-between" onClick={() => router.push("/account/profile")}>
                                                Profile
                                                <CircleUserRound className="h-3.5 w-3.5 ml-auto" />
                                            </DropdownMenuItem>
                                            <DropdownMenuItem className="text-xs py-1.5 cursor-pointer flex justify-between" onClick={() => router.push("/account/settings")}>
                                                Settings
                                                <Settings className="h-3.5 w-3.5 ml-auto" />
                                            </DropdownMenuItem>
                                            <div className="my-1 border-t border-border/40" />
                                            <div className="px-2 py-1.5">
                                                <button
                                                    onClick={() => router.push("/dashboard")}
                                                    className="flex w-full items-center justify-center h-8 rounded-md bg-foreground text-xs font-semibold text-background hover:opacity-90 transition-opacity cursor-pointer dark:bg-white dark:text-black dark:hover:bg-zinc-100"
                                                >
                                                    Upgrade to Pro
                                                </button>
                                            </div>
                                            <div className="my-1 border-t border-border/40" />
                                            <div className="flex items-center justify-between px-2 py-1.5">
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Theme</p>
                                                <ThemeSwitcher />
                                            </div>
                                            <div className="my-1 border-t border-border/40" />
                                            <DropdownMenuItem className="text-xs py-1.5 cursor-pointer flex justify-between" onClick={() => router.push("/dashboard")}>
                                                Dashboard
                                                <span className="size-3.5 shrink-0">
                                                    <Logo variant="mark" className="h-full w-full" />
                                                </span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem className="text-xs py-1.5 cursor-pointer text-red-500 focus:text-red-500 flex justify-between" onClick={async () => {
                                                    await supabase.auth.signOut();
                                                    router.push("/login");
                                                }}>
                                                Log out
                                                <LogOut className="h-3.5 w-3.5" />
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                );
                            } else if (action.isButton) {
                                const isOutlinedAction = action.variant === "outline";

                                return (
                                    <Button
                                        key={index}
                                        variant={isOutlinedAction ? "outline" : "default"}
                                        className={cn(
                                            "h-7 px-3 text-[11px] font-medium",
                                            isOutlinedAction
                                                ? "rounded-md border-foreground/20 bg-transparent text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground"
                                                : "rounded-md bg-foreground text-background hover:bg-foreground/90"
                                        )}
                                        asChild
                                    >
                                        <Link href={action.href}>
                                            {action.text}
                                        </Link>
                                    </Button>
                                );
                            } else {
                                return (
                                    <Button
                                        key={index}
                                        variant="outline"
                                        className="mr-1 hidden h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground md:inline-flex"
                                        asChild
                                    >
                                        <Link href={action.href}>
                                            {action.text}
                                        </Link>
                                    </Button>
                                );
                            }
                        })}
                        <Sheet>
                            <SheetTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="shrink-0 md:hidden rounded-full"
                                >
                                    <Menu className="size-5" />
                                    <span className="sr-only">Toggle navigation menu</span>
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="right" className="w-full border-none bg-background/95 backdrop-blur-xl p-6">
                                <div className="flex flex-col h-full">
                                    <div className="flex items-center gap-2 mb-8">
                                        {logo}
                                        {name && <span className="font-bold text-xl tracking-tight">{name}</span>}
                                    </div>

                                    <div className="flex-1 overflow-y-auto -mx-6 px-6">
                                        <Accordion type="single" collapsible className="w-full">
                                            {mobileNavItems.map((item, index) => (
                                                "sublinks" in item && item.sublinks ? (
                                                    <AccordionItem key={index} value={`item-${index}`} className="border-border/40">
                                                        <AccordionTrigger className="text-base font-medium hover:no-underline hover:text-foreground text-muted-foreground">
                                                            {item.title}
                                                        </AccordionTrigger>
                                                        <AccordionContent>
                                                            <div className="flex flex-col space-y-2 pl-4 pb-2">
                                                                {item.sublinks.map((sublink, sublinkIndex) => (
                                                                    <Link
                                                                        key={sublinkIndex}
                                                                        href={sublink.href || "#"}
                                                                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground py-2 transition-colors"
                                                                    >
                                                                        {sublink.icon ? <span className="text-muted-foreground">{sublink.icon}</span> : null}
                                                                        <span>{sublink.title}</span>
                                                                    </Link>
                                                                ))}
                                                            </div>
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                ) : (
                                                    <div key={index} className="border-b border-border/40 py-4">
                                                        <Link
                                                            href={item.href || "#"}
                                                            className="flex w-full items-center text-base font-medium text-muted-foreground hover:text-foreground transition-colors"
                                                        >
                                                            {item.title}
                                                        </Link>
                                                    </div>
                                                )
                                            ))}
                                        </Accordion>
                                    </div>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </NavbarRight>
                </NavbarComponent>
            </div>
        </motion.header>
    );
}
