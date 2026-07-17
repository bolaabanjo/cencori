"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import { Anthropic } from "@lobehub/icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
    GlobalIcon,
    EarthLockIcon,
    CloudIcon,
    JusticeScale01Icon,
    CpuIcon,
    AiChipIcon,
    ChipIcon,
    Coins01Icon,
    ExchangeDollarIcon,
    BankIcon,
    Layers01Icon,
    ServerStack01Icon,
    SecurityCheckIcon,
    ConnectIcon,
    Key01Icon,
    Shield01Icon,
    Calendar03Icon,
    Clock01Icon,
    Rocket01Icon,
    UserGroupIcon,
    SourceCodeIcon,
    Agreement01Icon,
    Exchange01Icon,
    Hospital01Icon,
    Plant01Icon,
    CourtHouseIcon,
    DeliveryTruck01Icon,
    Building06Icon,
    Configuration01Icon,
    CheckmarkBadge01Icon,
} from "@hugeicons/core-free-icons";
import { CheckIcon, ShapesIcon, BarChartIcon } from "@/assets/icons";

function HIcon({
    icon,
    size = 20,
    color = "currentColor",
    sw = 1.5,
    style,
}: {
    icon: IconSvgElement;
    size?: number;
    color?: string;
    sw?: number;
    style?: React.CSSProperties;
}) {
    return <HugeiconsIcon icon={icon} size={size} color={color} strokeWidth={sw} style={style} />;
}

