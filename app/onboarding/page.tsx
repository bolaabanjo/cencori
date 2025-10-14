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
/**
 * Minimal 3-step onboarding (Vercel-like minimalism)
 * - Step 1: What are you building? (production | hobby | learning | other)
 * - Step 2: Your role (founder | engineer | designer | product | other)
 * - Step 3: Review & finish
 *
 * Writes to public.users: project_type, role, onboarding_completed
 */

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

  useEffect(() => {
    let mounted = true;
    async function check() {
      const { data, error: userErr } = await supabase.auth.getUser();
      if (userErr || !data.user) {
        router.push("/login");
        return;
      }
      if (mounted) setEmail(data.user.email ?? null);
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
      const { data: userResp, error: gerr } = await supabase.auth.getUser();
      if (gerr || !userResp.user) throw new Error("No user session. Please sign in again.");
      const userId = userResp.user.id;

      const updates = {
        project_type: projectType === "other" ? projectOther.trim() : projectType,
        role: role === "other" ? roleOther.trim() : role,
        onboarding_completed: true,
      };

      const { error: updateErr } = await supabase.from("users").update(updates).eq("id", userId);
      if (updateErr) throw updateErr;

      router.push("/dashboard/organization");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete onboarding");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto mt-20">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">Quick setup</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            A couple questions to personalize your experience.
          </p>
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">{email ?? ""}</div>
      </div>

      <div className="mb-6">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">Step {step} of 3</div>
        <div className="h-2 mt-2 rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-black rounded-full dark:bg-white transition-all"
            style={{ width: `${(step / 3) * 100}%` }}
            aria-hidden
          />
        </div>
      </div>

      <section className="dark:bg-zinc-950 border">
        {step === 1 && (
          <div>
            <h2 className="text-lg font-medium text-zinc-900 dark:text-white">What are you building?</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 mb-4">
              Production, hobby project, or learning? This helps set sensible defaults.
            </p>

            <div className="grid gap-3">
              <OptionCard checked={projectType === "production"} onSelect={() => setProjectType("production")} title="Production" desc="High-stakes app, reliability & security heavy." />
              <OptionCard checked={projectType === "hobby"} onSelect={() => setProjectType("hobby")} title="Hobby / side project" desc="Experimentation and fast iteration." />
              <OptionCard checked={projectType === "learning"} onSelect={() => setProjectType("learning")} title="Learning / sandbox" desc="Practice, explore, learn." />
              <div className="p-3 rounded border border-zinc-100 dark:border-zinc-700">
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
                        className="mt-2 w-full rounded border px-3 py-2 bg-white dark:bg-zinc-700 border-zinc-200 dark:border-zinc-600 text-zinc-900 dark:text-white"
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

            <div className="grid gap-3">
              <OptionCard checked={role === "founder"} onSelect={() => setRole("founder")} title="Founder" desc="Building and shipping product." />
              <OptionCard checked={role === "engineer"} onSelect={() => setRole("engineer")} title="Engineer" desc="Systems & integration." />
              <OptionCard checked={role === "designer"} onSelect={() => setRole("designer")} title="Designer" desc="UX, flows, frontend." />
              <OptionCard checked={role === "product"} onSelect={() => setRole("product")} title="Product / PM" desc="Strategy & roadmap." />
              <div className="p-3 rounded border border-zinc-100 dark:border-zinc-700">
                <label className="flex items-start gap-3">
                  <input
                    aria-label="Other role"
                    type="radio"
                    checked={role === "other"}
                    onChange={() => setRole("other")}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-zinc-900 dark:text-white">Other</div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">Tell us</div>
                    {role === "other" && (
                      <input
                        value={roleOther}
                        onChange={(e) => setRoleOther(e.target.value)}
                        className="mt-2 w-full rounded border px-3 py-2 bg-white dark:bg-zinc-700 border-zinc-200 dark:border-zinc-600 text-zinc-900 dark:text-white"
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

            <div className="grid gap-3">
              <div className="p-3 rounded border border-slate-100 dark:border-zinc-700">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Project intent</div>
                <div className="mt-1 font-medium text-zinc-900 dark:text-white">{projectLabel || "-"}</div>
              </div>

              <div className="p-3 rounded border border-zinc-100 dark:border-zinc-700">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Role</div>
                <div className="mt-1 font-medium text-zinc-900 dark:text-white">{roleLabel || "-"}</div>
              </div>
            </div>
          </div>
        )}

        {error && <div className="mt-4 text-sm text-red-700">{error}</div>}

        <div className="mt-6 flex items-center justify-between">
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                className="px-3 py-2 rounded border text-sm text-zinc-700 dark:text-zinc-200"
              >
                Back
              </button>
            )}
          </div>

          <div className="flex gap-3">
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
                className="px-4 py-2 rounded-full bg-black text-white"
              >
                Next
              </button>
            ) : (
              <button
                onClick={() => void finish()}
                disabled={loading}
                className="px-4 py-2 rounded bg-black text-white disabled:opacity-60"
              >
                {loading ? "Finishing…" : "Finish onboarding"}
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
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-md border px-4 py-3 ${checked ? "border-zinc bg-zinc/5" : "border-zinc-100 bg-white dark:bg-zinc-800 dark:border-zinc-700"
        }`}
      aria-pressed={checked}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium text-zinc-900 dark:text-white">{title}</div>
          {desc && <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{desc}</div>}
        </div>
        <div className="ml-4">
          <div className={`h-5 w-5 rounded-full border ${checked ? "bg-black border-black" : "border-zinc-300 dark:border-zinc-600"}`} aria-hidden />
        </div>
      </div>
    </button>
  );
}

/* ----------------- Helpers ----------------- */

function capitalize(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
