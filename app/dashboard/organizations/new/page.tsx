"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { generateSlug, cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Link from "next/link";
import { useOrganizationProject } from "@/lib/contexts/OrganizationProjectContext";
import { motion, MotionConfig } from "framer-motion";
import type { Variants, Transition } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Building06Icon,
  UserIcon,
  UserGroupIcon,
  Rocket01Icon,
  OfficeIcon,
  Tick02Icon,
  CheckmarkBadge01Icon,
  Loading03Icon,
  ArrowRight02Icon,
  Copy01Icon,
  TerminalIcon,
} from "@hugeicons/core-free-icons";

const formSchema = z.object({
  name: z.string().min(2, { message: "Organization name must be at least 2 characters." }),
  type: z.enum(["personal", "agency", "startup", "company"]),
  plan: z.enum(["free", "pro", "team", "enterprise"]),
});

type FormValues = z.infer<typeof formSchema>;
type CreatedOrg = { id: string; slug: string };

const ORG_TYPES: Array<{ value: FormValues["type"]; label: string; description: string; icon: IconSvgElement }> = [
  { value: "personal", label: "Personal", description: "Just you, building or exploring", icon: UserIcon },
  { value: "agency", label: "Agency", description: "Building for clients", icon: UserGroupIcon },
  { value: "startup", label: "Startup", description: "Early-stage, moving fast", icon: Rocket01Icon },
  { value: "company", label: "Company", description: "An established business", icon: OfficeIcon },
];

const PLAN_TIERS: Array<{
  value: FormValues["plan"];
  label: string;
  price: string;
  period?: string;
  popular?: boolean;
  features: string[];
}> = [
  {
    value: "free",
    label: "Free",
    price: "$0",
    period: "/month",
    features: ["1,000 requests/month", "1 active project", "Community support"],
  },
  {
    value: "pro",
    label: "Pro",
    price: "$49",
    period: "/month",
    popular: true,
    features: ["50,000 requests/month", "Unlimited projects", "Full security pipeline"],
  },
  {
    value: "team",
    label: "Team",
    price: "$149",
    period: "/month",
    features: ["250,000 requests/month", "Team seats & collaboration", "24/7 priority support"],
  },
  {
    value: "enterprise",
    label: "Enterprise",
    price: "Custom",
    features: ["Unlimited requests & projects", "SSO & SAML", "Dedicated support & SLAs"],
  },
];

// Subtle entrance only — durations 0.2-0.4s, ease-out, opacity + transform (see /design/animation guidelines)
const pageVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

const tapTransition: Transition = { duration: 0.15, ease: "easeOut" };

type Lang = "typescript" | "python" | "fetch";

const LANGUAGE_TABS: Array<{ id: Lang; label: string }> = [
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "fetch", label: "Fetch" },
];

// Plain-text versions for clipboard — displayed code below is hand-highlighted JSX
const TS_CLIENT_SNIPPET = `import { Cencori } from "cencori";
import { cencori } from "cencori/vercel";

export const cencoriClient = new Cencori({
  apiKey: process.env.CENCORI_API_KEY!,
});

export { cencori };`;

const PYTHON_SNIPPET = `import os
from cencori import Cencori

cencori = Cencori(api_key=os.environ["CENCORI_API_KEY"])

response = cencori.ai.chat(
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.content)`;

const FETCH_SNIPPET = `const response = await fetch("https://api.cencori.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "CENCORI_API_KEY": process.env.CENCORI_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hello!" }],
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);`;

function CodeStep({
  number,
  title,
  copied,
  onCopy,
  children,
}: {
  number: string;
  title: string;
  copied: boolean;
  onCopy: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border border-border/40 rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/40">
        <span className="text-xs font-medium">{number}. {title}</span>
        <button
          type="button"
          onClick={onCopy}
          className="text-muted-foreground hover:text-foreground"
          aria-label={`Copy ${title.toLowerCase()}`}
        >
          <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={12} className={copied ? "text-emerald-500" : undefined} />
        </button>
      </div>
      <div className="px-3 py-2 bg-zinc-950 space-y-0.5">{children}</div>
    </div>
  );
}

// Helper to get monthly request limit based on tier
function getRequestLimit(tier: string): number {
  switch (tier) {
    case 'free': return 1000;
    case 'pro': return 50000;
    case 'team': return 250000;
    case 'enterprise': return 999999999;
    default: return 1000;
  }
}

