"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import Link from "next/link";

const COOKIE_CONSENT_KEY = "cencori-cookie-consent";

type ConsentValue = "accepted" | "rejected" | null;

function updateGoogleConsent(value: Exclude<ConsentValue, null>) {
    if (typeof window === "undefined") return;

    const gtag = (window as Window & {
        gtag?: (...args: unknown[]) => void;
    }).gtag;

    gtag?.("consent", "update", {
        analytics_storage: value === "accepted" ? "granted" : "denied",
        ad_storage: value === "accepted" ? "granted" : "denied",
    });
}

export function CookieConsent() {
    const [consent, setConsent] = useState<ConsentValue>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(COOKIE_CONSENT_KEY);

        if (stored === "accepted" || stored === "rejected") {
            setConsent(stored);
            return;
        }

        const timer = window.setTimeout(() => setIsVisible(true), 1_500);
        return () => window.clearTimeout(timer);
    }, []);

    const saveConsent = (value: Exclude<ConsentValue, null>) => {
        localStorage.setItem(COOKIE_CONSENT_KEY, value);
        updateGoogleConsent(value);
        setConsent(value);
        setIsVisible(false);
    };

    if (consent !== null) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.aside
                    data-cookie-consent
                    aria-label="Cookie preferences"
                    initial={{ y: 40, opacity: 0, scale: 0.985 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: 28, opacity: 0, scale: 0.99 }}
                    transition={{ type: "spring", damping: 28, stiffness: 320 }}
                    className="fixed inset-x-4 bottom-4 z-[100] sm:left-auto sm:right-4 sm:w-[500px] sm:max-w-[calc(100vw-2rem)]"
                >
                    <div className="relative overflow-hidden rounded-[1.75rem] bg-[#191919]/[0.97] p-4 text-white shadow-[0_16px_48px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl">
                        <button
                            type="button"
                            onClick={() => saveConsent("rejected")}
                            aria-label="Reject optional cookies and close"
                            className="absolute right-2.5 top-2.5 flex size-7 items-center justify-center rounded-full text-white/50 transition-colors duration-200 hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                            <X className="size-3.5" strokeWidth={2} />
                        </button>

                        <div className="pr-6">
                            <p className="text-pretty text-[11px] font-medium leading-[1.05rem] tracking-[-0.005em] text-white/60 sm:text-xs sm:leading-[1.15rem]">
                                Essential cookies keep Cencori running. With your permission,
                                analytics cookies help us measure performance and improve the
                                product.
                            </p>
                            <p className="mt-1.5 text-[10px] leading-4 text-white/45">
                                <Link
                                    href="/privacy-policy#cookies"
                                    className="text-white/80 underline decoration-white/55 underline-offset-2 transition-colors hover:text-white focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                >
                                    Cookie Policy
                                </Link>
                                <span className="mx-1.5 text-white/25">·</span>
                                <Link
                                    href="/privacy-policy"
                                    className="text-white/80 underline decoration-white/55 underline-offset-2 transition-colors hover:text-white focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                >
                                    Privacy Policy
                                </Link>
                                <span className="mx-1.5 text-white/25">·</span>
                                <Link
                                    href="/terms-of-service"
                                    className="text-white/80 underline decoration-white/55 underline-offset-2 transition-colors hover:text-white focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                >
                                    Terms of Service
                                </Link>
                            </p>
                        </div>

                        <AnimatePresence initial={false}>
                            {showSettings && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                                    className="overflow-hidden"
                                >
                                    <div className="mt-3 border-y border-white/12 sm:grid sm:grid-cols-2 sm:divide-x sm:divide-white/12">
                                        <div className="flex items-center justify-between gap-3 border-b border-white/12 py-2.5 sm:border-b-0 sm:pr-4">
                                            <div>
                                                <p className="text-[11px] font-semibold text-white">Essential</p>
                                                <p className="text-[9px] leading-3.5 text-white/45">
                                                    Security and core site behavior.
                                                </p>
                                            </div>
                                            <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.12em] text-white/45">
                                                Always on
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between gap-3 py-2.5 sm:pl-4">
                                            <div>
                                                <p className="text-[11px] font-semibold text-white">Analytics</p>
                                                <p className="text-[9px] leading-3.5 text-white/45">
                                                    Usage and product improvement.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={analyticsEnabled}
                                                onClick={() => setAnalyticsEnabled((enabled) => !enabled)}
                                                className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                                                    analyticsEnabled
                                                        ? "border-white bg-white"
                                                        : "border-white/25 bg-white/8"
                                                }`}
                                            >
                                                <span
                                                    className={`absolute top-0.5 size-3.5 rounded-full transition-transform duration-200 ${
                                                        analyticsEnabled
                                                            ? "translate-x-[1.05rem] bg-black"
                                                            : "translate-x-0.5 bg-white/70"
                                                    }`}
                                                />
                                                <span className="sr-only">Allow analytics cookies</span>
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <button
                                type="button"
                                onClick={() => setShowSettings((visible) => !visible)}
                                className="h-8 rounded-full border border-white/20 px-3 text-[10px] font-semibold tracking-[-0.005em] text-white transition-colors duration-200 hover:border-white/40 hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:mr-auto"
                            >
                                {showSettings ? "Hide Settings" : "Cookie Settings"}
                            </button>

                            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                                <button
                                    type="button"
                                    onClick={() => saveConsent("rejected")}
                                    className="h-8 rounded-full bg-white px-3 text-[10px] font-semibold tracking-[-0.005em] text-black transition-[background-color,transform] duration-200 hover:bg-white/85 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#191919]"
                                >
                                    Reject All
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        saveConsent(
                                            showSettings && !analyticsEnabled
                                                ? "rejected"
                                                : "accepted"
                                        )
                                    }
                                    className="h-8 rounded-full bg-white px-3 text-[10px] font-semibold tracking-[-0.005em] text-black transition-[background-color,transform] duration-200 hover:bg-white/85 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#191919]"
                                >
                                    {showSettings ? "Save Choices" : "Accept All"}
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.aside>
            )}
        </AnimatePresence>
    );
}
