import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function CustomersPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Customers: Case Studies & Testimonials</h1>
      <p className="text-zinc-400 mb-8">
        Case studies, logos, testimonials, and metrics.
      </p>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Our Valued Customers</h2>
        <p className="text-zinc-300 leading-relaxed">
          See how Cencori helps leading companies build, deploy, and scale AI-driven applications.
        </p>
      </section>
    </div>
  );
}
