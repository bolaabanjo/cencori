// app/product-ai/page.tsx
"use client";

import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function ProductAIPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">AI: Real-time Request/Response Protection</h1>
      <p className="text-zinc-400 mb-8">
        Short: Real-time request/response protection and policy enforcement for AI calls.
      </p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">What it Does</h2>
        <p className="text-zinc-300 leading-relaxed">
          Cencori&apos;s AI feature acts as the inline proxy between your applications and Large Language Models (LLMs). It inspects, redacts, sanitizes, or blocks content in real-time, returning a structured verdict and a trace ID for every interaction.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Key Features</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Request & response interception (/v1/protect):</strong> Transparently intercepts all AI calls to apply security and compliance policies.</li>
          <li><strong className="text-white">Rule engine (keyword, regex, pattern, threshold):</strong> Configurable rules to detect and act on sensitive data, malicious inputs, or policy violations.</li>
          <li><strong className="text-white">Redaction & sanitization actions (masking, truncation, rewrite):</strong> Automatically modifies content to remove sensitive information or undesirable patterns.</li>
          <li><strong className="text-white">Per-tenant policies and sensitivity profiles:</strong> Tailor security and data handling policies to individual organizations or projects.</li>
          <li><strong className="text-white">Low-latency mode for production use:</strong> Optimized for high-performance, real-time protection in demanding production environments.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Who Uses It</h2>
        <p className="text-zinc-300 leading-relaxed">
          This feature is ideal for developer teams, AI-first startups, and Small to Medium Businesses (SMBs) who need to secure their AI applications and ensure compliance.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Primary Integration</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">SDK (TypeScript):</strong> Easy integration into your application logic.</li>
          <li><strong className="text-white">Edge middleware:</strong> Deploy protection at the edge for minimal latency.</li>
          <li><strong className="text-white">Simple proxy swap:</strong> Quick integration by replacing your existing LLM proxy.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Ready to secure your AI interactions?</h2>
        <p className="text-zinc-300 leading-relaxed">
          <Link href={siteConfig.links.getStartedUrl} className="text-blue-400 hover:underline">Get Started with Cencori AI</Link> today or <Link href="mailto:support@fohnai.com" className="text-blue-400 hover:underline">contact us</Link> for more information.
        </p>
      </section>
    </div>
  );
}
