"use client";

import React, { useEffect, useRef, useState } from "react";
import { Anthropic } from "@lobehub/icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
    EarthLockIcon,
    Globe02Icon,
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
    ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import { CheckIcon, ChartStackedLineIcon, SunIcon, MoonIcon } from "@/assets/icons";

const ACC = "#3DDC97"; // dark-mode accent
const ACC_LIGHT = "#0E9A63"; // light-mode accent (deeper for contrast on white)

const AccentCtx = React.createContext<string>(ACC);

function HIcon({
    icon,
    size = 20,
    color,
    sw = 1.6,
    style,
}: {
    icon: IconSvgElement;
    size?: number;
    color?: string;
    sw?: number;
    style?: React.CSSProperties;
}) {
    const ctxAcc = React.useContext(AccentCtx);
    return <HugeiconsIcon icon={icon} size={size} color={color ?? ctxAcc} strokeWidth={sw} style={style} />;
}

const SECTIONS = [
    { id: "overview", n: "01", label: "Overview" },
    { id: "belief", n: "02", label: "Belief" },
    { id: "problem", n: "03", label: "Problem" },
    { id: "solution", n: "04", label: "Solution" },
    { id: "why", n: "05", label: "Why Now" },
    { id: "traction", n: "06", label: "Traction" },
    { id: "gtm", n: "07", label: "Go-to-Market" },
    { id: "market", n: "08", label: "Market" },
    { id: "team", n: "09", label: "Team" },
    { id: "ask", n: "10", label: "The Ask" },
];

