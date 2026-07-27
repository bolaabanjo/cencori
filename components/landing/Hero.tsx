"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";

// Global AI requests generated per day benchmark across all models/agents/users
const ESTIMATED_GLOBAL_REQUESTS_PER_DAY = 2000000000; // 2 Billion requests/day
const GLOBAL_REQUESTS_PER_SECOND = ESTIMATED_GLOBAL_REQUESTS_PER_DAY / 86400; // ~23,148.15

// Ground-truth baseline starting date for the Platform's cumulative intelligence timeline
// (Feb 1, 2026 00:00:00 UTC)
const LAUNCH_TIMESTAMP = 1770249600000;

export const Hero = () => {
  const { isAuthenticated } = useAuth();
  
  const [cencoriRequests, setCencoriRequests] = useState<number>(0);
  const [cumulativeGlobalRequests, setCumulativeGlobalRequests] = useState<number>(0);
  
  const requestRef = useRef<number | null>(null);

  // Fetch true, raw cumulative Cencori database counts in real-time
  useEffect(() => {
    const fetchRealMetrics = async () => {
      try {
        const res = await fetch("/api/v1/public-metrics");
        const json = await res.json();
        if (json.success && json.metrics) {
          setCencoriRequests(json.metrics.totalRequests);
        }
      } catch (err) {
        console.error("Failed to load real database metrics:", err);
      }
    };

    fetchRealMetrics();
    const interval = setInterval(fetchRealMetrics, 10000); // Re-sync ground-truth baseline every 10s
    return () => clearInterval(interval);
  }, []);

  // Compute smooth cumulative global baseline expansion on the fly (millisecond resolution)
  useEffect(() => {
    const updateTick = () => {
      const now = Date.now();
      const elapsedMsSinceLaunch = Math.max(0, now - LAUNCH_TIMESTAMP);
      const elapsedSeconds = elapsedMsSinceLaunch / 1000;

      // Extrapolate global denominator
      const currentGlobalRequests = elapsedSeconds * GLOBAL_REQUESTS_PER_SECOND;
      setCumulativeGlobalRequests(currentGlobalRequests);

      requestRef.current = requestAnimationFrame(updateTick);
    };

    requestRef.current = requestAnimationFrame(updateTick);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // Format with high decimal precision matching Stripe's micro-fraction standard
  const calculatePercentage = () => {
    if (cumulativeGlobalRequests <= 0 || cencoriRequests <= 0) return "0.00000000%";
    const percentage = (cencoriRequests / cumulativeGlobalRequests) * 100;
    
    // Ensure we show at least 8 decimal places for precise micro-scale reporting
    return percentage.toFixed(8) + "%";
  };

  return (
    <section className="bg-background border-b border-border/30 pt-28 sm:pt-36 pb-0">
      <div className="mx-auto max-w-6xl border-t border-x border-border/30 relative px-6 py-20 sm:px-12 sm:py-28">
        {/* Intersection markers at the top corners */}
        <div className="absolute -top-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
        <div className="absolute -top-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

        {/* Intersection markers at the bottom corners */}
        <div className="absolute -bottom-1.5 -left-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>
        <div className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3 items-center justify-center text-muted-foreground/40 font-mono text-[10px] select-none pointer-events-none">+</div>

        {/* Stripe-style Ticking Ratio Metric */}
        <div className="mb-6 flex items-center gap-1.5 font-mono text-[10px] sm:text-[11px] tracking-wider text-muted-foreground select-none">


          <span>Global AI running on Cencori: </span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {calculatePercentage()}
          </span>
        </div>

        <h1 className="font-heading text-[1.875rem] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-[2.125rem] lg:text-[2.375rem]">
          <span className="block sm:whitespace-nowrap">The infrastructure</span>
          <span className="block sm:whitespace-nowrap">global AI runs on.</span>
        </h1>

        {/* Subheadline slot — copy TBD */}

        <div className="mt-12 flex flex-wrap gap-3">
          <Link href={isAuthenticated ? "/dashboard" : "/signup"}>
            <Button className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90">
              {isAuthenticated ? "Dashboard" : "Get started"}
            </Button>
          </Link>
          <Link href="/docs">
            <Button
              variant="outline"
              className="h-7 rounded-md border-foreground/20 bg-transparent px-3 text-[11px] font-medium text-foreground/90 hover:border-foreground/40 hover:bg-foreground/5 hover:text-foreground"
            >
              Documentation
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};
