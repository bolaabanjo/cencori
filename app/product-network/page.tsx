import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function ProductNetworkPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Network: Threat Intelligence & Sharing</h1>
      <p className="text-zinc-400 mb-8">
        Short: Opt-in anonymized threat signal exchange across tenants.
      </p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">What it Does</h2>
        <p className="text-zinc-300 leading-relaxed">
          Cencori's Network feature facilitates an opt-in anonymized threat signal exchange across tenants. It aggregates patterns such as jailbreaks and exfiltration signatures into a shared signature library, delivering timely updates to tenant rule caches to enhance collective defense against emerging threats.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Key Features</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Shared signals feed, signature auto-push:</strong> Automatically receive and deploy the latest threat intelligence to protect your AI applications.</li>
          <li><strong className="text-white">Privacy-preserving aggregation and opt-in control:</strong> Contribute to collective security while maintaining full control over your data privacy.</li>
          <li><strong className="text-white">Premium curated threat bundles for industries:</strong> Access specialized threat intelligence tailored to specific industry risks and compliance needs.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Who Uses It</h2>
        <p className="text-zinc-300 leading-relaxed">
          Network is designed for enterprises and large platforms seeking a shared defense moat, enabling them to leverage collective threat intelligence for superior protection.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Primary Integration</h2>
        <ul className="list-disc list-inside text-zinc-300 leading-relaxed space-y-2">
          <li><strong className="text-white">Rule engine subscription, automated rule updates:</strong> Seamlessly integrate with Cencori's rule engine for continuous, automated threat intelligence updates.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Join the collective defense against AI threats.</h2>
        <p className="text-zinc-300 leading-relaxed">
          <Link href={siteConfig.links.getStartedUrl} className="text-blue-400 hover:underline">Get Started with Cencori Network</Link> today or <Link href="mailto:support@fohnai.com" className="text-blue-400 hover:underline">contact us</Link> for more information.
        </p>
      </section>
    </div>
  );
}
