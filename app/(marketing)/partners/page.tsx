"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Reveal } from "@/components/landing/Reveal";
import { partners } from "@/config/partners";
import { Search, Filter, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PartnersIndexPage() {
    const [searchQuery, setSearchQuery] = useState("");
    
    // For now, let's just use the partners from config
    const partnerList = Object.values(partners);
    
    const filteredPartners = partnerList.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const navActions = [
        { text: "Sign in", href: "/login", isButton: false },
        { text: "Get Started", href: "/signup", isButton: true, variant: "default" as const },
    ];

    return (
      <main className="pt-32 pb-24">
                <div className="mx-auto max-w-6xl px-4 md:px-6">
                    {/* Header */}
                    <div className="mb-20">
                        <Reveal>
                            <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-muted-foreground mb-8">
                                Ecosystem
                            </p>
                        </Reveal>
                        <Reveal delay={0.05}>
                            <h1 className="text-[2.75rem] sm:text-[4rem] font-semibold tracking-[-0.04em] leading-[1.05] mb-8">
                                Find a Partner
                            </h1>
                        </Reveal>
                        <Reveal delay={0.1}>
                            <p className="text-base sm:text-lg text-muted-foreground leading-[1.7] max-w-xl mb-12">
                                Discover the tools, platforms, and teams that integrate with Cencori to help you ship AI applications faster.
                            </p>
                        </Reveal>
                        
                        <Reveal delay={0.15}>
                            <div className="flex flex-col sm:flex-row gap-4 items-center">
                                <div className="relative w-full max-w-md">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <input 
                                        type="text"
                                        placeholder="Search partners..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-foreground/[0.02] border border-border/40 rounded-none px-10 py-2.5 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                                    />
                                </div>
                                <Button variant="outline" size="sm" className="h-10 px-4 rounded-none border-border/40 hidden sm:flex">
                                    <Filter className="h-3.5 w-3.5 mr-2" />
                                    Categories
                                </Button>
                            </div>
                        </Reveal>
                    </div>

                    {/* Partners Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border/20 border border-border/20">
                        {filteredPartners.length > 0 ? (
                            filteredPartners.map((partner, i) => (
                                <Reveal key={partner.slug} delay={i * 0.05}>
                                    <Link 
                                        href={`/partners/${partner.slug}`}
                                        className="group relative bg-background p-8 hover:bg-foreground/[0.01] transition-colors h-full flex flex-col"
                                    >
                                        <div className="flex justify-between items-start mb-12">
                                            <div className="h-10 w-10 text-foreground group-hover:scale-110 transition-transform duration-500 flex items-center justify-center">
                                                {partner.logo ? (
                                                    <partner.logo className="h-full w-full object-contain" />
                                                ) : (
                                                    <div className="h-full w-full bg-foreground/5" />
                                                )}
                                            </div>
                                            <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                                        </div>
                                        <h3 className="text-lg font-medium mb-3">{partner.name}</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                                            {partner.hero.subtitle}
                                        </p>
                                    </Link>
                                </Reveal>
                            ))
                        ) : (
                            <div className="col-span-full py-32 text-center bg-background">
                                <p className="text-sm text-muted-foreground italic">No partners found matching "{searchQuery}"</p>
                                <p className="text-xs text-muted-foreground/60 mt-2">Try searching for "Cursor" or "Claude" (once they're added)</p>
                            </div>
                        )}
                        
                        {/* Empty/Placeholder slots for "Become a partner" */}
                        <Reveal delay={0.2}>
                            <Link 
                                href="/contact"
                                className="group relative bg-foreground/[0.01] p-8 hover:bg-foreground/[0.02] transition-colors h-full flex flex-col border-2 border-dashed border-border/20"
                            >
                                <div className="mt-auto">
                                    <h3 className="text-lg font-medium mb-3">Become a Partner</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                                        Integrate your tool with Cencori and reach thousands of AI engineers.
                                    </p>
                                    <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-500 group-hover:underline">Get in touch &rarr;</span>
                                </div>
                            </Link>
                        </Reveal>
                    </div>
                </div>
            </main>
    );
}
