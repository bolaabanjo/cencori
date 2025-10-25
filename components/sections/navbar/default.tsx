import { type VariantProps } from "class-variance-authority";
import { CreditCard, Menu, Settings, UserPlus, Users, Shield, Book, Rocket, Code, Laptop, Share2, Building2, Workflow, DollarSign, LifeBuoy, Rss, Layers, Search, BriefcaseBusiness, UsersRound, Factory, ScrollText, CalendarDays, Handshake, Ship, LockKeyhole, HardHat, FileText, Blocks, FlaskConical, Gauge, Terminal, Globe, User, BookOpen, FileWarning, Package2 } from "lucide-react";
import { ReactNode } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { CircleUserRound } from "lucide-react";

import { siteConfig } from "@/config/site"; // Import siteConfig
import { cn } from "@/lib/utils";

import LaunchUI from "../../logos/launch-ui";
import Github from "../../logos/github";
import XLogo from "../../logos/x";
import { Button, buttonVariants } from "../../ui/button";
import {
  Navbar as NavbarComponent,
  NavbarLeft,
  NavbarRight,
} from "../../ui/navbar";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "../../ui/navigation-menu";
import { Sheet, SheetContent, SheetTrigger } from "../../ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabaseClient";
import router from "next/router";

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
  columns?: NavLink[][]; // For mega-dropdowns
  items?: NavLink[]; // For regular dropdowns
  footerCtaPrimary?: NavLink;
  footerCtaSecondary?: NavLink;
}

interface MobileNavLink {
  title: string;
  href?: string;
  sublinks?: MobileNavLink[];
}

interface NavbarActionProps {
  text: string;
  href: string;
  variant?: string;
  icon?: ReactNode;
  iconRight?: ReactNode;
  isButton?: boolean;
  isAvatar?: boolean;
  avatarSrc?: string | null;
  avatarFallback?: string;
}

interface NavbarProps {
  logo?: ReactNode;
  name?: string;
  homeUrl?: string;
  mobileNavItems?: MobileNavLink[]; // Changed to new mobile nav structure
  actions?: NavbarActionProps[];
  className?: string;
  isAuthenticated?: boolean;
  userProfile?: { name: string | null; avatar: string | null };
}

function isNavDropdown(item: NavItem): item is NavDropdown {
  return "type" in item;
}

