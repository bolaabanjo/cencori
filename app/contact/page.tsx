import React from 'react';
import Link from "next/link";
import { siteConfig } from "@/config/site";

export default function ContactPage() {
  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">Contact Us</h1>
      <p className="text-zinc-400 mb-8">
        Sales, partnerships, press, and general inquiries.
      </p>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Get in Touch</h2>
        <p className="text-zinc-300 leading-relaxed">
          For general inquiries, please email us at <Link href="mailto:info@fohnai.com" className="text-blue-400 hover:underline">info@fohnai.com</Link>.
        </p>
      </section>
    </div>
  );
}
