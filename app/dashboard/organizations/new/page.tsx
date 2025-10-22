// app/dashboard/organizations/new/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type OrgCreatePayload = {
  name: string;
  description?: string;
  type?: string;
  plan?: string;
};

export default function NewOrganizationPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [type, setType] = useState("personal");
  const [plan, setPlan] = useState("free");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Organization name is required.");
      return;
    }

    setLoading(true);

    const payload: OrgCreatePayload = {
      name: name.trim(),
      description: description.trim() || undefined,
      type,
      plan,
    };

    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        // API should return { error: "..." }
        throw new Error(json?.error ?? "Failed to create organization");
      }

      // assume API returns { organization: { id, ... } }
      const created = json.organization;
      if (created?.id) {
        // navigate to the organization page
        router.push(`/dashboard/organizations/${created.id}`);
      } else {
        // fallback: go back to organizations list
        router.push("/dashboard/organizations");
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Network error");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto mt-10">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Create a new organization</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Organizations are a way to group your projects. Each organization can be configured with different members and
          billing rules.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-4xl border border-zinc-800 bg-slate-900/60 dark:bg-black p-6 space-y-6"
        aria-labelledby="create-org-heading"
      >
        <div>
          <label htmlFor="org-name" className="text-xs font-medium text-zinc-300">
            Name
          </label>
          <input
            id="org-name"
            name="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Organization name"
            className="mt-2 block w-full rounded-3xl border border-zinc-700 bg-slate-800 dark:bg-zinc-800 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            required
            aria-required
          />
          <p className="text-xs text-slate-500 mt-2">
            What&apos;s the name of your company or team? You can change this later.
          </p>
        </div>

        <div>
          <label htmlFor="org-type" className="text-xs font-medium text-slate-300">
            Type
          </label>
          <select
            id="org-type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="personal">Personal</option>
            <option value="company">Company</option>
            <option value="open-source">Open source</option>
            <option value="education">Education</option>
            <option value="other">Other</option>
          </select>
          <p className="text-xs text-slate-500 mt-2">What best describes your organization?</p>
        </div>

        <div>
          <label htmlFor="org-plan" className="text-xs font-medium text-slate-300">
            Plan
          </label>
          <select
            id="org-plan"
            name="plan"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="free">Free — $0/month</option>
            <option value="pro">Pro — $49/month</option>
            <option value="enterprise">Enterprise — Contact us</option>
          </select>
          <p className="text-xs text-slate-500 mt-2">Which plan fits your organization&apos;s needs best?</p>
        </div>

        <div>
          <label htmlFor="org-desc" className="text-xs font-medium text-slate-300">
            Description (optional)
          </label>
          <textarea
            id="org-desc"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short description for your organization"
            className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            rows={3}
          />
        </div>

        {error && <div className="text-sm text-red-500">{error}</div>}

        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => router.push("/dashboard/organizations")}
            className="px-3 py-2 rounded-md border border-slate-700 text-sm text-slate-200 bg-transparent hover:bg-slate-800"
          >
            Cancel
          </button>

          <button
            type="submit"
            className="ml-auto inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Creating…" : "Create organization"}
          </button>
        </div>
      </form>
    </div>
  );
}
