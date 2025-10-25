import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function ProductDeveloperToolsPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Developer Tools: SDKs, CLI & Docs</h1>
      <p className="text-zinc-400 mb-8">
        Short: SDKs, CLI tooling, and ready-made templates to make integration frictionless.
      </p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">What it Does</h2>
        <p className="text-zinc-300 leading-relaxed">
          Cencori&apos;s Developer Tools provide a comprehensive suite of resources, including SDKs, CLI tooling, and ready-made templates, designed to make integration frictionless. With SDKs in TypeScript and Python, a powerful CLI for scans, a robust webhook reference implementation, and a clear OpenAPI specification, developers can quickly and efficiently integrate Cencori into their projects.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Key Features</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">TypeScript SDK (init + protect call):</strong> Simplify AI protection integration into your TypeScript applications with an intuitive SDK.</li>
          <li><strong className="text-white">GitHub Action and Terraform provider examples:</strong> Automate security checks within your CI/CD pipelines and infrastructure-as-code deployments.</li>
          <li><strong className="text-white">Comprehensive API docs, quickstart repo templates:</strong> Get started quickly with detailed documentation, API references, and ready-to-use project templates.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Who Uses It</h2>
        <p className="text-zinc-300 leading-relaxed">
          Developer Tools are essential for developers, platform engineers, and DevOps teams who want to seamlessly integrate Cencori&apos;s advanced AI security capabilities into their workflows and applications.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Primary Integration</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">SDKs (TypeScript, Python), CLI, OpenAPI spec, Webhooks:</strong> Comprehensive tools for flexible integration across various development environments and use cases.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Empower your development with Cencori&apos;s robust tools.</h2>
        <p className="text-zinc-300 leading-relaxed">
          <Link href={siteConfig.links.getStartedUrl} className="text-blue-400 hover:underline">Get Started with Cencori Developer Tools</Link> today or <Link href="mailto:support@fohnai.com" className="text-blue-400 hover:underline">contact us</Link> for more information.
        </p>
      </section>
    </div>
  );
} 
