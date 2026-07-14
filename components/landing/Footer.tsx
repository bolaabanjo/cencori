import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { siteConfig } from "@/config/site";
import { NewsletterForm } from "@/components/landing/NewsletterForm";

const footerProductLinks: { title: string; href: string; external?: boolean }[] = [
    { title: "AI Gateway", href: siteConfig.links.products.aiGateway },
    { title: "Models", href: siteConfig.links.products.models },
    { title: "Audit Logs", href: siteConfig.links.products.audit },
    { title: "Observability", href: siteConfig.links.products.insights },
    { title: "Scan", href: siteConfig.links.products.scan },
    { title: "Compare Cencori", href: "/compare" },
];

export const Footer = () => {
    return (
        <footer className="bg-background border-t border-border/30 pt-8 pb-4">
            <div className="max-w-screen-xl mx-auto px-4 md:px-6">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-6 mb-6">

                    {/* Brand + Newsletter */}
                    <div className="col-span-2 md:col-span-2 md:pr-6">
                        <Link href="/" className="flex items-center gap-1.5 mb-3">
                            <Logo variant="mark" className="h-4 w-4" />
                        </Link>
                        <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                            The AI cloud infrastructure to ship AI.
                        </p>
                        {/* Newsletter */}
                        <div className="max-w-xs">
                            <h4 className="text-[10px] font-medium uppercase tracking-wider mb-2">Newsletter</h4>
                            <NewsletterForm />
                            <p className="text-[10px] text-muted-foreground/60 mt-1.5 leading-relaxed">
                                Product updates and security research. Unsubscribe in one click.
                            </p>
                        </div>
                        <div className="flex items-center gap-3 mt-8">
                            <Link href={siteConfig.links.github} className="text-muted-foreground/50 hover:text-foreground transition-colors">
                                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                </svg>
                            </Link>
                            <Link href={siteConfig.links.x} className="text-muted-foreground/50 hover:text-foreground transition-colors">
                                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                </svg>
                            </Link>
                            <a href={siteConfig.links.youtube} target="_blank" rel="noopener noreferrer" className="text-muted-foreground/50 hover:text-foreground transition-colors" aria-label="YouTube">
                                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                                    <path d="M23.498 6.186a2.997 2.997 0 0 0-2.11-2.12C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.388.566a2.997 2.997 0 0 0-2.11 2.12C0 8.079 0 12 0 12s0 3.921.502 5.814a2.997 2.997 0 0 0 2.11 2.12C4.495 20.5 12 20.5 12 20.5s7.505 0 9.388-.566a2.997 2.997 0 0 0 2.11-2.12C24 15.921 24 12 24 12s0-3.921-.502-5.814ZM9.75 15.568V8.432L16.02 12 9.75 15.568Z" />
                                </svg>
                            </a>
                            <a href={siteConfig.links.discord} target="_blank" rel="noopener noreferrer" className="text-muted-foreground/50 hover:text-foreground transition-colors" aria-label="Discord">
                                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.069.069 0 0 0-.032.027C.533 9.048-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.23 10.23 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                                </svg>
                            </a>
                            <a href="https://linkedin.com/company/cencori" target="_blank" rel="noopener noreferrer" className="text-muted-foreground/50 hover:text-foreground transition-colors">
                                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                </svg>
                            </a>
                        </div>
                    </div>

                    {/* Product Links */}
                    <div>
                        <h4 className="text-[10px] font-medium uppercase tracking-wider mb-3">Product</h4>
                        <ul className="space-y-1.5">
                            {footerProductLinks.map((link) => (
                                <li key={link.title}>
                                    {link.external ? (
                                        <a
                                            href={link.href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {link.title}
                                        </a>
                                    ) : (
                                        <Link href={link.href} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                                            {link.title}
                                        </Link>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Resources Links */}
                    <div>
                        <h4 className="text-[10px] font-medium uppercase tracking-wider mb-3">Resources</h4>
                        <ul className="space-y-1.5">
                            <li><Link href="/playground" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Playground</Link></li>
                            <li><Link href="/docs" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Documentation</Link></li>
                            <li><Link href="/docs/api/metrics" className="text-xs text-muted-foreground hover:text-foreground transition-colors">API Reference</Link></li>
                            <li><Link href="/academy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Academy</Link></li>
                            <li><Link href={siteConfig.links.company.newsletter} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Newsletter</Link></li>
                            <li><Link href="/llm.txt" className="text-xs text-muted-foreground hover:text-foreground transition-colors">llm.txt</Link></li>
                            <li><Link href="/examples" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Examples</Link></li>
                            <li><Link href="/design" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Design System</Link></li>
                            <li><Link href="/brand" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Brand Assets</Link></li>
                            <li><Link href="/blog" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Blog</Link></li>
                            <li><a href={siteConfig.links.status} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Status</a></li>
                        </ul>
                    </div>

                    {/* Company Links */}
                    <div>
                        <h4 className="text-[10px] font-medium uppercase tracking-wider mb-3">Company</h4>
                        <ul className="space-y-1.5">
                            <li><Link href="/about" className="text-xs text-muted-foreground hover:text-foreground transition-colors">About</Link></li>
                            <li><Link href="/manifesto" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Manifesto</Link></li>
                            <li><Link href="/careers" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Careers</Link></li>
                            <li><Link href="/contact" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Contact</Link></li>
                            <li><Link href="/partners" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Partners</Link></li>
                        </ul>
                    </div>

                    {/* Legal */}
                    <div>
                        <h4 className="text-[10px] font-medium uppercase tracking-wider mb-3">Legal</h4>
                        <ul className="space-y-1.5">
                            <li><Link href="/privacy-policy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</Link></li>
                            <li><Link href="/terms-of-service" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</Link></li>
                        </ul>
                    </div>
                </div>

                <div className="border-t border-border/20 pt-4 flex items-center justify-between mb-6">
                    <div className="text-[10px] text-muted-foreground/50">
                        © 2026 Cencori Inc.
                    </div>
                    <ThemeSwitcher />
                </div>
            </div>
        </footer>
    );
};
