import Navbar from "@/components/landing/Navbar";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import Image from "next/image";

export default function BasecodePage() {
  return (
    <div className="marketing-theme dark relative isolate min-h-screen bg-[#0e1113] text-foreground">
      {/*
       * The terrain runs through next/image rather than as a CSS background so
       * it gets AVIF/WebP negotiation and, more importantly, a per-device
       * srcset — a phone needs roughly a 640px-wide crop of this, not the
       * desktop file. `objectPosition` reproduces the old `center 45%` crop:
       * the source is a tall portrait shot (sky on top, ridge around 40-55%,
       * rust trail below), and 45% keeps the ridge below the headline.
       */}
      <Image
        alt=""
        aria-hidden="true"
        className="-z-10 object-cover"
        fill
        priority
        quality={70}
        sizes="100vw"
        src="/basecode/terrain.jpg"
        style={{ objectPosition: "center 45%" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(180deg, rgba(10, 12, 14, 0.62) 0%, rgba(10, 12, 14, 0.34) 56%, rgba(10, 12, 14, 0.72) 100%)",
        }}
      />
      <Navbar
        homeUrl="/"
        className="border-b-0 bg-transparent backdrop-blur-none"
      />
      <main className="relative px-5 pb-16 pt-24 md:px-8 md:pt-28">
        <header className="mx-auto mb-6 max-w-4xl text-left md:mb-8">
          <p className="mb-5 flex items-center gap-2 text-lg font-semibold tracking-[-0.04em]">
            <Logo variant="mark" className="h-3.5" />
            Basecode
          </p>
          <h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-[-0.06em] sm:text-5xl md:text-6xl">
            Powerful coding agent for everyone, everywhere.
          </h1>
          <p className="mt-5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-white">
            Build something different
          </p>
          <Button
            asChild
            className="mt-7 h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90"
          >
            <a href="#download">Download for macOS</a>
          </Button>
        </header>
        <section className="mx-auto max-w-4xl overflow-hidden rounded-lg border border-white/15 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <Image
            alt="Basecode desktop workspace showing an agent task and code review"
            className="block h-auto w-full"
            height={2440}
            priority
            src="/basecode/desktop-preview-v2.png"
            width={3132}
          />
        </section>
      </main>
    </div>
  );
}
