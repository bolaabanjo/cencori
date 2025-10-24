// app/dashboard/organizations/new/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
    <div className="max-w-2xl mx-auto lg:mt-10">


      <form
        onSubmit={handleSubmit}
        className="rounded-sm border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-950 p-6 space-y-6"
        aria-labelledby="create-org-heading"
      >
      <div className="mb-">
        <h1 className="text-l font-semibold text-black dark:text-white">Create a new organization</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Organizations are a way to group your projects. 
          <br />Each organization can be configured with different members and
          billing rules.
        </p>
      </div>

        <div>
          <label htmlFor="org-name" className="text-xs font-medium dark:text-white text-black">
            Name
          </label>
          <input
            id="org-name"
            name="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Organization name"
            className="mt-2 block w-full text-sm rounded-md border dark:border-zinc-900 border-zinc-200 bg-white dark:bg-zinc-950 px-4 py-2  placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            required
            aria-required
          />
          <p className="text-sm text-zinc-600 mt-2">
            What&apos;s the name of your company or team? You can change this later.
          </p>
        </div>

        <div>
          <label htmlFor="org-type" className="text-xs font-medium dark:text-white text-black">
            Type
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="mt-2 flex w-full items-center justify-between text-sm rounded-md border dark:border-zinc-900 border-zinc-200 bg-white dark:bg-zinc-950 px-4 py-2 dark:text-zinc-100 text-zinc-900 focus:outline-none cursor-pointer focus:ring-2 focus:ring-zinc-500"
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 opacity-50"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-full lg:w-158">
              <DropdownMenuRadioGroup value={type} onValueChange={setType}>
                <DropdownMenuRadioItem value="personal">Personal</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="company">Company</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="open-source">Open source</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="education">Education</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="other">Other</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="text-sm text-zinc-600 mt-2">What best describes your organization?</p>
        </div>

        <div>
          <label htmlFor="org-plan" className="text-xs font-medium dark:text-white text-black">
            Plan
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="mt-2 flex w-full text-sm items-center justify-between rounded-md border dark:border-zinc-900 border-zinc-200 bg-white dark:bg-zinc-950 px-4 py-2 dark:text-zinc-100 text-zinc-900 focus:outline-none cursor-pointer focus:ring-2 focus:ring-zinc-500"
              >
                {plan === "free" ? "Free — $0/month" : plan === "pro" ? "Pro — $49/month" : "Enterprise — Contact us"}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 opacity-50"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] lg:w-158">
              <DropdownMenuRadioGroup value={plan} onValueChange={setPlan}>
                <DropdownMenuRadioItem value="free">Free — $0/month</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="pro">Pro — $49/month</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="enterprise">Enterprise — Contact us</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="text-sm text-zinc-600 mt-2">Which plan fits your organization&apos;s needs best?</p>
        </div>

        {error && <div className="text-sm text-red-500">{error}</div>}

        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => router.push("/dashboard/organizations")}
            className="px-3 py-2 rounded-md cursor-pointer border dark:border-zinc-700 border-zinc-200 text-xs dark:text-white text-black bg-transparent dark:hover:bg-zinc-800 hover:bg-zinc-200"
          >
            Cancel
          </button>

          <button
            type="submit"
            className="ml-auto inline-flex items-center gap-2 rounded-md bg-black dark:bg-white px-4 py-2 text-xs font-medium text-white dark:text-black hover:bg-gray-500 cursor-pointer disabled:opacity-60"
            disabled={loading}
            onClick={async (e) => {
              e.preventDefault(); // Prevent default form submit
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
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(payload),
                });

                const json = await res.json();

                if (!res.ok) {
                  throw new Error(
                    json?.error?.message ||
                      (typeof json?.error === "string"
                        ? json?.error
                        : "Could not create organization")
                  );
                }

                // On success, route to the organization page
                if (json?.organization) {
                  router.push(`/dashboard/organizations/${json.organization.id}`);
                } else if (json?.id) {
                  router.push(`/dashboard/organizations/${json.id}`);
                } else {
                  // fallback: go to organizations list
                  router.push(`/dashboard/organizations`);
                }
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "An unknown error occurred"
                );
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? "Creating…" : "Create organization"}
          </button>
        </div>
      </form>
    </div>
  );
}
