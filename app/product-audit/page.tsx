// app/product-audit/page.tsx
"use client";

import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function ProductAuditPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Audit: Immutable Logs & Compliance</h1>
      <p className="text-zinc-400 mb-8">
        Short: Append-only audit trail of every AI interaction with exports for compliance.
      </p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">What it Does</h2>
        <p className="text-zinc-300 leading-relaxed">
          Cencori&apos;s Audit feature provides an append-only audit trail of every AI interaction within your infrastructure. It stores discovery metadata and the full decision lineage for each interaction, offering robust filtering, customizable retention policies, and comprehensive export capabilities for compliance and incident reporting.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Key Features</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Append-only logs with trace IDs:</strong> Ensures data integrity and provides a clear, immutable record of all AI interactions.</li>
          <li><strong className="text-white">Compliance exports (CSV/PDF) and incident reports:</strong> Generate necessary documentation for regulatory compliance and security incident analysis.</li>
          <li><strong className="text-white">Retention & redaction controls per org:</strong> Customize data retention periods and apply redaction rules based on organizational policies.</li>
          <li><strong className="text-white">Role-based access for auditors:</strong> Securely control who can access and review audit logs with granular permissions.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Who Uses It</h2>
        <p className="text-zinc-300 leading-relaxed">
          Audit is essential for regulated industries and enterprise security teams that require a verifiable and comprehensive record of AI activities for compliance and risk management.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Primary Integration</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Built into Protect:</strong> Seamlessly integrates with Cencori&apos;s AI protection features.</li>
          <li><strong className="text-white">Dashboard + API for exports:</strong> Access and manage audit logs directly through the Cencori dashboard or via dedicated APIs for programmatic access.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Ensure AI compliance and traceability.</h2>
        <p className="text-zinc-300 leading-relaxed">
          <Link href={siteConfig.links.getStartedUrl} className="text-blue-400 hover:underline">Get Started with Cencori Audit</Link> today or <Link href="mailto:support@fohnai.com" className="text-blue-400 hover:underline">contact us</Link> for more information.
        </p>
      </section>
    </div>
  );
}
