import { type VariantProps } from "class-variance-authority";
import { CreditCard, Menu, Settings, UserPlus, Users } from "lucide-react";
import { ReactNode } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { CircleUserRound } from "lucide-react";

import { siteConfig } from "@/config/site"; // Import siteConfig
import { cn } from "@/lib/utils";

import LaunchUI from "../../logos/launch-ui";
import { Button, buttonVariants } from "../../ui/button";
import {
  Navbar as NavbarComponent,
  NavbarLeft,
  NavbarRight,
} from "../../ui/navbar";
import Navigation from "../../ui/navigation";
import { Sheet, SheetContent, SheetTrigger } from "../../ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabaseClient";
import router from "next/router";

interface NavbarLink {
  text: string;
  href: string;
}

interface NavbarActionProps {
  text: string;
  href: string;
  variant?: string; // Changed to string for flexibility
  icon?: ReactNode;
  iconRight?: ReactNode;
  isButton?: boolean;
  isAvatar?: boolean; // New prop
  avatarSrc?: string | null;
  avatarFallback?: string; // New prop
}

interface NavbarProps {
  logo?: ReactNode;
  name?: string;
  homeUrl?: string;
  mobileLinks?: NavbarLink[];
  actions?: NavbarActionProps[];
  showNavigation?: boolean;
  customNavigation?: ReactNode;
  className?: string;
  isAuthenticated?: boolean; // New prop
  userProfile?: { name: string | null; avatar: string | null; email: string | null }; // New prop, added email
  router?: string; // Add router prop
  supabase?: string; // Add supabase prop
}

export default function Navbar({
  logo = <LaunchUI />,
  name = siteConfig.name,
  homeUrl = siteConfig.url,
  mobileLinks = [
    { text: "Dashboard", href: "/dashboard/organizations" },
    { text: "Documentation", href: siteConfig.links.docs },
    { text: "GitHub", href: siteConfig.links.github },
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
  showNavigation = true,
  customNavigation,
  className,
  isAuthenticated = false, // Default to false
  userProfile,
}: NavbarProps) {
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
            {showNavigation && (customNavigation || <Navigation />)}
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
                  <p className="text-xs leading-none text-muted-foreground">
                    {userProfile?.email ?? ""}
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
                <nav className="grid gap-6 text-lg font-medium">
                  <a
                    href={homeUrl}
                    className="flex items-center gap-2 text-xl font-bold"
                  >
                    <span>{name}</span>
                  </a>
                  {mobileLinks.map((link, index) => (
                    <a
                      key={index}
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {link.text}
                    </a>
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
