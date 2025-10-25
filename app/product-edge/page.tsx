import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function ProductEdgePage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Edge: Platform Integrations & Edge Middleware</h1>
      <p className="text-zinc-400 mb-8">
        Short: Pre-built integrations and middleware for platforms like Vercel, Supabase, and edge runtimes.
      </p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">What it Does</h2>
        <p className="text-zinc-300 leading-relaxed">
          Cencori&apos;s Edge feature provides pre-built integrations and middleware for leading platforms such as Vercel and Supabase, as well as various edge runtimes. It offers one-click installs, ready-to-use Edge Middleware snippets, and integration manifests, enabling platform users to activate Cencori Protect capabilities without extensive engineering efforts.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Key Features</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Vercel Integration (preview checks + edge protection):</strong> Seamlessly integrate Cencori&apos;s protection into your Vercel deployments, including preview checks and edge-level security.</li>
          <li><strong className="text-white">Supabase extension for edge functions routing:</strong> Extend Supabase capabilities with Cencori&apos;s edge function routing for enhanced security and performance.</li>
          <li><strong className="text-white">Browser/IDE plugins for pre-deploy checks (Cursor/VSCode):</strong> Get real-time security feedback directly within your development environment before deployment.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Who Uses It</h2>
        <p className="text-zinc-300 leading-relaxed">
          Edge is ideal for platform marketplaces and developer product teams looking to offer robust AI security integrations to their users with minimal friction.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Primary Integration</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Marketplace listing + installation flow:</strong> Easily discover and install Cencori integrations directly from platform marketplaces.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Accelerate your AI security with seamless integrations.</h2>
        <p className="text-zinc-300 leading-relaxed">
          <Link href={siteConfig.links.getStartedUrl} className="text-blue-400 hover:underline">Get Started with Cencori Edge</Link> today or <Link href="mailto:support@fohnai.com" className="text-blue-400 hover:underline">contact us</Link> for more information.
        </p>
      </section>
    </div>
  );
}
