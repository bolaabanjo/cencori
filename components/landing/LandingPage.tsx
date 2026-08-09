"use client";

import Navbar from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { SocialProof } from "@/components/landing/SocialProof";
import { GatewayWedge } from "@/components/landing/GatewayWedge";
import { LatestPosts } from "@/components/landing/LatestPosts";
import { BottomCTA } from "@/components/landing/BottomCTA";
import { Footer } from "@/components/landing/Footer";

export function LandingPage() {
  return (
    <div className="marketing-theme min-h-screen bg-background text-foreground selection:bg-foreground selection:text-background [--border:#b8b8b8] dark:[--border:#4a4a4a]">
      <Navbar homeUrl="/" />

      <main>
        <Hero />
        <SocialProof />
        <GatewayWedge />
        <LatestPosts />
        <BottomCTA />
      </main>

      <Footer />
    </div>
  );
}
