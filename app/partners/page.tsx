import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function PartnersPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Partners: Integrations & Collaborations</h1>
      <p className="text-zinc-400 mb-8">
        Integration partners, marketplace listings, platform partnerships.
      </p>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Become a Partner</h2>
        <p className="text-zinc-300 leading-relaxed">
          Interested in partnering with Cencori? <Link href="mailto:partnerships@fohnai.com" className="text-blue-400 hover:underline">Contact us</Link> to learn more about our partner programs.
        </p>
      </section>
    </div>
  );
}
