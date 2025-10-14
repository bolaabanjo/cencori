"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/**
 * Onboarding steps:
 * 1) Project intent (Production / Hobby / Learning / Other)
 * 2) Role (Founder / Engineer / Designer / Product / Other)
 * 3) Review & finish
 */

type ProjectType = "production" | "hobby" | "learning" | "other";
type Role =
  | "founder"
  | "engineer"
  | "designer"
  | "product"
  | "other";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [projectType, setProjectType] = useState<ProjectType | null>(null);
  const [projectTypeOther, setProjectTypeOther] = useState<string>("");
  const [role, setRole] = useState<Role | null>(null);
  const [roleOther, setRoleOther] = useState<string>("");

  // user email display
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function fetchUser() {
      const { data, error: userErr } = await supabase.auth.getUser();
      if (userErr || !data.user) {
        // not authenticated, redirect to login
        router.push("/login");
        return;
      }
      if (mounted) setEmail(data.user.email ?? null);
    }
    fetchUser();
    return () => {
      mounted = false;
    };
  }, [router]);

  const projectTypeLabel = useMemo(() => {
    if (!projectType) return "";
    if (projectType === "other") return projectTypeOther || "Other";
    return projectType[0].toUpperCase() + projectType.slice(1);
  }, [projectType, projectTypeOther]);

  const roleLabel = useMemo(() => {
    if (!role) return "";
    if (role === "other") return roleOther || "Other";
    return role[0].toUpperCase() + role.slice(1);
  }, [role, roleOther]);

  function canContinueCurrentStep() {
    if (step === 1) {
      if (!projectType) return false;
      if (projectType === "other" && projectTypeOther.trim().length === 0) return false;
      return true;
    }
    if (step === 2) {
      if (!role) return false;
      if (role === "other" && roleOther.trim().length === 0) return false;
      return true;
    }
    return true;
  }

  async function handleFinish() {
    setError(null);
    setLoading(true);
    try {
      const profileUpdates: Record<string, unknown> = {
        project_type: projectType === "other" ? projectTypeOther.trim() : projectType,
        role: role === "other" ? roleOther.trim() : role,
        onboarding_completed: true,
      };

      // update public.users table: find current user id from auth
      const { data: userResp, error: getUserErr } = await supabase.auth.getUser();
      if (getUserErr || !userResp.user) {
        throw new Error("User session not found. Try logging in again.");
      }

      const userId = userResp.user.id;

      // Update the users row. Assumes public.users has `id` equal to auth user's id.
      const { error: updateErr } = await supabase
        .from("users")
        .update(profileUpdates)
        .eq("id", userId);

      if (updateErr) throw updateErr;

      // success -> go to org dashboard (they'll see prompt to create an org)
      router.push("/dashboard/organization");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete onboarding");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Welcome to Cencori</h1>
              <p className="text-sm text-slate-600 mt-2">
                A few quick questions to personalize your experience.
              </p>
            </div>
            <div className="text-sm text-slate-500">
              {email ?? ""}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <div className="text-xs text-slate-500">Step {step} of 3</div>
            <div className="flex-1 h-2 bg-slate-200 rounded overflow-hidden">
              <div
                aria-hidden
                className="h-full bg-black transition-all"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>
        </header>

        <section className="bg-white rounded-lg shadow p-6">
          {step === 1 && (
            <div>
              <h2 className="text-xl font-medium mb-2">What are you building?</h2>
              <p className="text-sm text-slate-500 mb-4">
                Tell us whether you&apos;re building a production app, a hobby project, or learning.
                This helps us show the right defaults and guardrails.
              </p>

              <div className="grid gap-3">
                <RadioCard
                  id="project-production"
                  checked={projectType === "production"}
                  onChange={() => setProjectType("production")}
                  title="Production app"
                  desc="High stakes — uptime, security, compliance matter."
                />
                <RadioCard
                  id="project-hobby"
                  checked={projectType === "hobby"}
                  onChange={() => setProjectType("hobby")}
                  title="Hobby / side project"
                  desc="Fast iteration, prototypes, creative experiments."
                />
                <RadioCard
                  id="project-learning"
                  checked={projectType === "learning"}
                  onChange={() => setProjectType("learning")}
                  title="Learning / sandbox"
                  desc="Exploration, tutorials, trying new ideas."
                />
                <div className="p-3 rounded border">
                  <label className="flex items-start gap-3">
                    <input
                      id="project-other"
                      name="project-type"
                      type="radio"
                      checked={projectType === "other"}
                      onChange={() => setProjectType("other")}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium">Other</div>
                      <div className="text-sm text-slate-500">Tell us in a few words</div>
                      {projectType === "other" && (
                        <input
                          aria-label="Other project description"
                          value={projectTypeOther}
                          onChange={(e) => setProjectTypeOther(e.target.value)}
                          className="mt-2 block w-full rounded border px-3 py-2"
                          placeholder="Describe your use case"
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
              <h2 className="text-xl font-medium mb-2">What&apos;s your role?</h2>
              <p className="text-sm text-slate-500 mb-4">
                Your role helps us tailor examples and recommended integrations.
              </p>

              <div className="grid gap-3">
                <RadioCard
                  id="role-founder"
                  checked={role === "founder"}
                  onChange={() => setRole("founder")}
                  title="Founder"
                  desc="Building a product and leading the team."
                />
                <RadioCard
                  id="role-engineer"
                  checked={role === "engineer"}
                  onChange={() => setRole("engineer")}
                  title="Senior Engineer"
                  desc="Building core systems and shipping infrastructure."
                />
                <RadioCard
                  id="role-designer"
                  checked={role === "designer"}
                  onChange={() => setRole("designer")}
                  title="Designer"
                  desc="Working on UX, flow, and product polish."
                />
                <RadioCard
                  id="role-product"
                  checked={role === "product"}
                  onChange={() => setRole("product")}
                  title="Product / PM"
                  desc="Owning outcomes and product strategy."
                />
                <div className="p-3 rounded border">
                  <label className="flex items-start gap-3">
                    <input
                      id="role-other"
                      name="role"
                      type="radio"
                      checked={role === "other"}
                      onChange={() => setRole("other")}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium">Other</div>
                      <div className="text-sm text-slate-500">Tell us your role</div>
                      {role === "other" && (
                        <input
                          aria-label="Your role"
                          value={roleOther}
                          onChange={(e) => setRoleOther(e.target.value)}
                          className="mt-2 block w-full rounded border px-3 py-2"
                          placeholder="e.g. DevOps, Researcher, Student..."
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
              <h2 className="text-xl font-medium mb-2">You&apos;re almost done</h2>
              <p className="text-sm text-slate-500 mb-4">
                Review your choices below. You can create an organization later from the dashboard.
              </p>

              <dl className="grid gap-3">
                <div className="p-3 rounded border">
                  <dt className="text-xs text-slate-500">Project intent</dt>
                  <dd className="mt-1 font-medium">{projectTypeLabel || "—"}</dd>
                </div>

                <div className="p-3 rounded border">
                  <dt className="text-xs text-slate-500">Role</dt>
                  <dd className="mt-1 font-medium">{roleLabel || "—"}</dd>
                </div>
              </dl>

              <div className="text-sm text-slate-500 mt-4">
                Tip: You can finalize your organization and projects inside the dashboard. We’ll suggest default protections based on your selections.
              </div>
            </div>
          )}

          {error && <div className="mt-4 text-sm text-red-700">{error}</div>}

          <div className="mt-6 flex items-center justify-between">
            <div>
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(1, s - 1))}
                  className="px-3 py-2 rounded border"
                >
                  Back
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!canContinueCurrentStep()) {
                      setError("Please complete the required fields to continue.");
                      return;
                    }
                    setError(null);
                    setStep((s) => Math.min(3, s + 1));
                  }}
                  className="px-4 py-2 rounded bg-black text-white"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleFinish()}
                  className="px-4 py-2 rounded bg-black text-white"
                  disabled={loading}
                >
                  {loading ? "Finalizing…" : "Finish onboarding"}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/* ---------- Small presentational RadioCard component ---------- */

function RadioCard({
  id,
  title,
  desc,
  checked,
  onChange,
}: {
  id: string;
  title: string;
  desc?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      htmlFor={id}
      className={`block cursor-pointer rounded-md border p-3 hover:shadow-sm ${checked ? "border-black bg-black/5" : "bg-white"
        }`}
    >
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="radio"
          name="radio"
          checked={checked}
          onChange={onChange}
          className="mt-1"
          aria-checked={checked}
        />
        <div className="flex-1">
          <div className="font-medium">{title}</div>
          {desc && <div className="text-sm text-slate-500 mt-1">{desc}</div>}
        </div>
      </div>
    </label>
  );
}
