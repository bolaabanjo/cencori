"use client";

import { useRouter } from "next/navigation";
import { useState, use } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, MotionConfig } from "framer-motion";
import type { Variants, Transition } from "framer-motion";
import { slugify, cn } from "@/lib/utils";
import { isReservedProjectSlug } from "@/lib/reserved-slugs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabaseClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizationProject } from "@/lib/contexts/OrganizationProjectContext";
import { UpgradeDialog } from "@/components/billing/UpgradeDialog";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building06Icon,
  Tick02Icon,
  Copy01Icon,
  ArrowRight02Icon,
  Loading03Icon,
  CheckmarkBadge01Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";

interface OrganizationData {
  id: string;
  name: string;
  slug: string;
  subscription_tier: string;
}

// General region groups (auto-routing to nearest in group)
const GENERAL_REGIONS = [
  { value: "americas", label: "Americas", flag: "🌎", recommended: false },
  { value: "europe", label: "Europe", flag: "🌍", recommended: true },
  { value: "asia-pacific", label: "Asia-Pacific", flag: "🌏", recommended: false },
] as const;

// Specific regions with country flags and codes
const SPECIFIC_REGIONS = [
  { value: "us-east-1", label: "East US (N. Virginia)", code: "us-east-1", flag: "🇺🇸", recommended: true },
  { value: "us-west-1", label: "West US (N. California)", code: "us-west-1", flag: "🇺🇸", recommended: false },
  { value: "us-west-2", label: "West US (Oregon)", code: "us-west-2", flag: "🇺🇸", recommended: false },
  { value: "ca-central-1", label: "Canada (Central)", code: "ca-central-1", flag: "🇨🇦", recommended: false },
  { value: "eu-west-1", label: "West EU (Ireland)", code: "eu-west-1", flag: "🇮🇪", recommended: true },
  { value: "eu-central-1", label: "Central EU (Frankfurt)", code: "eu-central-1", flag: "🇩🇪", recommended: false },
  { value: "ap-southeast-1", label: "Southeast Asia (Singapore)", code: "ap-southeast-1", flag: "🇸🇬", recommended: false },
  { value: "ap-northeast-1", label: "Northeast Asia (Tokyo)", code: "ap-northeast-1", flag: "🇯🇵", recommended: false },
  { value: "ap-south-1", label: "South Asia (Mumbai)", code: "ap-south-1", flag: "🇮🇳", recommended: false },
  { value: "sa-east-1", label: "South America (São Paulo)", code: "sa-east-1", flag: "🇧🇷", recommended: false },
  { value: "me-south-1", label: "Middle East (Bahrain)", code: "me-south-1", flag: "🇧🇭", recommended: false },
  { value: "af-south-1", label: "Africa (Cape Town)", code: "af-south-1", flag: "🇿🇦", recommended: false },
] as const;

const formSchema = z.object({
  name: z.string().min(2, { message: "Project name must be at least 2 characters." }),
  description: z.string().optional(),
  region: z.string(),
});

type FormValues = z.infer<typeof formSchema>;
type Lang = "typescript" | "python" | "fetch";
type WizardStep = 1 | 2 | 3 | 4;

const LANGUAGE_TABS: Array<{ id: Lang; label: string }> = [
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "fetch", label: "Fetch" },
];

