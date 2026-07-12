"use client";

import { Button } from "@/components/ui/button";
import { Download, Check, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Footer } from "@/components/landing/Footer";

export default function BrandPageContent() {
    return (
        <>
            <main className="container mx-auto max-w-6xl pt-24 pb-32 md:pb-32 px-4 flex flex-col items-center justify-center relative z-10">

                {/* Announcement Badge */}
                <div className="mb-8 animate-appear flex flex-col items-center">
                    <div className="inline-flex items-center rounded-full border border-border bg-muted/50 px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                        <span className="flex h-2 w-2 rounded-full bg-purple-500 mr-2 animate-pulse" />
                        <span className="mr-2">Official Assets</span>
                    </div>
                </div>

                {/* Title */}
                <div className="mb-16 animate-appear flex flex-col items-center gap-2 [animation-delay:100ms]">
                    <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-center max-w-3xl text-slate-50">
                        Brand Assets
                    </h1>
                    <p className="text-base sm:text-lg text-zinc-400 text-center max-w-xl">
                        Download official Cencori logos, icons, and brand guidelines.
                    </p>
                </div>

                {/* Logo Section */}
                <section className="w-full animate-appear [animation-delay:200ms] space-y-8">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold mb-2">Logos</h2>
                        <p className="text-sm text-zinc-400">Primary logo variations for web, print, and presentations.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {logos.map((logo, i) => (
                            <BrandCard key={i} {...logo} />
                        ))}
                    </div>
                </section>

                {/* Icon Section */}
                <section className="w-full mt-24 animate-appear [animation-delay:400ms] space-y-8">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold mb-2">Icons</h2>
                        <p className="text-sm text-zinc-400">Standalone icons for app icons, badges, and small UI spaces.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {icons.map((icon, i) => (
                            <BrandCard key={i} {...icon} />
                        ))}
                    </div>
                </section>

                {/* Wallpapers Section */}
                <section className="w-full mt-24 animate-appear [animation-delay:500ms] space-y-8">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold mb-2">Wallpapers</h2>
                        <p className="text-sm text-zinc-400">Desktop and mobile wallpapers featuring the Cencori brand.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {wallpapers.map((wp, i) => (
                            <BrandCard key={i} {...wp} />
                        ))}
                    </div>
                </section>

                {/* Guidelines */}
                <section className="w-full mt-24 animate-appear [animation-delay:600ms]">
                    <div className="rounded-xl border border-border/60 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 p-8 sm:p-12 flex flex-col items-center text-center">
                        <h2 className="text-2xl font-bold mb-4">Brand Guidelines</h2>
                        <p className="text-sm text-zinc-400 max-w-xl mb-6">
                            Our comprehensive brand guidelines cover logo usage, color palette, typography, tone of voice, and more.
                        </p>
                        <Button variant="default" size="lg" asChild>
                            <a href="/brand-guidelines.pdf" download>
                                <Download className="mr-2 h-4 w-4" />
                                Download Guidelines
                            </a>
                        </Button>
                    </div>
                </section>
            </main>

            <Footer />
        </>
    );
}

type BrandItem = {
    title: string;
    preview: string;
    src: string;
    format: string;
};

const logos: BrandItem[] = [
    {
        title: "Cencori Logo — Light",
        preview: "/brand/cencori-logo-light.svg",
        src: "/brand/cencori-logo-light.svg",
        format: "SVG",
    },
    {
        title: "Cencori Logo — Dark",
        preview: "/brand/cencori-logo-dark.svg",
        src: "/brand/cencori-logo-dark.svg",
        format: "SVG",
    },
    {
        title: "Cencori Logo — Symbol",
        preview: "/brand/cencori-symbol.svg",
        src: "/brand/cencori-symbol.svg",
        format: "SVG",
    },
    {
        title: "Cencori Logo — Light PNG",
        preview: "/brand/cencori-logo-light.png",
        src: "/brand/cencori-logo-light.png",
        format: "PNG",
    },
    {
        title: "Cencori Logo — Dark PNG",
        preview: "/brand/cencori-logo-dark.png",
        src: "/brand/cencori-logo-dark.png",
        format: "PNG",
    },
    {
        title: "Cencori Logo — Symbol PNG",
        preview: "/brand/cencori-symbol.png",
        src: "/brand/cencori-symbol.png",
        format: "PNG",
    },
];

const icons: BrandItem[] = [
    {
        title: "Cencori Icon — Light",
        preview: "/brand/cencori-icon-light.svg",
        src: "/brand/cencori-icon-light.svg",
        format: "SVG",
    },
    {
        title: "Cencori Icon — Dark",
        preview: "/brand/cencori-icon-dark.svg",
        src: "/brand/cencori-icon-dark.svg",
        format: "SVG",
    },
    {
        title: "Cencori Icon — Light PNG",
        preview: "/brand/cencori-icon-light.png",
        src: "/brand/cencori-icon-light.png",
        format: "PNG",
    },
    {
        title: "Cencori Icon — Dark PNG",
        preview: "/brand/cencori-icon-dark.png",
        src: "/brand/cencori-icon-dark.png",
        format: "PNG",
    },
];

const wallpapers: BrandItem[] = [
    {
        title: "Desktop Wallpaper — Dark",
        preview: "/brand/wallpaper-desktop-dark.png",
        src: "/brand/wallpaper-desktop-dark.png",
        format: "PNG",
    },
    {
        title: "Desktop Wallpaper — Light",
        preview: "/brand/wallpaper-desktop-light.png",
        src: "/brand/wallpaper-desktop-light.png",
        format: "PNG",
    },
    {
        title: "Mobile Wallpaper — Dark",
        preview: "/brand/wallpaper-mobile-dark.png",
        src: "/brand/wallpaper-mobile-dark.png",
        format: "PNG",
    },
    {
        title: "Mobile Wallpaper — Light",
        preview: "/brand/wallpaper-mobile-light.png",
        src: "/brand/wallpaper-mobile-light.png",
        format: "PNG",
    },
];

function BrandCard({ title, preview, src, format }: BrandItem) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            // Fetch the image as a blob
            const response = await fetch(src);
            const blob = await response.blob();

            await navigator.clipboard.write([
                new ClipboardItem({ [blob.type]: blob }),
            ]);

            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Fallback: copy the URL
            try {
                await navigator.clipboard.writeText(src);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            } catch {
                // silently fail
            }
        }
    };

    return (
        <div className="group relative rounded-xl border border-border/40 bg-card overflow-hidden transition-all duration-300 hover:border-border/80 hover:shadow-lg">
            <div className="aspect-[4/3] relative bg-gradient-to-br from-zinc-900 to-zinc-950 p-8 flex items-center justify-center">
                <Image
                    src={preview}
                    alt={title}
                    width={320}
                    height={240}
                    className="max-w-full max-h-full object-contain"
                />
            </div>
            <div className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{format}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                    >
                        {copied ? (
                            <>
                                <Check className="w-3 h-3" />
                                Copied
                            </>
                        ) : (
                            <>
                                <Download className="w-3 h-3" />
                                Copy
                            </>
                        )}
                    </button>
                    <Link
                        href={src}
                        download
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                        <Download className="w-3 h-3" />
                        Download
                    </Link>
                </div>
            </div>
        </div>
    );
}
