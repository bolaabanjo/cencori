import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function AboutPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">About Cencori</h1>
      <p className="text-zinc-400 mb-8">
        Company mission, leadership bios, high-level vision.
      </p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Our Mission</h2>
        <p className="text-zinc-300 leading-relaxed">
          Cencori is a multi-tenant AI infrastructure platform designed to help teams build, deploy, and scale AI-driven applications with consistency and reliability.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Our Vision</h2>
        <p className="text-zinc-300 leading-relaxed">
          To unify how developers create, protect, and scale AI systems across different use cases, ranging from experimental prototypes to enterprise-grade solutions.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Learn more about us.</h2>
        <p className="text-zinc-300 leading-relaxed">
          <Link href={siteConfig.links.getStartedUrl} className="text-blue-400 hover:underline">Get Started with Cencori</Link> today or <Link href="mailto:support@fohnai.com" className="text-blue-400 hover:underline">contact us</Link> for more information.
        </p>
      </section>
    </div>
  );
}
