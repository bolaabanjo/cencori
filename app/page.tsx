// app/page.tsx
"use client";

import { Logo } from "@/components/logo";
import FooterSection from "@/components/sections/footer/default";
import Hero from "@/components/sections/hero/default";
import Navbar from "@/components/sections/navbar/default";
import { siteConfig } from "@/config/site";
import { ArrowRightIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { CircleUserRound } from "lucide-react";
import { useRouter } from "next/navigation"; // Import useRouter

export default function HomePage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState<{ name: string | null; avatar: string | null }>({ name: null, avatar: null });

  useEffect(() => {
    const checkUser = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (data?.session) {
        setIsAuthenticated(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const meta = user.user_metadata ?? {};
          const avatar = meta.avatar_url ?? meta.picture ?? null;
          const name = meta.name ?? user.email?.split("@")[0] ?? null;
          setUserProfile({ name: name as string | null, avatar: avatar as string | null });
        }
      } else {
        setIsAuthenticated(false);
        setUserProfile({ name: null, avatar: null });
      }
    };
    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setIsAuthenticated(true);
        const { user } = session;
        if (user) {
          const meta = user.user_metadata ?? {};
          const avatar = meta.avatar_url ?? meta.picture ?? null;
          const name = meta.name ?? user.email?.split("@")[0] ?? null;
          setUserProfile({ name: name as string | null, avatar: avatar as string | null });
        }
      } else {
        setIsAuthenticated(false);
        setUserProfile({ name: null, avatar: null });
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const unauthenticatedActions = [
    { text: "Sign in", href: siteConfig.links.signInUrl, isButton: false },
    {
      text: "Get Started",
      href: siteConfig.links.getStartedUrl,
      isButton: true,
      variant: "default",
    },
  ];

  const authenticatedActions = [
    {
      text: "Dashboard",
      href: "/dashboard/organizations",
      isButton: true,
      variant: "default", // Use a string literal, TS will infer type when array is const
    },
    {
      text: userProfile.name || "User",
      href: "#", // Not clickable as per requirement, or could be profile page
      isButton: false,
      isAvatar: true, // Custom prop for Navbar to render avatar
      avatarSrc: userProfile.avatar,
      avatarFallback: (userProfile.name || "U").slice(0, 2).toUpperCase(),
    },
  ];

  const unauthenticatedMobileLinks = [
    { text: "Dashboard", href: "/dashboard/organizations" },
    { text: "Documentation", href: siteConfig.links.docs },
    { text: "GitHub", href: siteConfig.links.github },
  ];

  const authenticatedMobileLinks = [
    { text: "Dashboard", href: "/dashboard/organizations" },
    { text: "Documentation", href: siteConfig.links.docs },
    { text: "GitHub", href: siteConfig.links.github },
  ];

  return (
    <div className="min-h-screen lg:px-32 bg-background text-foreground">
      <Navbar
        logo={<Logo variant="mark" className="h-4" />}
        name="Cencori"
        homeUrl="/"
        mobileLinks={isAuthenticated ? authenticatedMobileLinks : unauthenticatedMobileLinks}
        actions={isAuthenticated ? authenticatedActions : unauthenticatedActions}
        isAuthenticated={isAuthenticated}
        userProfile={isAuthenticated ? userProfile : undefined}
      />
      <main>
        <Hero />
      </main>
      <FooterSection
        logo={<Logo variant="mark" className="h-4" />}
        name="Cencori"
        columns={[
          {
            title: "Product",
            links: [
              { text: "Dashboard", href: "/dashboard/organizations" },
              { text: "Documentation", href: siteConfig.links.docs },
            ],
          },
          {
            title: "Company",
            links: [
              { text: "About", href: "#" },
              { text: "Careers", href: "#" },
              { text: "Blog", href: "#" },
            ],
          },
          {
            title: "Contact",
            links: [
              { text: "GitHub", href: siteConfig.links.github },
            ],
          },
        ]}
        copyright="© 2025 FohnAI. All rights reserved"
        policies={[
          { text: "Privacy Policy", href: "/privacy-policy" },
          { text: "Terms of Service", href: "/terms-of-service" },
        ]}
        showModeToggle={true}
      />
    </div>
  );
}