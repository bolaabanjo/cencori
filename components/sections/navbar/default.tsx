import { type VariantProps } from "class-variance-authority";
import { Menu } from "lucide-react";
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
  userProfile?: { name: string | null; avatar: string | null }; // New prop
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
                  <Avatar key={index} className="h-7 w-7 cursor-pointer">
                    {action.avatarSrc && action.avatarSrc.length > 0 ? (
                      <AvatarImage src={action.avatarSrc} alt={action.text} />
                    ) : (
                      <AvatarFallback>
                        <CircleUserRound className="h-5 w-5 text-zinc-500" />
                      </AvatarFallback>
                    )}
                  </Avatar>
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
