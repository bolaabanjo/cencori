"use client";

import { useEffect, useRef } from "react";
import { sileo } from "sileo";
import { WifiOff, Wifi } from "lucide-react";

/**
 * Global connection monitor. When the browser goes offline it raises a single
 * persistent, morphing toast instead of letting failed fetches tear the
 * dashboard down to a 404. The toast is compact by default and expands on
 * hover to reveal the full explanation. When the connection returns it is
 * dismissed and replaced with a brief "Back online" confirmation.
 *
 * Nothing on the current page unmounts or navigates — the user keeps exactly
 * what they were looking at; data simply refetches once connectivity is back.
 */
export function ConnectivityWatcher() {
    // Holds the id of the active offline toast so we can dismiss it precisely.
    const offlineToastId = useRef<string | null>(null);
    // Tracks whether we were offline, so "Back online" only fires after a real drop.
    const wasOffline = useRef(false);

    useEffect(() => {
        const showOffline = () => {
            if (offlineToastId.current) return; // already showing
            wasOffline.current = true;
            offlineToastId.current = sileo.warning({
                title: "You're offline",
                type: "warning",
                duration: null, // persist until the connection returns
                icon: <WifiOff className="h-4 w-4" />,
                description: (
                    <div className="group cursor-default">
                        <span>Connection lost — nothing was lost with it.</span>
                        {/* grid-rows 0fr → 1fr animates height smoothly on hover */}
                        <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out group-hover:grid-rows-[1fr]">
                            <div className="overflow-hidden">
                                <p className="pt-1.5 text-[12px] leading-5 text-muted-foreground">
                                    We can&apos;t reach Cencori&apos;s servers right now. Everything you
                                    were viewing is still on screen — it&apos;ll refresh automatically the
                                    moment you&apos;re reconnected. Check your Wi-Fi or network connection
                                    and try again.
                                </p>
                            </div>
                        </div>
                    </div>
                ),
            });
        };

        const showOnline = () => {
            if (offlineToastId.current) {
                sileo.dismiss(offlineToastId.current);
                offlineToastId.current = null;
            }
            if (wasOffline.current) {
                wasOffline.current = false;
                sileo.success({
                    title: "Back online",
                    type: "success",
                    duration: 3000,
                    icon: <Wifi className="h-4 w-4" />,
                    description: "Connection restored. Your dashboard is up to date.",
                });
            }
        };

        // Reflect the state we booted in (e.g. page opened while already offline).
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
            showOffline();
        }

        window.addEventListener("offline", showOffline);
        window.addEventListener("online", showOnline);
        return () => {
            window.removeEventListener("offline", showOffline);
            window.removeEventListener("online", showOnline);
        };
    }, []);

    return null;
}
