// app/product-sandbox/page.tsx
"use client";

import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function ProductSandboxPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Sandbox: Safe Execution Environment</h1>
      <p className="text-zinc-400 mb-8">
        Short: Hardened runtime for executing AI-generated code or scripts safely.
      </p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">What it Does</h2>
        <p className="text-zinc-300 leading-relaxed">
          Cencori's Sandbox provides a hardened runtime for safely executing AI-generated code or scripts. It runs generated code (Python/SQL/JS) in an isolated container with strict resource and network policies, ensuring deterministic outputs and comprehensive logs, preventing any malicious code from impacting your systems.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Key Features</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Network-blocked sandboxes with time/resource caps:</strong> Execute code in a completely isolated environment with predefined limits on execution time and resource consumption.</li>
          <li><strong className="text-white">Safe I/O, monitored filesystem, forbids shell escapes:</strong> Strict controls prevent unauthorized file access, system commands, or external communication.</li>
          <li><strong className="text-white">Replayable executions and audit trail:</strong> Every execution is recorded and can be replayed, providing full traceability and auditing capabilities.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Who Uses It</h2>
        <p className="text-zinc-300 leading-relaxed">
          Sandbox is crucial for products that execute model-generated code, such as analytics UIs, automation platforms, or any application where untrusted code execution needs to be managed securely.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Primary Integration</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Remote execution API + webhooks:</strong> Easily integrate sandbox capabilities into your applications via a powerful API and receive real-time updates through webhooks.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Ensure safe execution of AI-generated code.</h2>
        <p className="text-zinc-300 leading-relaxed">
          <Link href={siteConfig.links.getStartedUrl} className="text-blue-400 hover:underline">Get Started with Cencori Sandbox</Link> today or <Link href="mailto:support@fohnai.com" className="text-blue-400 hover:underline">contact us</Link> for more information.
        </p>
      </section>
    </div>
  );
}
