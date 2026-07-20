"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const COOKIE_CONSENT_KEY = "cencori-cookie-consent";

type ConsentValue = "accepted" | "rejected" | null;

export function CookieConsent() {
    const [consent, setConsent] = useState<ConsentValue>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Check localStorage for existing consent
        const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
        if (stored === "accepted" || stored === "rejected") {
            setConsent(stored);
        } else {
            // Show banner after a short delay for better UX
            const timer = setTimeout(() => setIsVisible(true), 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
        setConsent("accepted");
        setIsVisible(false);

        // Enable analytics if needed
        if (typeof window !== "undefined" && (window as Window & { gtag?: (...args: unknown[]) => void }).gtag) {
            (window as Window & { gtag?: (...args: unknown[]) => void }).gtag?.("consent", "update", {
                analytics_storage: "granted",
            });
        }
    };

    const handleReject = () => {
        localStorage.setItem(COOKIE_CONSENT_KEY, "rejected");
        setConsent("rejected");
        setIsVisible(false);

        // Disable analytics
        if (typeof window !== "undefined" && (window as Window & { gtag?: (...args: unknown[]) => void }).gtag) {
            (window as Window & { gtag?: (...args: unknown[]) => void }).gtag?.("consent", "update", {
                analytics_storage: "denied",
            });
        }
    };

    // Don't render if consent already given
    if (consent !== null) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    data-cookie-consent
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:max-w-md z-50"
                >
                    <div className="bg-card border border-border/50 rounded-xl shadow-2xl p-5 backdrop-blur-sm">
                        <div className="flex items-start gap-4">
                            <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                                <Cookie className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-semibold mb-1">Cookie Preferences</h3>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    We use cookies to improve your experience and analyze site usage.{" "}
                                    <Link
                                        href="/privacy"
                                        className="text-primary hover:underline"
                                    >
                                        Learn more
                                    </Link>
                                </p>

                                <div className="flex items-center gap-2 mt-4">
                                    <Button
                                        size="sm"
                                        onClick={handleAccept}
                                        className="h-8 text-xs px-4"
                                    >
                                        Accept All
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={handleReject}
                                        className="h-8 text-xs px-4"
                                    >
                                        Reject
                                    </Button>
                                </div>
                            </div>
                            <button
                                onClick={handleReject}
                                className="p-1 rounded-md hover:bg-muted/50 transition-colors shrink-0"
                                aria-label="Close"
                            >
                                <X className="h-4 w-4 text-muted-foreground" />
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
