import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function BlogPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Blog: Product Updates & Deep Dives</h1>
      <p className="text-zinc-400 mb-8">
        Product updates, engineering deep dives, policy & safety essays, and weekly build logs.
      </p>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Stay Updated</h2>
        <p className="text-zinc-300 leading-relaxed">
          Check back soon for our latest articles and updates!
        </p>
      </section>
    </div>
  );
}
