"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { 
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type ProjectType = "production" | "hobby" | "learning" | "other";
type Role = "founder" | "engineer" | "designer" | "product" | "other";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // state
  const [projectType, setProjectType] = useState<ProjectType | null>(null);
  const [projectOther, setProjectOther] = useState<string>("");
  const [role, setRole] = useState<Role | null>(null);
  const [roleOther, setRoleOther] = useState<string>("");

  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function check() {
      const { data, error: userErr } = await supabase.auth.getUser();
      if (userErr || !data.user) {
        router.push("/login");
        return;
      }
      const user = data.user;

      // Prefer common avatar keys provided by OAuth providers
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const possibleAvatar =
        (meta.avatar_url as string) ??
        (meta.picture as string) ??
        (meta.avatar as string) ??
        null;

      const name =
        (meta.name as string) ??
        (meta.full_name as string) ??
        (user.email ? user.email.split("@")[0] : "") ??
        null;

      if (mounted) {
        setEmail(data.user.email ?? null);
        setAvatarUrl(possibleAvatar ?? null);
        setDisplayName(name ?? null);
      }
    }
    check();
    return () => {
      mounted = false;
    };
  }, [router]);

  const projectLabel = useMemo(() => {
    if (!projectType) return "";
    if (projectType === "other") return projectOther || "Other";
    return capitalize(projectType);
  }, [projectType, projectOther]);

  const roleLabel = useMemo(() => {
    if (!role) return "";
    if (role === "other") return roleOther || "Other";
    return capitalize(role);
  }, [role, roleOther]);

  function canProceed() {
    if (step === 1) {
      if (!projectType) return false;
      if (projectType === "other" && projectOther.trim().length === 0) return false;
      return true;
    }
    if (step === 2) {
      if (!role) return false;
      if (role === "other" && roleOther.trim().length === 0) return false;
      return true;
    }
    return true;
  }

  async function finish() {
    setError(null);
    setLoading(true);
    try {
      const project_label = projectType === "other" ? projectOther.trim() : projectType;
      const role_label = role === "other" ? roleOther.trim() : role;
  
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_type: project_label, role: role_label }),
      });
  
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Server failed to complete onboarding");
      }
  
      // success -> go to new organization page
      router.push("/dashboard/organizations/new");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to complete onboarding";
      setError(message);
      console.error("Client finish error:", err);
      setLoading(false);
    }
  }
  
  
    const initials = useMemo(() => {
      const name = displayName ?? email ?? "";
      if (!name) return "";
      const parts = name.split(/[\s._-]+/).filter(Boolean);
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }, [displayName, email]);

  return (
    <div className="max-w-xl sm:max-w-3xl mx-auto px-4 sm:px-0 mt-20">
      <div className="mb-6 flex flex-row sm:flex-row item-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-semibold text-zinc-900 dark:text-white">Quick setup</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            A couple questions to personalize your experience.
          </p>
        </div>
        <div>
          <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt={displayName ?? email ?? "User avatar"} />
            ) : (
              <AvatarFallback>{initials}</AvatarFallback>
            )}
          </Avatar>
        </div>
      </div>

      <div className="mb-6">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">Step {step} of 3</div>
        <div className="h-1.5 sm:h-2 mt-2 rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-black rounded-full dark:bg-white transition-all"
            style={{ width: `${(step / 3) * 100}%` }}
            aria-hidden
          />
        </div>
      </div>

      <section className="dark:bg-zinc-950">
        {step === 1 && (
          <div>
            <h2 className="text-lg font-medium text-zinc-900 dark:text-white">What are you building?</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 mb-4">
              Production, hobby project, or learning? This helps set sensible defaults.
            </p>

            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              <OptionCard checked={projectType === "production"} onSelect={() => setProjectType("production")} title="Production" desc="High-stakes app, reliability & security heavy." />
              <OptionCard checked={projectType === "hobby"} onSelect={() => setProjectType("hobby")} title="Hobby / side project" desc="Experimentation and fast iteration." />
              <OptionCard checked={projectType === "learning"} onSelect={() => setProjectType("learning")} title="Learning / sandbox" desc="Practice, explore, learn." />
              <div className="p-3 rounded-3xl border border-zinc-100 dark:border-zinc-700">
                <label className="flex items-start gap-3">
                  <input
                    aria-label="Other project type"
                    type="radio"
                    checked={projectType === "other"}
                    onChange={() => setProjectType("other")}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-zinc-900 dark:text-white">Other</div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">Short description</div>
                    {projectType === "other" && (
                      <input
                        value={projectOther}
                        onChange={(e) => setProjectOther(e.target.value)}
                        className="mt-2 w-full rounded-2xl border px-3 py-2 bg-white dark:bg-zinc-700 border-zinc-200 dark:border-zinc-600 text-zinc-900 dark:text-white"
                        placeholder="Describe your use case (e.g. 'internal tooling')"
                      />
                    )}
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">What&apos;s your role?</h2>
            <p className="text-sm text-slate-500 dark:text-gray-400 mt-1 mb-4">This helps surface relevant docs and examples.</p>

            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              <OptionCard checked={role === "founder"} onSelect={() => setRole("founder")} title="Founder" desc="Building and shipping product." />
              <OptionCard checked={role === "engineer"} onSelect={() => setRole("engineer")} title="Engineer" desc="Systems & integration." />
              <OptionCard checked={role === "designer"} onSelect={() => setRole("designer")} title="Designer" desc="UX, flows, frontend." />
              <OptionCard checked={role === "product"} onSelect={() => setRole("product")} title="Product / PM" desc="Strategy & roadmap." />
              <div className="p-3 rounded-3xl border border-zinc-100 dark:border-zinc-700">
                <label className="flex items-start gap-3">
                  <input
                    aria-label="Other role"
                    type="radio"
                    checked={role === "other"}
                    onChange={() => setRole("other")}
                    className="mt-1"
                  />
                  <div className="flex-1 rounded-3xl">
                    <div className="font-medium text-zinc-900 dark:text-white">Other</div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">Tell us</div>
                    {role === "other" && (
                      <input
                        value={roleOther}
                        onChange={(e) => setRoleOther(e.target.value)}
                        className="mt-2 w-full rounded-2xl border px-3 py-2 bg-white dark:bg-zinc-700 border-zinc-200 dark:border-zinc-600 text-zinc-900 dark:text-white"
                        placeholder="e.g. DevOps, Researcher..."
                      />
                    )}
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-lg font-medium text-zinc-900 dark:text-white">Review</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 mb-4">Looks good, we&apos;ll suggest defaults based on these choices.</p>

            <div className="grid gap-3 rounded-3xl grid-cols-1 sm:grid-cols-2">
              <div className="p-3 rounded-3xl border border-slate-100 dark:border-zinc-700 pl-4">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Project intent</div>
                <div className="mt-1 font-medium text-zinc-900 dark:text-white">{projectLabel || "-"}</div>
              </div>

              <div className="p-3 rounded-3xl border border-zinc-100 dark:border-zinc-700 pl-4">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Role</div>
                <div className="mt-1 font-medium text-zinc-900 dark:text-white">{roleLabel || "-"}</div>
              </div>
            </div>
          </div>
        )}

        {error && <div className="mt-4 text-sm text-red-700">{error}</div>}

        <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                className="w-full sm:w-auto px-4 cursor-pointer py-2 rounded-full border mb-4 text-sm text-zinc-700 dark:text-zinc-200"
              >
                Back
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            {step < 3 ? (
              <button
                onClick={() => {
                  if (!canProceed()) {
                    setError("Please complete this step before continuing.");
                    return;
                  }
                  setError(null);
                  setStep((s) => s + 1);
                }}
                className="w-full sm:w-auto px-4 cursor-pointer py-2 rounded-full bg-black mb-10 dark:bg-white text-white dark:text-black"
              >
                Next
              </button>
            ) : (
              <button
                onClick={() => void finish()}
                disabled={loading}
                className="w-full sm:w-auto px-4 cursor-pointer py-2 rounded-full bg-black text-white dark:bg-white dark:text-black disabled:opacity-60"
              >
                {loading ? "Please wait…" : "Done"}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ----------------- Small presentational components ----------------- */

function OptionCard({ checked, title, desc, onSelect }: { checked: boolean; title: string; desc?: string; onSelect: () => void }) {
  return (
    <RadioGroup
      onClick={onSelect}
      className={`w-full text-left rounded-3xl border px-4 py-3 sm:px-4 sm:py-3 ${checked ? "border-zinc bg-black/5 dark:bg-white/5" : "border-zinc-100 bg-white dark:bg-zinc-950 dark:border-zinc-800"
        }`}
      aria-pressed={checked}
    >
      <div className="flex items-start justify-between">
        <div>
          <RadioGroup className="font-medium text-zinc-900 dark:text-white">{title}</RadioGroup>
          {desc && <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{desc}</div>}
        </div>
        <RadioGroup className="ml-4">
          <Label className={`h-5 w-5 rounded-full border ${checked ? "bg-black dark:bg-white border-zinc" : "border-zinc-300 dark:border-zinc-100"}`} aria-hidden />
        </RadioGroup>
      </div>
    </RadioGroup>
  );
}

/* ----------------- Helpers ----------------- */

function capitalize(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
