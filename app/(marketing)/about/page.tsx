import React from 'react';
import { Metadata } from 'next';
import Link from "next/link";

export const metadata: Metadata = {
  title: 'About | Cencori',
  description:
    'Cencori is a deep technology company building the computing infrastructure global AI runs on.',
};

export default function AboutPage() {
  return (
    <main className="container mx-auto py-32 px-6 max-w-2xl min-h-screen flex flex-col justify-center">
      <header className="mb-12 text-center sm:text-left">
        <h1 className="text-5xl sm:text-6xl font-serif italic font-normal tracking-tight">
          What is Cencori?
        </h1>
      </header>

      <div className="space-y-8 text-sm leading-relaxed text-muted-foreground selection:bg-purple-500/30 max-w-lg">
        <p className="text-foreground font-medium">
          Cencori is a deep technology company building the computing infrastructure global AI runs on.
        </p>

        <p>
          The company operates at the intersection of{' '}
          <span className="text-foreground">computing and artificial intelligence</span>, building the
          infrastructure required for AI to run reliably across companies, institutions, research
          environments, critical systems, and the physical world.
        </p>

        <p>
          Cencori&rsquo;s focus is computing: the systems that make AI possible to execute, operate,
          control, and scale. As AI becomes embedded across industries, economies, science,
          infrastructure, and everyday technology, Cencori is building the computing foundation
          beneath it.
        </p>

        <p className="text-foreground font-medium">
          Our mission is to make the infrastructure required to build and run AI accessible to
          everyone, everywhere.
        </p>

        <p>Put simply:</p>

        <p className="pt-4 text-foreground font-bold italic font-serif text-2xl">
          AI needs computing. Cencori provides it.
        </p>

        <p className="pt-12">
          <Link href="/contact" className="text-foreground underline underline-offset-4 hover:no-underline">
            Get in touch
          </Link>
          {' '}or read the{' '}
          <Link href="/manifesto" className="text-foreground underline underline-offset-4 hover:no-underline">
            manifesto
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