function PitchDeckContent() {
    const searchParams = useSearchParams();
    const [isPrintMode, setIsPrintMode] = useState(false);

    useEffect(() => {
        if (searchParams.get("print") === "true") {
            setIsPrintMode(true);
            document.body.setAttribute("data-ready", "true");
        }
    }, [searchParams]);

    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            if (width < 1100) {
                const scale = (width - 32) / 1280; // 16px padding on each side
                document.documentElement.style.setProperty("--slide-zoom", String(scale));
            } else {
                document.documentElement.style.removeProperty("--slide-zoom");
            }
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const [current, setCurrent] = useState(0);
    const total = 10;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
                setCurrent((prev) => (prev + 1) % total);
            }
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                setCurrent((prev) => (prev - 1 + total) % total);
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [total]);

    const goTo = (n: number) => setCurrent(n);
    const navigate = (dir: number) => setCurrent((prev) => (prev + dir + total) % total);

    const downloadPDF = () => {
        // Temporarily activate all slides for printing
        document.body.setAttribute("data-ready", "true");
        const container = document.querySelector(".pitch-deck-container") as HTMLElement | null;
        const deck = document.querySelector(".deck") as HTMLElement | null;
        const slides = document.querySelectorAll(".slide");

        // Save original styles
        if (container) {
            container.style.cssText = "height:auto!important;overflow:visible!important;position:relative!important;padding:0!important;margin:0!important;background:#fff!important;";
        }
        if (deck) {
            deck.style.cssText = "height:auto!important;overflow:visible!important;position:relative!important;display:block!important;padding:0!important;margin:0!important;";
        }
        slides.forEach((s) => {
            (s as HTMLElement).style.cssText = "position:relative!important;display:flex!important;page-break-after:always!important;page-break-inside:avoid!important;break-after:page!important;height:100vh!important;width:100vw!important;min-height:100vh!important;max-height:100vh!important;overflow:hidden!important;box-sizing:border-box!important;transform:scale(0.95)!important;transform-origin:center center!important;zoom:1!important;margin:0!important;border:none!important;box-shadow:none!important;inset:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;";
        });

        // Trigger browser print dialog (user can save as PDF)
        setTimeout(() => {
            window.print();

            // Restore original styles after print dialog closes
            setTimeout(() => {
                document.body.removeAttribute("data-ready");
                if (container) container.style.cssText = "";
                if (deck) deck.style.cssText = "";
                slides.forEach((s) => {
                    (s as HTMLElement).style.cssText = "";
                });
            }, 500);
        }, 100);
    };

    return (
        <>
            <div className="pitch-deck-container">
            <Script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js" strategy="afterInteractive" />
            <style jsx global>{`
                .pitch-deck-container {
                    --black: #000000;
                    --white: #FFFFFF;
                    --muted: #A3A3A3;
                    --muted-light: #D4D4D4;
                    --border: #262626;
                    --border-light: #E5E5E5;

                    --font-display: var(--font-manrope), system-ui, sans-serif;
                    --font-body: var(--font-manrope), system-ui, sans-serif;
                    --font-code: var(--font-mono), ui-monospace, monospace;

                    width: 100vw;
                    height: 100vh;
                    background: #fff;
                    font-family: var(--font-body);
                    overflow: hidden;
                    position: fixed;
                    top: 0;
                    left: 0;
                    z-index: 9999;
                }

                .deck { width: 100%; height: 100%; position: relative; }
                .slide { position: absolute; inset: 0; display: none; overflow: hidden; }
                .slide.active { display: flex; }

                ${isPrintMode ? `
                    html, body, #__next, .pitch-deck-container {
                        height: auto !important;
                        min-height: auto !important;
                        overflow: visible !important;
                        position: relative !important;
                    }
                    .deck {
                        height: auto !important;
                        overflow: visible !important;
                        position: relative !important;
                        display: block !important;
                    }
                    .slide {
                        position: relative !important;
                        display: flex !important;
                        page-break-after: always !important;
                        page-break-inside: avoid !important;
                        break-after: page !important;
                        height: 100vh !important;
                        width: 100vw !important;
                        min-height: 100vh !important;
                        max-height: 100vh !important;
                        overflow: hidden !important;
                        box-sizing: border-box !important;
                        margin: 0 auto !important;
                    }
                    .nav, .export-btn, .slide-counter, .slide-logo { display: none !important; }
                ` : ""}

                .nav { position: fixed; bottom: 36px; left: 50%; transform: translateX(-50%); z-index: 10000; display: flex; align-items: center; gap: 20px; }
                .nav-dots { display: flex; gap: 6px; }
                .dot { width: 4px; height: 4px; border-radius: 50%; background: #ccc; cursor: pointer; transition: all .3s; }
                .dot.active { background: #000; width: 20px; border-radius: 2px; }
                .nav-btn { background: none; border: 1px solid #d4d4d4; color: #888; font-family: var(--font-code); font-size: 10px; letter-spacing: .1em; padding: 6px 14px; cursor: pointer; transition: all .2s; }
                .nav-btn:hover { border-color: #000; color: #000; }

                .export-btn { position: fixed; bottom: 36px; right: 40px; z-index: 10001; background: none; border: 1px solid #d4d4d4; color: #888; font-family: var(--font-code); font-size: 9px; letter-spacing: .15em; text-transform: uppercase; padding: 6px 14px; cursor: pointer; transition: all .2s; }
                .export-btn:hover { border-color: #000; color: #000; }

                @media print {
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    html, body, #__next {
                        width: 100vw !important;
                        height: 100vh !important;
                        min-height: 100vh !important;
                        overflow: visible !important;
                        background: #fff !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .pitch-deck-container {
                        width: 100vw !important;
                        height: auto !important;
                        min-height: 100vh !important;
                        position: relative !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        overflow: visible !important;
                        background: #fff !important;
                        --slide-zoom: 1 !important;
                    }
                    .deck {
                        width: 100vw !important;
                        height: auto !important;
                        position: relative !important;
                        display: block !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        overflow: visible !important;
                    }
                    .slide {
                        position: relative !important;
                        display: flex !important;
                        width: 100vw !important;
                        height: 100vh !important;
                        min-height: 100vh !important;
                        max-height: 100vh !important;
                        overflow: hidden !important;
                        transform: scale(0.95) !important;
                        transform-origin: center center !important;
                        zoom: 1 !important;
                        margin: 0 !important;
                        page-break-after: always !important;
                        page-break-inside: avoid !important;
                        break-after: page !important;
                        box-sizing: border-box !important;
                        border: none !important;
                        box-shadow: none !important;
                        inset: 0 !important;
                    }
                    .nav, .slide-counter, .slide-logo, .export-btn {
                        display: none !important;
                    }
                    @page {
                        size: landscape;
                        margin: 0;
                    }
                }

                .slide-counter { position: fixed; top: 28px; right: 40px; font-family: var(--font-code); font-size: 11px; color: #999; letter-spacing: .1em; z-index: 10000; }
                .slide-logo { position: fixed; top: 28px; left: 40px; z-index: 10000; }

                /* SHARED */
                .kicker { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
                .chip-sm { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #262626; border-radius: 4px; flex-shrink: 0; }
                .chip-sm.light { border-color: #e5e5e5; }
                .chip { width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #262626; border-radius: 5px; flex-shrink: 0; }
                .chip.light { border-color: #e5e5e5; }
                .eyebrow { font-family: var(--font-code); font-size: 10px; letter-spacing: .2em; color: #737373; text-transform: uppercase; margin: 0; }
                .eyebrow-dark { font-family: var(--font-code); font-size: 10px; letter-spacing: .2em; color: #666; text-transform: uppercase; margin: 0; }
                .headline-dark { font-family: var(--font-display); font-size: clamp(34px, 3.8vw, 52px); font-weight: 700; line-height: 1.04; letter-spacing: -0.025em; color: #000; margin-bottom: 24px; }
                .headline-light { font-family: var(--font-display); font-size: clamp(34px, 3.8vw, 52px); font-weight: 700; line-height: 1.04; letter-spacing: -0.025em; color: #fff; margin-bottom: 24px; }
                .body-dark { font-size: 14px; color: #444; line-height: 1.75; font-weight: 400; margin-bottom: 16px; }
                .body-light { font-size: 14px; color: #8a8a8a; line-height: 1.75; font-weight: 400; margin-bottom: 16px; }
                .big-quote { font-family: var(--font-display); font-size: clamp(22px, 2.6vw, 32px); font-weight: 500; line-height: 1.25; letter-spacing: -0.02em; color: #000; border-left: 2px solid #000; padding-left: 24px; margin: 32px 0; }

                /* SLIDE 1 - THE COMPANY */
                .s1 { background: #fff; flex-direction: column; justify-content: center; padding: 0 10%; }
                .s1-eyebrow { font-family: var(--font-code); font-size: 11px; letter-spacing: .2em; color: #737373; text-transform: uppercase; }
                .s1-statline { font-family: var(--font-display); font-size: clamp(40px, 5.6vw, 78px); font-weight: 700; line-height: 1.02; letter-spacing: -0.03em; color: #000; margin: 28px 0 36px; max-width: 1200px; }
                .s1-statline em { font-style: normal; color: #aaa; }
                .s1-thesis { display: flex; align-items: center; gap: 12px; font-size: 15px; color: #666; font-weight: 400; letter-spacing: .01em; margin-bottom: 44px; }
                .s1-thesis strong { color: #000; font-weight: 600; }
                .s1-meta { display: flex; gap: 48px; border-top: 1px solid #e5e5e5; padding-top: 32px; }
                .s1-meta-item label { display: block; font-family: var(--font-code); font-size: 10px; letter-spacing: .15em; color: #999; text-transform: uppercase; margin-bottom: 6px; }
                .s1-meta-item span { font-size: 14px; color: #000; font-weight: 500; }

                /* SLIDE 2 - THE BELIEF */
                .s2 { background: #fff; flex-direction: row; }
                .s2-left { width: 52%; padding: 8% 5% 8% 10%; display: flex; flex-direction: column; justify-content: center; }
                .s2-right { width: 48%; padding: 8% 10% 8% 5%; border-left: 1px solid #e5e5e5; display: flex; flex-direction: column; justify-content: center; }
                .s2-answer { font-family: var(--font-code); font-size: 11px; color: #737373; letter-spacing: .08em; margin-bottom: 28px; }
                .s2-statement { font-family: var(--font-display); font-size: clamp(20px, 2.4vw, 31px); font-weight: 600; color: #000; line-height: 1.2; letter-spacing: -0.02em; }
                .s2-conviction { font-family: var(--font-code); font-size: 10px; letter-spacing: .2em; color: #737373; text-transform: uppercase; margin-bottom: 20px; }
                .s2-belief-item { display: flex; gap: 14px; padding: 15px 0; border-bottom: 1px solid #f0f0f0; }
                .s2-belief-item:last-child { border-bottom: none; }
                .s2-belief-text { font-size: 13.5px; color: #333; line-height: 1.6; font-weight: 400; }
                .s2-belief-text strong { color: #000; font-weight: 600; }

                /* SLIDE 3 - THE PROBLEM */
                .s3 { background: #fff; flex-direction: column; justify-content: center; padding: 2% 10% 0; }
                .s3-headline { font-family: var(--font-display); font-size: clamp(34px, 4vw, 48px); font-weight: 700; line-height: 1.05; letter-spacing: -0.025em; color: #000; margin-bottom: 16px; }
                .problem-stack { display: flex; flex-direction: column; gap: 6px; width: 100%; }
                .problem-layer { background: #fafafa; border: 1px solid #e5e5e5; padding: 10px 20px; display: flex; align-items: center; gap: 30px; border-radius: 8px; }
                .problem-layer-num { font-family: var(--font-code); font-size: 11.5px; letter-spacing: .2em; color: #aaa; width: 40px; flex-shrink: 0; }
                .problem-layer-label { font-family: var(--font-code); font-size: 10px; letter-spacing: .15em; color: #888; text-transform: uppercase; width: 130px; flex-shrink: 0; }
                .problem-layer-content { font-size: 14px; color: #555; line-height: 1.4; flex: 1; }
                .problem-layer-content strong { color: #000; font-weight: 600; }
                .s3-result { border: 1px solid #e5e5e5; margin-top: 10px; padding: 10px 20px; display: flex; align-items: center; gap: 40px; border-radius: 8px; background: #fafafa; }
                .s3-result-label { font-family: var(--font-code); font-size: 11px; letter-spacing: .2em; color: #999; text-transform: uppercase; white-space: nowrap; }
                .s3-result-list { display: flex; gap: 40px; flex: 1; }
                .s3-result-item { display: flex; align-items: center; gap: 12px; font-size: 13.5px; color: #555; }
                .s3-result-item strong { color: #000; font-weight: 500; }
 
                /* SLIDE 4 - THE SOLUTION */
                .s4 { background: #fff; flex-direction: column; justify-content: center; padding: 0 10%; }
                .s4-subhead { font-size: 16px; color: #737373; font-weight: 400; margin-bottom: 36px; max-width: 760px; line-height: 1.7; }
                .solution-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 30px; }
                .solution-card { background: #fafafa; border: 1px solid #e5e5e5; padding: 20px 24px; border-radius: 8px; display: flex; flex-direction: column; gap: 12px; transition: border-color 0.2s ease; }
                .solution-card:hover { border-color: #000; }
                .solution-card-header { display: flex; align-items: center; gap: 12px; }
                .solution-card-title { font-family: var(--font-display); font-size: 16.5px; font-weight: 600; color: #000; }
                .solution-card-desc { font-size: 12.5px; color: #555; line-height: 1.5; font-weight: 400; }
                .s4-closing-note { border: 1px solid #e5e5e5; padding: 22px 30px; display: flex; align-items: center; gap: 24px; border-radius: 8px; background: #fafafa; }
                .s4-closing-text { font-size: 15px; color: #333; font-weight: 400; line-height: 1.5; }
                .s4-closing-text strong { color: #000; font-weight: 600; }
 
                /* SLIDE 5 - WHY NOW */
                .s5 { background: #fff; flex-direction: column; justify-content: center; padding: 2% 10% 0; }
                .timeline-eras { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #e5e5e5; border: 1px solid #e5e5e5; margin-bottom: 28px; }
                .s5-content { display: flex; gap: 24px; width: 100%; align-items: stretch; margin-top: 5px; }
                .s5-charts { width: 44%; display: flex; flex-direction: column; gap: 12px; justify-content: center; }
                .s5-details { width: 56%; display: flex; flex-direction: column; gap: 8px; justify-content: center; }
                
                /* Charts layout */
                .chart-container-s5 { background: #fafafa; border: 1px solid #e5e5e5; padding: 14px 20px; border-radius: 8px; }
                .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
                .chart-title { font-family: var(--font-code); font-size: 11px; letter-spacing: .15em; color: #888; text-transform: uppercase; margin: 0; }
                .chart-stat-callout { font-family: var(--font-display); font-size: 15px; font-weight: 700; color: #000; }
                
                /* Stacked Bar Chart */
                .inference-chart { display: flex; justify-content: space-between; align-items: flex-end; height: 130px; padding: 10px 10px 0; border-bottom: 1px solid #e5e5e5; margin-bottom: 8px; }
                .chart-bar-group { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 45px; }
                .chart-bar-stack { width: 22px; height: 110px; display: flex; flex-direction: column-reverse; border-radius: 2px; overflow: hidden; background: #eaeaea; }
                .bar-inference { background: #8b5cf6; width: 100%; transition: height 0.3s; }
                .bar-training { background: #3b82f6; width: 100%; transition: height 0.3s; }
                .chart-bar-label { font-family: var(--font-code); font-size: 9.5px; color: #888; }
                
                /* Chart Legends */
                .chart-legends { display: flex; gap: 24px; justify-content: center; margin-top: 4px; }
                .chart-legend-item { display: flex; align-items: center; gap: 6px; font-family: var(--font-code); font-size: 9.5px; color: #777; }
                .legend-color { width: 10px; height: 10px; border-radius: 1px; }
                .legend-color.inference { background: #8b5cf6; }
                .legend-color.training { background: #3b82f6; }
 
                /* Horizontal Bar Chart */
                .horizontal-chart { display: flex; flex-direction: column; gap: 14px; margin-top: 6px; }
                .horiz-row { display: flex; flex-direction: column; gap: 6px; }
                .horiz-info { display: flex; justify-content: space-between; font-size: 12px; color: #666; }
                .horiz-label { font-family: var(--font-code); font-size: 9.5px; color: #888; text-transform: uppercase; }
                .horiz-val { font-family: var(--font-code); font-size: 11px; color: #000; font-weight: 600; }
                .horiz-bar-bg { height: 10px; background: #eaeaea; border-radius: 5px; overflow: hidden; width: 100%; }
                .horiz-bar-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); border-radius: 5px; }
 
                /* List detail item */
                .s5-detail-item { border: 1px solid #e5e5e5; padding: 8px 14px; border-radius: 8px; background: #fafafa; display: flex; gap: 12px; align-items: flex-start; transition: border-color 0.2s ease; }
                .s5-detail-item:hover { border-color: #000; }
                .s5-icon-box { width: 30px; height: 30px; border-radius: 4px; border: 1px solid #e5e5e5; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: #f0f0f0; }
                .s5-text-box { display: flex; flex-direction: column; gap: 2px; }
                .s5-item-title { font-family: var(--font-display); font-size: 13px; font-weight: 600; color: #000; }
                .s5-item-desc { font-size: 11.5px; color: #555; line-height: 1.35; font-weight: 400; }
                .s5-item-desc strong { color: #000; font-weight: 500; }
 
                /* SLIDE 6 - TRACTION */
                .s6 { background: #fff; flex-direction: column; justify-content: flex-start; padding: 6% 8% 0; }
                .s6-layout { display: flex; gap: 36px; width: 100%; align-items: stretch; margin-top: 15px; }
                .s6-left { width: 50%; display: flex; flex-direction: column; gap: 16px; }
                .s6-right { width: 50%; display: flex; flex-direction: column; gap: 16px; }

                /* Traction Grid of metrics */
                .traction-metric-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; width: 100%; }
                .traction-metric-card { border-radius: 8px; padding: 22px 24px; display: flex; flex-direction: column; gap: 6px; border: 1px solid rgba(0,0,0,0.05); color: #fff; transition: transform 0.2s ease; }
                .traction-metric-card:hover { transform: translateY(-3px); }
                .traction-metric-card.purple { background: linear-gradient(135deg, #7c3aed, #4f46e5); }
                .traction-metric-card.blue { background: linear-gradient(135deg, #2563eb, #0284c7); }
                .traction-metric-card.green { background: linear-gradient(135deg, #059669, #0f766e); }
                .traction-metric-card.pink { background: linear-gradient(135deg, #db2777, #b91c1c); }
                .traction-metric-card.dark { background: linear-gradient(135deg, #1f2937, #111827); border-color: #374151; }
                .traction-metric-card.orange { background: linear-gradient(135deg, #ea580c, #c2410c); }

                .traction-card-big { font-family: var(--font-display); font-size: 34px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
                .traction-card-label { font-family: var(--font-code); font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; opacity: 0.85; }
                .traction-card-desc { font-size: 11.5px; opacity: 0.9; line-height: 1.4; }

                /* Traction Right columns details */
                .traction-detail-box { background: #fafafa; border: 1px solid #e5e5e5; border-radius: 8px; padding: 18px 22px; display: flex; flex-direction: column; gap: 10px; }
                .traction-box-title { font-family: var(--font-display); font-size: 13.5px; font-weight: 700; color: #000; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #eaeaea; padding-bottom: 6px; }
                
                .traction-list { display: flex; flex-direction: column; gap: 8px; }
                .traction-list-item { display: flex; align-items: flex-start; gap: 10px; font-size: 12.5px; color: #444; line-height: 1.45; }
                .traction-list-item strong { color: #000; font-weight: 600; }
                
                /* Press mentions */
                .press-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
                .press-badge { background: #eaeaea; color: #333; font-family: var(--font-code); font-size: 9px; padding: 4px 8px; border-radius: 4px; text-transform: uppercase; font-weight: 600; letter-spacing: .05em; }

                /* Community count grid */
                .comm-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
                .comm-item { background: #fff; border: 1px solid #eaeaea; border-radius: 6px; padding: 10px; text-align: center; display: flex; flex-direction: column; gap: 2px; }
                .comm-val { font-family: var(--font-display); font-size: 16px; font-weight: 700; color: #000; }
                .comm-label { font-family: var(--font-code); font-size: 8px; color: #777; text-transform: uppercase; }
 
                /* SLIDE 7 - GO-TO-MARKET */
                .s7 { background: #fff; flex-direction: column; justify-content: center; padding: 0 8%; }
                .gtm-layout { display: flex; gap: 20px; width: 100%; align-items: stretch; }
                .gtm-vectors { width: 56%; display: flex; flex-direction: column; gap: 12px; }
                .gtm-multipliers { width: 44%; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
                .gtm-card { background: #fafafa; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px 20px; display: flex; gap: 14px; align-items: stretch; }
                .gtm-accent-bar { width: 4px; border-radius: 99px; flex-shrink: 0; }
                .gtm-accent-bar.blue { background: #3b82f6; }
                .gtm-accent-bar.green { background: #10b981; }
                .gtm-card-body { flex: 1; display: flex; flex-direction: column; }
                .gtm-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
                .gtm-card-pill { font-family: var(--font-code); font-size: 9px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.1em; }
                .gtm-card-pill.highlight { color: #3b82f6; }
                .gtm-card-badge { font-family: var(--font-code); font-size: 8px; padding: 2px 6px; border-radius: 3px; font-weight: 700; text-transform: uppercase; }
                .status-primary { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
                .status-live { background: rgba(16, 185, 129, 0.15); color: #10b981; }
                .gtm-card-title-lg { font-family: var(--font-display); font-size: 18px; font-weight: 600; color: #000; margin-bottom: 3px; }
                .gtm-card-desc-lg { font-size: 12px; color: #666; line-height: 1.35; margin-bottom: 8px; }
                .gtm-card-bullet-grid { display: flex; flex-direction: column; gap: 5px; }
                .gtm-bullet { display: flex; align-items: flex-start; gap: 8px; font-size: 11px; color: #555; line-height: 1.35; }
                .gtm-bullet strong { color: #000; font-weight: 600; }
                
                .gtm-card-sm { background: #fafafa; border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; justify-content: space-between; }
                .gtm-sm-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
                .gtm-sm-icon { width: 22px; height: 22px; border-radius: 4px; background: #f0f0f0; border: 1px solid #e5e5e5; display: flex; align-items: center; justify-content: center; }
                .gtm-sm-label { font-family: var(--font-code); font-size: 8px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
                .gtm-sm-title { font-family: var(--font-display); font-size: 13px; font-weight: 600; color: #000; margin-bottom: 2px; }
                .gtm-sm-text { font-size: 11px; color: #555; line-height: 1.35; }
                .gtm-sm-text strong { color: #000; font-weight: 600; }
 
                /* SLIDE 7b - BUSINESS MODEL & FINANCIALS */
                .s7b { background: #fff; flex-direction: column; justify-content: flex-start; padding: 2% 6% 0; }
                .s7b-layout { display: flex; gap: 20px; width: 100%; align-items: stretch; margin-top: 8px; }
                .s7b-left { width: 44%; display: flex; flex-direction: column; gap: 12px; }
                .s7b-right { width: 56%; display: flex; flex-direction: column; gap: 8px; }

                /* Business model card grids */
                .biz-model-grid { display: flex; flex-direction: column; gap: 8px; }
                .biz-card { background: #fafafa; border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 14px; display: flex; align-items: flex-start; gap: 14px; transition: border-color 0.2s; }
                .biz-card:hover { border-color: #000; }
                .biz-icon-box { width: 34px; height: 34px; border-radius: 6px; background: #eaeaea; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .biz-text-box { display: flex; flex-direction: column; gap: 2px; }
                .biz-card-title { font-family: var(--font-display); font-size: 13.5px; font-weight: 700; color: #000; display: flex; align-items: center; gap: 6px; }
                .biz-card-desc { font-size: 11.5px; color: #555; line-height: 1.4; }
                .biz-card-desc strong { color: #000; font-weight: 600; }
                .biz-status-pill { font-family: var(--font-code); font-size: 8px; padding: 2px 6px; border-radius: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
                .biz-status-pill.active { background: #e0f2fe; color: #0369a1; }
                .biz-status-pill.planned { background: #fef3c7; color: #d97706; }
                .biz-status-pill.beta { background: #f3e8ff; color: #7c3aed; }

                /* Financial table styles */
                .financial-table-box { background: #fafafa; border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 16px; display: flex; flex-direction: column; gap: 10px; }
                .financial-table { width: 100%; border-collapse: collapse; }
                .financial-table th { text-align: left; font-family: var(--font-code); font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: #777; border-bottom: 1px solid #eaeaea; padding-bottom: 6px; }
                .financial-table td { padding: 4px 0; border-bottom: 1px solid #eaeaea; font-size: 12px; color: #444; }
                .financial-table tr:last-child td { border-bottom: none; }
                .fin-metric-bold { font-family: var(--font-display); font-size: 13px; font-weight: 700; color: #000; }
                .fin-metric-code { font-family: var(--font-code); font-size: 11.5px; font-weight: 600; }

                /* CSS Financial line chart */
                .fin-chart-container { background: #fafafa; border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 16px; display: flex; flex-direction: column; gap: 10px; }
                .fin-chart-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eaeaea; padding-bottom: 6px; }
                .fin-chart-title { font-family: var(--font-code); font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: #777; }
                .fin-chart { display: flex; justify-content: space-around; align-items: flex-end; height: 125px; position: relative; }

                /* SLIDE 8 - MARKET */
                .s8 { background: #fff; flex-direction: column; justify-content: flex-start; padding: 2% 5% 0; }
                .s8-layout { display: flex; gap: 32px; width: 100%; align-items: stretch; margin-top: 10px; }
                .s8-col-1 { width: 33%; display: flex; flex-direction: column; gap: 12px; }
                .s8-col-2 { width: 33%; display: flex; flex-direction: column; gap: 12px; }
                .s8-col-3 { width: 34%; display: flex; flex-direction: column; gap: 12px; }
 
                /* Funnel / Nested Layers */
                .market-funnel { display: flex; flex-direction: column; gap: 6px; width: 100%; }
                .funnel-layer { border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 16px; background: #fafafa; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s ease; }
                .funnel-layer:hover { border-color: #000; background: #f5f5f5; transform: translateX(6px); }
                .funnel-meta { display: flex; flex-direction: column; gap: 4px; }
                .funnel-title { font-family: var(--font-display); font-size: 16.5px; font-weight: 700; color: #000; }
                .funnel-desc { font-size: 12.5px; color: #666; line-height: 1.3; }
                .funnel-value { font-family: var(--font-code); font-size: 15.5px; font-weight: 700; color: #000; }
 
                /* Market charts */
                .chart-container-s8 { background: #fafafa; border: 1px solid #e5e5e5; padding: 12px 18px; border-radius: 8px; display: flex; flex-direction: column; justify-content: space-between; min-height: 165px; }
                .chart-container-s8 .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #eaeaea; padding-bottom: 4px; }
                .chart-container-s8 .chart-title { font-family: var(--font-code); font-size: 9.5px; letter-spacing: .12em; color: #666; text-transform: uppercase; margin: 0; }
                .chart-container-s8 .chart-stat-callout { font-family: var(--font-display); font-size: 13.5px; font-weight: 700; color: #000; }
 
                /* Line/Area Chart for Growth */
                .area-chart { display: flex; justify-content: space-between; align-items: flex-end; height: 90px; padding: 10px 10px 0; border-bottom: 1px solid #e5e5e5; margin-bottom: 4px; position: relative; }
                .area-chart-grid { position: absolute; left: 0; right: 0; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; padding-bottom: 1px; }
                .grid-line { border-top: 1px dashed #eaeaea; width: 100%; height: 0; }
 
                .area-chart-bar-group { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 50px; z-index: 2; }
                .area-chart-bar { width: 20px; background: #eaeaea; display: flex; flex-direction: column-reverse; height: 75px; border-radius: 2px 2px 0 0; }
                .area-chart-fill { background: #000; width: 100%; transition: height 0.3s; position: relative; border-radius: 2px 2px 0 0; }
                .area-chart-val-label { position: absolute; top: -18px; left: 50%; transform: translateX(-50%); font-family: var(--font-code); font-size: 9px; color: #000; font-weight: 600; }
                .area-chart-label { font-family: var(--font-code); font-size: 9px; color: #888; }
                
                /* GPU / Inference Growth Multi Bar */
                .multi-bar-chart { display: flex; justify-content: space-between; align-items: flex-end; height: 90px; padding: 10px 10px 0; border-bottom: 1px solid #e5e5e5; margin-bottom: 4px; position: relative; }
                .multi-bar-bar-group { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 50px; z-index: 2; }
                .multi-bar-group { display: flex; gap: 3px; align-items: flex-end; height: 75px; position: relative; }
                .multi-bar-val { width: 10px; border-radius: 1.5px 1.5px 0 0; transition: height 0.3s; position: relative; }
                .multi-bar-val-label { position: absolute; top: -16px; left: 50%; transform: translateX(-50%); font-family: var(--font-code); font-size: 8.5px; color: #444; font-weight: 500; }
                .multi-bar-val.primary { background: #8b5cf6; }
                .multi-bar-val.secondary { background: #3b82f6; }
                .multi-bar-val.tertiary { background: #d4d4d4; }
                .multi-bar-label { font-family: var(--font-code); font-size: 9px; color: #888; }
                
                /* Chart Legends for S8 */
                .chart-legends-s8 { display: flex; gap: 12px; justify-content: center; margin-top: 2px; }
                .chart-legend-item-s8 { display: flex; align-items: center; gap: 4px; font-family: var(--font-code); font-size: 8px; color: #777; }
                .legend-color-s8 { width: 8px; height: 8px; border-radius: 1px; }
                .legend-color-s8.primary { background: #8b5cf6; }
                .legend-color-s8.secondary { background: #3b82f6; }
                .legend-color-s8.tertiary { background: #d4d4d4; }
 
                /* Pie Chart Styles */
                .pie-chart-wrapper { display: flex; align-items: center; gap: 24px; height: 90px; padding: 0 10px; }
                .pie-chart { width: 80px; height: 80px; border-radius: 50%; background: conic-gradient(#111111 0% 43%, #8b5cf6 43% 71%, #3b82f6 71% 87%, #10b981 87% 94%, #ef4444 94% 100%); flex-shrink: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.05); }
                .pie-legend { display: flex; flex-direction: column; gap: 2px; }
                .pie-legend-item { display: flex; align-items: center; gap: 6px; font-family: var(--font-code); font-size: 10px; color: #555; }
                .legend-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }

                /* Stacked Bar Chart Horiz */
                .stacked-bar-chart-horiz { display: flex; height: 24px; border-radius: 6px; overflow: hidden; width: 100%; margin-top: 12px; }
                .stacked-segment { height: 100%; display: flex; align-items: center; justify-content: center; font-family: var(--font-code); font-size: 9px; color: #fff; font-weight: 700; transition: width 0.3s; }
 
                /* SLIDE 9 - TEAM */
                .s9 { background: #fff; flex-direction: row; }
                .s9-left { width: 50%; padding: 4% 5% 4% 10%; border-right: 1px solid #e5e5e5; display: flex; flex-direction: column; justify-content: center; }
                .s9-right { width: 50%; padding: 4% 10% 4% 5%; display: flex; flex-direction: column; justify-content: center; }
                .team-member { display: flex; align-items: flex-start; gap: 24px; margin-top: 16px; }
                .team-avatar { width: 75px; height: 75px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1px solid #e5e5e5; }
                .team-info { flex: 1; }
                .team-name { font-family: var(--font-display); font-size: 28px; font-weight: 600; letter-spacing: -0.02em; color: #000; margin-bottom: 3px; }
                .team-title { font-family: var(--font-code); font-size: 11px; letter-spacing: .12em; color: #737373; text-transform: uppercase; margin-bottom: 6px; }
                .team-bio { font-size: 12.5px; color: #555; line-height: 1.5; font-weight: 400; }
                .team-divider { border: none; border-top: 1px solid #e5e5e5; margin: 12px 0; }
                .s9-stat { display: flex; align-items: flex-start; gap: 14px; border: 1px solid #e5e5e5; padding: 12px 18px; margin-bottom: 8px; }
                .team-name { font-family: var(--font-display); font-size: 24px; font-weight: 600; letter-spacing: -0.02em; color: #000; margin-bottom: 2px; }
                .team-title { font-family: var(--font-code); font-size: 10px; letter-spacing: .12em; color: #737373; text-transform: uppercase; margin-bottom: 4px; }
                .team-bio { font-size: 12px; color: #555; line-height: 1.4; font-weight: 400; }
                .team-divider { border: none; border-top: 1px solid #e5e5e5; margin: 10px 0; }
                .s9-stat { display: flex; align-items: flex-start; gap: 10px; border: 1px solid #e5e5e5; padding: 10px 14px; margin-bottom: 6px; }
                .s9-stat-label { font-family: var(--font-code); font-size: 9px; letter-spacing: .12em; color: #737373; text-transform: uppercase; margin-bottom: 6px; }
                .s9-stat-text { font-size: 14.5px; color: #333; font-weight: 400; line-height: 1.55; }
                .s9-stat-text strong { font-weight: 600; color: #000; }
 
                /* SLIDE 10 - THE ASK */
                .s10 { background: #fff; flex-direction: column; justify-content: center; padding: 2% 10% 0; }
                .ask-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 1px; background: #e5e5e5; margin-top: 16px; border: 1px solid #e5e5e5; }
                .ask-cell { background: #fff; padding: 18px 24px; }
                .ask-cell.featured { background: #fafafa; }
                .ask-label { font-family: var(--font-code); font-size: 10px; letter-spacing: .2em; color: #888; text-transform: uppercase; margin-bottom: 12px; }
                .ask-label.dark { color: #737373; }
                .ask-value { font-family: var(--font-display); font-size: 44px; font-weight: 700; color: #000; line-height: 1; letter-spacing: -0.03em; margin-bottom: 8px; }
                .ask-value.dark { color: #000; }
                .ask-value-sub { font-size: 14px; color: #777; font-weight: 400; }
                .ask-value-sub.dark { color: #737373; }
                .funds-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 13.5px; }
                .funds-table td { padding: 12px 0; border-bottom: 1px solid #eaeaea; color: #555; vertical-align: middle; }
                .funds-table tr:last-child td { border-bottom: none; }
                .funds-cell { display: flex; align-items: center; gap: 11px; }
                .funds-amt { text-align: right; color: #000; font-family: var(--font-code); font-size: 12.5px; white-space: nowrap; }
                .s10-milestones { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #e5e5e5; border: 1px solid #e5e5e5; margin-top: 12px; }
                .s10-milestone { background: #fff; padding: 10px 14px; }
                .s10-milestone-month { font-family: var(--font-code); font-size: 9px; letter-spacing: .1em; color: #999; margin-bottom: 8px; text-transform: uppercase; }
                .s10-milestone-text { font-size: 12px; color: #555; font-weight: 400; line-height: 1.5; }
                .s10-close { font-family: var(--font-display); font-size: clamp(24px, 3.2vw, 40px); font-weight: 700; color: #000; line-height: 1.05; letter-spacing: -0.03em; margin-top: 16px; }
                .s10-close em { font-style: normal; color: #aaa; }
                .s10-contact { display: flex; gap: 44px; border-top: 1px solid #e5e5e5; padding-top: 14px; margin-top: 16px; }
                .s10-contact-item label { display: block; font-family: var(--font-code); font-size: 10px; letter-spacing: .15em; color: #999; text-transform: uppercase; margin-bottom: 6px; }
                .s10-contact-item span { font-size: 14px; color: #000; font-weight: 500; }

                @media screen and (max-width: 340px) {
                    .pitch-deck-container { --slide-zoom: 0.225 !important; }
                }
                @media screen and (min-width: 341px) and (max-width: 370px) {
                    .pitch-deck-container { --slide-zoom: 0.25 !important; }
                }
                @media screen and (min-width: 371px) and (max-width: 400px) {
                    .pitch-deck-container { --slide-zoom: 0.27 !important; }
                }
                @media screen and (min-width: 401px) and (max-width: 450px) {
                    .pitch-deck-container { --slide-zoom: 0.30 !important; }
                }
                @media screen and (min-width: 451px) and (max-width: 500px) {
                    .pitch-deck-container { --slide-zoom: 0.34 !important; }
                }
                @media screen and (min-width: 501px) and (max-width: 600px) {
                    .pitch-deck-container { --slide-zoom: 0.38 !important; }
                }
                @media screen and (min-width: 601px) and (max-width: 700px) {
                    .pitch-deck-container { --slide-zoom: 0.46 !important; }
                }
                @media screen and (min-width: 701px) and (max-width: 800px) {
                    .pitch-deck-container { --slide-zoom: 0.54 !important; }
                }
                @media screen and (min-width: 801px) and (max-width: 900px) {
                    .pitch-deck-container { --slide-zoom: 0.62 !important; }
                }
                @media screen and (min-width: 901px) and (max-width: 1000px) {
                    .pitch-deck-container { --slide-zoom: 0.70 !important; }
                }
                @media screen and (min-width: 1001px) and (max-width: 1100px) {
                    .pitch-deck-container { --slide-zoom: 0.78 !important; }
                }

                @media screen and (max-width: 1100px) {
                    .pitch-deck-container {
                        position: relative !important;
                        width: 100% !important;
                        max-width: 100vw !important;
                        height: auto !important;
                        min-height: 100vh !important;
                        overflow-y: auto !important;
                        overflow-x: hidden !important;
                        background: #f5f5f5 !important;
                        padding: 24px 0 !important;
                        box-sizing: border-box !important;
                        left: auto !important;
                        top: auto !important;
                    }
                    .deck {
                        display: flex !important;
                        flex-direction: column !important;
                        gap: 0px !important;
                        align-items: center !important;
                        height: auto !important;
                        width: 100% !important;
                        overflow-x: hidden !important;
                        position: relative !important;
                    }
                    .slide {
                        position: relative !important;
                        display: flex !important; /* Show all slides stacked */
                        width: 1280px !important;
                        height: 720px !important;
                        min-height: 720px !important;
                        max-height: 720px !important;
                        transform: scale(var(--slide-zoom, 0.28)) !important;
                        transform-origin: top center !important;
                        margin-bottom: calc(720px * (var(--slide-zoom, 0.28) - 1) + 20px) !important;
                        border: 1px solid #e5e5e5 !important;
                        border-radius: 12px !important;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.08) !important;
                        background: #fff !important;
                        box-sizing: border-box !important;
                        overflow: hidden !important;
                        inset: auto !important;
                    }
                    .nav, .slide-counter, .slide-logo {
                        display: none !important;
                    }
                    .export-btn {
                        display: block !important;
                        position: fixed !important;
                        bottom: 20px !important;
                        right: 20px !important;
                        background: #000 !important;
                        border: 1px solid #000 !important;
                        color: #fff !important;
                        border-radius: 99px !important;
                        padding: 10px 18px !important;
                        font-size: 10px !important;
                        font-weight: 700 !important;
                        box-shadow: 0 4px 16px rgba(0,0,0,0.15) !important;
                        z-index: 10001 !important;
                        letter-spacing: 0.1em !important;
                    }
                    .export-btn:hover {
                        background: #222 !important;
                        border-color: #222 !important;
                    }
                }
            `}</style>

            <div className="slide-logo">
                <img src="/logo%20black.svg" alt="Cencori Logo" style={{ width: "48px", height: "auto" }} />
            </div>
            <div className="slide-counter" id="counter">
                {String(current + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </div>

            <div className="deck">

                {/* SLIDE 1 - THE COMPANY */}
                <div className={`slide s1 ${isPrintMode || current === 0 ? "active" : ""}`}>
                    <div className="kicker">
                        <span className="chip-sm light"><HIcon icon={GlobalIcon} size={15} color="#737373" /></span>
                        <span className="s1-eyebrow">Pre-seed Raise · $500K · SAFE</span>
                    </div>
                    <div className="s1-statline">
                        The AI Cloud Infrastructure<br />
                        powering <em>critical systems.</em>
                    </div>
                    <div className="s1-thesis">
                        <HIcon icon={EarthLockIcon} size={20} color="#000" />
                        <span><strong>AI Cloud Infrastructure</strong>: powering critical systems across AI, enterprises, and modern computing.</span>
                    </div>
                    <div className="s1-meta">
                        <div className="s1-meta-item"><label>Raising</label><span>$500,000</span></div>
                        <div className="s1-meta-item"><label>Valuation</label><span>$5M cap</span></div>
                        <div className="s1-meta-item"><label>CEO</label><span>Bola Roy Banjo</span></div>
                        <div className="s1-meta-item"><label>COO</label><span>Oreofe Ojurereoluwa Daniel</span></div>
                    </div>
                </div>


                {/* SLIDE 3 - THE PROBLEM */}
                <div className={`slide s3 ${isPrintMode || current === 1 ? "active" : ""}`}>
                    <div className="kicker">
                        <span className="chip-sm light"><HIcon icon={JusticeScale01Icon} size={15} color="#737373" /></span>
                        <span className="eyebrow">The Problem</span>
                    </div>
                    <div className="s3-headline">AI adoption is blocked by a layered problem.</div>
                    
                    <div className="problem-stack">
                        <div className="problem-layer">
                            <div className="problem-layer-num">01 / L1</div>
                            <div className="problem-layer-label">Infrastructure</div>
                            <div className="problem-layer-content">
                                <strong>AI infrastructure is fragmented.</strong> Different frameworks, model providers, and hardware architectures prevent unified control.
                            </div>
                        </div>
                        <div className="problem-layer">
                            <div className="problem-layer-num">02 / L2</div>
                            <div className="problem-layer-label">Enterprise</div>
                            <div className="problem-layer-content">
                                <strong>Enterprises struggle with security, governance and compliance.</strong> Sensitive client data must be ring-fenced, audited, and strictly localized.
                            </div>
                        </div>
                        <div className="problem-layer">
                            <div className="problem-layer-num">03 / L3</div>
                            <div className="problem-layer-label">Developers</div>
                            <div className="problem-layer-content">
                                <strong>Developers integrate multiple AI providers manually.</strong> Hardcoding APIs, orchestrating routing, and maintaining reliability wastes valuable resources.
                            </div>
                        </div>
                        <div className="problem-layer">
                            <div className="problem-layer-num">04 / L4</div>
                            <div className="problem-layer-label">Operations</div>
                            <div className="problem-layer-content">
                                <strong>AI workloads are expensive and difficult to manage.</strong> Scaling GPU/CPU resources on-demand leads to massive costs and operational overhead.
                            </div>
                        </div>
                        <div className="problem-layer">
                            <div className="problem-layer-num">05 / L5</div>
                            <div className="problem-layer-label">Sovereignty</div>
                            <div className="problem-layer-content">
                                <strong>African organizations face additional latency and data sovereignty constraints.</strong> Local regulations demand local hosting, but local compute infrastructure is nonexistent.
                            </div>
                        </div>
                    </div>

                    <div className="s3-result">
                        <div className="s3-result-label">The result</div>
                        <div className="s3-result-list">
                            <div className="s3-result-item"><HIcon icon={ExchangeDollarIcon} size={16} color="#737373" /><span><strong>Operational inefficiency</strong> and high costs</span></div>
                            <div className="s3-result-item"><HIcon icon={Calendar03Icon} size={16} color="#737373" /><span><strong>Regulatory risk</strong> for sensitive datasets</span></div>
                            <div className="s3-result-item"><HIcon icon={CpuIcon} size={16} color="#737373" /><span><strong>An innovation ceiling</strong> for emerging markets</span></div>
                        </div>
                    </div>
                </div>

                {/* SLIDE 4 - THE SOLUTION */}
                {/* SLIDE 4 - THE SOLUTION */}
                <div className={`slide s4 ${isPrintMode || current === 2 ? "active" : ""}`}>
                    <div className="kicker">
                        <span className="chip-sm light"><ShapesIcon fill="#000" width={15} height={15} /></span>
                        <span className="eyebrow">The Solution</span>
                    </div>
                    <div className="headline-dark">Introducing Cencori as it exists today.</div>
                    <div className="s4-subhead">A complete middleware and governance layer for enterprise AI, built to simplify development and scale operations from day one.</div>
                    
                    <div className="solution-grid">
                        <div className="solution-card">
                            <div className="solution-card-header">
                                <HIcon icon={ConnectIcon} size={18} color="#000" />
                                <div className="solution-card-title">Unified Gateway</div>
                            </div>
                            <div className="solution-card-desc">
                                A single endpoint to access and orchestrate multiple models, simplifying integration.
                            </div>
                        </div>
                        <div className="solution-card">
                            <div className="solution-card-header">
                                <HIcon icon={Shield01Icon} size={18} color="#000" />
                                <div className="solution-card-title">Security</div>
                            </div>
                            <div className="solution-card-desc">
                                Granular access tokens, data encryption, and role-based access policies.
                            </div>
                        </div>
                        <div className="solution-card">
                            <div className="solution-card-header">
                                <HIcon icon={Coins01Icon} size={18} color="#000" />
                                <div className="solution-card-title">Billing</div>
                            </div>
                            <div className="solution-card-desc">
                                Multi-tenant billing tracking, budget controls, and detailed usage analytics.
                            </div>
                        </div>
                        <div className="solution-card">
                            <div className="solution-card-header">
                                <HIcon icon={Layers01Icon} size={18} color="#000" />
                                <div className="solution-card-title">Caching</div>
                            </div>
                            <div className="solution-card-desc">
                                Prompt and response caching to cut down token usage and reduce latency.
                            </div>
                        </div>
                        <div className="solution-card">
                            <div className="solution-card-header">
                                <HIcon icon={Configuration01Icon} size={18} color="#000" />
                                <div className="solution-card-title">Routing</div>
                            </div>
                            <div className="solution-card-desc">
                                Semantic, fallback, and cost-based route optimization for reliability.
                            </div>
                        </div>
                        <div className="solution-card">
                            <div className="solution-card-header">
                                <HIcon icon={ServerStack01Icon} size={18} color="#000" />
                                <div className="solution-card-title">Observability</div>
                            </div>
                            <div className="solution-card-desc">
                                Real-time logs, analytics, latency tracing, and cost attribution.
                            </div>
                        </div>
                        <div className="solution-card">
                            <div className="solution-card-header">
                                <HIcon icon={SourceCodeIcon} size={18} color="#000" />
                                <div className="solution-card-title">SDKs</div>
                            </div>
                            <div className="solution-card-desc">
                                Native, TypeSafe SDKs (TypeScript, Python, Go) ready for production environments.
                            </div>
                        </div>
                        <div className="solution-card">
                            <div className="solution-card-header">
                                <HIcon icon={Key01Icon} size={18} color="#000" />
                                <div className="solution-card-title">Enterprise Controls</div>
                            </div>
                            <div className="solution-card-desc">
                                Single Sign-On (SSO), workspace isolation, and comprehensive audit trails.
                            </div>
                        </div>
                    </div>

                    <div className="s4-closing-note">
                        <HIcon icon={CheckmarkBadge01Icon} size={22} color="#000" style={{ flexShrink: 0 }} />
                        <div className="s4-closing-text">
                            <strong>This has gotten us our success so far, and it's not even the end product.</strong> Over 350+ developers and official partnerships are powered by this active layer.
                        </div>
                    </div>
                </div>

                {/* SLIDE 5 - WHY NOW */}
                <div className={`slide s5 ${isPrintMode || current === 3 ? "active" : ""}`}>
                    <div className="kicker">
                        <span className="chip-sm light"><HIcon icon={Calendar03Icon} size={15} color="#737373" /></span>
                        <span className="eyebrow">Why Now</span>
                    </div>
                    <div className="headline-dark" style={{ marginBottom: "15px" }}>The Convergence of Regulation and the Intelligence Boom</div>
                    
                    <div className="s5-content">
                        {/* Left Column: Data-Driven Charts */}
                        <div className="s5-charts">
                            {/* Chart 1: Stacked Bar Chart */}
                            <div className="chart-container-s5">
                                <div className="chart-header">
                                    <h4 className="chart-title">Global AI Compute Spend Shift</h4>
                                    <span className="chart-stat-callout">Inference Dominance</span>
                                </div>
                                <div className="inference-chart">
                                    <div className="chart-bar-group">
                                        <div className="chart-bar-stack">
                                            <div className="bar-inference" style={{ height: "33%" }} />
                                            <div className="bar-training" style={{ height: "67%" }} />
                                        </div>
                                        <span className="chart-bar-label">2023</span>
                                    </div>
                                    <div className="chart-bar-group">
                                        <div className="chart-bar-stack">
                                            <div className="bar-inference" style={{ height: "50%" }} />
                                            <div className="bar-training" style={{ height: "50%" }} />
                                        </div>
                                        <span className="chart-bar-label">2025</span>
                                    </div>
                                    <div className="chart-bar-group">
                                        <div className="chart-bar-stack">
                                            <div className="bar-inference" style={{ height: "66%" }} />
                                            <div className="bar-training" style={{ height: "34%" }} />
                                        </div>
                                        <span className="chart-bar-label" style={{ color: "#000", fontWeight: "bold" }}>2026</span>
                                    </div>
                                    <div className="chart-bar-group">
                                        <div className="chart-bar-stack">
                                            <div className="bar-inference" style={{ height: "75%" }} />
                                            <div className="bar-training" style={{ height: "25%" }} />
                                        </div>
                                        <span className="chart-bar-label">2029 (P)</span>
                                    </div>
                                </div>
                                <div className="chart-legends">
                                    <div className="chart-legend-item">
                                        <span className="legend-color inference" />
                                        <span>Inference (Ops)</span>
                                    </div>
                                    <div className="chart-legend-item">
                                        <span className="legend-color training" />
                                        <span>Training (R&D)</span>
                                    </div>
                                </div>
                            </div>

                            {/* Chart 2: Horizontal Bar Chart */}
                            <div className="chart-container-s5">
                                <div className="chart-header">
                                    <h4 className="chart-title">Enterprise Multi-Model Adoption</h4>
                                    <span className="chart-stat-callout">No Vendor Lock-In</span>
                                </div>
                                <div className="horizontal-chart">
                                    <div className="horiz-row">
                                        <div className="horiz-info">
                                            <span className="horiz-label">Active Multi-Model Production</span>
                                            <span className="horiz-val">65%</span>
                                        </div>
                                        <div className="horiz-bar-bg">
                                            <div className="horiz-bar-fill" style={{ width: "65%" }} />
                                        </div>
                                    </div>
                                    <div className="horiz-row">
                                        <div className="horiz-info">
                                            <span className="horiz-label">Projected Multi-Model (18 Months)</span>
                                            <span className="horiz-val">94%</span>
                                        </div>
                                        <div className="horiz-bar-bg">
                                            <div className="horiz-bar-fill" style={{ width: "94%" }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Detailed Drivers */}
                        <div className="s5-details">
                            <div className="s5-detail-item">
                                <div className="s5-icon-box">
                                    <HIcon icon={Rocket01Icon} size={16} color="#000" />
                                </div>
                                <div className="s5-text-box">
                                    <div className="s5-item-title">Explosion of AI Applications</div>
                                    <div className="s5-item-desc">Generative AI workloads are rapidly transitioning from experimental sandboxes into <strong>core production systems</strong> requiring enterprise-grade reliability.</div>
                                </div>
                            </div>

                            <div className="s5-detail-item">
                                <div className="s5-icon-box">
                                    <HIcon icon={ConnectIcon} size={16} color="#000" />
                                </div>
                                <div className="s5-text-box">
                                    <div className="s5-item-title">Multi-Model World</div>
                                    <div className="s5-item-desc">No single model wins. Over <strong>65% of enterprises</strong> now run multiple LLMs concurrently to optimize costs, latency, and capabilities.</div>
                                </div>
                            </div>

                            <div className="s5-detail-item">
                                <div className="s5-icon-box">
                                    <HIcon icon={UserGroupIcon} size={16} color="#000" />
                                </div>
                                <div className="s5-text-box">
                                    <div className="s5-item-title">Enterprise AI Adoption</div>
                                    <div className="s5-item-desc">Over <strong>90% of large organizations</strong> have deployed LLMs, shifting operational focus toward security, governance, and data privacy.</div>
                                </div>
                            </div>

                            <div className="s5-detail-item" style={{ border: "1px solid #000" }}>
                                <div className="s5-icon-box" style={{ background: "#eaeaea" }}>
                                    <HIcon icon={JusticeScale01Icon} size={16} color="#000" />
                                </div>
                                <div className="s5-text-box">
                                    <div className="s5-item-title">Regulatory Mandates (CBN PSS/DIR/PUB/CIR/001/004)</div>
                                    <div className="s5-item-desc">Nigeria's June 15, 2026 directive legally forces all payment transactions and customer data onto <strong>in-country local servers by January 1, 2027</strong>.</div>
                                </div>
                            </div>

                            <div className="s5-detail-item">
                                <div className="s5-icon-box">
                                    <HIcon icon={CpuIcon} size={16} color="#000" />
                                </div>
                                <div className="s5-text-box">
                                    <div className="s5-item-title">Growing Inference Demand</div>
                                    <div className="s5-item-desc">Inference has overtaken training, now accounting for <strong>two-thirds of total AI compute budgets</strong>. Caching and routing are required to manage costs.</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={`slide s6 ${isPrintMode || current === 4 ? "active" : ""}`}>
                    <div className="kicker">
                        <span className="chip-sm light"><HIcon icon={Rocket01Icon} size={15} color="#000" /></span>
                        <span className="eyebrow">Traction</span>
                    </div>
                    <div className="headline-dark" style={{ marginBottom: "5px" }}>Organic Developer Adoption & Partnerships.</div>
                    
                    <div className="s6-layout">
                        {/* Left Side: 3x2 Colored Metric Cards */}
                        <div className="s6-left">
                            <div className="traction-metric-grid">
                                <div className="traction-metric-card purple">
                                    <span className="traction-card-label">SDK Installs</span>
                                    <div className="traction-card-big">15,000+</div>
                                    <span className="traction-card-desc">NPM & PyPI downloads from global developer communities</span>
                                </div>
                                <div className="traction-metric-card blue">
                                    <span className="traction-card-label">AI Requests</span>
                                    <div className="traction-card-big">48,000+</div>
                                    <span className="traction-card-desc">Production API requests routed through gateway</span>
                                </div>
                                <div className="traction-metric-card green">
                                    <span className="traction-card-label">Active Users</span>
                                    <div className="traction-card-big">400+</div>
                                    <span className="traction-card-desc">Registered software engineers and teams onboarded</span>
                                </div>
                                <div className="traction-metric-card pink">
                                    <span className="traction-card-label">Frontier Models</span>
                                    <div className="traction-card-big">150+</div>
                                    <span className="traction-card-desc">Supported models with zero-latency load balancing</span>
                                </div>
                                <div className="traction-metric-card dark">
                                    <span className="traction-card-label">AI Providers</span>
                                    <div className="traction-card-big">16</div>
                                    <span className="traction-card-desc">Integrations including OpenAI, Anthropic, and Gemini</span>
                                </div>
                                <div className="traction-metric-card orange">
                                    <span className="traction-card-label">Integrations</span>
                                    <div className="traction-card-big">Vercel AI</div>
                                    <span className="traction-card-desc">Native modules for Vercel, Supabase, and Tanstack</span>
                                </div>
                            </div>
                        </div>

                        {/* Right Side: Enterprise Pipeline, Partnerships, Press, Community */}
                        <div className="s6-right">
                            {/* Partnerships */}
                            <div className="traction-detail-box">
                                <div className="traction-box-title">
                                    <HIcon icon={Exchange01Icon} size={16} color="#000" /> Strategic Partnerships
                                </div>
                                <div className="traction-list">
                                    <div className="traction-list-item">
                                        <HIcon icon={CheckmarkBadge01Icon} size={14} color="#059669" style={{ flexShrink: 0, marginTop: 2 }} />
                                        <span><strong>Anthropic Partnership:</strong> Official partnership to provide African developers seamless access to Claude models.</span>
                                    </div>
                                    <div className="traction-list-item">
                                        <HIcon icon={CheckmarkBadge01Icon} size={14} color="#059669" style={{ flexShrink: 0, marginTop: 2 }} />
                                        <span><strong>Univad Partnership:</strong> Accelerating ed-tech innovation by providing tech students access to frontier AI.</span>
                                    </div>
                                    <div className="traction-list-item">
                                        <HIcon icon={CheckmarkBadge01Icon} size={14} color="#059669" style={{ flexShrink: 0, marginTop: 2 }} />
                                        <span><strong>Developer Moat:</strong> Co-authored bridges with Tanstack & Vercel AI SDK to scale developer adoption.</span>
                                    </div>
                                </div>
                            </div>

                            {/* Enterprise talks & Community */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                <div className="traction-detail-box" style={{ padding: "14px 16px" }}>
                                    <div className="traction-box-title" style={{ fontSize: "12px" }}>
                                        <HIcon icon={BankIcon} size={14} color="#000" /> Enterprise Pipeline
                                    </div>
                                    <div className="traction-list" style={{ gap: "6px" }}>
                                        <div className="traction-list-item" style={{ fontSize: "11.5px" }}>
                                            <span style={{ color: "#8b5cf6", fontWeight: "bold" }}>UBA:</span>
                                            <span>In talks with one of the largest banks in Africa.</span>
                                        </div>
                                        <div className="traction-list-item" style={{ fontSize: "11.5px" }}>
                                            <span style={{ color: "#3b82f6", fontWeight: "bold" }}>Risevest:</span>
                                            <span>Fintech enterprise pilot discussions.</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="traction-detail-box" style={{ padding: "14px 16px" }}>
                                    <div className="traction-box-title" style={{ fontSize: "12px" }}>
                                        <HIcon icon={UserGroupIcon} size={14} color="#000" /> Community
                                    </div>
                                    <div className="comm-grid">
                                        <div className="comm-item">
                                            <span className="comm-val">487</span>
                                            <span className="comm-label">X/TW</span>
                                        </div>
                                        <div className="comm-item">
                                            <span className="comm-val">278</span>
                                            <span className="comm-label">IN</span>
                                        </div>
                                        <div className="comm-item">
                                            <span className="comm-val">156</span>
                                            <span className="comm-label">DISC</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Press mentions */}
                            <div className="traction-detail-box" style={{ padding: "12px 18px" }}>
                                <div className="traction-box-title" style={{ fontSize: "12px", borderBottom: "none", paddingBottom: 0, marginBottom: 4 }}>
                                    Featured Press & Media
                                </div>
                                <div className="press-badges">
                                    <span className="press-badge">TechCabal</span>
                                    <span className="press-badge">Techloy</span>
                                    <span className="press-badge">Consonance</span>
                                    <span className="press-badge">Tech with Africa</span>
                                    <span className="press-badge">TechCrier</span>
                                    <span className="press-badge">AU Startups</span>
                                    <span className="press-badge">iAfrica</span>
                                    <span className="press-badge" style={{ background: "#000", color: "#fff" }}>Hot Startup of the Month</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SLIDE 7 - GO-TO-MARKET */}
                <div className={`slide s7 ${isPrintMode || current === 5 ? "active" : ""}`}>
                    <div className="kicker">
                        <span className="chip-sm light"><HIcon icon={Exchange01Icon} size={15} color="#737373" /></span>
                        <span className="eyebrow">Go-to-Market Strategy</span>
                    </div>
                    <div className="headline-dark" style={{ marginBottom: "2px" }}>The Compliance Wedge + Developer Groundswell.</div>
                    <div className="body-dark" style={{ maxWidth: "800px", fontSize: "13.5px", color: "#666", marginBottom: "16px" }}>
                        Cencori secures high-value enterprise accounts forced local by sovereign compliance, while scaling bottom-up developer volume to establish the regional AI standard.
                    </div>

                    <div className="gtm-layout">
                        {/* Core Motions */}
                        <div className="gtm-vectors">
                            {/* Enterprise First */}
                            <div className="gtm-card ent-card">
                                <div className="gtm-accent-bar blue"></div>
                                <div className="gtm-card-body">
                                    <div className="gtm-card-head">
                                        <span className="gtm-card-pill highlight">Enterprise First</span>
                                        <span className="gtm-card-badge status-primary">Primary Wedge</span>
                                    </div>
                                    <div className="gtm-card-title-lg">Sovereign Compliance & Nodes</div>
                                    <div className="gtm-card-desc-lg">
                                        Targeting 3-5 Tier-1 Financial Institutions (currently in talks with UBA) facing the strict <strong>CBN-2027 localization mandate</strong>.
                                    </div>
                                    <div className="gtm-card-bullet-grid">
                                        <div className="gtm-bullet">
                                            <HIcon icon={Agreement01Icon} size={14} color="#000" style={{ flexShrink: 0, marginTop: 1 }} />
                                            <span><strong>$15K-$30K/mo MRR</strong> per node deployment plus initial setup fees</span>
                                        </div>
                                        <div className="gtm-bullet">
                                            <HIcon icon={SecurityCheckIcon} size={14} color="#000" style={{ flexShrink: 0, marginTop: 1 }} />
                                            <span><strong>CBN Readiness:</strong> Legally mandatory compliance by Jan 1, 2027 underwrites the hardware CapEx</span>
                                        </div>
                                        <div className="gtm-bullet">
                                            <HIcon icon={CpuIcon} size={14} color="#000" style={{ flexShrink: 0, marginTop: 1 }} />
                                            <span><strong>Sovereign Nodes:</strong> High-margin dedicated cloud infrastructure funded by anchors</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Developer Second */}
                            <div className="gtm-card dev-card">
                                <div className="gtm-accent-bar green"></div>
                                <div className="gtm-card-body">
                                    <div className="gtm-card-head">
                                        <span className="gtm-card-pill">Developer Second</span>
                                        <span className="gtm-card-badge status-live">Live & Scaling</span>
                                    </div>
                                    <div className="gtm-card-title-lg">Product-Led Growth (PLG) Gateway</div>
                                    <div className="gtm-card-desc-lg">
                                        Bottom-up volume driving regional adoption. Developers start with the secure API gateway and grow into team workspaces and compute.
                                    </div>
                                    <div className="gtm-card-bullet-grid">
                                        <div className="gtm-bullet">
                                            <HIcon icon={Rocket01Icon} size={14} color="#000" style={{ flexShrink: 0, marginTop: 1 }} />
                                            <span><strong>Naira Billing:</strong> Zero FX friction drives easy adoption for startups and local developers</span>
                                        </div>
                                        <div className="gtm-bullet">
                                            <HIcon icon={UserGroupIcon} size={14} color="#000" style={{ flexShrink: 0, marginTop: 1 }} />
                                            <span><strong>Self-Serve Scale:</strong> Heavy organic volume (15k+ downloads, 400 active developers)</span>
                                        </div>
                                        <div className="gtm-bullet">
                                            <HIcon icon={Exchange01Icon} size={14} color="#000" style={{ flexShrink: 0, marginTop: 1 }} />
                                            <span><strong>Upsell Pipeline:</strong> Scaling developer apps feed back into the Enterprise compliance funnel</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Accelerators Grid */}
                        <div className="gtm-multipliers">
                            {/* Partners */}
                            <div className="gtm-card-sm">
                                <div className="gtm-sm-head">
                                    <div className="gtm-sm-icon"><HIcon icon={UserGroupIcon} size={14} color="#000" /></div>
                                    <span className="gtm-sm-label">Partners</span>
                                </div>
                                <div className="gtm-sm-title">Strategic Ecosystem</div>
                                <div className="gtm-sm-text">
                                    <strong>Anthropic Partnership:</strong> Easy direct Claude access. 
                                    <br /><strong>Univad Partnership:</strong> Accelerating student developer onboarding.
                                </div>
                            </div>

                            {/* Integrations */}
                            <div className="gtm-card-sm">
                                <div className="gtm-sm-head">
                                    <div className="gtm-sm-icon"><HIcon icon={Configuration01Icon} size={14} color="#000" /></div>
                                    <span className="gtm-sm-label">Integrations</span>
                                </div>
                                <div className="gtm-sm-title">Developer Moat</div>
                                <div className="gtm-sm-text">
                                    Out-of-the-box support for <strong>Vercel, Supabase, TanStack</strong>. Co-authored library bridges prevent friction.
                                </div>
                            </div>

                            {/* Community */}
                            <div className="gtm-card-sm">
                                <div className="gtm-sm-head">
                                    <div className="gtm-sm-icon"><HIcon icon={UserGroupIcon} size={14} color="#fff" /></div>
                                    <span className="gtm-sm-label">Community</span>
                                </div>
                                <div className="gtm-sm-title">Organic Groundswell</div>
                                <div className="gtm-sm-text">
                                    <strong>900+ multi-channel developers</strong> (Twitter, LinkedIn, Discord) contributing pull requests and templates.
                                </div>
                            </div>

                            {/* Content */}
                            <div className="gtm-card-sm">
                                <div className="gtm-sm-head">
                                    <div className="gtm-sm-icon"><HIcon icon={SourceCodeIcon} size={14} color="#000" /></div>
                                    <span className="gtm-sm-label">Content</span>
                                </div>
                                <div className="gtm-sm-title">Education & Playbooks</div>
                                <div className="gtm-sm-text">
                                    Developer guides, compliance blueprints, and community-authored wrappers (e.g. Vercel provider) driving self-serve growth.
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="gtm-bridge-new" style={{ marginTop: "14px", padding: "10px 18px", border: "1px dashed #d4d4d4", borderRadius: "8px", display: "flex", gap: "10px", alignItems: "center" }}>
                        <span className="chip-sm light" style={{ background: '#f5f5f5', color: '#000', border: '1px solid #e5e5e5', padding: '4px 8px', borderRadius: '4px', height: 'fit-content' }}>
                            <HIcon icon={Exchange01Icon} size={14} color="#000" />
                        </span>
                        <span style={{ fontSize: '12.5px', color: '#555' }}>
                            <strong>The Flywheel:</strong> Anchor banks underwrite local hardware CapEx (Lagos Node) to offer cheaper regional serverless GPU compute, drawing developers whose scaling workloads feed the enterprise pipeline.
                        </span>
                    </div>
                </div>

                {/* SLIDE 7b - BUSINESS MODEL & FINANCIALS */}
                <div className={`slide s7b ${isPrintMode || current === 6 ? "active" : ""}`}>
                    <div className="kicker">
                        <span className="chip-sm light"><HIcon icon={Coins01Icon} size={15} color="#000" /></span>
                        <span className="eyebrow">Business Model & Timeline</span>
                    </div>
                    <div className="headline-dark" style={{ marginBottom: "2px" }}>Validated Demand → Gating & Monetization.</div>
                    <div className="body-dark" style={{ fontSize: "13.5px", color: "#666", marginBottom: "8px" }}>Launched Jan 5 in open developer beta. Currently <strong>pre-revenue</strong> with organic validation (15k installs). Gating starts <strong>July 2026</strong>.</div>
                    
                    <div className="s7b-layout">
                        {/* Left Column: Revenue Model Today & Expansion */}
                        <div className="s7b-left">
                            <div className="biz-model-grid">
                                <div className="biz-card">
                                    <div className="biz-icon-box">
                                        <HIcon icon={ConnectIcon} size={18} color="#000" />
                                    </div>
                                    <div className="biz-text-box">
                                        <div className="biz-card-title">
                                            AI Gateway Usage Markup
                                            <span className="biz-status-pill beta">July Gating</span>
                                        </div>
                                        <div className="biz-card-desc">Cencori charges a <strong>5% to 15% markup</strong> on top of raw API token consumption routed through the gateway, collected automatically via Stripe Connect.</div>
                                    </div>
                                </div>
                                <div className="biz-card">
                                    <div className="biz-icon-box">
                                        <HIcon icon={Calendar03Icon} size={18} color="#000" />
                                    </div>
                                    <div className="biz-text-box">
                                        <div className="biz-card-title">
                                            SaaS Subscriptions
                                            <span className="biz-status-pill beta">July Gating</span>
                                        </div>
                                        <div className="biz-card-desc">Developer/Team seats: <strong>Pro plan ($49/mo)</strong> and <strong>Team plan ($149/mo)</strong> offering advanced rate limits, SSO, and native billing modules.</div>
                                    </div>
                                </div>
                                <div className="biz-card">
                                    <div className="biz-icon-box">
                                        <HIcon icon={BankIcon} size={18} color="#000" />
                                    </div>
                                    <div className="biz-text-box">
                                        <div className="biz-card-title">
                                            Enterprise Sovereignty
                                            <span className="biz-status-pill planned">In Pipeline</span>
                                        </div>
                                        <div className="biz-card-desc">Private node deployment, custom latency parameters, PII scrubbing compliance audits. Tier-1 banks contract at a <strong>$240K/yr base license</strong>.</div>
                                    </div>
                                </div>
                                <div className="biz-card">
                                    <div className="biz-icon-box">
                                        <HIcon icon={CpuIcon} size={18} color="#000" />
                                    </div>
                                    <div className="biz-text-box">
                                        <div className="biz-card-title">
                                            Sovereign Compute Usage
                                            <span className="biz-status-pill planned">Planned</span>
                                        </div>
                                        <div className="biz-card-desc">Hardware-backed margin: On-demand and reserved local GPU/CPU compute billing once the Lagos Node is active, targeting <strong>60-70% gross margins</strong>.</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: 36-Month Projections & Burn Rate */}
                        <div className="s7b-right">
                            <div className="financial-table-box">
                                <table className="financial-table">
                                    <thead>
                                        <tr>
                                            <th>Forecast Timeline</th>
                                            <th>M0–M6 (Jan-Jun '26)</th>
                                            <th>Month 12 (Dec '26)</th>
                                            <th>Month 24 (Dec '27)</th>
                                            <th>Month 36 (Dec '28)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td><strong>Annual Revenue (ARR)</strong></td>
                                            <td className="fin-metric-bold" style={{ color: "#d97706" }}>$0 (Beta Phase)</td>
                                            <td className="fin-metric-bold">$250,000</td>
                                            <td className="fin-metric-bold">$2,200,000</td>
                                            <td className="fin-metric-bold">$6,800,000</td>
                                        </tr>
                                        <tr>
                                            <td>Average Monthly Burn</td>
                                            <td className="fin-metric-code">$35,000</td>
                                            <td className="fin-metric-code">$120,000</td>
                                            <td className="fin-metric-code">$180,000</td>
                                            <td className="fin-metric-code">$250,000</td>
                                        </tr>
                                        <tr>
                                            <td>Blended Gross Margins</td>
                                            <td className="fin-metric-code">—</td>
                                            <td className="fin-metric-code" style={{ color: "#059669" }}>85% (SaaS)</td>
                                            <td className="fin-metric-code" style={{ color: "#059669" }}>75% (Mixed)</td>
                                            <td className="fin-metric-code" style={{ color: "#059669" }}>70% (Compute)</td>
                                        </tr>
                                        <tr>
                                            <td>Active Developers</td>
                                            <td>400 active devs</td>
                                            <td>1,500 devs</td>
                                            <td>4,200 devs</td>
                                            <td>10,000+ devs</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Projections Visual line chart */}
                            <div className="fin-chart-container" style={{ marginTop: "8px" }}>
                                <div className="fin-chart-header">
                                    <span className="fin-chart-title">36-Month ARR Projection</span>
                                    <span className="fin-metric-bold" style={{ color: "#000", fontSize: "14px" }}>Target: $6.8M ARR</span>
                                </div>
                                <div className="fin-chart" style={{ display: "block", height: "220px", padding: "0 4px" }}>
                                    <svg viewBox="0 0 560 320" style={{ width: "100%", height: "100%" }}>
                                        <defs>
                                            <linearGradient id="area-mono" x1="0%" y1="0%" x2="0%" y2="100%">
                                                <stop offset="0%" stopColor="#000" stopOpacity="0.10" />
                                                <stop offset="100%" stopColor="#000" stopOpacity="0.0" />
                                            </linearGradient>
                                        </defs>

                                        {/* Y-axis labels */}
                                        <text x="38" y="38" textAnchor="end" fontSize="11px" fontFamily="var(--font-code)" fill="#bbb">$7M</text>
                                        <text x="38" y="88" textAnchor="end" fontSize="11px" fontFamily="var(--font-code)" fill="#bbb">$5M</text>
                                        <text x="38" y="148" textAnchor="end" fontSize="11px" fontFamily="var(--font-code)" fill="#bbb">$3M</text>
                                        <text x="38" y="218" textAnchor="end" fontSize="11px" fontFamily="var(--font-code)" fill="#bbb">$1M</text>
                                        <text x="38" y="278" textAnchor="end" fontSize="11px" fontFamily="var(--font-code)" fill="#bbb">$0</text>

                                        {/* Horizontal grid lines */}
                                        <line x1="48" y1="35" x2="530" y2="35" stroke="#f0f0f0" />
                                        <line x1="48" y1="85" x2="530" y2="85" stroke="#f0f0f0" />
                                        <line x1="48" y1="145" x2="530" y2="145" stroke="#f0f0f0" />
                                        <line x1="48" y1="215" x2="530" y2="215" stroke="#f0f0f0" />
                                        <line x1="48" y1="275" x2="530" y2="275" stroke="#e0e0e0" />

                                        {/* Area fill */}
                                        <path d="M 80 275 L 200 275 L 320 265 L 420 145 L 510 42 L 510 275 Z" fill="url(#area-mono)" />

                                        {/* Line path */}
                                        <path d="M 80 275 L 200 275 L 320 265 L 420 145 L 510 42" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                                        {/* Dashed line from M6 gating start */}
                                        <line x1="200" y1="275" x2="200" y2="25" stroke="#d0d0d0" strokeWidth="1" strokeDasharray="5,5" />
                                        <text x="200" y="20" textAnchor="middle" fontSize="10px" fontFamily="var(--font-code)" fill="#aaa" fontStyle="italic">Gating starts</text>

                                        {/* Data points */}
                                        <circle cx="80" cy="275" r="7" fill="#fff" stroke="#000" strokeWidth="2.5" />
                                        <circle cx="200" cy="275" r="7" fill="#fff" stroke="#000" strokeWidth="2.5" />
                                        <circle cx="320" cy="265" r="7" fill="#fff" stroke="#000" strokeWidth="2.5" />
                                        <circle cx="420" cy="145" r="7" fill="#fff" stroke="#000" strokeWidth="2.5" />
                                        <circle cx="510" cy="42" r="8" fill="#000" stroke="#fff" strokeWidth="2.5" />

                                        {/* Value labels */}
                                        <text x="80" y="260" textAnchor="middle" fontSize="13px" fontWeight="700" fontFamily="var(--font-code)" fill="#000">$0</text>
                                        <text x="200" y="260" textAnchor="middle" fontSize="13px" fontWeight="700" fontFamily="var(--font-code)" fill="#000">$0</text>
                                        <text x="320" y="250" textAnchor="middle" fontSize="13px" fontWeight="700" fontFamily="var(--font-code)" fill="#000">$250K</text>
                                        <text x="420" y="132" textAnchor="middle" fontSize="13px" fontWeight="700" fontFamily="var(--font-code)" fill="#000">$2.2M</text>
                                        <text x="510" y="28" textAnchor="middle" fontSize="14px" fontWeight="800" fontFamily="var(--font-code)" fill="#000">$6.8M</text>

                                        {/* X-axis labels */}
                                        <text x="80" y="298" textAnchor="middle" fontSize="11px" fontFamily="var(--font-code)" fill="#999">Jan &apos;26</text>
                                        <text x="200" y="298" textAnchor="middle" fontSize="11px" fontFamily="var(--font-code)" fill="#999">Jun &apos;26</text>
                                        <text x="320" y="298" textAnchor="middle" fontSize="11px" fontFamily="var(--font-code)" fill="#999">Month 12</text>
                                        <text x="420" y="298" textAnchor="middle" fontSize="11px" fontFamily="var(--font-code)" fill="#999">Month 24</text>
                                        <text x="510" y="298" textAnchor="middle" fontSize="11px" fontWeight="700" fontFamily="var(--font-code)" fill="#000">Month 36</text>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SLIDE 8 - MARKET OPPORTUNITY */}
                <div className={`slide s8 ${isPrintMode || current === 7 ? "active" : ""}`}>
                    <div className="kicker">
                        <span className="chip-sm light"><BarChartIcon fill="#000" width={15} height={15} /></span>
                        <span className="eyebrow">Market</span>
                    </div>
                    <div className="headline-dark" style={{ marginBottom: "5px" }}>Deconstructing the $223B+ AI Infrastructure Boom.</div>
                    
                    <div className="s8-layout">
                        {/* Column 1: Nested Market Layers */}
                        <div className="s8-col-1">
                            <div className="market-funnel">
                                <div className="funnel-layer">
                                    <div className="funnel-meta">
                                        <div className="funnel-title">AI Infrastructure (TAM)</div>
                                        <div className="funnel-desc">Global compute, specialized hardware, and AI hosting layer</div>
                                    </div>
                                    <div className="funnel-value">$223.5B</div>
                                </div>
                                <div className="funnel-layer" style={{ marginLeft: "10px", width: "calc(100% - 10px)" }}>
                                    <div className="funnel-meta">
                                        <div className="funnel-title">Cloud Infrastructure (SAM)</div>
                                        <div className="funnel-desc">Total GenAI-driven cloud hosting spend by 2030 (Goldman Sachs)</div>
                                    </div>
                                    <div className="funnel-value">$200.0B</div>
                                </div>
                                <div className="funnel-layer" style={{ marginLeft: "20px", width: "calc(100% - 20px)" }}>
                                    <div className="funnel-meta">
                                        <div className="funnel-title">Enterprise AI (SOM)</div>
                                        <div className="funnel-desc">Enterprise governance, middleware, and security compliance software</div>
                                    </div>
                                    <div className="funnel-value">$80.0B</div>
                                </div>
                                <div className="funnel-layer" style={{ marginLeft: "30px", width: "calc(100% - 30px)" }}>
                                    <div className="funnel-meta">
                                        <div className="funnel-title">Developer Infrastructure</div>
                                        <div className="funnel-desc">Specialized API gateways, prompt caching, and SDK orchestration</div>
                                    </div>
                                    <div className="funnel-value">CAGR 30.4%</div>
                                </div>
                                <div className="funnel-layer" style={{ marginLeft: "40px", width: "calc(100% - 40px)", borderColor: "#000", background: "#fbfbfb" }}>
                                    <div className="funnel-meta">
                                        <div className="funnel-title" style={{ fontWeight: "700" }}>Emerging Markets (Target)</div>
                                        <div className="funnel-desc">African cloud & sovereign compute spend, accelerated by CBN 2027</div>
                                    </div>
                                    <div className="funnel-value" style={{ color: "#000", fontWeight: "700" }}>$10.0B+</div>
                                </div>
                            </div>
                        </div>

                        {/* Column 2: Growth Charts */}
                        <div className="s8-col-2">
                            {/* Chart 1: Market Growth */}
                            <div className="chart-container-s8">
                                <div className="chart-header">
                                    <h4 className="chart-title">AI Cloud Infrastructure Spend</h4>
                                    <span className="chart-stat-callout">30.4% CAGR</span>
                                </div>
                                <div className="area-chart">
                                    <div className="area-chart-grid">
                                        <div className="grid-line" />
                                        <div className="grid-line" />
                                        <div className="grid-line" />
                                    </div>
                                    <div className="area-chart-bar-group">
                                        <div className="area-chart-bar">
                                            <div className="area-chart-fill" style={{ height: "20%", backgroundColor: "#3b82f6" }}>
                                                <span className="area-chart-val-label">$45B</span>
                                            </div>
                                        </div>
                                        <span className="area-chart-label">2024</span>
                                    </div>
                                    <div className="area-chart-bar-group">
                                        <div className="area-chart-bar">
                                            <div className="area-chart-fill" style={{ height: "38%", backgroundColor: "#8b5cf6" }}>
                                                <span className="area-chart-val-label">$85B</span>
                                            </div>
                                        </div>
                                        <span className="area-chart-label">2026</span>
                                    </div>
                                    <div className="area-chart-bar-group">
                                        <div className="area-chart-bar">
                                            <div className="area-chart-fill" style={{ height: "67%", backgroundColor: "#ec4899" }}>
                                                <span className="area-chart-val-label">$150B</span>
                                            </div>
                                        </div>
                                        <span className="area-chart-label">2028</span>
                                    </div>
                                    <div className="area-chart-bar-group">
                                        <div className="area-chart-bar">
                                            <div className="area-chart-fill" style={{ height: "100%", backgroundColor: "#ef4444" }}>
                                                <span className="area-chart-val-label">$223B</span>
                                            </div>
                                        </div>
                                        <span className="area-chart-label" style={{ color: "#000", fontWeight: "bold" }}>2030 (P)</span>
                                    </div>
                                </div>
                            </div>

                            {/* Chart 2: African Cloud Market SOM */}
                            <div className="chart-container-s8">
                                <div className="chart-header">
                                    <h4 className="chart-title">African Cloud Market (SOM)</h4>
                                    <span className="chart-stat-callout">Sovereignty Catalyst</span>
                                </div>
                                <div className="area-chart">
                                    <div className="area-chart-grid">
                                        <div className="grid-line" />
                                        <div className="grid-line" />
                                        <div className="grid-line" />
                                    </div>
                                    <div className="area-chart-bar-group">
                                        <div className="area-chart-bar">
                                            <div className="area-chart-fill" style={{ height: "24%", backgroundColor: "#10b981" }}>
                                                <span className="area-chart-val-label">$2.5B</span>
                                            </div>
                                        </div>
                                        <span className="area-chart-label">2024</span>
                                    </div>
                                    <div className="area-chart-bar-group">
                                        <div className="area-chart-bar">
                                            <div className="area-chart-fill" style={{ height: "46%", backgroundColor: "#059669" }}>
                                                <span className="area-chart-val-label">$4.8B</span>
                                            </div>
                                        </div>
                                        <span className="area-chart-label">2026</span>
                                    </div>
                                    <div className="area-chart-bar-group">
                                        <div className="area-chart-bar">
                                            <div className="area-chart-fill" style={{ height: "69%", backgroundColor: "#3b82f6" }}>
                                                <span className="area-chart-val-label">$7.2B</span>
                                            </div>
                                        </div>
                                        <span className="area-chart-label">2028</span>
                                    </div>
                                    <div className="area-chart-bar-group">
                                        <div className="area-chart-bar">
                                            <div className="area-chart-fill" style={{ height: "100%", backgroundColor: "#8b5cf6" }}>
                                                <span className="area-chart-val-label">$10.4B</span>
                                            </div>
                                        </div>
                                        <span className="area-chart-label" style={{ color: "#000", fontWeight: "bold" }}>2030 (P)</span>
                                    </div>
                                </div>
                            </div>

                            {/* Chart 3: GPU Inference Demand Scale */}
                            <div className="chart-container-s8">
                                <div className="chart-header">
                                    <h4 className="chart-title">Inference GPU Demand Scale</h4>
                                    <span className="chart-stat-callout">18.5x Growth</span>
                                </div>
                                <div className="area-chart">
                                    <div className="area-chart-grid">
                                        <div className="grid-line" />
                                        <div className="grid-line" />
                                        <div className="grid-line" />
                                    </div>
                                    <div className="area-chart-bar-group">
                                        <div className="area-chart-bar">
                                            <div className="area-chart-fill" style={{ height: "5%", backgroundColor: "#3b82f6" }}>
                                                <span className="area-chart-val-label">1x</span>
                                            </div>
                                        </div>
                                        <span className="area-chart-label">2024</span>
                                    </div>
                                    <div className="area-chart-bar-group">
                                        <div className="area-chart-bar">
                                            <div className="area-chart-fill" style={{ height: "23%", backgroundColor: "#8b5cf6" }}>
                                                <span className="area-chart-val-label">4.2x</span>
                                             </div>
                                        </div>
                                        <span className="area-chart-label">2026</span>
                                    </div>
                                    <div className="area-chart-bar-group">
                                        <div className="area-chart-bar">
                                            <div className="area-chart-fill" style={{ height: "52%", backgroundColor: "#ec4899" }}>
                                                <span className="area-chart-val-label">9.6x</span>
                                            </div>
                                        </div>
                                        <span className="area-chart-label">2028</span>
                                    </div>
                                    <div className="area-chart-bar-group">
                                        <div className="area-chart-bar">
                                            <div className="area-chart-fill" style={{ height: "100%", backgroundColor: "#ef4444" }}>
                                                <span className="area-chart-val-label">18.5x</span>
                                            </div>
                                        </div>
                                        <span className="area-chart-label" style={{ color: "#000", fontWeight: "bold" }}>2030 (P)</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Column 3: Distribution & Workload Charts */}
                        <div className="s8-col-3">
                            {/* Chart 4: Pie Chart (Enterprise LLM Spend Share) */}
                            <div className="chart-container-s8">
                                <div className="chart-header">
                                    <h4 className="chart-title">Enterprise LLM Spend Share</h4>
                                    <span className="chart-stat-callout">Multi-Vendor reality</span>
                                </div>
                                <div className="pie-chart-wrapper">
                                    <div className="pie-chart" />
                                    <div className="pie-legend">
                                        <div className="pie-legend-item">
                                            <span className="legend-dot" style={{ backgroundColor: "#111111" }} />
                                            <span>OpenAI (43%)</span>
                                        </div>
                                        <div className="pie-legend-item">
                                            <span className="legend-dot" style={{ backgroundColor: "#8b5cf6" }} />
                                            <span>Anthropic (28%)</span>
                                        </div>
                                        <div className="pie-legend-item">
                                            <span className="legend-dot" style={{ backgroundColor: "#3b82f6" }} />
                                            <span>Google (16%)</span>
                                        </div>
                                        <div className="pie-legend-item">
                                            <span className="legend-dot" style={{ backgroundColor: "#10b981" }} />
                                            <span>Meta (7%)</span>
                                        </div>
                                        <div className="pie-legend-item">
                                            <span className="legend-dot" style={{ backgroundColor: "#ef4444" }} />
                                            <span>Others (6%)</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Chart 5: AI OpEx Budget Allocation (Horizontal Stacked Bar) */}
                            <div className="chart-container-s8">
                                <div className="chart-header">
                                    <h4 className="chart-title">AI OpEx Budget Allocation</h4>
                                    <span className="chart-stat-callout">Inference Dominates</span>
                                </div>
                                <div className="stacked-bar-chart-horiz">
                                    <div className="stacked-segment" style={{ width: "65%", backgroundColor: "#8b5cf6" }}>65%</div>
                                    <div className="stacked-segment" style={{ width: "18%", backgroundColor: "#3b82f6" }}>18%</div>
                                    <div className="stacked-segment" style={{ width: "17%", backgroundColor: "#10b981" }}>17%</div>
                                </div>
                                <div className="chart-legends-s8" style={{ marginTop: "6px" }}>
                                    <div className="chart-legend-item-s8">
                                        <span className="legend-color-s8" style={{ backgroundColor: "#8b5cf6", borderRadius: "50%" }} />
                                        <span>Inference</span>
                                    </div>
                                    <div className="chart-legend-item-s8">
                                        <span className="legend-color-s8" style={{ backgroundColor: "#3b82f6", borderRadius: "50%" }} />
                                        <span>Data/Egress</span>
                                    </div>
                                    <div className="chart-legend-item-s8">
                                        <span className="legend-color-s8" style={{ backgroundColor: "#10b981", borderRadius: "50%" }} />
                                        <span>R&D</span>
                                    </div>
                                </div>
                            </div>

                            {/* Chart 6: Compute Workload Allocation */}
                            <div className="chart-container-s8">
                                <div className="chart-header">
                                    <h4 className="chart-title">Compute Workload Allocation</h4>
                                    <span className="chart-stat-callout">Inference Overtakes</span>
                                </div>
                                <div className="multi-bar-chart">
                                    <div className="area-chart-grid">
                                        <div className="grid-line" />
                                        <div className="grid-line" />
                                        <div className="grid-line" />
                                    </div>
                                    <div className="multi-bar-bar-group">
                                        <div className="multi-bar-group">
                                            <div className="multi-bar-val secondary" style={{ height: "60%" }}>
                                                <span className="multi-bar-val-label">60%</span>
                                            </div>
                                            <div className="multi-bar-val primary" style={{ height: "40%" }}>
                                                <span className="multi-bar-val-label">40%</span>
                                            </div>
                                        </div>
                                        <span className="multi-bar-label">2024</span>
                                    </div>
                                    <div className="multi-bar-bar-group">
                                        <div className="multi-bar-group">
                                            <div className="multi-bar-val secondary" style={{ height: "34%" }}>
                                                <span className="multi-bar-val-label">34%</span>
                                            </div>
                                            <div className="multi-bar-val primary" style={{ height: "66%" }}>
                                                <span className="multi-bar-val-label">66%</span>
                                            </div>
                                        </div>
                                        <span className="multi-bar-label" style={{ color: "#000", fontWeight: "bold" }}>2026</span>
                                    </div>
                                    <div className="multi-bar-bar-group">
                                        <div className="multi-bar-group">
                                            <div className="multi-bar-val secondary" style={{ height: "25%" }}>
                                                <span className="multi-bar-val-label">25%</span>
                                            </div>
                                            <div className="multi-bar-val primary" style={{ height: "75%" }}>
                                                <span className="multi-bar-val-label">75%</span>
                                            </div>
                                        </div>
                                        <span className="multi-bar-label">2028 (P)</span>
                                    </div>
                                </div>
                                <div className="chart-legends-s8">
                                    <div className="chart-legend-item-s8">
                                        <span className="legend-color-s8 primary" />
                                        <span>Inference</span>
                                    </div>
                                    <div className="chart-legend-item-s8">
                                        <span className="legend-color-s8 secondary" />
                                        <span>Training</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SLIDE 9 - TEAM */}
                <div className={`slide s9 ${isPrintMode || current === 8 ? "active" : ""}`}>
                    <div className="s9-left">
                        <div className="kicker">
                            <span className="chip-sm light"><HIcon icon={UserGroupIcon} size={15} color="#000" /></span>
                            <span className="eyebrow">The Team</span>
                        </div>
                        <div className="headline-dark" style={{ fontSize: "clamp(26px,3.2vw,40px)" }}>Operators who shipped<br />before fundraising.</div>
                        <div className="body-dark">Everything on the previous slides was built by this founding team before raising a dollar: the live gateway, the SDKs, the partnership.</div>
                        <div className="team-member">
                            <img src="/roy.png" alt="Bola Roy Banjo" className="team-avatar" />
                            <div className="team-info">
                                <div className="team-name">Bola Roy Banjo</div>
                                <div className="team-title">CEO & Co-founder</div>
                                <div className="team-bio">Built Cencori from zero to a production-grade AI gateway, billing, dashboard, and SDKs. A BSc Mechanical Engineering foundation brings a systems-and-hardware mind to AI infrastructure from first principles: exactly what a vertically integrated, hardware-enabled cloud demands.</div>
                            </div>
                        </div>
                        <hr className="team-divider" />
                        <div className="team-member">
                            <img src="/daniel-avatar.png" alt="Oreofe Ojurereoluwa Daniel" className="team-avatar" />
                            <div className="team-info">
                                <div className="team-name">Oreofe Ojurereoluwa Daniel</div>
                                <div className="team-title">COO & Co-founder</div>
                                <div className="team-bio">Owns operations and business infrastructure: compliance frameworks, vendor and facility negotiations, partnership pipelines, and the operational discipline to stand up a co-located node and onboard regulated clients.</div>
                            </div>
                        </div>
                    </div>
                    <div className="s9-right">
                        <div className="kicker">
                            <span className="chip-sm light"><HIcon icon={CheckmarkBadge01Icon} size={15} color="#000" /></span>
                            <span className="eyebrow">Why This Team Wins</span>
                        </div>
                        <div className="s9-stat">
                            <HIcon icon={CheckmarkBadge01Icon} size={20} color="#000" style={{ flexShrink: 0, marginTop: 1 }} />
                            <div><div className="s9-stat-label">Proof</div><div className="s9-stat-text"><strong>A live gateway, 350+ developers, and an Anthropic partnership, built with zero institutional capital.</strong> This team executes under constraint. Resourced, it builds at the pace of a funded company.</div></div>
                        </div>
                        <div className="s9-stat">
                            <HIcon icon={ChipIcon} size={20} color="#000" style={{ flexShrink: 0, marginTop: 1 }} />
                            <div><div className="s9-stat-label">Systems</div><div className="s9-stat-text"><strong>Hardware is not a pivot; it's the thesis.</strong> A mechanical-engineering foundation makes the co-located, silicon-isolated infrastructure roadmap a natural extension of how this team already thinks.</div></div>
                        </div>
                        <div className="s9-stat" style={{ marginBottom: 0 }}>
                            <HIcon icon={EarthLockIcon} size={20} color="#000" style={{ flexShrink: 0, marginTop: 1 }} />
                            <div><div className="s9-stat-label">Conviction</div><div className="s9-stat-text"><strong>Building the sovereign cloud for the intelligence era.</strong> Not a feature, not a wrapper: the compliant infrastructure layer an entire region will be required to run on.</div></div>
                        </div>
                    </div>
                </div>

                {/* SLIDE 10 - THE ASK */}
                <div className={`slide s10 ${isPrintMode || current === 9 ? "active" : ""}`}>
                    <div className="kicker">
                        <span className="chip-sm light"><HIcon icon={Rocket01Icon} size={15} color="#737373" /></span>
                        <span className="eyebrow">The Ask</span>
                    </div>
                    <div className="headline-dark">$500K at a $5M valuation.</div>
                    <div className="ask-grid">
                        <div className="ask-cell featured">
                            <div className="ask-label dark">Raising</div>
                            <div className="ask-value dark" style={{ fontSize: "40px" }}>$500,000</div>
                            <div className="ask-value-sub dark">Pre-seed · SAFE at $5M Valuation</div>
                        </div>
                        <div className="ask-cell">
                            <div className="ask-label">What the Capital Accomplishes</div>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", color: "#555", lineHeight: "1.4" }}>
                                <tbody>
                                    <tr style={{ borderBottom: "1px solid #f0f0f0" }}><td style={{ padding: "5px 0" }}><strong>Expand Engineering:</strong> Harden core serverless GPU stack & sovereign hypervisors</td></tr>
                                    <tr style={{ borderBottom: "1px solid #f0f0f0" }}><td style={{ padding: "5px 0" }}><strong>Enterprise Sales:</strong> Accelerate pipeline for CBN-2027 compliant banking nodes</td></tr>
                                    <tr style={{ borderBottom: "1px solid #f0f0f0" }}><td style={{ padding: "5px 0" }}><strong>Compliance:</strong> Secure local data residency & security certifications (SOC 2)</td></tr>
                                    <tr style={{ borderBottom: "1px solid #f0f0f0" }}><td style={{ padding: "5px 0" }}><strong>Compute:</strong> Procure NVIDIA GPU/CPU hardware for the Lagos Node</td></tr>
                                    <tr style={{ borderBottom: "none" }}><td style={{ padding: "5px 0" }}><strong>Global Partnerships:</strong> Establish telecom & global cloud infrastructure alliances</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div className="ask-cell" style={{ gridColumn: "span 2" }}>
                            <div className="ask-label">Why Cencori Wins (The Investment Thesis)</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", marginTop: "4px" }}>
                                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                                    <HIcon icon={CheckmarkBadge01Icon} size={16} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontWeight: "700", color: "#000", fontSize: "12.5px" }}>Underwritten CapEx Flow</div>
                                        <div style={{ fontSize: "11.5px", color: "#555", marginTop: "2px" }}>Tier-1 anchor banks fund local hardware deployments, removing scaling and capital risks from day one.</div>
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                                    <HIcon icon={Shield01Icon} size={16} color="#3b82f6" style={{ marginTop: 2, flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontWeight: "700", color: "#000", fontSize: "12.5px" }}>Regulatory Lock-In</div>
                                        <div style={{ fontSize: "11.5px", color: "#555", marginTop: "2px" }}>The CBN-2027 localization mandate makes our sovereign regional cloud a legal necessity for financial institutions.</div>
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                                    <HIcon icon={UserGroupIcon} size={16} color="#8b5cf6" style={{ marginTop: 2, flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontWeight: "700", color: "#000", fontSize: "12.5px" }}>Bottom-Up Developer Gravity</div>
                                        <div style={{ fontSize: "11.5px", color: "#555", marginTop: "2px" }}>Over 15k+ downloads and 400+ active developers create an organic pipeline that feeds the enterprise funnel.</div>
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                                    <HIcon icon={Coins01Icon} size={16} color="#f59e0b" style={{ marginTop: 2, flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontWeight: "700", color: "#000", fontSize: "12.5px" }}>High-Margin Node Economics</div>
                                        <div style={{ fontSize: "11.5px", color: "#555", marginTop: "2px" }}>Each regional node generates $15K–$30K/mo MRR at 70%+ gross margins once compute is live.</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="future-glimpse-container" style={{ marginTop: "12px" }}>
                        <div className="ask-label" style={{ marginBottom: "6px" }}>A Glimpse of the Future</div>
                        <div className="future-flow" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fafafa", border: "1px solid #e5e5e5", borderRadius: "8px", padding: "10px 18px" }}>
                            <div className="flow-step" style={{ flex: 1, textAlign: "center" }}>
                                <div style={{ fontFamily: "var(--font-code)", fontSize: "8px", color: "#888", textTransform: "uppercase", fontWeight: "700" }}>Phase 1</div>
                                <div style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: "700", color: "#000", marginTop: "2px" }}>Gateway</div>
                                <div style={{ fontSize: "11px", color: "#666", marginTop: "1px" }}>Unified API & security (Live)</div>
                            </div>
                            <div className="flow-arrow" style={{ color: "#aaa", fontSize: "16px", padding: "0 10px" }}>→</div>
                            <div className="flow-step" style={{ flex: 1, textAlign: "center" }}>
                                <div style={{ fontFamily: "var(--font-code)", fontSize: "8px", color: "#888", textTransform: "uppercase", fontWeight: "700" }}>Phase 2</div>
                                <div style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: "700", color: "#000", marginTop: "2px" }}>Compute</div>
                                <div style={{ fontSize: "11px", color: "#666", marginTop: "1px" }}>Local GPU/CPU nodes</div>
                            </div>
                            <div className="flow-arrow" style={{ color: "#aaa", fontSize: "16px", padding: "0 10px" }}>→</div>
                            <div className="flow-step" style={{ flex: 1, textAlign: "center" }}>
                                <div style={{ fontFamily: "var(--font-code)", fontSize: "8px", color: "#888", textTransform: "uppercase", fontWeight: "700" }}>Phase 3</div>
                                <div style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: "700", color: "#000", marginTop: "2px" }}>Global AI Cloud</div>
                                <div style={{ fontSize: "11px", color: "#666", marginTop: "1px" }}>Multi-region mesh</div>
                            </div>
                            <div className="flow-arrow" style={{ color: "#aaa", fontSize: "16px", padding: "0 10px" }}>→</div>
                            <div className="flow-step" style={{ flex: 1, textAlign: "center" }}>
                                <div style={{ fontFamily: "var(--font-code)", fontSize: "8px", color: "#888", textTransform: "uppercase", fontWeight: "700" }}>Phase 4</div>
                                <div style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: "700", color: "#000", marginTop: "2px" }}>Advanced Infrastructure</div>
                                <div style={{ fontSize: "11px", color: "#666", marginTop: "1px" }}>Silicon-to-agent integration</div>
                            </div>
                        </div>
                    </div>

                    <div className="s10-close" style={{ marginTop: "14px" }}>
                        The AI Cloud Infrastructure<br />powering <em>critical systems.</em>
                    </div>
                    <div className="s10-contact">
                        <div className="s10-contact-item"><label>Founder</label><span>Bola Roy Banjo</span></div>
                        <div className="s10-contact-item"><label>Email</label><span>bola@cencori.com</span></div>
                        <div className="s10-contact-item"><label>Website</label><span>cencori.com</span></div>
                        <div className="s10-contact-item"><label>Round</label><span>$500K Pre-seed · SAFE</span></div>
                    </div>
                </div>

            </div>

            <div className="nav">
                <button className="nav-btn" onClick={() => navigate(-1)}>← PREV</button>
                <div className="nav-dots">
                    {[...Array(total)].map((_, i) => (
                        <div key={i} className={`dot ${current === i ? "active" : ""}`} onClick={() => goTo(i)} />
                    ))}
                </div>
                <button className="nav-btn" onClick={() => navigate(1)}>NEXT →</button>
            </div>

            {!isPrintMode && (
                <button className="export-btn" onClick={downloadPDF}>
                    DOWNLOAD
                </button>
            )}
            </div>
        </>
    );
}

export default function PitchDeckPage() {
    return (
        <Suspense fallback={<div style={{ background: "#fff", width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontFamily: "var(--font-mono), ui-monospace, monospace", fontSize: "11px", letterSpacing: ".2em", textTransform: "uppercase" }}>Loading deck…</div>}>
            <PitchDeckContent />
        </Suspense>
    );
}