export default function Navbar({
  logo = <LaunchUI />,
  name = siteConfig.name,
  homeUrl = siteConfig.url,
  mobileNavItems = [
    { title: "Products", sublinks: [
      { title: "Protect", href: siteConfig.links.products.ai },
      { title: "Audit", href: siteConfig.links.products.audit },
      { title: "Knight", href: siteConfig.links.products.knight },
      { title: "Sandbox", href: siteConfig.links.products.sandbox },
      { title: "Insights", href: siteConfig.links.products.insights },
      { title: "Network", href: siteConfig.links.products.network },
      { title: "Edge", href: siteConfig.links.products.edge },
      { title: "Enterprise", href: siteConfig.links.products.enterprise },
      { title: "Developer Tools", href: siteConfig.links.products.developerTools },
    ]},
    { title: "Solutions", sublinks: [
      { title: "AI-first Startups", href: "/solutions/ai-startups" },
      { title: "Platform & ISVs", href: "/solutions/platforms" },
      { title: "Regulated Industries", href: "/solutions/regulated" },
      { title: "Developer Teams", href: "/solutions/devtools" },
      { title: "Protect Generated Apps", href: "/solutions/vibe-coded" },
      { title: "Data-science Sandboxes", href: "/solutions/model-ops" },
      { title: "Code Execution & Automation Safety", href: "/solutions/sandboxing" },
    ]},
    { title: "Resources", sublinks: [
      { title: "Documentation", href: siteConfig.links.docs },
      { title: "API Reference", href: "/docs/api" },
      { title: "SDKs & Quickstarts", href: siteConfig.links.products.developerTools },
      { title: "Guides & Tutorials", href: "/resources/guides" },
      { title: "Changelog", href: siteConfig.links.company.changelog },
      { title: "Use Cases / Case Studies", href: siteConfig.links.company.customers },
      { title: "Security & Compliance", href: "/security" },
      { title: "Status & Incidents", href: "/status" },
    ]},
    { title: "Pricing", href: "/pricing" },
    { title: "Documentation", href: siteConfig.links.docs },
    { title: "Blog", href: siteConfig.links.company.blog },
  ],
  actions = [
    { text: "Sign in", href: siteConfig.links.signInUrl, isButton: false },
    {
      text: "Get Started",
      href: siteConfig.links.getStartedUrl,
      isButton: true,
      variant: "default",
    },
  ],
  className,
  isAuthenticated = false,
  userProfile,
}: NavbarProps) {

  const productsDropdown: NavDropdown = {
    title: "Products",
    type: "mega",
    columns: [
      [
        { title: "Protect", href: siteConfig.links.products.ai, description: "Real-time request/response protection and policy enforcement.", icon: <Shield className="h-4 w-4" /> },
        { title: "Audit", href: siteConfig.links.products.audit, description: "Immutable logs and exportable compliance reports.", icon: <Book className="h-4 w-4" /> },
        { title: "Knight", href: siteConfig.links.products.knight, description: "Build-time CI scanning and PR enforcement.", icon: <HardHat className="h-4 w-4" /> },
        { title: "Sandbox", href: siteConfig.links.products.sandbox, description: "Hardened execution environment for model-generated code.", icon: <FlaskConical className="h-4 w-4" /> },
      ],
      [
        { title: "Insights", href: siteConfig.links.products.insights, description: "Analytics, risk dashboards, and alerting.", icon: <Gauge className="h-4 w-4" /> },
        { title: "Network", href: siteConfig.links.products.network, description: "Opt-in threat intelligence and signature feeds.", icon: <Share2 className="h-4 w-4" /> },
        { title: "Edge", href: siteConfig.links.products.edge, description: "Platform integrations and edge middleware (Vercel, Supabase).", icon: <Laptop className="h-4 w-4" /> },
        { title: "Enterprise", href: siteConfig.links.products.enterprise, description: "VPC/on-prem, SLAs, and compliance services.", icon: <Building2 className="h-4 w-4" /> },
        { title: "Developer Tools", href: siteConfig.links.products.developerTools, description: "SDKs, CLI, and quickstarts.", icon: <Code className="h-4 w-4" /> },
      ],
    ],
    footerCtaPrimary: { title: "Try Protect (Free)", href: "/signup?product=protect" },
    footerCtaSecondary: { title: "Contact Sales", href: "/contact?topic=enterprise" },
  };

  const solutionsDropdown: NavDropdown = {
    title: "Solutions",
    type: "dropdown",
    items: [
      { title: "AI-first Startups", href: "/solutions/ai-startups", description: "rapid safe launch and scaling.", icon: <Rocket className="h-4 w-4" /> },
      { title: "Platform & ISVs", href: "/solutions/platforms", description: "integrate Cencori into developer workflows.", icon: <Layers className="h-4 w-4" /> },
      { title: "Regulated Industries", href: "/solutions/regulated", description: "fintech, healthcare, legal compliance.", icon: <ScrollText className="h-4 w-4" /> },
      { title: "Developer Teams", href: "/solutions/devtools", description: "reduce developer risk during deploy.", icon: <Terminal className="h-4 w-4" /> },
      { title: "Protect Generated Apps", href: "/solutions/vibe-coded", description: "(Cursor, V0, Lovable)", icon: <Blocks className="h-4 w-4" /> },
      { title: "Data-science Sandboxes & Model Ops", href: "/solutions/model-ops", description: "", icon: <FlaskConical className="h-4 w-4" /> },
      { title: "Code Execution & Automation Safety", href: "/solutions/sandboxing", description: "", icon: <LockKeyhole className="h-4 w-4" /> },
    ],
  };

  const resourcesDropdown: NavDropdown = {
    title: "Resources",
    type: "dropdown",
    items: [
      { title: "Documentation", href: siteConfig.links.docs, icon: <BookOpen className="h-4 w-4" /> },
      { title: "API Reference", href: "/docs/api", icon: <Code className="h-4 w-4" /> },
      { title: "SDKs & Quickstarts", href: siteConfig.links.products.developerTools, icon: <Terminal className="h-4 w-4" /> },
      { title: "Guides & Tutorials", href: "/resources/guides", icon: <LifeBuoy className="h-4 w-4" /> },
      { title: "Changelog", href: siteConfig.links.company.changelog, icon: <FileText className="h-4 w-4" /> },
      { title: "Use cases / Case studies", href: siteConfig.links.company.customers, icon: <UsersRound className="h-4 w-4" /> },
      { title: "Security & Compliance", href: "/security", icon: <LockKeyhole className="h-4 w-4" /> },
      { title: "Status & Incidents", href: "/status", icon: <FileWarning className="h-4 w-4" /> },
    ],
  };

  const navItems: NavItem[] = [
    productsDropdown,
    solutionsDropdown,
    resourcesDropdown,
    { title: "Pricing", href: "/pricing", icon: <DollarSign className="h-4 w-4" /> },
    { title: "Documentation", href: siteConfig.links.docs, icon: <BookOpen className="h-4 w-4" /> },
    { title: "Blog", href: siteConfig.links.company.blog, icon: <Rss className="h-4 w-4" /> },
  ];

  return (
    <header className={cn("sticky top-0 z-50 -mb-4 px-4 pb-4", className)}>
      <div className="fade-bottom bg-background/15 absolute left-0 h-24 w-full backdrop-blur-lg"></div>
      <div className="max-w-container relative mx-auto">
        <NavbarComponent>
          <NavbarLeft>
            <a
              href={homeUrl}
              className="flex items-center gap-2 text-xl font-bold"
            >
              {logo}
              {name}
            </a>
            <NavigationMenu className="hidden md:flex">
              <NavigationMenuList>
                {navItems.map((item, index) => {
                  if (isNavDropdown(item)) {
                    if (item.type === "mega") {
                      return (
                        <NavigationMenuItem key={index}>
                          <NavigationMenuTrigger>{item.title}</NavigationMenuTrigger>
                          <NavigationMenuContent>
                            <ul className="grid gap-3 p-6 md:w-[400px] lg:w-[500px] lg:grid-cols-2">
                              {item.columns?.map((col, colIndex) => (
                                <div key={colIndex}>
                                  {col.map((link, linkIndex) => (
                                    <ListItem key={linkIndex} title={link.title} href={link.href} icon={link.icon}>
                                      {link.description}
                                    </ListItem>
                                  ))}
                                </div>
                              ))}
                            </ul>
                            {(item.footerCtaPrimary || item.footerCtaSecondary) && (
                              <div className="flex justify-end p-4 border-t">
                                {item.footerCtaSecondary && (
                                  <NavigationMenuLink asChild>
                                    <Button variant="outline" className="mr-2" asChild>
                                      <a href={item.footerCtaSecondary.href}>
                                        {item.footerCtaSecondary.title}
                                      </a>
                                    </Button>
                                  </NavigationMenuLink>
                                )}
                                {item.footerCtaPrimary && (
                                  <NavigationMenuLink asChild>
                                    <Button asChild>
                                      <a href={item.footerCtaPrimary.href}>
                                        {item.footerCtaPrimary.title}
                                      </a>
                                    </Button>
                                  </NavigationMenuLink>
                                )}
                              </div>
                            )}
                          </NavigationMenuContent>
                        </NavigationMenuItem>
                      );
                    } else { // item.type === "dropdown"
                      return (
                        <NavigationMenuItem key={index}>
                          <NavigationMenuTrigger>{item.title}</NavigationMenuTrigger>
                          <NavigationMenuContent>
                            <ul className="grid w-[200px] gap-3 p-4 md:w-[300px]">
                              {item.items?.map((link, linkIndex) => (
                                <ListItem key={linkIndex} title={link.title} href={link.href} icon={link.icon}>
                                  {link.description}
                                </ListItem>
                              ))}
                            </ul>
                          </NavigationMenuContent>
                        </NavigationMenuItem>
                      );
                    }
                  } else { // item is NavLink
                    return (
                      <NavigationMenuItem key={index}>
                        <Link href={item.href} legacyBehavior passHref>
                          <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                            {item.title}
                          </NavigationMenuLink>
                        </Link>
                      </NavigationMenuItem>
                    );
                  }
                })}
              </NavigationMenuList>
            </NavigationMenu>
          </NavbarLeft>
          <NavbarRight>
            {actions.map((action, index) => {
              if (action.isAvatar && isAuthenticated) {
                return (
          <DropdownMenu key="authenticated-avatar-menu">
            <DropdownMenuTrigger asChild>
              <Avatar className="h-7 w-7 cursor-pointer">
                {userProfile?.avatar && userProfile.avatar.length > 0 ? (
                  <AvatarImage
                    src={userProfile.avatar}
                    alt={
                      typeof userProfile?.name === "string"
                        ? userProfile.name
                        : "User avatar"
                    }
                  />
                ) : (
                  <AvatarFallback>
                    <CircleUserRound className="h-5 w-5 text-zinc-200" />
                  </AvatarFallback>
                )}
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-66" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-s leading-none text-white font-semibold">
                    {userProfile?.name ?? ""}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/dashboard/profile")}>
                <CircleUserRound className="mr-2 h-4 w-4" />
                <span className="text-xs">Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/dashboard/billing")}>
                <CreditCard className="mr-2 h-4 w-4" />
                <span className="text-xs">Billing</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/dashboard/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                <span className="text-xs"> Account Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/")}>
                
                <span className="text-xs">Homepage</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/dashboard/team")}>
                <Users className="mr-2 h-4 w-4" />
                <span className="text-xs">Team</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/dashboard/invite-user")}>
                <UserPlus className="mr-2 h-4 w-4" />
                <span className="text-xs">Invite User</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push("/login");
                }}
              >
                <span className="text-xs">Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
                );
              } else if (action.isButton) {
                return (
                  <Button
                    key={index}
                    variant={
                      action.variant && 
                      ["default", "link", "destructive", "outline", "glow", "secondary", "ghost"].includes(action.variant)
                        ? action.variant as
                            | "default"
                            | "link"
                            | "destructive"
                            | "outline"
                            | "glow"
                            | "secondary"
                            | "ghost"
                        : "default"
                    }
                    asChild
                  >
                    <a href={action.href}>
                      {action.icon}
                      {action.text}
                      {action.iconRight}
                    </a>
                  </Button>
                );
              } else {
                return (
                  <a
                    key={index}
                    href={action.href}
                    className="hidden text-sm md:block"
                  >
                    {action.text}
                  </a>
                );
              }
            })}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 md:hidden"
                >
                  <Menu className="size-5" />
                  <span className="sr-only">Toggle navigation menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                <nav className="grid gap-6 text-lg font-medium pt-10">
                  {mobileNavItems.map((item, index) => (
                    "sublinks" in item && item.sublinks ? (
                      <details key={index} className="group">
                        <summary className="flex w-full items-center justify-between text-muted-foreground hover:text-foreground cursor-pointer">
                          {item.title}
                          <span className="transition-transform group-open:rotate-90">&gt;</span>
                        </summary>
                        <ul className="ml-4 mt-2 space-y-2">
                          {item.sublinks.map((sublink, sublinkIndex) => (
                            sublink.sublinks ? (
                              <details key={sublinkIndex} className="group">
                                <summary className="flex w-full items-center justify-between text-muted-foreground hover:text-foreground cursor-pointer">
                                  {sublink.title}
                                  <span className="transition-transform group-open:rotate-90">&gt;</span>
                                </summary>
                                <ul className="ml-4 mt-2 space-y-2">
                                  {sublink.sublinks.map((nestedLink, nestedLinkIndex) => (
                                    <li key={nestedLinkIndex}>
                                      <Link href={nestedLink.href || "#"} className="text-muted-foreground hover:text-foreground">
                                        {nestedLink.title}
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ) : (
                              <li key={sublinkIndex}>
                                <Link href={sublink.href || "#"} className="text-muted-foreground hover:text-foreground">
                                  {sublink.title}
                                </Link>
                              </li>
                            )
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <Link
                        key={index}
                        href={item.href || "#"}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {item.title}
                      </Link>
                    )
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
          </NavbarRight>
        </NavbarComponent>
      </div>
    </header>
  );
}

import * as React from "react";
import Link from "next/link";
const ListItem = React.forwardRef<React.ElementRef<"a">, React.ComponentPropsWithoutRef<"a"> & { icon?: ReactNode }>(({ className, title, children, icon, ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          ref={ref}
          className={cn(
            "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
            className
          )}
          {...props}
        >
          <div className="flex items-center gap-2">
            {icon && icon}
            <div className="text-sm font-medium leading-none">{title}</div>
          </div>
          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
            {children}
          </p>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";
