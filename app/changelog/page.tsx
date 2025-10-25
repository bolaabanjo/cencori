import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function ChangelogPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Changelog: Product & Platform Release Notes</h1>
      <p className="text-zinc-400 mb-8">
        Succinct entries, date-stamped, linked to PRs or docs.
      </p>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Latest Updates</h2>
        <p className="text-zinc-300 leading-relaxed">
          Stay tuned for our latest product and platform updates.
        </p>
      </section>
    </div>
  );
}
