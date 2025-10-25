import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function CareersPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Careers: Join Our Team</h1>
      <p className="text-zinc-400 mb-8">
        Open roles, benefits, hiring philosophy, and how to apply.
      </p>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Current Openings</h2>
        <p className="text-zinc-300 leading-relaxed">
          We are always looking for talented individuals to join our growing team. Visit our <Link href="#" className="text-blue-400 hover:underline">Job Board</Link> to see current openings.
        </p>
      </section>
    </div>
  );
}
