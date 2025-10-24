// app/page.tsx
"use client";

import { Logo } from "@/components/logo";
import FooterSection from "@/components/sections/footer/default";
import Hero from "@/components/sections/hero/default";
import Navbar from "@/components/sections/navbar/default";
import { siteConfig } from "@/config/site";
import { ArrowRightIcon } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar
        logo={<Logo variant="mark" className="h-4" />}
        name="Cencori"
        homeUrl="/"
        mobileLinks={[
          { text: "Dashboard", href: "/dashboard/organizations" },
          { text: "Documentation", href: siteConfig.links.docs },
          { text: "GitHub", href: siteConfig.links.github },
        ]}
        actions={[
          { text: "Sign in", href: siteConfig.links.signInUrl, isButton: false },
          {
            text: "Get Started",
            href: siteConfig.links.getStartedUrl,
            isButton: true,
            variant: "default",
          },
        ]}
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
              { text: "About", href: "#" }, // Placeholder
              { text: "Careers", href: "#" }, // Placeholder
              { text: "Blog", href: "#" }, // Placeholder
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
          { text: "Privacy Policy", href: "#" }, // Placeholder
          { text: "Terms of Service", href: "#" }, // Placeholder
        ]}
        showModeToggle={true}
      />
    </div>
  );
}