const STEPPER_STEPS: Array<{ id: WizardStep; title: string; subtitle: string }> = [
  { id: 1, title: "Project Details", subtitle: "Name your project" },
  { id: 2, title: "Setup SDK", subtitle: "Install & configure" },
  { id: 3, title: "Environment Variables", subtitle: "Add your API key" },
  { id: 4, title: "Make a Request", subtitle: "Verify it works" },
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

function Stepper({ current }: { current: WizardStep }) {
  return (
    <div className="hidden lg:block">
      {STEPPER_STEPS.map((step, i) => {
        const isDone = step.id < current;
        const isActive = step.id === current;
        return (
          <div key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                  isDone
                    ? "border-foreground bg-foreground text-background"
                    : isActive
                      ? "border-foreground text-foreground"
                      : "border-border/50 text-muted-foreground/50"
                )}
              >
                {isDone ? <HugeiconsIcon icon={Tick02Icon} size={12} /> : step.id}
              </div>
              {i < STEPPER_STEPS.length - 1 && (
                <div className={cn("w-px flex-1 min-h-10", isDone ? "bg-foreground" : "bg-border/40")} />
              )}
            </div>
            <div className={cn("pb-10", isActive ? "" : "opacity-60")}>
              <p className={cn("text-sm", isActive ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>
                {step.title}
              </p>
              <p className="text-xs text-muted-foreground">{step.subtitle}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function useOrganization(orgSlug: string) {
  return useQuery({
    queryKey: ["organizationOnboarding", orgSlug],
    queryFn: async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Not authenticated");

      const { data: orgData, error: fetchError } = await supabase
        .from("organizations")
        .select("id, name, slug, subscription_tier")
        .eq("slug", orgSlug)
        .eq("owner_id", user.id)
        .maybeSingle();

      if (fetchError || !orgData) throw new Error("Organization not found or you don't have permission.");
      return orgData as OrganizationData;
    },
    staleTime: 60 * 1000,
  });
}

interface PageProps {
  params: Promise<{ orgSlug: string }>;
}

export default function OnboardingPage({ params }: PageProps) {
  const { orgSlug } = use(params);
  const router = useRouter();
  const { refetchData } = useOrganizationProject();
  const queryClient = useQueryClient();

  const { data: organization, isLoading: orgLoading, error: orgError } = useOrganization(orgSlug);

  const [step, setStep] = useState<WizardStep>(1);
  const [creating, setCreating] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [project, setProject] = useState<{ id: string; slug: string; name: string } | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState<Lang>("typescript");
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedClient, setCopiedClient] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [copiedRequest, setCopiedRequest] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationFailed, setValidationFailed] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "", region: "auto" },
  });

  const onCreateProject = async (values: FormValues) => {
    setCreating(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("You must be logged in to create a project.");
      setCreating(false);
      return;
    }
    if (!organization) {
      toast.error("Organization data is not loaded yet. Please try again.");
      setCreating(false);
      return;
    }

    const tier = organization.subscription_tier || "free";
    if (tier === "free") {
      const { count } = await supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id);
      if ((count ?? 0) >= 1) {
        setCreating(false);
        setUpgradeOpen(true);
        return;
      }
    }

    const baseSlug = slugify(values.name) || "project";
    let newSlug = baseSlug;
    let slugExists = true;
    for (let i = 0; i < 20; i++) {
      if (isReservedProjectSlug(newSlug)) {
        newSlug = `${baseSlug}-${i + 2}`;
        continue;
      }
      const { data } = await supabase
        .from("projects")
        .select("slug")
        .eq("organization_id", organization.id)
        .eq("slug", newSlug)
        .single();
      if (!data) {
        slugExists = false;
        break;
      }
      newSlug = `${baseSlug}-${i + 2}`;
    }
    if (slugExists) {
      toast.error("Could not generate a unique project slug. Please try a different name.");
      setCreating(false);
      return;
    }

    const { data: newProject, error } = await supabase
      .from("projects")
      .insert({
        name: values.name,
        slug: newSlug,
        description: values.description || null,
        organization_id: organization.id,
        visibility: "private",
        region: values.region,
      })
      .select("id, slug, name")
      .single();

    if (error || !newProject) {
      console.error("Error creating project:", error?.message);
      toast.error("Failed to create project. " + (error?.message ?? ""));
      setCreating(false);
      return;
    }

    // Auto-create a default secret key so the project is immediately usable.
    try {
      const keyRes = await fetch(`/api/projects/${newProject.id}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Default Key", environment: "production", key_type: "secret" }),
      });
      const keyData = await keyRes.json();
      if (!keyRes.ok || !keyData?.apiKey?.full_key) {
        throw new Error(keyData?.error || "Failed to create API key");
      }
      setApiKey(keyData.apiKey.full_key as string);
    } catch (err) {
      console.error("Error creating default API key:", err);
      toast.error("Project created, but the default API key couldn't be generated. You can create one from the project's API Keys page.");
    }

    await refetchData();
    // Invalidate the projects-list React Query cache so /~/projects
    // shows the newly-created project instead of the pre-creation empty state.
    await queryClient.invalidateQueries({ queryKey: ["orgProjects", orgSlug] });
    setProject(newProject);
    setCreating(false);
    setStep(2);
  };

  const copyText = async (text: string, setCopied: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const installCommand = activeLang === "python" ? "pip install cencori" : "npm install cencori ai";

  const onValidate = async () => {
    if (!project) return;
    setValidating(true);
    setValidationFailed(false);
    try {
      const res = await fetch(`/api/projects/${project.id}/ai/has-activity`);
      const data = await res.json();
      if (res.ok && data.hasActivity) {
        toast.success("First request received!");
        router.push(`/${orgSlug}/${project.slug}`);
        return;
      }
      setValidationFailed(true);
    } catch (err) {
      console.error("Error validating first request:", err);
      setValidationFailed(true);
    } finally {
      setValidating(false);
    }
  };

  if (orgLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto px-6 py-10">
        <Skeleton className="h-5 w-40 mb-2" />
        <Skeleton className="h-3 w-64 mb-8" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (orgError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-xs text-red-500">{orgError.message}</p>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className="flex min-h-[80vh] items-center justify-center px-6 py-10"
        variants={pageVariants}
        initial="hidden"
        animate="show"
      >
        <div className="grid w-full max-w-4xl grid-cols-1 gap-10 lg:grid-cols-[1fr_240px]">
          <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
            {/* Step 1 — Project Details */}
            {step === 1 && (
              <div>
                <div className="mb-6 flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/40 bg-secondary/40">
                    <HugeiconsIcon icon={Building06Icon} size={16} className="text-foreground" />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold tracking-tight">Create your first project</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Projects hold your API keys and configuration for {organization?.name}.
                    </p>
                  </div>
                </div>

                <div className="border border-border/40 rounded-md">
                  <form onSubmit={form.handleSubmit(onCreateProject)}>
                    <div className="p-5 space-y-2 border-b border-border/40">
                      <label htmlFor="name" className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Name</label>
                      <Input id="name" placeholder="My project" autoComplete="off" className="h-9 max-w-sm text-xs bg-secondary/50 border-border/50" {...form.register("name")} />
                      {form.formState.errors.name && <p className="text-[11px] text-red-500">{form.formState.errors.name.message}</p>}
                    </div>

                    <div className="p-5 space-y-2 border-b border-border/40">
                      <label htmlFor="description" className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Description</label>
                      <Input id="description" placeholder="A brief description (optional)" autoComplete="off" className="h-9 max-w-sm text-xs bg-secondary/50 border-border/50" {...form.register("description")} />
                    </div>

                    <div className="p-5 space-y-2">
                      <label htmlFor="region" className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Region</label>
                      <Select onValueChange={(value: string) => form.setValue("region", value)} defaultValue={form.getValues("region")}>
                        <SelectTrigger id="region" className="h-9 max-w-sm text-xs bg-secondary/50 border-border/50">
                          <SelectValue placeholder="Select region" />
                        </SelectTrigger>
                        <SelectContent className="max-h-80 w-[340px]">
                          <div className="px-2 py-1.5">
                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">General Regions</span>
                          </div>
                          {GENERAL_REGIONS.map((region) => (
                            <SelectItem key={region.value} value={region.value} className="text-xs py-2">
                              <div className="flex items-center justify-between w-full gap-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{region.flag}</span>
                                  <span>{region.label}</span>
                                </div>
                                {region.recommended && <span className="text-[9px] font-medium text-emerald-500 border border-emerald-500/30 px-1.5 py-0.5 rounded">RECOMMENDED</span>}
                              </div>
                            </SelectItem>
                          ))}
                          <div className="my-1 border-t border-border/40" />
                          <div className="px-2 py-1.5">
                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Specific Regions</span>
                          </div>
                          {SPECIFIC_REGIONS.map((region) => (
                            <SelectItem key={region.value} value={region.value} className="text-xs py-2">
                              <div className="flex items-center justify-between w-full gap-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{region.flag}</span>
                                  <span>{region.label}</span>
                                  <span className="text-muted-foreground font-mono text-[10px]">{region.code}</span>
                                </div>
                                {region.recommended && <span className="text-[9px] font-medium text-emerald-500 border border-emerald-500/30 px-1.5 py-0.5 rounded">RECOMMENDED</span>}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </form>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button onClick={form.handleSubmit(onCreateProject)} disabled={creating} size="sm" className="h-8 px-4 text-xs gap-1.5">
                    {creating ? (
                      <>
                        <HugeiconsIcon icon={Loading03Icon} size={13} className="animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Create project
                        <HugeiconsIcon icon={ArrowRight02Icon} size={13} />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2 — Setup SDK */}
            {step === 2 && (
              <div>
                <div className="mb-6">
                  <h1 className="text-xl font-semibold tracking-tight">Setup the SDK</h1>
                  <p className="mt-1 text-sm text-muted-foreground">Install Cencori into {project?.name} and wire up a client.</p>
                </div>

                <div className="flex items-center gap-1 border-b border-border/40">
                  {LANGUAGE_TABS.map((lang) => (
                    <motion.button
                      key={lang.id}
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      transition={tapTransition}
                      onClick={() => setActiveLang(lang.id)}
                      className={cn(
                        "-mb-px border-b-2 px-2.5 py-1.5 text-xs font-medium transition-colors",
                        activeLang === lang.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {lang.label}
                    </motion.button>
                  ))}
                </div>

                <motion.div key={activeLang} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15, ease: "easeOut" }} className="mt-4 space-y-2">
                  {activeLang !== "fetch" && (
                    <CodeStep number="1" title="Install the SDK" copied={copiedInstall} onCopy={() => copyText(installCommand, setCopiedInstall)}>
                      <code className="text-[11px] font-mono text-emerald-400">{installCommand}</code>
                    </CodeStep>
                  )}

                  <CodeStep
                    number={activeLang === "fetch" ? "1" : "2"}
                    title={activeLang === "typescript" ? "Create a shared client" : activeLang === "python" ? "Create a client" : "No client needed"}
                    copied={copiedClient}
                    onCopy={() => copyText(
                      activeLang === "python"
                        ? `import os\nfrom cencori import Cencori\n\ncencori = Cencori(api_key=os.environ["CENCORI_API_KEY"])`
                        : activeLang === "fetch"
                          ? `const CENCORI_API_KEY = process.env.CENCORI_API_KEY;`
                          : `import { Cencori } from "cencori";\n\nexport const cencoriClient = new Cencori({\n  apiKey: process.env.CENCORI_API_KEY!,\n});`,
                      setCopiedClient
                    )}
                  >
                    {activeLang === "typescript" && (
                      <>
                        <code className="block text-[11px] font-mono"><span className="text-purple-400">import</span> <span className="text-zinc-300">{"{"}</span> <span className="text-amber-300">Cencori</span> <span className="text-zinc-300">{"}"}</span> <span className="text-purple-400">from</span> <span className="text-emerald-400">&quot;cencori&quot;</span><span className="text-zinc-400">;</span></code>
                        <code className="block text-[11px] font-mono text-zinc-600">&nbsp;</code>
                        <code className="block text-[11px] font-mono"><span className="text-purple-400">export const</span> <span className="text-blue-400">cencoriClient</span> <span className="text-zinc-400">=</span> <span className="text-purple-400">new</span> <span className="text-amber-300">Cencori</span><span className="text-zinc-300">({"{"}</span></code>
                        <code className="block text-[11px] font-mono">  <span className="text-zinc-300">apiKey:</span> <span className="text-blue-400">process.env</span><span className="text-zinc-400">.</span><span className="text-zinc-100">CENCORI_API_KEY</span><span className="text-zinc-400">!,</span></code>
                        <code className="block text-[11px] font-mono"><span className="text-zinc-300">{"})"}</span><span className="text-zinc-400">;</span></code>
                      </>
                    )}
                    {activeLang === "python" && (
                      <>
                        <code className="block text-[11px] font-mono"><span className="text-purple-400">import</span> <span className="text-zinc-100">os</span></code>
                        <code className="block text-[11px] font-mono"><span className="text-purple-400">from</span> <span className="text-zinc-100">cencori</span> <span className="text-purple-400">import</span> <span className="text-amber-300">Cencori</span></code>
                        <code className="block text-[11px] font-mono text-zinc-600">&nbsp;</code>
                        <code className="block text-[11px] font-mono"><span className="text-blue-400">cencori</span> <span className="text-zinc-400">=</span> <span className="text-amber-300">Cencori</span><span className="text-zinc-300">(</span><span className="text-zinc-100">api_key</span><span className="text-zinc-400">=</span><span className="text-zinc-100">os.environ</span><span className="text-zinc-300">[</span><span className="text-emerald-400">&quot;CENCORI_API_KEY&quot;</span><span className="text-zinc-300">])</span></code>
                      </>
                    )}
                    {activeLang === "fetch" && (
                      <code className="block text-[11px] font-mono text-zinc-500">No install or client setup — call the HTTP API directly with fetch.</code>
                    )}
                  </CodeStep>
                </motion.div>

                <div className="mt-4 flex justify-end">
                  <Button onClick={() => setStep(3)} size="sm" className="h-8 px-4 text-xs gap-1.5">
                    Continue
                    <HugeiconsIcon icon={ArrowRight02Icon} size={13} />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3 — Environment Variables */}
            {step === 3 && (
              <div>
                <div className="mb-6">
                  <h1 className="text-xl font-semibold tracking-tight">Add your API key</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A default key was generated for {project?.name}. Add it to your project&apos;s <code className="font-mono">.env</code> file.
                  </p>
                </div>

                <CodeStep number="1" title="Add to .env" copied={copiedEnv} onCopy={() => copyText(`CENCORI_API_KEY=${apiKey ?? ""}`, setCopiedEnv)}>
                  <code className="text-[11px] font-mono break-all">
                    <span className="text-blue-400">CENCORI_API_KEY</span>
                    <span className="text-zinc-500">={apiKey ?? "csk_..."}</span>
                  </code>
                </CodeStep>

                {!apiKey && (
                  <p className="mt-2 text-[11px] text-orange-500">
                    We couldn&apos;t auto-generate a key. Create one from the project&apos;s API Keys page.
                  </p>
                )}

                <p className="mt-3 text-[11px] text-muted-foreground">
                  This key is shown once — it&apos;s stored as a hash, not in plain text. Keep it secret and never expose it to the client.
                </p>

                <div className="mt-4 flex justify-end">
                  <Button onClick={() => setStep(4)} size="sm" className="h-8 px-4 text-xs gap-1.5">
                    Continue
                    <HugeiconsIcon icon={ArrowRight02Icon} size={13} />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4 — Make a request */}
            {step === 4 && (
              <div>
                <div className="mb-6">
                  <h1 className="text-xl font-semibold tracking-tight">Make your first request</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Run this, then confirm below — we&apos;ll check {project?.name} for activity.
                  </p>
                </div>

                <CodeStep number="1" title="Send a request" copied={copiedRequest} onCopy={() => copyText(
                  activeLang === "python"
                    ? `response = cencori.ai.chat(\n    messages=[{"role": "user", "content": "Hello!"}]\n)\nprint(response.content)`
                    : activeLang === "typescript"
                      ? `const response = await cencoriClient.chat.completions.create({\n  model: "llama-3.1-8b-instant",\n  messages: [{ role: "user", content: "Hello!" }],\n});\nconsole.log(response.choices[0].message.content);`
                      : `const response = await fetch("https://api.cencori.com/v1/chat/completions", {\n  method: "POST",\n  headers: {\n    "CENCORI_API_KEY": "${apiKey ?? "csk_your_api_key_here"}",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({\n    model: "llama-3.1-8b-instant",\n    messages: [{ role: "user", content: "Hello!" }],\n  }),\n});\n\nconst data = await response.json();\nconsole.log(data.choices[0].message.content);`,
                  setCopiedRequest
                )}>
                  {activeLang === "python" && (
                    <>
                      <code className="block text-[11px] font-mono"><span className="text-blue-400">response</span> <span className="text-zinc-400">=</span> <span className="text-zinc-100">cencori.ai.chat</span><span className="text-zinc-300">(</span></code>
                      <code className="block text-[11px] font-mono">    <span className="text-zinc-100">messages</span><span className="text-zinc-400">=</span><span className="text-zinc-300">[{"{"}</span><span className="text-emerald-400">&quot;role&quot;</span><span className="text-zinc-400">:</span> <span className="text-emerald-400">&quot;user&quot;</span><span className="text-zinc-300">,</span> <span className="text-emerald-400">&quot;content&quot;</span><span className="text-zinc-400">:</span> <span className="text-emerald-400">&quot;Hello!&quot;</span><span className="text-zinc-300">{"}"}]</span></code>
                      <code className="block text-[11px] font-mono"><span className="text-zinc-300">)</span></code>
                      <code className="block text-[11px] font-mono"><span className="text-zinc-100">print</span><span className="text-zinc-300">(</span><span className="text-zinc-100">response.content</span><span className="text-zinc-300">)</span></code>
                    </>
                  )}
                  {activeLang === "typescript" && (
                    <>
                      <code className="block text-[11px] font-mono"><span className="text-purple-400">const</span> <span className="text-blue-400">response</span> <span className="text-zinc-400">=</span> <span className="text-purple-400">await</span> <span className="text-zinc-100">cencoriClient.chat.completions.create</span><span className="text-zinc-300">({"{"}</span></code>
                      <code className="block text-[11px] font-mono">  <span className="text-zinc-300">model:</span> <span className="text-emerald-400">&quot;llama-3.1-8b-instant&quot;</span><span className="text-zinc-300">,</span></code>
                      <code className="block text-[11px] font-mono">  <span className="text-zinc-300">messages:</span> <span className="text-zinc-300">[{"{"}</span> <span className="text-zinc-100">role:</span> <span className="text-emerald-400">&quot;user&quot;</span><span className="text-zinc-300">,</span> <span className="text-zinc-100">content:</span> <span className="text-emerald-400">&quot;Hello!&quot;</span> <span className="text-zinc-300">{"}"}],</span></code>
                      <code className="block text-[11px] font-mono"><span className="text-zinc-300">{"}"});</span></code>
                      <code className="block text-[11px] font-mono"><span className="text-zinc-100">console.log</span><span className="text-zinc-300">(</span><span className="text-zinc-100">response.choices[0].message.content</span><span className="text-zinc-300">)</span><span className="text-zinc-400">;</span></code>
                    </>
                  )}
                  {activeLang === "fetch" && (
                    <>
                      <code className="block text-[11px] font-mono"><span className="text-purple-400">const</span> <span className="text-blue-400">response</span> <span className="text-zinc-400">=</span> <span className="text-purple-400">await</span> <span className="text-zinc-100">fetch</span><span className="text-zinc-300">(</span><span className="text-emerald-400">&quot;https://api.cencori.com/v1/chat/completions&quot;</span><span className="text-zinc-300">, {"{"}</span></code>
                      <code className="block text-[11px] font-mono">  <span className="text-zinc-300">method:</span> <span className="text-emerald-400">&quot;POST&quot;</span><span className="text-zinc-300">,</span></code>
                      <code className="block text-[11px] font-mono">  <span className="text-zinc-300">headers: {"{"}</span></code>
                      <code className="block text-[11px] font-mono">    <span className="text-emerald-400">&quot;CENCORI_API_KEY&quot;</span><span className="text-zinc-400">:</span> <span className="text-emerald-400">&quot;{apiKey ?? "csk_your_api_key_here"}&quot;</span><span className="text-zinc-300">,</span></code>
                      <code className="block text-[11px] font-mono">    <span className="text-emerald-400">&quot;Content-Type&quot;</span><span className="text-zinc-400">:</span> <span className="text-emerald-400">&quot;application/json&quot;</span><span className="text-zinc-300">,</span></code>
                      <code className="block text-[11px] font-mono">  <span className="text-zinc-300">{"}"},</span></code>
                      <code className="block text-[11px] font-mono">  <span className="text-zinc-300">body:</span> <span className="text-zinc-100">JSON.stringify</span><span className="text-zinc-300">({"{"}</span></code>
                      <code className="block text-[11px] font-mono">    <span className="text-zinc-100">model:</span> <span className="text-emerald-400">&quot;llama-3.1-8b-instant&quot;</span><span className="text-zinc-300">,</span></code>
                      <code className="block text-[11px] font-mono">    <span className="text-zinc-100">messages:</span> <span className="text-zinc-300">[{"{"}</span> <span className="text-zinc-100">role:</span> <span className="text-emerald-400">&quot;user&quot;</span><span className="text-zinc-300">,</span> <span className="text-zinc-100">content:</span> <span className="text-emerald-400">&quot;Hello!&quot;</span> <span className="text-zinc-300">{"}"}],</span></code>
                      <code className="block text-[11px] font-mono">  <span className="text-zinc-300">{"}"}),</span></code>
                      <code className="block text-[11px] font-mono"><span className="text-zinc-300">{"}"});</span></code>
                      <code className="block text-[11px] font-mono text-zinc-600">&nbsp;</code>
                      <code className="block text-[11px] font-mono"><span className="text-purple-400">const</span> <span className="text-blue-400">data</span> <span className="text-zinc-400">=</span> <span className="text-purple-400">await</span> <span className="text-zinc-100">response.json</span><span className="text-zinc-300">()</span><span className="text-zinc-400">;</span></code>
                      <code className="block text-[11px] font-mono"><span className="text-zinc-100">console.log</span><span className="text-zinc-300">(</span><span className="text-zinc-100">data.choices[0].message.content</span><span className="text-zinc-300">)</span><span className="text-zinc-400">;</span></code>
                    </>
                  )}
                </CodeStep>

                {validationFailed && (
                  <div className="mt-3 rounded-md border border-orange-500/30 bg-orange-500/5 px-3 py-2">
                    <p className="text-[11px] text-orange-500">
                      We haven&apos;t seen a request from {project?.name} yet. Run the snippet above, then validate again.
                    </p>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 text-xs gap-1.5"
                    onClick={() => router.push(`/${orgSlug}/${project?.slug}`)}
                  >
                    Skip for now
                  </Button>
                  <Button onClick={onValidate} disabled={validating} size="sm" className="h-8 px-4 text-xs gap-1.5">
                    {validating ? (
                      <>
                        <HugeiconsIcon icon={Loading03Icon} size={13} className="animate-spin" />
                        Checking...
                      </>
                    ) : validationFailed ? (
                      <>
                        <HugeiconsIcon icon={RefreshIcon} size={13} />
                        Retry
                      </>
                    ) : (
                      <>
                        <HugeiconsIcon icon={CheckmarkBadge01Icon} size={13} />
                        I&apos;ve made my request
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </motion.div>

          <motion.div variants={itemVariants} initial="hidden" animate="show">
            <Stepper current={step} />
          </motion.div>
        </div>
      </motion.div>

      {organization && (
        <UpgradeDialog
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          orgId={organization.id}
          orgSlug={orgSlug}
          orgName={organization.name}
          reason="Your free plan is limited to 1 project. Upgrade to Pro for unlimited projects."
          recommendedTier="pro"
        />
      )}
    </MotionConfig>
  );
}
