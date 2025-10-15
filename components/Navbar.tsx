// components/Navbar.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { User } from "@supabase/supabase-js";

import { DesktopNav } from "./navbar-03/desktop-nav";
import { MobileNav } from "./navbar-03/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle"; // Keep ThemeToggle for desktop

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
    <nav className="fixed top-6 inset-x-4 h-16  border dark:border-zinc-900 max-w-6xl mx-auto z-50">
      <div className="h-full flex items-center justify-between mx-auto px-4">
        {/* Logo */}
        <Link href="/">
          {theme === "dark" ? (
            <img src="/cdark.png" alt="Logo Dark" className="h-6" />
          ) : (
            <img src="/clight.png" alt="Logo Light" className="h-6" />
          )}
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-4">
          <DesktopNav user={user} UserAvatarComponent={UserAvatar} />
        </div>

        {/* Mobile Navigation */}
        <MobileNav user={user} UserAvatarComponent={UserAvatar} />
      </div>
    </nav>
  );
};

export default Navbar;