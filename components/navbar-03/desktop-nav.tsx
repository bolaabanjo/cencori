// components/navbar-03/desktop-nav.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import type { User } from "@supabase/supabase-js";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import { mainNavItems } from "@/components/navbar-03/config"; // Import your defined nav items

interface DesktopNavProps {
  user: User | null;
  UserAvatarComponent: React.FC<{ user: User }>; // Pass UserAvatar as a prop
}

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a"> & { icon: React.ElementType }
>(({ className, title, children, icon: Icon, ...props }, ref) => {
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
          {Icon && <Icon className="h-4 w-4 text-muted-foreground mb-2" />}
          <div className="text-sm font-medium leading-none">{title}</div>
          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
            {children}
          </p>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";

export const DesktopNav: React.FC<DesktopNavProps> = ({ user, UserAvatarComponent }) => {
  const { theme } = useTheme();

  return (
    <NavigationMenu>
      <NavigationMenuList>
        {mainNavItems.map((navItem) => (
          <NavigationMenuItem key={navItem.name}>
            {navItem.type === "link" ? (
              <Link href={navItem.href} legacyBehavior passHref>
                <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                  {navItem.name}
                </NavigationMenuLink>
              </Link>
            ) : (
              <>
                <NavigationMenuTrigger>{navItem.name}</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                    {navItem.items?.map((item) => (
                      <ListItem
                        key={item.title}
                        title={item.title}
                        href={item.href}
                        icon={item.icon}
                      >
                        {item.description}
                      </ListItem>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </>
            )}
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
      <div className="flex items-center space-x-4 ml-auto">
        <ThemeToggle />
        {user ? (
          <>
            <UserAvatarComponent user={user} />
            <Link href="/dashboard">
              <Button className="rounded-full">Dashboard</Button>
            </Link>
          </>
        ) : (
          <>
            <Link href="/login">
              <Button variant="outline" className="rounded-full">Sign In</Button>
            </Link>
            <Link href="/signup">
              <Button className="rounded-full text-sm">Sign Up</Button>
            </Link>
          </>
        )}
      </div>
    </NavigationMenu>
  );
};