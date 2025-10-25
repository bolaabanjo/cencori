import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function ProductEnterprisePage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Enterprise: Dedicated Deployments & Compliance</h1>
      <p className="text-zinc-400 mb-8">
        Short: Dedicated deployments and compliance controls for enterprise customers.
      </p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">What it Does</h2>
        <p className="text-zinc-300 leading-relaxed">
          Cencori&apos;s Enterprise offering provides dedicated deployments and comprehensive compliance controls for large organizations. It allows Cencori to run within customer Virtual Private Clouds (VPCs) or data centers, offering features like Single Sign-On (SSO), System for Cross-domain Identity Management (SCIM), dedicated Service Level Agreements (SLAs), SOC2 artifacts, and tailored legal agreements to meet stringent enterprise requirements.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Key Features</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">On-prem deployment, VPC peering, private model routing:</strong> Deploy Cencori directly within your infrastructure for maximum control and data residency.</li>
          <li><strong className="text-white">SSO/SCIM, audit exports, data residency options:</strong> Integrate with existing identity management systems, export audit data for compliance, and control where your data resides.</li>
          <li><strong className="text-white">Dedicated support, onboarding, and customization:</strong> Receive personalized assistance, streamlined onboarding, and custom solutions tailored to your enterprise needs.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Who Uses It</h2>
        <p className="text-zinc-300 leading-relaxed">
          Enterprise solutions are critical for banks, healthcare providers, government agencies, and large cloud platforms that require robust security, compliance, and dedicated infrastructure for their AI operations.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Primary Integration</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Professional services + deployment automation:</strong> Leverage expert professional services and advanced deployment automation to ensure a smooth and secure integration of Cencori into your enterprise environment.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Power your enterprise AI with unparalleled security and compliance.</h2>
        <p className="text-zinc-300 leading-relaxed">
          <Link href={siteConfig.links.getStartedUrl} className="text-blue-400 hover:underline">Get Started with Cencori Enterprise</Link> today or <Link href="mailto:support@fohnai.com" className="text-blue-400 hover:underline">contact us</Link> for more information.
        </p>
      </section>
    </div>
  );
}
