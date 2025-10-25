import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function ShippedPage() {
  return (
    <div className="container mx-auto py-12 px-4 max_w_4xl">
      <h1 className="text-4xl font-bold mb-6">Shipped: Product Highlights & Features</h1>
      <p className="text-zinc-400 mb-8">
        Product highlights and major feature launches framed as “what&apos;s live”.
      </p>

      <section>
        <h2 className="text-2xl font-semibold mb-4">What&apos;s New</h2>
        <p className="text-zinc-300 leading-relaxed">
          Explore our latest features and product updates.
        </p>
      </section>
    </div>
  );
}
