// app/product-knight/page.tsx
"use client";

import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function ProductKnightPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Knight: Static & CI Scanning</h1>
      <p className="text-zinc-400 mb-8">
        Short: Build-time code and configuration scanner for “vibe-coded” apps and generated projects.
      </p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">What it Does</h2>
        <p className="text-zinc-300 leading-relaxed">
          Cencori's Knight feature provides a robust build-time code and configuration scanner. It runs in your CI/CD pipeline or as a pre-deploy hook to detect secrets, unsafe patterns, insecure network calls, and suspicious prompt templates, ensuring your AI-powered applications are secure from the ground up.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Key Features</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">AST-based secret detection, dependency SCA, CSP/CORS checks:</strong> Advanced scanning capabilities to identify a wide range of vulnerabilities and misconfigurations.</li>
          <li><strong className="text-white">GitHub Action + GitLab CI integration + PR annotations:</strong> Seamlessly integrate security scanning into your existing development workflows and receive direct feedback on pull requests.</li>
          <li><strong className="text-white">Preview deploy checks (Vercel Integration):</strong> Ensure that every deployment meets your security standards before it goes live.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Who Uses It</h2>
        <p className="text-zinc-300 leading-relaxed">
          Knight is invaluable for platforms, open-source generators, and any team deploying generated code, helping them maintain high security standards and prevent common pitfalls in AI application development.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Primary Integration</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">GitHub App, GitHub Action, Vercel pre-deploy step:</strong> Flexible integration options to fit your preferred development and deployment environment.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Secure your AI applications from build to deploy.</h2>
        <p className="text-zinc-300 leading-relaxed">
          <Link href={siteConfig.links.getStartedUrl} className="text-blue-400 hover:underline">Get Started with Cencori Knight</Link> today or <Link href="mailto:support@fohnai.com" className="text-blue-400 hover:underline">contact us</Link> for more information.
        </p>
      </section>
    </div>
  );
}
