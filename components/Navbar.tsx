"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Menu as MenuIcon } from "lucide-react";

/**
 * A responsive Navbar that:
 * - shows desktop dropdowns for Products / Developers / Solutions
 * - shows mobile Sheet with menu and footer actions
 * - displays Sign In / Sign Up when unauthenticated
 * - displays Avatar + Dashboard when authenticated
 *
 * Place <Navbar /> in your global layout/header.
 */

type UserProfile = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, any>;
};

export default function Navbar() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function fetchUser() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        if (mounted) setUser(null);
        return;
      }
      const u = data.user as unknown as UserProfile;
      if (mounted) {
        setUser(u);
        const meta = (u.user_metadata ?? {}) as Record<string, any>;
        const possibleAvatar =
          (meta.avatar_url as string) ?? (meta.picture as string) ?? (meta.avatar as string) ?? null;
        setAvatarUrl(possibleAvatar ?? null);
        const name = meta.name ?? meta.full_name ?? (u.email ? u.email.split("@")[0] : "");
        setDisplayName(name ?? null);
      }
    }
    fetchUser();

    // subscribe to auth changes so UI updates on sign-in/out
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      fetchUser();
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe?.();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    router.push("/");
  }

  // menu structure (you can extend these objects)
  const productItems = [
    { title: "AI Firewall", href: "/products/firewall", desc: "Protect your models & prompts" },
    { title: "Model Scanner", href: "/products/scanner", desc: "Integrity & signatures" },
  ];

  const developerItems = [
    { title: "API Reference", href: "/developers/api" },
    { title: "SDKs", href: "/developers/sdks" },
  ];

  const solutionItems = [
    { title: "Finance", href: "/solutions/finance" },
    { title: "Healthcare", href: "/solutions/healthcare" },
  ];

  // Helper to render dropdown content
  function MenuDropdown({ label, items }: { label: string; items: { title: string; href: string; desc?: string }[] }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center gap-1 text-sm font-medium hover:underline">
            {label} <ChevronDown className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {items.map((it) => (
            <DropdownMenuItem key={it.href} asChild>
              <Link href={it.href} className="flex flex-col">
                <span className="font-medium">{it.title}</span>
                {it.desc && <span className="text-xs text-slate-500">{it.desc}</span>}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <nav className="w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* left side: logo + desktop nav */}
          <div className="flex items-center gap-8 mx-5 h-8 cursor-pointer">
            <Link href="/" className="flex items-center gap-3">
              {/* Logo changes with theme */}
                {/* Light theme logo */}
                <img
                  src="/clight.png"
                  alt="Cencori Logo"
                  className=" object-contain block dark:hidden"
                  width={20}
                  height={20}
                />
                {/* Dark theme logo */}
                <img
                  src="/cdark.png"
                  alt="Cencori Logo (Dark)"
                  className=" object-contain hidden dark:block"
                  width={20}
                  height={20}
                />
            </Link>

            {/* Desktop menus - hidden on small screens */}
            <div className="hidden md:flex items-center gap-6">
              <MenuDropdown label="Products" items={productItems} />
              <MenuDropdown label="Developers" items={developerItems} />
              <MenuDropdown label="Solutions" items={solutionItems} />
              <Link href="/pricing" className="text-sm hover:underline">Pricing</Link>
              <Link href="/docs" className="text-sm hover:underline">Docs</Link>
              <Link href="/blog" className="text-sm hover:underline">Blog</Link>
            </div>
          </div>

          {/* right side: actions */}
          <div className="flex items-center gap-4">
            {/* Desktop auth buttons */}
            <div className="hidden md:flex items-center gap-3 mx-5 h-8 cursor-pointer">
              {!user ? (
                <>
                  <Link href="/login" className="text-sm">Sign in</Link>
                  <Link href="/signup">
                    <Button className="mx-5 h-8 cursor-pointer">Sign up</Button>
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/dashboard/organization">
                    <Button variant="outline">Dashboard</Button>
                  </Link>

                  {/* small avatar dropdown for account actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button aria-label="Account menu" className="ml-2">
                        <Avatar>
                          {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName ?? "avatar"} /> : <AvatarFallback>{(displayName ?? "U").slice(0,2).toUpperCase()}</AvatarFallback>}
                        </Avatar>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href="/dashboard/organization">Dashboard</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/account">Account settings</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/dashboard/organization?create=org">Create organization</Link>
                      </DropdownMenuItem>
                      <div className="border-t my-1" />
                      <DropdownMenuItem onSelect={() => void signOut()}>Log out</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>

            {/* Mobile: hamburger -> Sheet */}
            <div className="md:hidden flex items-center gap-2">
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <button className="p-2 rounded-md">
                    {/* avatar sits near the hamburger on mobile (if user present) */}
                    {user ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName ?? "avatar"} /> : <AvatarFallback>{(displayName ?? "U").slice(0,2).toUpperCase()}</AvatarFallback>}
                        </Avatar>
                        <MenuIcon className="h-5 w-5" />
                      </div>
                    ) : (
                      <MenuIcon className="h-6 w-6" />
                    )}
                  </button>
                </SheetTrigger>

                <SheetContent side="right" className="w-full sm:w-[420px]">
                  <SheetHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {/* small avatar */}
                        <Avatar className="h-8 w-8">
                          {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName ?? "avatar"} /> : <AvatarFallback>{(displayName ?? "U").slice(0,2).toUpperCase()}</AvatarFallback>}
                        </Avatar>
                      </div>
                    </div>
                  </SheetHeader>

                  <div className="mt-4 space-y-4">
                    {/* Menu links (stack) */}
                    <div className="space-y-2">
                      {/* Products accordion */}
                      <details className="rounded border p-3">
                        <summary className="flex items-center justify-between cursor-pointer">
                          <span>Products</span>
                          <ChevronDown className="h-4 w-4" />
                        </summary>
                        <div className="mt-2 space-y-1">
                          {productItems.map((it) => (
                            <Link key={it.href} href={it.href} className="block px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700">
                              <div className="text-sm font-medium">{it.title}</div>
                              {it.desc && <div className="text-xs text-slate-500">{it.desc}</div>}
                            </Link>
                          ))}
                        </div>
                      </details>

                      {/* Developers */}
                      <details className="rounded border p-3">
                        <summary className="flex items-center justify-between cursor-pointer">
                          <span>Developers</span>
                          <ChevronDown className="h-4 w-4" />
                        </summary>
                        <div className="mt-2 space-y-1">
                          {developerItems.map((it) => (
                            <Link key={it.href} href={it.href} className="block px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700">{it.title}</Link>
                          ))}
                        </div>
                      </details>

                      {/* Solutions */}
                      <details className="rounded border p-3">
                        <summary className="flex items-center justify-between cursor-pointer">
                          <span>Solutions</span>
                          <ChevronDown className="h-4 w-4" />
                        </summary>
                        <div className="mt-2 space-y-1">
                          {solutionItems.map((it) => (
                            <Link key={it.href} href={it.href} className="block px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700">{it.title}</Link>
                          ))}
                        </div>
                      </details>

                      <Link href="/pricing" className="block px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700">Pricing</Link>
                      <Link href="/docs" className="block px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700">Docs</Link>
                      <Link href="/blog" className="block px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700">Blog</Link>
                    </div>
                  </div>

                  {/* sheet footer - actions */}
                  <div className="mt-6 border-t pt-4 mr-4 ml-4">
                    {!user ? (
                      <div className="space-y-3">
                        <Link href="/login" className="block text-center py-2">Sign in</Link>
                        <Link href="/signup" className="block">
                          <Button className="w-full">Create account</Button>
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Link href="/dashboard/organization" className="block">
                          <Button className="w-full">Dashboard</Button>
                        </Link>
                        <Link href="/dashboard/organization?create=org" className="block px-3 py-2">Create organization</Link>
                        <Link href="/account" className="block px-3 py-2">Account settings</Link>
                        <button onClick={() => void signOut()} className="w-full text-left px-3 py-2">Log out</button>
                        <div className="h-px bg-slate-100 my-2" />
                        {/* other links can follow */}
                      </div>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
