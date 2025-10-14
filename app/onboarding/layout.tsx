// app/onboarding/layout.tsx
import React from "react";
import { ThemeToggle } from "@/components/theme-toggle"; // client component
import Image from "next/image";

export const metadata = {
  title: "Onboarding — Cencori",
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center gap-3 text-sm font-medium">
            <div className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-md">
              {/* small mark / logo */}
              <Image
                src="/cdark.png"
                alt="FohnAI logo"
                width={16}
                height={16}
                className="flex items-center gap-3"/>
            </div>
            <span className="hidden md:inline">Cencori</span>
          </a>
        </div>

        <div className="flex items-center gap-3">
          {/* ThemeToggle is a client component */}
          <ThemeToggle />
        </div>
      </header>

      <main className="p-8">
        {children}
      </main>
    </div>
  );
}
