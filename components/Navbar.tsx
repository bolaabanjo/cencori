// components/Navbar.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { User } from "@supabase/supabase-js";
import { ThemeToggle } from "@/components/theme-toggle";
import { MenuIcon, XIcon } from "lucide-react"; // Import icons for mobile menu
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet"; // Assuming you have a Sheet component

interface UserAvatarProps {
  user: User;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ user }) => {
  const getInitials = (name: string | null | undefined) => {
    if (!name) {
      if (user.email) {
        return user.email[0].toUpperCase();
      }
      return "U";
    }
    const parts = name.split(" ");
    if (parts.length > 1) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0][0].toUpperCase();
  };

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const userName = user.user_metadata?.full_name as string | undefined;

  return (
    <Avatar>
      <AvatarImage src={avatarUrl || ""} alt={userName || "User Avatar"} />
      <AvatarFallback>{getInitials(userName || user.email)}</AvatarFallback>
    </Avatar>
  );
};

const Navbar: React.FC = () => {
  const { theme } = useTheme();
  const [user, setUser] = React.useState<User | null>(null);
  const supabase = createClientComponentClient();

  React.useEffect(() => {
    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
    };

    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <nav className="flex items-center justify-between p-4 px-6 md:px-8 lg:px-12">
      {/* Logo */}
      <Link href="/">
        {theme === "dark" ? (
          <img src="/cdark.png" alt="Logo Dark" className="h-6" />
        ) : (
          <img src="/clight.png" alt="Logo Light" className="h-6" />
        )}
      </Link>

      {/* Desktop Navigation Links and Auth/Avatar */}
      <div className="hidden md:flex items-center space-x-4">
        <ThemeToggle />
        {user ? (
          <UserAvatar user={user} />
        ) : (
          <>
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/signup">
              <Button>Get Started</Button>
            </Link>
          </>
        )}
      </div>

      {/* Mobile Menu (Hamburger) */}
      <div className="md:hidden flex items-center space-x-4">
        <ThemeToggle />
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <MenuIcon className="h-6 w-6" />
              <span className="sr-only">Toggle navigation menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right">
            <div className="flex flex-col items-start space-y-4 pt-8">
              <SheetClose asChild>
                <Link href="/">
                  {theme === "dark" ? (
                    <img src="/cdark.png" alt="Logo Dark" className="h-8" />
                  ) : (
                    <img src="/clight.png" alt="Logo Light" className="h-8" />
                  )}
                </Link>
              </SheetClose>
              {user ? (
                <SheetClose asChild>
                  <UserAvatar user={user} />
                </SheetClose>
              ) : (
                <>
                  <SheetClose asChild>
                    <Link href="/login">
                      <Button variant="ghost" className="w-full justify-start">Sign In</Button>
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link href="/signup">
                      <Button className="w-full justify-start">Sign Up</Button>
                    </Link>
                  </SheetClose>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
};

export default Navbar;