export default function NewOrganizationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdOrg, setCreatedOrg] = useState<CreatedOrg | null>(null);
  const [activeLang, setActiveLang] = useState<Lang>("typescript");
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [copiedClient, setCopiedClient] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);
  const { refetchData } = useOrganizationProject();
  const paymentSucceededRef = useRef(false);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
      ),
    [],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      type: "personal",
      plan: "free",
    },
  });

  const selectedPlan = form.watch("plan");
  const selectedType = form.watch("type");
  const isPaidPlan = selectedPlan === "pro" || selectedPlan === "team";

  // Initialize Bachs checkout (no-op, redirect-based)

  const cleanupAbandonedOrganization = useCallback(async (orgId: string) => {
    const { error } = await supabase
      .from("organizations")
      .delete()
      .eq("id", orgId);

    if (error) {
      console.error("[Checkout] Failed to cleanup abandoned organization:", error.message);
      return false;
    }

    await refetchData();
    return true;
  }, [supabase, refetchData]);

  // Redirect to Bachs hosted checkout
  const openBachsCheckout = useCallback(async (checkoutUrl: string) => {
    window.location.href = checkoutUrl;
  }, []);

  const copyInstall = async () => {
    await navigator.clipboard.writeText(activeLang === "python" ? "pip install cencori" : "npm install cencori ai");
    setCopiedInstall(true);
    setTimeout(() => setCopiedInstall(false), 2000);
  };

  const copyEnv = async () => {
    await navigator.clipboard.writeText("CENCORI_API_KEY=csk_your_api_key_here");
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  const copyClient = async () => {
    const snippet = activeLang === "python" ? PYTHON_SNIPPET : activeLang === "fetch" ? FETCH_SNIPPET : TS_CLIENT_SNIPPET;
    await navigator.clipboard.writeText(snippet);
    setCopiedClient(true);
    setTimeout(() => setCopiedClient(false), 2000);
  };

  const copyCli = async () => {
    await navigator.clipboard.writeText("npx create-cencori-app my-app");
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2000);
  };

  const onSubmit = async (values: FormValues) => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error("You must be logged in to create an organization.");
      setLoading(false);
      return;
    }

    let newSlug = generateSlug();
    let slugExists = true;

    for (let i = 0; i < 5; i++) {
      const { data } = await supabase
        .from("organizations")
        .select("slug")
        .eq("slug", newSlug)
        .single();

      if (!data) {
        slugExists = false;
        break;
      }
      newSlug = generateSlug();
    }

    if (slugExists) {
      toast.error("Could not generate a unique slug. Please try again.");
      setLoading(false);
      return;
    }

    const requiresCheckout = values.plan === 'pro' || values.plan === 'team';
    const initialTier = requiresCheckout ? 'free' : values.plan;
    const requestLimit = getRequestLimit(initialTier);

    const { data: orgData, error } = await supabase.from("organizations").insert({
      name: values.name,
      slug: newSlug,
      // Paid plans remain free-tier until checkout is completed by webhook.
      subscription_tier: initialTier,
      subscription_status: values.plan === 'free' ? 'active' : 'trialing',
      monthly_request_limit: requestLimit,
      monthly_requests_used: 0,
      owner_id: user.id,
    }).select('id, slug').single();

    if (error) {
      console.error("Error creating organization:", error.message);
      toast.error("Failed to create organization. " + error.message);
      setLoading(false);
      return;
    }

    if (!orgData) {
      toast.error("Failed to create organization. Please try again.");
      setLoading(false);
      return;
    }

    const { error: memberError } = await supabase.from("organization_members").insert({
      organization_id: orgData.id,
      user_id: user.id,
      role: "owner",
    });

    if (memberError) {
      console.error("Error adding organization owner:", memberError.message);
      await cleanupAbandonedOrganization(orgData.id);
      toast.error("Failed to finalize organization setup. Please try again.");
      setLoading(false);
      return;
    }

    setCreatedOrg(orgData);
    if (!requiresCheckout) {
      toast.success("Organization created!");
      await refetchData();
    }
    setLoading(false);

    // Handle based on plan
    if (values.plan === 'enterprise') {
      router.push(`/contact?plan=enterprise&org=${orgData.slug}`);
    } else if (values.plan === 'pro' || values.plan === 'team') {
      // Redirect to Bachs hosted checkout
      setCheckoutLoading(true);

      try {
        const response = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tier: values.plan,
            interval: 'month',
            orgId: orgData.id,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.checkoutUrl) {
          throw new Error(data.error || 'Failed to create checkout');
        }

        openBachsCheckout(data.checkoutUrl);

      } catch (err) {
        console.error("Error creating checkout:", err);
        const cleanedUp = await cleanupAbandonedOrganization(orgData.id);
        setCreatedOrg(null);
        setCheckoutLoading(false);
        if (!cleanedUp) {
          toast.error("Checkout failed. Please delete the unfinished organization from settings.");
          router.push(`/dashboard/organizations/${orgData.slug}/billing?upgrade=true`);
          return;
        }
        toast.error("Checkout failed. Organization was not created.");
      }
    } else {
      // Free plan - show the get-started screen instead of redirecting immediately
      setSuccess(true);
    }
  };

  // Success state — get you started
  if (success && createdOrg) {
    const orgName = form.getValues("name") || "Your organization";
    const goToDashboard = () => router.push(`/dashboard/organizations/${createdOrg.slug}/onboarding`);

    return (
      <MotionConfig reducedMotion="user">
        <motion.div
          className="flex min-h-[80vh] items-center justify-center px-6 py-10"
          variants={pageVariants}
          initial="hidden"
          animate="show"
        >
        <div className="w-full max-w-4xl">
          {/* Header */}
          <motion.div variants={itemVariants} className="mb-8 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/30">
              <HugeiconsIcon icon={CheckmarkBadge01Icon} size={16} className="text-emerald-500" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Let&apos;s get you started</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {orgName} is ready. Add Cencori to your project to start making AI requests.
              </p>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Start from scratch */}
            <motion.div variants={itemVariants} className="flex flex-col border border-border/40 rounded-md p-5">
              <h2 className="text-sm font-semibold">Start from scratch</h2>
              <p className="mt-1 text-xs text-muted-foreground">Wire the SDK into your own codebase.</p>

              {/* Language tabs */}
              <div className="mt-4 flex items-center gap-1 border-b border-border/40">
                {LANGUAGE_TABS.map((lang) => (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => setActiveLang(lang.id)}
                    className={cn(
                      "-mb-px border-b-2 px-2.5 py-1.5 text-xs font-medium transition-colors",
                      activeLang === lang.id
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>

              <motion.div
                key={activeLang}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="mt-4 space-y-2"
              >
                {activeLang !== "fetch" && (
                  <CodeStep number="1" title="Install the SDK" copied={copiedInstall} onCopy={copyInstall}>
                    <code className="text-[11px] font-mono text-emerald-400">
                      {activeLang === "python" ? "pip install cencori" : "npm install cencori ai"}
                    </code>
                  </CodeStep>
                )}

                <CodeStep number={activeLang === "fetch" ? "1" : "2"} title="Add to .env" copied={copiedEnv} onCopy={copyEnv}>
                  <code className="text-[11px] font-mono"><span className="text-blue-400">CENCORI_API_KEY</span><span className="text-zinc-500">=csk_your_api_key_here</span></code>
                </CodeStep>

                <CodeStep
                  number={activeLang === "fetch" ? "2" : "3"}
                  title={activeLang === "typescript" ? "Create a shared client" : "Make a request"}
                  copied={copiedClient}
                  onCopy={copyClient}
                >
                  {activeLang === "typescript" && (
                    <>
                      <code className="block text-[11px] font-mono"><span className="text-purple-400">import</span> <span className="text-zinc-300">{"{"}</span> <span className="text-amber-300">Cencori</span> <span className="text-zinc-300">{"}"}</span> <span className="text-purple-400">from</span> <span className="text-emerald-400">&quot;cencori&quot;</span><span className="text-zinc-400">;</span></code>
                      <code className="block text-[11px] font-mono"><span className="text-purple-400">import</span> <span className="text-zinc-300">{"{"}</span> <span className="text-blue-300">cencori</span> <span className="text-zinc-300">{"}"}</span> <span className="text-purple-400">from</span> <span className="text-emerald-400">&quot;cencori/vercel&quot;</span><span className="text-zinc-400">;</span></code>
                      <code className="block text-[11px] font-mono text-zinc-600">&nbsp;</code>
                      <code className="block text-[11px] font-mono"><span className="text-purple-400">export const</span> <span className="text-blue-400">cencoriClient</span> <span className="text-zinc-400">=</span> <span className="text-purple-400">new</span> <span className="text-amber-300">Cencori</span><span className="text-zinc-300">({"{"}</span></code>
                      <code className="block text-[11px] font-mono">  <span className="text-zinc-300">apiKey:</span> <span className="text-blue-400">process.env</span><span className="text-zinc-400">.</span><span className="text-zinc-100">CENCORI_API_KEY</span><span className="text-zinc-400">!,</span></code>
                      <code className="block text-[11px] font-mono"><span className="text-zinc-300">{"})"}</span><span className="text-zinc-400">;</span></code>
                      <code className="block text-[11px] font-mono"><span className="text-purple-400">export</span> <span className="text-zinc-300">{"{"}</span> <span className="text-blue-300">cencori</span> <span className="text-zinc-300">{"}"}</span><span className="text-zinc-400">;</span></code>
                    </>
                  )}
                  {activeLang === "python" && (
                    <>
                      <code className="block text-[11px] font-mono"><span className="text-purple-400">import</span> <span className="text-zinc-100">os</span></code>
                      <code className="block text-[11px] font-mono"><span className="text-purple-400">from</span> <span className="text-zinc-100">cencori</span> <span className="text-purple-400">import</span> <span className="text-amber-300">Cencori</span></code>
                      <code className="block text-[11px] font-mono text-zinc-600">&nbsp;</code>
                      <code className="block text-[11px] font-mono"><span className="text-blue-400">cencori</span> <span className="text-zinc-400">=</span> <span className="text-amber-300">Cencori</span><span className="text-zinc-300">(</span><span className="text-zinc-100">api_key</span><span className="text-zinc-400">=</span><span className="text-zinc-100">os.environ</span><span className="text-zinc-300">[</span><span className="text-emerald-400">&quot;CENCORI_API_KEY&quot;</span><span className="text-zinc-300">])</span></code>
                      <code className="block text-[11px] font-mono text-zinc-600">&nbsp;</code>
                      <code className="block text-[11px] font-mono"><span className="text-blue-400">response</span> <span className="text-zinc-400">=</span> <span className="text-zinc-100">cencori.ai.chat</span><span className="text-zinc-300">(</span></code>
                      <code className="block text-[11px] font-mono">    <span className="text-zinc-100">messages</span><span className="text-zinc-400">=</span><span className="text-zinc-300">[{"{"}</span><span className="text-emerald-400">&quot;role&quot;</span><span className="text-zinc-400">:</span> <span className="text-emerald-400">&quot;user&quot;</span><span className="text-zinc-300">,</span> <span className="text-emerald-400">&quot;content&quot;</span><span className="text-zinc-400">:</span> <span className="text-emerald-400">&quot;Hello!&quot;</span><span className="text-zinc-300">{"}"}]</span></code>
                      <code className="block text-[11px] font-mono"><span className="text-zinc-300">)</span></code>
                      <code className="block text-[11px] font-mono"><span className="text-zinc-100">print</span><span className="text-zinc-300">(</span><span className="text-zinc-100">response.content</span><span className="text-zinc-300">)</span></code>
                    </>
                  )}
                  {activeLang === "fetch" && (
                    <>
                      <code className="block text-[11px] font-mono"><span className="text-purple-400">const</span> <span className="text-blue-400">response</span> <span className="text-zinc-400">=</span> <span className="text-purple-400">await</span> <span className="text-zinc-100">fetch</span><span className="text-zinc-300">(</span><span className="text-emerald-400">&quot;https://api.cencori.com/v1/chat/completions&quot;</span><span className="text-zinc-300">, {"{"}</span></code>
                      <code className="block text-[11px] font-mono">  <span className="text-zinc-300">method:</span> <span className="text-emerald-400">&quot;POST&quot;</span><span className="text-zinc-300">,</span></code>
                      <code className="block text-[11px] font-mono">  <span className="text-zinc-300">headers: {"{"}</span></code>
                      <code className="block text-[11px] font-mono">    <span className="text-emerald-400">&quot;CENCORI_API_KEY&quot;</span><span className="text-zinc-400">:</span> <span className="text-blue-400">process.env</span><span className="text-zinc-400">.</span><span className="text-zinc-100">CENCORI_API_KEY</span><span className="text-zinc-300">,</span></code>
                      <code className="block text-[11px] font-mono">    <span className="text-emerald-400">&quot;Content-Type&quot;</span><span className="text-zinc-400">:</span> <span className="text-emerald-400">&quot;application/json&quot;</span><span className="text-zinc-300">,</span></code>
                      <code className="block text-[11px] font-mono">  <span className="text-zinc-300">{"}"},</span></code>
                      <code className="block text-[11px] font-mono">  <span className="text-zinc-300">body:</span> <span className="text-zinc-100">JSON.stringify</span><span className="text-zinc-300">({"{"}</span></code>
                      <code className="block text-[11px] font-mono">    <span className="text-zinc-100">model:</span> <span className="text-emerald-400">&quot;gpt-4o&quot;</span><span className="text-zinc-300">,</span></code>
                      <code className="block text-[11px] font-mono">    <span className="text-zinc-100">messages:</span> <span className="text-zinc-300">[{"{"}</span> <span className="text-zinc-100">role:</span> <span className="text-emerald-400">&quot;user&quot;</span><span className="text-zinc-300">,</span> <span className="text-zinc-100">content:</span> <span className="text-emerald-400">&quot;Hello!&quot;</span> <span className="text-zinc-300">{"}"}],</span></code>
                      <code className="block text-[11px] font-mono">  <span className="text-zinc-300">{"}"}),</span></code>
                      <code className="block text-[11px] font-mono"><span className="text-zinc-300">{"}"});</span></code>
                      <code className="block text-[11px] font-mono text-zinc-600">&nbsp;</code>
                      <code className="block text-[11px] font-mono"><span className="text-purple-400">const</span> <span className="text-blue-400">data</span> <span className="text-zinc-400">=</span> <span className="text-purple-400">await</span> <span className="text-zinc-100">response.json</span><span className="text-zinc-300">()</span><span className="text-zinc-400">;</span></code>
                      <code className="block text-[11px] font-mono"><span className="text-zinc-100">console.log</span><span className="text-zinc-300">(</span><span className="text-zinc-100">data.choices[0].message.content</span><span className="text-zinc-300">)</span><span className="text-zinc-400">;</span></code>
                    </>
                  )}
                </CodeStep>

                {activeLang !== "python" && (
                  <>
                    <p className="pt-2 text-[11px] text-muted-foreground">Or scaffold a brand-new app:</p>
                    <div className="flex items-center justify-between rounded-md border border-border/40 bg-zinc-950 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <HugeiconsIcon icon={TerminalIcon} size={12} className="text-zinc-500" />
                        <code className="text-[11px] font-mono text-zinc-100">npx create-cencori-app my-app</code>
                      </div>
                      <button type="button" onClick={copyCli} className="text-zinc-500 hover:text-zinc-100" aria-label="Copy scaffold command">
                        <HugeiconsIcon icon={copiedCli ? Tick02Icon : Copy01Icon} size={12} className={copiedCli ? "text-emerald-500" : undefined} />
                      </button>
                    </div>
                  </>
                )}
              </motion.div>

              <div className="mt-4 flex items-center gap-3 text-[11px]">
                <Link href="/docs/getting-started" className="text-primary hover:underline">Docs</Link>
                <Link href="/docs/installation" className="text-primary hover:underline">Installation</Link>
              </div>
            </motion.div>

            {/* Explore the dashboard */}
            <motion.div variants={itemVariants} className="flex flex-col border border-border/40 rounded-md p-5">
              <h2 className="text-sm font-semibold">Explore the dashboard</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Jump into {orgName} to create a project, grab an API key, and invite your team.
              </p>

              {/* Decorative dashboard preview */}
              <div className="relative mt-4 flex flex-1 min-h-[220px] flex-col rounded-md border border-border/40 bg-secondary/20 p-3">
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-border" />
                  <span className="h-1.5 w-1.5 rounded-full bg-border" />
                  <span className="h-1.5 w-1.5 rounded-full bg-border" />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-border/40 bg-card p-2">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Requests</p>
                    <p className="mt-1 font-mono text-sm font-semibold">12,048</p>
                  </div>
                  <div className="rounded-md border border-border/40 bg-card p-2">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Latency</p>
                    <p className="mt-1 font-mono text-sm font-semibold">184ms</p>
                  </div>
                </div>

                {/* chart grows to fill whatever space is left */}
                <div className="mt-2 flex flex-1 min-h-[64px] items-end gap-1 rounded-md border border-border/40 bg-card p-3">
                  {[40, 65, 45, 80, 55, 90, 60, 75].map((h, i) => (
                    <motion.span
                      key={i}
                      initial={{ scaleY: 0, opacity: 0 }}
                      animate={{ scaleY: 1, opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.1 + i * 0.03, ease: "easeOut" }}
                      className="origin-bottom flex-1 rounded-sm bg-primary/30"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[9px] text-muted-foreground">Live</span>
                </div>
              </div>

              <Button onClick={goToDashboard} className="mt-4 h-8 self-end px-4 text-xs gap-1.5">
                Continue
                <HugeiconsIcon icon={ArrowRight02Icon} size={13} />
              </Button>
            </motion.div>
          </div>
        </div>
        </motion.div>
      </MotionConfig>
    );
  }

  // Form
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className="w-full max-w-3xl mx-auto px-6 py-10"
        variants={pageVariants}
        initial="hidden"
        animate="show"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="mb-8 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/40 bg-secondary/40">
            <HugeiconsIcon icon={Building06Icon} size={16} className="text-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Create your organization</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Organizations group your projects, team, and billing in one place.
            </p>
          </div>
        </motion.div>

        {/* Form Card */}
        <motion.div variants={itemVariants} className="border border-border/40">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          {/* Name Field */}
          <div className="p-5 space-y-2 border-b border-border/40">
            <label htmlFor="name" className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Organization name
            </label>
            <div className="relative max-w-sm">
              <HugeiconsIcon
                icon={Building06Icon}
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="name"
                placeholder="Acme Inc."
                autoComplete="off"
                className="h-9 pl-8 text-xs bg-secondary/50 border-border/50"
                {...form.register("name")}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              You can change this anytime in settings.
            </p>
            {form.formState.errors.name && (
              <p className="text-[11px] text-red-500">{form.formState.errors.name.message}</p>
            )}
          </div>

          {/* Type Field */}
          <div className="p-5 space-y-3 border-b border-border/40">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Type
            </label>
            <div role="radiogroup" aria-label="Organization type" className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {ORG_TYPES.map((opt) => {
                const isSelected = selectedType === opt.value;
                return (
                  <motion.button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    whileTap={{ scale: 0.97 }}
                    transition={tapTransition}
                    onClick={() => form.setValue("type", opt.value)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-md border p-3 text-center transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border/50 bg-secondary/30 hover:bg-secondary/60"
                    )}
                  >
                    <HugeiconsIcon
                      icon={opt.icon}
                      size={16}
                      className={isSelected ? "text-primary" : "text-muted-foreground"}
                    />
                    <span className={cn("text-xs font-medium", isSelected ? "text-foreground" : "text-muted-foreground")}>
                      {opt.label}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Plan Field */}
          <div className="p-5 space-y-3">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Plan
            </label>
            <div role="radiogroup" aria-label="Plan" className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {PLAN_TIERS.map((tier) => {
                const isSelected = selectedPlan === tier.value;
                return (
                  <motion.button
                    key={tier.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    whileTap={{ scale: 0.97 }}
                    transition={tapTransition}
                    onClick={() => form.setValue("plan", tier.value)}
                    className={cn(
                      "relative flex flex-col items-start gap-2 rounded-md border p-3 text-left transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border/50 bg-secondary/30 hover:bg-secondary/60"
                    )}
                  >
                    {tier.popular && (
                      <span className="absolute -top-2 right-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-emerald-500">
                        Popular
                      </span>
                    )}
                    <span className="text-xs font-medium text-foreground">{tier.label}</span>
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {tier.price}
                      {tier.period && (
                        <span className="ml-0.5 font-sans text-[10px] font-normal text-muted-foreground">{tier.period}</span>
                      )}
                    </span>
                    <ul className="space-y-1">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                          <HugeiconsIcon icon={Tick02Icon} size={10} className="mt-0.5 shrink-0 text-emerald-500" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </motion.button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Need more detail?{" "}
              <Link href="/pricing" className="text-primary hover:underline">
                Compare plans
              </Link>
            </p>
            {isPaidPlan && (
              <p className="text-[11px] text-emerald-500">
                Payment will be collected in a secure overlay after creating.
              </p>
            )}
          </div>
        </form>
        </motion.div>

        {/* Footer */}
        <motion.div variants={itemVariants} className="flex items-center justify-between mt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs px-3"
            onClick={() => router.push("/dashboard/organizations")}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            className="h-8 text-xs px-4 gap-1.5"
            disabled={loading || checkoutLoading}
            onClick={form.handleSubmit(onSubmit)}
          >
            {loading ? (
              <>
                <HugeiconsIcon icon={Loading03Icon} size={13} className="animate-spin" />
                Creating...
              </>
            ) : checkoutLoading ? (
              <>
                <HugeiconsIcon icon={Loading03Icon} size={13} className="animate-spin" />
                Opening checkout...
              </>
            ) : (
              <>
                Create organization
                <HugeiconsIcon icon={ArrowRight02Icon} size={13} />
              </>
            )}
          </Button>
        </motion.div>
      </motion.div>
    </MotionConfig>
  );
}
