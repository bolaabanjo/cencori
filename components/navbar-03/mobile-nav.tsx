// components/navbar-03/mobile-nav.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import type { User } from "@supabase/supabase-js";
import { MenuIcon } from "lucide-react";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
  } from "@/components/ui/accordion"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { mainNavItems } from "@/components/navbar-03/config"; // Import your defined nav items
import { Separator } from "../ui/separator";

interface MobileNavProps {
  user: User | null;
  UserAvatarComponent: React.FC<{ user: User }>; // Pass UserAvatar as a prop
}

export const MobileNav: React.FC<MobileNavProps> = ({ user, UserAvatarComponent }) => {
  const { theme } = useTheme();

  return (
    <div className="flex items-center space-x-2 md:hidden">
      {user && <UserAvatarComponent user={user} />}
      <ThemeToggle />
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <MenuIcon className="h-6 w-6" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="flex flex-col">
          <div className="mt-16 ml-4 w-full flex flex-col items-center space-y-4 flex-grow">
            {mainNavItems.map((navItem) => (
              <React.Fragment key={navItem.name}>
                {navItem.type === "link" ? (
                  <SheetClose asChild>
                    <Link href={navItem.href} className="text-lg font-medium hover:text-primary transition-colors w-full p-2">
                      {navItem.name}
                    </Link>
                  </SheetClose>
                ) : (
                  <div className="w-full">
                    <Accordion type="single" collapsible className="w-full pr-8">
                      <AccordionItem value={navItem.name}>
                        <AccordionTrigger className="text-lg font-semibold">
                          {navItem.name}
                        </AccordionTrigger>
                        <AccordionContent>
                          <ul className="ml-2 space-y-2 border-l pl-4">
                            {navItem.items?.map((item) => (
                              <SheetClose asChild key={item.title}>
                                <Link
                                  href={item.href}
                                  className="flex items-center gap-2 text-base hover:text-primary transition-colors"
                                >
                                  {item.icon && (
                                    <item.icon className="h-5 w-5 text-muted-foreground" />
                                  )}
                                  {item.title}
                                </Link>
                              </SheetClose>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                )}
              </React.Fragment>
            ))}
            {user && (
              <SheetClose asChild>
                <Link href="/dashboard/organization">
                  <Button variant="ghost" className="w-full justify-start rounded-full">Dashboard</Button>
                </Link>
              </SheetClose>
            )}
            {!user && (
              <>
             </>
            )}
          </div>
          <>
               <Separator className="my-4" />
               <div className="ml-4 mr-5">
                <SheetClose asChild >
                  <Link href="/login">
                    <Button variant="ghost" className="w-full item-center rounded-full">Sign In</Button>
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link href="/signup">
                    <Button className="w-full sm:w-auto px-4 py-2 justify-center item-center rounded-full bg-black mb-10 dark:bg-white text-white dark:text-black">Sign Up</Button>
                  </Link>
                </SheetClose>
                </div>
              </>
        </SheetContent>
      </Sheet>
    </div>
  );
};