export default function PitchV2() {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState("overview");
    const [progress, setProgress] = useState(0);
    const [theme, setTheme] = useState<"light" | "dark">("light");

    useEffect(() => {
        const isPrintMode = new URLSearchParams(window.location.search).get("print") === "true";
        if (!isPrintMode) return;

        document.body.setAttribute("data-ready", "true");
        return () => document.body.removeAttribute("data-ready");
    }, []);

    useEffect(() => {
        try {
            const saved = window.localStorage.getItem("cencori-pitch-theme");
            if (saved === "light" || saved === "dark") setTheme(saved);
        } catch {}
    }, []);

    const toggleTheme = () =>
        setTheme((t) => {
            const next = t === "light" ? "dark" : "light";
            try {
                window.localStorage.setItem("cencori-pitch-theme", next);
            } catch {}
            return next;
        });

    const acc = theme === "light" ? ACC_LIGHT : ACC;

    useEffect(() => {
        const root = scrollRef.current;
        if (!root) return;
        const secs = Array.from(root.querySelectorAll<HTMLElement>(".v2-sec"));
        if (!("IntersectionObserver" in window)) {
            secs.forEach((s) => s.classList.add("in"));
            return;
        }
        const ratios = new Map<string, number>();
        const io = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    if (e.isIntersecting) e.target.classList.add("in");
                    ratios.set(e.target.id, e.intersectionRatio);
                }
                let best: string | null = null;
                let bestR = -1;
                ratios.forEach((r, id) => {
                    if (r > bestR) {
                        bestR = r;
                        best = id;
                    }
                });
                if (best) setActive(best);
            },
            { root, threshold: [0, 0.25, 0.5, 0.75, 1] }
        );
        secs.forEach((s) => io.observe(s));
        return () => io.disconnect();
    }, []);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const max = el.scrollHeight - el.clientHeight;
        setProgress(max > 0 ? (el.scrollTop / max) * 100 : 0);
    };

    const jump = (id: string) => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return (
        <AccentCtx.Provider value={acc}>
        <div className={`v2 ${theme === "light" ? "light" : ""}`}>
            <style jsx global>{`
                .v2 {
                    --bg: #08090b;
                    --bg2: #0c0e11;
                    --panel: #0f1216;
                    --ink: #f3f5f6;
                    --ink2: #aeb6bf;
                    --ink3: #69727c;
                    --line: #1b1f24;
                    --line2: #262b31;
                    --acc: ${ACC};
                    --acc-dim: rgba(61, 220, 151, 0.1);
                    --display: var(--font-manrope), system-ui, sans-serif;
                    --body: var(--font-inter), system-ui, sans-serif;
                    --mono: var(--font-mono), ui-monospace, monospace;

                    height: 100vh;
                    width: 100vw;
                    overflow: hidden;
                    background: var(--bg);
                    color: var(--ink);
                    font-family: var(--body);
                    position: fixed;
                    inset: 0;
                    z-index: 9999;
                    transition: background .3s ease, color .3s ease;
                }
                .v2 *::selection { background: var(--acc); color: #04130c; }

                .v2.light {
                    --bg: #ffffff;
                    --bg2: #f4f6f8;
                    --panel: #f7f8fa;
                    --ink: #0b0d11;
                    --ink2: #485059;
                    --ink3: #8b939c;
                    --line: #e7e9ec;
                    --line2: #d8dce1;
                    --acc: ${ACC_LIGHT};
                    --acc-dim: rgba(14, 154, 99, 0.08);
                }
                .v2.light .v2-scroll {
                    background-image:
                        linear-gradient(rgba(0, 0, 0, 0.045) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(0, 0, 0, 0.045) 1px, transparent 1px);
                }
                .v2.light .v2-brand img,
                .v2.light .v2-wall img { filter: invert(1) brightness(0.92); }
                .v2.light .v2-eng.anchor { border-color: rgba(14, 154, 99, 0.4); box-shadow: inset 0 0 60px rgba(14, 154, 99, 0.05); }
                .v2.light .v2-eng-tag.live { border-color: rgba(14, 154, 99, 0.45); }

                .v2-scroll {
                    height: 100vh;
                    overflow-y: auto;
                    overflow-x: hidden;
                    scroll-snap-type: y proximity;
                    scroll-behavior: smooth;
                    background-image:
                        linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255, 255, 255, 0.022) 1px, transparent 1px);
                    background-size: 72px 72px, 72px 72px;
                    background-attachment: fixed;
                }
                .v2-scroll::-webkit-scrollbar { width: 0; height: 0; }

                /* top progress */
                .v2-prog { position: fixed; top: 0; left: 0; right: 0; height: 2px; background: transparent; z-index: 10002; }
                .v2-prog-bar { height: 100%; background: var(--acc); box-shadow: 0 0 16px var(--acc); transition: width .12s linear; }

                /* brand lockup */
                .v2-brand { position: fixed; top: 30px; left: 40px; z-index: 10001; display: flex; align-items: center; gap: 12px; }
                .v2-brand img { width: 30px; height: auto; }
                .v2-brand span { font-family: var(--mono); font-size: 9px; letter-spacing: .28em; color: var(--ink3); text-transform: uppercase; }

                /* theme toggle */
                .v2-theme { position: fixed; top: 26px; right: 40px; z-index: 10001; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; background: none; border: 1px solid var(--line2); border-radius: 50%; color: var(--ink2); cursor: pointer; transition: all .2s; }
                .v2-theme:hover { border-color: var(--acc); color: var(--acc); }

                /* section rail */
                .v2-rail { position: fixed; top: 50%; left: 40px; transform: translateY(-50%); z-index: 10001; display: flex; flex-direction: column; gap: 2px; }
                .v2-rail-item { display: flex; align-items: center; gap: 12px; background: none; border: none; cursor: pointer; padding: 7px 0; text-align: left; opacity: .5; transition: opacity .25s; }
                .v2-rail-item:hover { opacity: 1; }
                .v2-rail-item.on { opacity: 1; }
                .v2-rail-line { width: 18px; height: 1px; background: var(--ink3); transition: all .25s; }
                .v2-rail-item.on .v2-rail-line { width: 30px; background: var(--acc); box-shadow: 0 0 10px var(--acc); }
                .v2-rail-num { font-family: var(--mono); font-size: 9px; letter-spacing: .15em; color: var(--ink3); transition: color .25s; }
                .v2-rail-item.on .v2-rail-num { color: var(--acc); }
                .v2-rail-label { font-family: var(--mono); font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: var(--ink2); opacity: 0; transform: translateX(-4px); transition: all .25s; }
                .v2-rail-item:hover .v2-rail-label, .v2-rail-item.on .v2-rail-label { opacity: 1; transform: none; }

                .v2-dl { position: fixed; bottom: 30px; right: 40px; z-index: 10001; display: flex; align-items: center; gap: 8px; background: none; border: 1px solid var(--line2); color: var(--ink3); font-family: var(--mono); font-size: 9px; letter-spacing: .18em; text-transform: uppercase; padding: 8px 14px; cursor: pointer; transition: all .2s; border-radius: 2px; }
                .v2-dl:hover { border-color: var(--acc); color: var(--acc); }

                /* sections */
                .v2-sec { min-height: 100vh; scroll-snap-align: start; display: flex; flex-direction: column; justify-content: center; position: relative; padding: 120px 8% 120px 150px; }
                .v2-sec.alt { background: var(--bg2); }
                .v2-sec.reveal { opacity: 0; transform: translateY(30px); transition: opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1); }
                .v2-sec.reveal.in { opacity: 1; transform: none; }
                .v2-wrap { width: 100%; max-width: 1160px; margin: 0 auto; }

                .v2-kicker { display: flex; align-items: center; gap: 12px; margin-bottom: 30px; }
                .v2-kicker .n { font-family: var(--mono); font-size: 11px; letter-spacing: .1em; color: var(--acc); }
                .v2-kicker .bar { width: 26px; height: 1px; background: var(--line2); }
                .v2-kicker .t { font-family: var(--mono); font-size: 10px; letter-spacing: .26em; text-transform: uppercase; color: var(--ink3); }

                .v2-h { font-family: var(--display); font-weight: 600; letter-spacing: -0.03em; line-height: 1.03; color: var(--ink); }
                .v2-acc { color: var(--acc); }
                .v2-lead { font-size: 15px; line-height: 1.7; color: var(--ink2); font-weight: 400; max-width: 640px; }

                /* OVERVIEW / HERO */
                .v2-hero-tag { font-family: var(--mono); font-size: 11px; letter-spacing: .2em; text-transform: uppercase; color: var(--ink3); margin-bottom: 28px; }
                .v2-hero-tag b { color: var(--acc); font-weight: 500; }
                .v2-hero-h { font-family: var(--display); font-weight: 600; letter-spacing: -0.04em; line-height: 0.98; font-size: clamp(44px, 7.5vw, 104px); color: var(--ink); margin-bottom: 30px; }
                .v2-hero-sub { font-size: 16px; line-height: 1.6; color: var(--ink2); max-width: 560px; margin-bottom: 56px; }
                .v2-hero-strip { display: grid; grid-template-columns: repeat(4, auto); gap: 56px; border-top: 1px solid var(--line); padding-top: 28px; }
                .v2-stat-k { font-family: var(--mono); font-size: 9px; letter-spacing: .18em; text-transform: uppercase; color: var(--ink3); margin-bottom: 8px; }
                .v2-stat-v { font-family: var(--display); font-size: 22px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink); }
                .v2-stat-v.acc { color: var(--acc); }
                .v2-globe { position: absolute; right: -120px; top: 50%; transform: translateY(-50%); opacity: 0.05; pointer-events: none; }
                .v2.light .v2-globe { opacity: 0.08; }
                .v2-scrollcue { position: absolute; bottom: 40px; left: 150px; display: flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 9px; letter-spacing: .2em; text-transform: uppercase; color: var(--ink3); }
                .v2-scrollcue .dn { display: inline-flex; animation: v2bob 1.8s ease-in-out infinite; }
                @keyframes v2bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(4px); } }

                /* BELIEF */
                .v2-statement { font-family: var(--display); font-weight: 600; letter-spacing: -0.025em; line-height: 1.18; font-size: clamp(24px, 3vw, 40px); color: var(--ink); max-width: 920px; margin-bottom: 28px; }
                .v2-statement b { color: var(--acc); font-weight: 600; }
                .v2-quote { font-family: var(--display); font-style: italic; font-size: clamp(18px, 2vw, 26px); color: var(--ink2); border-left: 2px solid var(--acc); padding-left: 22px; margin: 0 0 48px; font-weight: 500; }
                .v2-beliefs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); }
                .v2-belief { background: var(--bg); padding: 26px 28px; display: flex; gap: 16px; transition: background .25s; }
                .v2-belief:hover { background: var(--panel); }
                .v2-belief .ix { font-family: var(--mono); font-size: 11px; color: var(--acc); padding-top: 2px; }
                .v2-belief .bd { flex: 1; }
                .v2-belief .hd { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
                .v2-belief .hd b { font-family: var(--display); font-size: 16px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink); }
                .v2-belief p { font-size: 12.5px; line-height: 1.6; color: var(--ink2); }

                /* PROBLEM */
                .v2-faults { border-top: 1px solid var(--line); }
                .v2-fault { display: grid; grid-template-columns: 64px 52px 1fr 200px; gap: 28px; align-items: center; padding: 30px 4px; border-bottom: 1px solid var(--line); transition: background .25s; }
                .v2-fault:hover { background: var(--panel); }
                .v2-fault .fn { font-family: var(--mono); font-size: 13px; color: var(--ink3); }
                .v2-fault .fi { width: 52px; height: 52px; border: 1px solid var(--line2); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
                .v2-fault .ft { font-family: var(--display); font-size: 22px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink); margin-bottom: 7px; }
                .v2-fault .fp { font-size: 12.5px; line-height: 1.6; color: var(--ink2); max-width: 540px; }
                .v2-fault .fx { display: flex; align-items: center; gap: 9px; justify-content: flex-end; font-family: var(--mono); font-size: 10px; letter-spacing: .08em; color: var(--ink3); text-transform: uppercase; text-align: right; }
                .v2-fault .fx b { color: var(--acc); font-weight: 500; }

                /* SOLUTION */
                .v2-engines { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 36px 0 20px; }
                .v2-eng { border: 1px solid var(--line2); border-radius: 4px; background: var(--panel); padding: 28px; position: relative; overflow: hidden; }
                .v2-eng.anchor { border-color: rgba(61,220,151,0.32); box-shadow: inset 0 0 60px rgba(61,220,151,0.04); }
                .v2-eng-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
                .v2-eng-tag { font-family: var(--mono); font-size: 9px; letter-spacing: .2em; text-transform: uppercase; padding: 4px 9px; border-radius: 2px; border: 1px solid var(--line2); color: var(--ink3); }
                .v2-eng-tag.live { color: var(--acc); border-color: rgba(61,220,151,0.4); }
                .v2-eng-name { font-family: var(--display); font-size: 24px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink); margin-bottom: 4px; }
                .v2-eng-for { font-size: 12px; color: var(--ink3); margin-bottom: 20px; }
                .v2-eng-li { display: flex; align-items: center; gap: 11px; font-size: 13px; color: var(--ink2); padding: 9px 0; border-top: 1px solid var(--line); }
                .v2-iso { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
                .v2-iso-i { display: flex; gap: 13px; align-items: flex-start; }
                .v2-iso-i .it { font-family: var(--mono); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink); margin-bottom: 6px; }
                .v2-iso-i p { font-size: 11.5px; line-height: 1.55; color: var(--ink3); }

                /* WHY NOW */
                .v2-why-grid { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 60px; align-items: center; margin-bottom: 48px; }
                .v2-bigdate { font-family: var(--display); font-weight: 600; letter-spacing: -0.04em; line-height: 0.9; font-size: clamp(48px, 7vw, 100px); color: var(--acc); }
                .v2-bigdate small { display: block; font-family: var(--mono); font-size: 11px; letter-spacing: .2em; color: var(--ink3); text-transform: uppercase; margin-top: 14px; -webkit-text-fill-color: var(--ink3); }
                .v2-timeline { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
                .v2-tl { padding: 22px 22px; border-right: 1px solid var(--line); position: relative; }
                .v2-tl:last-child { border-right: none; }
                .v2-tl.hot { background: var(--acc-dim); }
                .v2-tl-node { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
                .v2-tl-k { font-family: var(--mono); font-size: 9px; letter-spacing: .16em; text-transform: uppercase; color: var(--ink3); }
                .v2-tl-h { font-family: var(--display); font-size: 17px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink); margin-bottom: 7px; }
                .v2-tl p { font-size: 11.5px; line-height: 1.55; color: var(--ink2); }
                .v2-proofs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
                .v2-proof { display: flex; flex-direction: column; gap: 11px; padding: 16px; border: 1px solid var(--line); border-radius: 3px; background: var(--bg); }
                .v2-proof p { font-size: 11px; line-height: 1.45; color: var(--ink2); }

                /* TRACTION */
                .v2-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 36px 0 28px; }
                .v2-bigstat { border: 1px solid var(--line); border-radius: 4px; padding: 26px; background: var(--panel); }
                .v2-bigstat .ic { margin-bottom: 20px; }
                .v2-bigstat .nm { font-family: var(--display); font-size: 40px; font-weight: 600; letter-spacing: -0.04em; color: var(--acc); line-height: 1; margin-bottom: 10px; }
                .v2-bigstat .nm.sm { font-size: 26px; }
                .v2-bigstat .lb { font-size: 12px; line-height: 1.5; color: var(--ink2); }
                .v2-bigstat .lb b { color: var(--ink); font-weight: 600; }
                .v2-note { display: flex; gap: 16px; border: 1px solid var(--line2); border-left: 2px solid var(--acc); border-radius: 3px; padding: 22px 26px; background: var(--bg); }
                .v2-note p { font-size: 13px; line-height: 1.65; color: var(--ink2); }
                .v2-note p b { color: var(--ink); font-weight: 600; }

                /* GTM */
                .v2-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 34px 0 22px; }
                .v2-col { border: 1px solid var(--line2); border-radius: 4px; background: var(--panel); padding: 26px; }
                .v2-col-hd { display: flex; align-items: center; gap: 13px; margin-bottom: 20px; }
                .v2-col-k { font-family: var(--mono); font-size: 9px; letter-spacing: .16em; text-transform: uppercase; color: var(--ink3); margin-bottom: 4px; }
                .v2-col-k b { color: var(--acc); font-weight: 500; }
                .v2-col-nm { font-family: var(--display); font-size: 21px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink); }
                .v2-col-li { display: flex; align-items: flex-start; gap: 11px; font-size: 12.5px; line-height: 1.45; color: var(--ink2); padding: 8px 0; }
                .v2-flywheel { display: flex; align-items: center; gap: 16px; border: 1px solid var(--line); border-radius: 4px; padding: 20px 26px; background: var(--acc-dim); }
                .v2-flywheel p { font-size: 13px; line-height: 1.55; color: var(--ink); }
                .v2-flywheel p b { color: var(--acc); font-weight: 600; }

                /* MARKET */
                .v2-ladder { display: flex; flex-direction: column; gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 4px; overflow: hidden; margin: 30px 0 22px; }
                .v2-rung { display: grid; grid-template-columns: 220px 1.2fr 1.4fr; gap: 26px; align-items: center; background: var(--bg); padding: 17px 24px; transition: background .25s; }
                .v2-rung:hover { background: var(--panel); }
                .v2-rung-nm { display: flex; align-items: center; gap: 13px; }
                .v2-rung-nm .nm { font-family: var(--display); font-size: 17px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink); }
                .v2-rung-nm .st { font-family: var(--mono); font-size: 8px; letter-spacing: .12em; text-transform: uppercase; color: var(--acc); display: block; margin-top: 2px; }
                .v2-rung .vv { font-size: 12.5px; color: var(--ink2); line-height: 1.5; }
                .v2-rung .uu { font-size: 12.5px; color: var(--ink3); line-height: 1.5; }
                .v2-econ { display: grid; grid-template-columns: 1fr auto; gap: 8px 40px; border: 1px solid var(--line2); border-radius: 4px; padding: 22px 26px; background: var(--panel); font-family: var(--mono); }
                .v2-econ .er { display: contents; }
                .v2-econ .er span { font-size: 12px; color: var(--ink2); padding: 5px 0; }
                .v2-econ .er .vv { color: var(--ink); text-align: right; }
                .v2-econ .er.total span { color: var(--ink); font-weight: 600; border-top: 1px solid var(--line2); padding-top: 13px; margin-top: 5px; }
                .v2-econ .er.total .vv { color: var(--acc); }
                .v2-econ-cap { font-family: var(--mono); font-size: 10px; color: var(--ink3); letter-spacing: .04em; margin-top: 16px; }

                /* TEAM */
                .v2-team { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 32px 0 24px; }
                .v2-member { border: 1px solid var(--line); border-radius: 4px; padding: 24px; background: var(--panel); display: flex; gap: 18px; }
                .v2-member img { width: 58px; height: 58px; border-radius: 50%; object-fit: cover; border: 1px solid var(--line2); flex-shrink: 0; }
                .v2-member .mn { font-family: var(--display); font-size: 20px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink); margin-bottom: 4px; }
                .v2-member .mt { font-family: var(--mono); font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: var(--acc); margin-bottom: 11px; }
                .v2-member .mb { font-size: 12px; line-height: 1.65; color: var(--ink2); }
                .v2-wins { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
                .v2-win { display: flex; flex-direction: column; gap: 12px; }
                .v2-win .wk { font-family: var(--mono); font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: var(--ink3); }
                .v2-win p { font-size: 12px; line-height: 1.55; color: var(--ink2); }
                .v2-win p b { color: var(--ink); font-weight: 600; }

                /* ASK */
                .v2-ask-top { display: flex; align-items: baseline; gap: 22px; margin-bottom: 14px; flex-wrap: wrap; }
                .v2-ask-amt { font-family: var(--display); font-size: clamp(48px, 7vw, 92px); font-weight: 600; letter-spacing: -0.04em; color: var(--acc); line-height: 1; }
                .v2-ask-h { font-family: var(--display); font-size: clamp(22px, 2.6vw, 34px); font-weight: 600; letter-spacing: -0.02em; color: var(--ink); }
                .v2-ask-sub { font-family: var(--mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--ink3); margin-bottom: 34px; }
                .v2-fundbar { display: flex; height: 10px; border-radius: 3px; overflow: hidden; margin-bottom: 20px; border: 1px solid var(--line); }
                .v2-fundseg { height: 100%; }
                .v2-funds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
                .v2-fund { background: var(--bg); padding: 16px 16px; }
                .v2-fund .fh { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; }
                .v2-fund .fa { font-family: var(--display); font-size: 18px; font-weight: 600; color: var(--ink); letter-spacing: -0.02em; }
                .v2-fund .fp { font-family: var(--mono); font-size: 9px; color: var(--acc); letter-spacing: .1em; }
                .v2-fund .fl { font-size: 11px; line-height: 1.45; color: var(--ink3); margin-top: 4px; }
                .v2-miles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 4px; overflow: hidden; margin: 22px 0 36px; }
                .v2-mile { background: var(--bg); padding: 18px 20px; position: relative; }
                .v2-mile .mm { font-family: var(--mono); font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: var(--acc); margin-bottom: 9px; }
                .v2-mile p { font-size: 11.5px; line-height: 1.5; color: var(--ink2); }
                .v2-close { font-family: var(--display); font-weight: 600; letter-spacing: -0.03em; line-height: 1.05; font-size: clamp(28px, 4vw, 52px); color: var(--ink); margin-bottom: 36px; }
                .v2-close b { color: var(--acc); font-weight: 600; }
                .v2-contact { display: grid; grid-template-columns: repeat(4, auto); gap: 50px; border-top: 1px solid var(--line); padding-top: 26px; }
                .v2-contact .ck { font-family: var(--mono); font-size: 9px; letter-spacing: .15em; text-transform: uppercase; color: var(--ink3); margin-bottom: 7px; }
                .v2-contact .cv { font-size: 14px; color: var(--ink); font-weight: 500; }
                .v2-foot { font-family: var(--mono); font-size: 9px; letter-spacing: .2em; text-transform: uppercase; color: var(--ink3); margin-top: 44px; }

                @media print {
                    html,
                    body {
                        width: 1920px !important;
                        height: auto !important;
                        margin: 0 !important;
                        overflow: visible !important;
                        background: #fff !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .v2 {
                        position: static !important;
                        width: 1920px !important;
                        height: auto !important;
                        min-height: auto !important;
                        overflow: visible !important;
                        background: var(--bg) !important;
                    }
                    .v2-scroll {
                        display: block !important;
                        width: 1920px !important;
                        height: auto !important;
                        overflow: visible !important;
                        background-attachment: scroll !important;
                    }
                    .v2-rail,
                    .v2-brand,
                    .v2-prog,
                    .v2-dl,
                    .v2-theme,
                    .v2-wall,
                    .v2-scrollcue {
                        display: none !important;
                    }
                    .v2-sec {
                        width: 1920px !important;
                        height: 1080px !important;
                        min-height: 1080px !important;
                        padding: 110px 150px !important;
                        box-sizing: border-box !important;
                        overflow: hidden !important;
                        break-after: page !important;
                        page-break-after: always !important;
                        opacity: 1 !important;
                        transform: none !important;
                    }
                    .v2-sec:last-child {
                        break-after: auto !important;
                        page-break-after: auto !important;
                    }
                    .v2-wrap {
                        max-width: 1160px !important;
                    }
                }

                /* responsive wall */
                .v2-wall { display: none; }
                @media (max-width: 1080px) {
                    .v2-scroll, .v2-rail, .v2-brand, .v2-prog, .v2-dl, .v2-theme { display: none !important; }
                    .v2-wall { display: flex; position: fixed; inset: 0; background: var(--bg); flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px; z-index: 100000; }
                    .v2-wall img { width: 52px; margin-bottom: 40px; }
                    .v2-wall h3 { font-family: var(--display); font-size: 24px; font-weight: 600; color: var(--ink); margin-bottom: 16px; letter-spacing: -0.02em; }
                    .v2-wall p { font-family: var(--mono); font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink3); max-width: 280px; line-height: 1.8; }
                }
            `}</style>

            <div className="v2-wall">
                <img src="/logo white.svg" alt="Cencori" />
                <h3>Best viewed on desktop.</h3>
                <p>This investor memo carries dense technical and financial detail. Open it on a larger display to review the full roadmap.</p>
            </div>

            <div className="v2-prog"><div className="v2-prog-bar" style={{ width: `${progress}%` }} /></div>

            <div className="v2-brand">
                <img src="/logo white.svg" alt="Cencori" />
                <span>Sovereign Infrastructure</span>
            </div>

            <button className="v2-theme" onClick={toggleTheme} aria-label="Toggle light or dark mode">
                {theme === "light" ? <MoonIcon width={15} height={15} /> : <SunIcon width={15} height={15} />}
            </button>

            <nav className="v2-rail">
                {SECTIONS.map((s) => (
                    <button key={s.id} className={`v2-rail-item ${active === s.id ? "on" : ""}`} onClick={() => jump(s.id)}>
                        <span className="v2-rail-num">{s.n}</span>
                        <span className="v2-rail-line" />
                        <span className="v2-rail-label">{s.label}</span>
                    </button>
                ))}
            </nav>

            <button className="v2-dl" onClick={() => (window.location.href = "/api/pitch/export?format=pdf&deck=v2")}>Download</button>

            <div className="v2-scroll" ref={scrollRef} onScroll={onScroll}>

                {/* 01 - OVERVIEW */}
                <section id="overview" className="v2-sec">
                    <div className="v2-globe"><HIcon icon={Globe02Icon} size={560} sw={0.5} /></div>
                    <div className="v2-wrap">
                        <div className="v2-hero-tag">Pre-seed Raise <b>·</b> Lagos Node <b>·</b> Investor Memo</div>
                        <h1 className="v2-hero-h">The <span className="v2-acc">sovereign</span> AI cloud<br />for emerging markets.</h1>
                        <p className="v2-hero-sub">A hardware-enabled sovereign cloud. Compliant, low-latency AI infrastructure, built in-country.</p>
                        <div className="v2-hero-strip">
                            <div><div className="v2-stat-k">Raising</div><div className="v2-stat-v acc">$500K</div></div>
                            <div><div className="v2-stat-k">Valuation</div><div className="v2-stat-v">$5M</div></div>
                            <div><div className="v2-stat-k">Instrument</div><div className="v2-stat-v">SAFE</div></div>
                            <div><div className="v2-stat-k">Stage</div><div className="v2-stat-v">Pre-seed</div></div>
                        </div>
                    </div>
                    <div className="v2-scrollcue"><span className="dn"><HIcon icon={ArrowDown01Icon} size={14} color="#8b939c" /></span><span>Scroll</span></div>
                </section>

                {/* 02 - BELIEF */}
                <section id="belief" className="v2-sec alt reveal">
                    <div className="v2-wrap">
                        <div className="v2-kicker"><span className="n">02</span><span className="bar" /><span className="t">The Belief</span></div>
                        <div className="v2-statement">AI will not run forever on borrowed infrastructure. The next era of emerging-market AI has to be <b>sovereign</b>: hosted, governed, and priced at home.</div>
                        <div className="v2-quote">You cannot regulate data you do not hold.</div>
                        <div className="v2-beliefs">
                            <div className="v2-belief"><span className="ix">01</span><div className="bd"><div className="hd"><HIcon icon={CloudIcon} size={17} /><b>Software alone hits a wall</b></div><p>Pure-software AI in emerging markets still runs on foreign clouds, exposed to FX, egress fees, and now regulation. The foundation has to be physical.</p></div></div>
                            <div className="v2-belief"><span className="ix">02</span><div className="bd"><div className="hd"><HIcon icon={JusticeScale01Icon} size={17} /><b>Regulation forces the shift</b></div><p>The CBN 2027 mandate makes local data residency the law, not a preference. Every Nigerian financial institution must localize by January 1, 2027.</p></div></div>
                            <div className="v2-belief"><span className="ix">03</span><div className="bd"><div className="hd"><HIcon icon={Layers01Icon} size={17} /><b>The sovereign layer wins</b></div><p>Control compliant, in-country AI infrastructure and you become the default for finance, health, agriculture, and government.</p></div></div>
                            <div className="v2-belief"><span className="ix">04</span><div className="bd"><div className="hd"><HIcon icon={ServerStack01Icon} size={17} /><b>Cencori is building it</b></div><p>Not foreign racks rented locally. A vertically integrated, hardware-enabled sovereign cloud, starting in Lagos.</p></div></div>
                        </div>
                    </div>
                </section>

                {/* 03 - PROBLEM */}
                <section id="problem" className="v2-sec reveal">
                    <div className="v2-wrap">
                        <div className="v2-kicker"><span className="n">03</span><span className="bar" /><span className="t">The Problem</span></div>
                        <h2 className="v2-h" style={{ fontSize: "clamp(30px,3.6vw,50px)", marginBottom: "12px" }}>Trapped between a cloud tax<br />and a compliance wall.</h2>
                        <div className="v2-faults">
                            <div className="v2-fault">
                                <div className="fn">01</div>
                                <div className="fi"><HIcon icon={Coins01Icon} size={22} /></div>
                                <div><div className="ft">The Cloud Tax</div><div className="fp">Enterprises run on AWS, Azure, and GCP, paying dollar-denominated egress and bandwidth fees, fully exposed to FX swings. Capital flight, every single month.</div></div>
                                <div className="fx"><HIcon icon={ExchangeDollarIcon} size={15} color="#8b939c" /><span><b>Capital flight</b><br />value leaves the region</span></div>
                            </div>
                            <div className="v2-fault">
                                <div className="fn">02</div>
                                <div className="fi"><HIcon icon={JusticeScale01Icon} size={22} /></div>
                                <div><div className="ft">The Compliance Wall</div><div className="fp">CBN 2027 legally bars financial institutions from processing sensitive citizen and transaction data on foreign cloud. Localize in-country, or operate illegally.</div></div>
                                <div className="fx"><HIcon icon={Calendar03Icon} size={15} color="#8b939c" /><span><b>2027 deadline</b><br />already counting down</span></div>
                            </div>
                            <div className="v2-fault">
                                <div className="fn">03</div>
                                <div className="fi"><HIcon icon={CpuIcon} size={22} /></div>
                                <div><div className="ft">The Compute Chokehold</div><div className="fp">Local banks, startups, and researchers are priced and latency-locked out of high-performance GPUs. Standard data centers are CPU-built; they cannot run modern AI.</div></div>
                                <div className="fx"><HIcon icon={CpuIcon} size={15} color="#8b939c" /><span><b>Innovation ceiling</b><br />a region locked out</span></div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 04 - SOLUTION */}
                <section id="solution" className="v2-sec alt reveal">
                    <div className="v2-wrap">
                        <div className="v2-kicker"><span className="n">04</span><span className="bar" /><span className="t">The Solution</span></div>
                        <h2 className="v2-h" style={{ fontSize: "clamp(30px,3.6vw,50px)" }}>One sovereign stack. <span className="v2-acc">Two engines.</span></h2>
                        <p className="v2-lead" style={{ marginTop: "16px" }}>Enterprise-grade hardware, co-located in Lagos, split into two market offerings on a single physical stack, with hardware-enforced isolation between them.</p>
                        <div className="v2-engines">
                            <div className="v2-eng anchor">
                                <div className="v2-eng-bar"><HIcon icon={BankIcon} size={24} /><span className="v2-eng-tag">Anchor</span></div>
                                <div className="v2-eng-name">Cencori Enterprise</div>
                                <div className="v2-eng-for">For banks, fintechs, insurers, and government.</div>
                                <div className="v2-eng-li"><CheckIcon fill={acc} width={13} height={13} /> CPU-driven core ledgers</div>
                                <div className="v2-eng-li"><CheckIcon fill={acc} width={13} height={13} /> Localized NVMe data storage</div>
                                <div className="v2-eng-li"><CheckIcon fill={acc} width={13} height={13} /> Real-time, in-country AI workloads</div>
                                <div className="v2-eng-li"><CheckIcon fill={acc} width={13} height={13} /> 100% CBN-2027 compliant</div>
                            </div>
                            <div className="v2-eng">
                                <div className="v2-eng-bar"><HIcon icon={AiChipIcon} size={24} /><span className="v2-eng-tag live">Live</span></div>
                                <div className="v2-eng-name">Cencori Compute</div>
                                <div className="v2-eng-for">For startups, researchers, and engineers.</div>
                                <div className="v2-eng-li"><CheckIcon fill={acc} width={13} height={13} /> On-demand, serverless GPU pools</div>
                                <div className="v2-eng-li"><CheckIcon fill={acc} width={13} height={13} /> Distributed ML model training</div>
                                <div className="v2-eng-li"><CheckIcon fill={acc} width={13} height={13} /> The AI gateway, live today</div>
                                <div className="v2-eng-li"><CheckIcon fill={acc} width={13} height={13} /> Naira-backed, pay-as-you-go billing</div>
                            </div>
                        </div>
                        <div className="v2-iso">
                            <div className="v2-iso-i"><HIcon icon={ChipIcon} size={19} /><div><div className="it">Silicon Isolation</div><p>NVIDIA MIG and SR-IOV slice each GPU and CPU into physically isolated hardware slots.</p></div></div>
                            <div className="v2-iso-i"><HIcon icon={Key01Icon} size={19} /><div><div className="it">Data Separation</div><p>Enterprise data on dedicated NVMe, encrypted with on-silicon AES-256 keys held by the client.</p></div></div>
                            <div className="v2-iso-i"><HIcon icon={Shield01Icon} size={19} /><div><div className="it">Network Perimeter</div><p>Bank traffic bypasses the public internet via private cross-connect into isolated VPCs.</p></div></div>
                        </div>
                    </div>
                </section>

                {/* 05 - WHY NOW */}
                <section id="why" className="v2-sec reveal">
                    <div className="v2-wrap">
                        <div className="v2-kicker"><span className="n">05</span><span className="bar" /><span className="t">Why Now</span></div>
                        <div className="v2-why-grid">
                            <div className="v2-bigdate">Jan 1<br />2027<small>The clock is the catalyst</small></div>
                            <p className="v2-lead">The Central Bank of Nigeria&apos;s data-localization mandate requires every financial institution to host and process local transaction data inside the country&apos;s borders. A hard, dated, non-optional deadline, and the migration window is open now.</p>
                        </div>
                        <div className="v2-timeline">
                            <div className="v2-tl"><div className="v2-tl-node"><HIcon icon={CloudIcon} size={17} color="#8b939c" /><span className="v2-tl-k">Today</span></div><div className="v2-tl-h">Non-compliant by default</div><p>Banks run sensitive workloads on foreign cloud, exposed to FX, egress, and a regulation they cannot yet meet.</p></div>
                            <div className="v2-tl hot"><div className="v2-tl-node"><HIcon icon={JusticeScale01Icon} size={17} /><span className="v2-tl-k">Jan 1, 2027</span></div><div className="v2-tl-h">Mandate in force</div><p>Local data residency becomes law. Localize, or face regulatory action.</p></div>
                            <div className="v2-tl"><div className="v2-tl-node"><HIcon icon={Clock01Icon} size={17} /><span className="v2-tl-k">The Window</span></div><div className="v2-tl-h">12 to 18 months</div><p>Whoever is compliant-ready first wins the banks. That window is open right now.</p></div>
                        </div>
                        <div className="v2-proofs" style={{ marginTop: "20px" }}>
                            <div className="v2-proof"><HIcon icon={JusticeScale01Icon} size={20} /><p>CBN 2027: a deadline written into law</p></div>
                            <div className="v2-proof"><HIcon icon={ExchangeDollarIcon} size={20} /><p>Cloud tax and FX: a cost banks feel monthly</p></div>
                            <div className="v2-proof"><HIcon icon={CpuIcon} size={20} /><p>GPU lockout: real, unmet local demand</p></div>
                            <div className="v2-proof"><HIcon icon={ConnectIcon} size={20} /><p>Live gateway and 350 devs: we already ship</p></div>
                            <div className="v2-proof"><Anthropic size={20} /><p>Anthropic partnership: structural credibility</p></div>
                        </div>
                    </div>
                </section>

                {/* 06 - TRACTION */}
                <section id="traction" className="v2-sec alt reveal">
                    <div className="v2-wrap">
                        <div className="v2-kicker"><span className="n">06</span><span className="bar" /><span className="t">Traction</span></div>
                        <h2 className="v2-h" style={{ fontSize: "clamp(28px,3.4vw,46px)" }}>We built the software half<br />before raising a dollar.</h2>
                        <p className="v2-lead" style={{ marginTop: "14px" }}>The gateway is live and developers are building on it: proof this team ships production infrastructure. This raise builds the sovereign hardware layer beneath it.</p>
                        <div className="v2-stats">
                            <div className="v2-bigstat"><div className="ic"><HIcon icon={UserGroupIcon} size={24} /></div><div className="nm">350+</div><div className="lb">Developers onboarded, zero paid marketing</div></div>
                            <div className="v2-bigstat"><div className="ic"><HIcon icon={ConnectIcon} size={24} /></div><div className="nm">LIVE</div><div className="lb">Production AI gateway, dashboard and SDKs</div></div>
                            <div className="v2-bigstat"><div className="ic"><Anthropic size={24} /></div><div className="nm sm">Partner</div><div className="lb">Official <b>Anthropic</b> partnership</div></div>
                            <div className="v2-bigstat"><div className="ic"><HIcon icon={SourceCodeIcon} size={24} /></div><div className="nm sm">TS·PY·GO</div><div className="lb">Native SDKs across three languages</div></div>
                        </div>
                        <div className="v2-note"><HIcon icon={CheckmarkBadge01Icon} size={22} style={{ flexShrink: 0 }} /><p><b>Zero institutional capital. Zero paid marketing.</b> The founding team shipped a live AI gateway, multiple SDKs, and an Anthropic partnership before asking for a dollar. The banks, the GPUs, and the Lagos node are not claims; they are exactly what this raise goes to build.</p></div>
                    </div>
                </section>

                {/* 07 - GO-TO-MARKET */}
                <section id="gtm" className="v2-sec reveal">
                    <div className="v2-wrap">
                        <div className="v2-kicker"><span className="n">07</span><span className="bar" /><span className="t">Go-to-Market</span></div>
                        <h2 className="v2-h" style={{ fontSize: "clamp(30px,3.6vw,50px)" }}>Anchor the banks. <span className="v2-acc">Fund the builders.</span></h2>
                        <p className="v2-lead" style={{ marginTop: "14px" }}>Enterprise contracts with financial institutions underwrite the infrastructure, which lets us offer the cheapest sovereign GPU compute in the region, pulling in the next thousand builders.</p>
                        <div className="v2-cols">
                            <div className="v2-col">
                                <div className="v2-col-hd"><HIcon icon={BankIcon} size={22} /><div><div className="v2-col-k">Anchor <b>· Planned</b></div><div className="v2-col-nm">Enterprise</div></div></div>
                                <div className="v2-col-li"><HIcon icon={Agreement01Icon} size={14} style={{ flexShrink: 0, marginTop: 1 }} />Target: 3 to 5 Tier-1 financial institutions</div>
                                <div className="v2-col-li"><HIcon icon={SecurityCheckIcon} size={14} style={{ flexShrink: 0, marginTop: 1 }} />Wedge: CBN-2027 compliance, ready before the deadline</div>
                                <div className="v2-col-li"><HIcon icon={Coins01Icon} size={14} style={{ flexShrink: 0, marginTop: 1 }} />$25K implementation plus $15K to $30K monthly recurring</div>
                                <div className="v2-col-li"><HIcon icon={Rocket01Icon} size={14} style={{ flexShrink: 0, marginTop: 1 }} />This raise funds acquisition of the first anchor clients</div>
                                <div className="v2-col-li"><HIcon icon={Exchange01Icon} size={14} style={{ flexShrink: 0, marginTop: 1 }} />Absorbs the Lagos node CapEx in 18 to 24 months</div>
                            </div>
                            <div className="v2-col">
                                <div className="v2-col-hd"><HIcon icon={SourceCodeIcon} size={22} /><div><div className="v2-col-k">Volume <b>· Live</b></div><div className="v2-col-nm">Developers</div></div></div>
                                <div className="v2-col-li"><HIcon icon={AiChipIcon} size={14} style={{ flexShrink: 0, marginTop: 1 }} />Pay-as-you-go GPU and AI gateway, live today</div>
                                <div className="v2-col-li"><HIcon icon={UserGroupIcon} size={14} style={{ flexShrink: 0, marginTop: 1 }} />350+ developers onboarded, zero marketing spend</div>
                                <div className="v2-col-li"><HIcon icon={Coins01Icon} size={14} style={{ flexShrink: 0, marginTop: 1 }} />Naira-backed billing, no FX friction</div>
                                <div className="v2-col-li"><HIcon icon={ConnectIcon} size={14} style={{ flexShrink: 0, marginTop: 1 }} />Integrate in minutes: SDKs, OpenAPI, playground</div>
                                <div className="v2-col-li"><HIcon icon={Rocket01Icon} size={14} style={{ flexShrink: 0, marginTop: 1 }} />Low entry barrier drives long-tail volume</div>
                            </div>
                        </div>
                        <div className="v2-flywheel"><HIcon icon={Exchange01Icon} size={22} /><p><b>The flywheel:</b> 3 to 5 anchor banks fund the Lagos node, which lets us drop the price of sovereign compute for hundreds of local startups, building a captive, multi-industry ecosystem. Enterprise pays for the metal; developers compound the moat.</p></div>
                    </div>
                </section>

                {/* 08 - MARKET */}
                <section id="market" className="v2-sec alt reveal">
                    <div className="v2-wrap">
                        <div className="v2-kicker"><span className="n">08</span><span className="bar" /><span className="t">Market</span></div>
                        <h2 className="v2-h" style={{ fontSize: "clamp(28px,3.4vw,46px)" }}>Win finance first. Then spill into<br />every regulated industry.</h2>
                        <div className="v2-ladder">
                            <div className="v2-rung"><div className="v2-rung-nm"><HIcon icon={BankIcon} size={19} /><div><span className="nm">Finance</span><span className="st">Anchor</span></div></div><div className="vv">Regulatory sovereignty and Naira predictability</div><div className="uu">Transaction ledgers, settlement, live fraud scoring</div></div>
                            <div className="v2-rung"><div className="v2-rung-nm"><HIcon icon={Hospital01Icon} size={19} /><div><span className="nm">Healthcare</span><span className="st">Horizon 1</span></div></div><div className="vv">Compliant patient-data residency</div><div className="uu">X-ray and MRI ML diagnostics, health records</div></div>
                            <div className="v2-rung"><div className="v2-rung-nm"><HIcon icon={Plant01Icon} size={19} /><div><span className="nm">Agriculture</span><span className="st">Horizon 2</span></div></div><div className="vv">Edge processing and low-bandwidth aggregation</div><div className="uu">Drone and satellite mapping, soil sensors, yield prediction</div></div>
                            <div className="v2-rung"><div className="v2-rung-nm"><HIcon icon={CourtHouseIcon} size={19} /><div><span className="nm">Government</span><span className="st">Horizon 3</span></div></div><div className="vv">National identity and security infrastructure</div><div className="uu">NIN and BVN registry, municipal AI automation</div></div>
                        </div>
                        <div className="v2-econ">
                            <div className="er"><span><ChartStackedLineIcon fill={acc} width={13} height={13} style={{ verticalAlign: "-2px", marginRight: 8 }} />3 to 5 anchor banks at ~$240K per year</span><span className="vv">~$0.7M to $1.2M ARR</span></div>
                            <div className="er"><span>Plus Cencori Compute, developer GPU volume</span><span className="vv">scales on top</span></div>
                            <div className="er"><span>Lagos node, CapEx plus OpEx to go live</span><span className="vv">~$4.4M</span></div>
                            <div className="er total"><span>Anchor revenue absorbs the node in</span><span className="vv">18 to 24 months</span></div>
                        </div>
                        <div className="v2-econ-cap">Then replicate the unit across Abuja, Johannesburg, Nairobi, Cairo, and Accra. Illustrative projections, not guarantees.</div>
                    </div>
                </section>

                {/* 09 - TEAM */}
                <section id="team" className="v2-sec reveal">
                    <div className="v2-wrap">
                        <div className="v2-kicker"><span className="n">09</span><span className="bar" /><span className="t">Team</span></div>
                        <h2 className="v2-h" style={{ fontSize: "clamp(28px,3.4vw,46px)" }}>Operators who shipped<br />before fundraising.</h2>
                        <p className="v2-lead" style={{ marginTop: "14px" }}>Everything in this memo, the live gateway, the SDKs, the partnership, was built by this founding team before raising a dollar.</p>
                        <div className="v2-team">
                            <div className="v2-member"><img src="/roy.png" alt="Bola Roy Banjo" /><div><div className="mn">Bola Roy Banjo</div><div className="mt">CEO and Co-founder</div><div className="mb">Built Cencori from zero to a production-grade AI gateway, billing, dashboard, and SDKs. A BSc Mechanical Engineering foundation brings a systems-and-hardware mind to AI infrastructure from first principles: exactly what a vertically integrated, hardware-enabled cloud demands.</div></div></div>
                            <div className="v2-member"><img src="/daniel-avatar.png" alt="Oreofe Ojurereoluwa Daniel" /><div><div className="mn">Oreofe Ojurereoluwa Daniel</div><div className="mt">COO and Co-founder</div><div className="mb">Owns operations and business infrastructure: compliance frameworks, vendor and facility negotiations, partnership pipelines, and the operational discipline to stand up a co-located node and onboard regulated clients.</div></div></div>
                        </div>
                        <div className="v2-wins">
                            <div className="v2-win"><HIcon icon={CheckmarkBadge01Icon} size={20} /><div className="wk">Proof</div><p><b>A live gateway, 350+ developers, and an Anthropic partnership, built with zero institutional capital.</b> This team executes under constraint. Resourced, it builds at the pace of a funded company.</p></div>
                            <div className="v2-win"><HIcon icon={ChipIcon} size={20} /><div className="wk">Systems</div><p><b>Hardware is not a pivot; it is the thesis.</b> A mechanical-engineering foundation makes the co-located, silicon-isolated roadmap a natural extension of how this team already thinks.</p></div>
                            <div className="v2-win"><HIcon icon={EarthLockIcon} size={20} /><div className="wk">Conviction</div><p><b>Building the sovereign cloud for the intelligence era.</b> Not a feature, not a wrapper: the compliant infrastructure layer an entire region will be required to run on.</p></div>
                        </div>
                    </div>
                </section>

                {/* 10 - THE ASK */}
                <section id="ask" className="v2-sec alt reveal">
                    <div className="v2-wrap">
                        <div className="v2-kicker"><span className="n">10</span><span className="bar" /><span className="t">The Ask</span></div>
                        <div className="v2-ask-top"><div className="v2-ask-amt">$500K</div><div className="v2-ask-h">to bring the Lagos node live.</div></div>
                        <div className="v2-ask-sub">Pre-seed · SAFE · $5M valuation cap</div>
                        <div className="v2-fundbar">
                            <div className="v2-fundseg" style={{ width: "40%", background: acc, opacity: 1 }} />
                            <div className="v2-fundseg" style={{ width: "24%", background: acc, opacity: 0.78 }} />
                            <div className="v2-fundseg" style={{ width: "12%", background: acc, opacity: 0.6 }} />
                            <div className="v2-fundseg" style={{ width: "9%", background: acc, opacity: 0.46 }} />
                            <div className="v2-fundseg" style={{ width: "8%", background: acc, opacity: 0.34 }} />
                            <div className="v2-fundseg" style={{ width: "7%", background: acc, opacity: 0.24 }} />
                        </div>
                        <div className="v2-funds">
                            <div className="v2-fund"><div className="fh"><HIcon icon={CpuIcon} size={16} /><span className="fa">$200K</span><span className="fp">40%</span></div><div className="fl">Hardware procurement: GPUs, multi-core CPUs, NVMe</div></div>
                            <div className="v2-fund"><div className="fh"><HIcon icon={Configuration01Icon} size={16} /><span className="fa">$120K</span><span className="fp">24%</span></div><div className="fl">Core software: kernel hardening, hypervisors, runway</div></div>
                            <div className="v2-fund"><div className="fh"><HIcon icon={UserGroupIcon} size={16} /><span className="fa">$60K</span><span className="fp">12%</span></div><div className="fl">Operating runway and team: first key hires</div></div>
                            <div className="v2-fund"><div className="fh"><HIcon icon={Shield01Icon} size={16} /><span className="fa">$45K</span><span className="fp">9%</span></div><div className="fl">Capital buffer: FX protection and spare inventory</div></div>
                            <div className="v2-fund"><div className="fh"><HIcon icon={DeliveryTruck01Icon} size={16} /><span className="fa">$40K</span><span className="fp">8%</span></div><div className="fl">Logistics: freight, port clearing, import duties</div></div>
                            <div className="v2-fund"><div className="fh"><HIcon icon={Building06Icon} size={16} /><span className="fa">$35K</span><span className="fp">7%</span></div><div className="fl">Facility: Tier III+ co-lo, power, interconnects</div></div>
                        </div>
                        <div className="v2-miles">
                            <div className="v2-mile"><div className="mm">Month 1 to 6</div><p>Hardware procured, co-location secured, gateway scaled</p></div>
                            <div className="v2-mile"><div className="mm">Month 6 to 12</div><p>First anchor bank live on the compliant stack, CBN-ready</p></div>
                            <div className="v2-mile"><div className="mm">Month 12 to 18</div><p>3 to 5 anchor banks, node cash-flow positive, Compute GA</p></div>
                            <div className="v2-mile"><div className="mm">Month 18 to 24</div><p>Self-funding, Pan-African node #2 in planning</p></div>
                        </div>
                        <div className="v2-close">We are building the sovereign AI cloud<br />for <b>emerging markets.</b></div>
                        <div className="v2-contact">
                            <div><div className="ck">Founder</div><div className="cv">Bola Roy Banjo</div></div>
                            <div><div className="ck">Email</div><div className="cv">bola@cencori.com</div></div>
                            <div><div className="ck">Website</div><div className="cv">cencori.com</div></div>
                            <div><div className="ck">Round</div><div className="cv">$500K Pre-seed · SAFE</div></div>
                        </div>
                        <div className="v2-foot">Cencori · 2026 · Confidential</div>
                    </div>
                </section>

            </div>
        </div>
        </AccentCtx.Provider>
    );
}
