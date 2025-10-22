"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo"; // your logo component (inline SVG recommended)
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"; // shadcn avatar
import { supabase } from "@/lib/supabaseClient";

type Organization = {
  id: string;
  name: string;
  description?: string | null;
  user_id?: string | null;
  created_at?: string | null;
};

export default function OrganizationsPage() {
  const router = useRouter();

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [creating, setCreating] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch organizations from your API
  async function fetchOrgs() {
    setLoading(true);
    try {
      const res = await fetch("/api/organizations");
      const payload = await res.json();
      if (!res.ok) {
        console.error("Failed to fetch orgs", payload);
        setError(payload?.error ?? "Failed to fetch organizations");
        setOrgs([]);
      } else {
        setOrgs(payload.organizations ?? []);
      }
    } catch (err) {
      console.error(err);
      setError("Network error while fetching organizations");
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOrgs();

    // load user profile for avatar
    let mounted = true;
    supabase.auth.getUser().then(({ data, error: uErr }) => {
      if (uErr || !data.user) return;
      const user = data.user;
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const possibleAvatar = (meta.avatar_url as string) ?? (meta.picture as string) ?? null;
      const name = (meta.name as string) ?? (meta.full_name as string) ?? (user.email ? user.email.split("@")[0] : "") ?? null;
      if (mounted) {
        setUserEmail(user.email ?? null);
        setAvatarUrl(possibleAvatar ?? null);
        setDisplayName(name ?? null);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return orgs;
    const q = search.toLowerCase();
    return orgs.filter((o) => (o.name ?? "").toLowerCase().includes(q) || (o.description ?? "").toLowerCase().includes(q));
  }, [orgs, search]);

  // Create a new organization (simple prompt flow)
  async function handleCreate() {
    const name = prompt("Name of new organization?");
    if (!name || !name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: "" }),
      });
      const payload = await res.json();
      if (!res.ok) {
        alert(payload?.error ?? "Failed to create organization");
      } else {
        // refresh list and navigate to org page (or keep on list)
        await fetchOrgs();
        // optional: navigate into the newly created org if payload contains id
        const created = payload.organization as Organization | undefined;
        if (created?.id) router.push(`/dashboard/organization/${created.id}`);
      }
    } catch (err) {
      console.error(err);
      alert("Network error creating organization");
    } finally {
      setCreating(false);
    }
  }

  // click an org card
  function openOrg(orgId: string) {
    router.push(`/dashboard/organization/${orgId}`);
  }

  // initials for avatar fallback
  function initialsFrom(nameOrEmail?: string | null) {
    const s = nameOrEmail ?? "";
    if (!s) return "U";
    const parts = s.split(/[\s._-]+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return (
    <div className="min-h-[72vh]">
      {/* Header area is inside global layout / header; this is page content */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center justify-between gap-6">
            <h1 className="text-2xl font-semibold text-slate-100">Your Organizations</h1>
          </div>
        </div>

        {/* Search + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex-1">
            <label htmlFor="org-search" className="sr-only">Search organizations</label>
            <input
              id="org-search"
              role="searchbox"
              placeholder="Search for an organization"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-60 max-w-xl rounded-3xl bg-black-900/50 border border-zinc-800 px-4 py-2 text-zinc-300 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="w-full sm:w-auto">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full sm:w-auto inline-flex items-center gap-2 rounded-3xl bg-emerald-600 dark:bg-white px-4 py-2 text-sm text-white dark:text-black hover:bg-emerald-500 disabled:opacity-60"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="inline-block">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              New organization
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-full py-12 text-center text-sm text-slate-400">Loading organizations…</div>
          ) : filtered.length === 0 ? (
            <div className="col-span-full rounded-3xl border border-zinc-800 bg-black-900/30 p-8 text-center">
              <div className="text-sm text-white mb-3">No organizations found</div>
              <div className="flex justify-center">
                <button onClick={handleCreate} className="inline-flex items-center gap-2 rounded-3xl bg-black dark:bg-white px-4 py-2 text-sm text-white dark:text-black hover:bg-emerald-500">
                  Create your first organization
                </button>
              </div>
            </div>
          ) : (
            filtered.map((org) => (
              <article
                key={org.id}
                onClick={() => openOrg(org.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openOrg(org.id); }}
                className="flex items-center gap-4 px-4 py-4 rounded-md border border-slate-800 bg-slate-900/40 hover:bg-slate-900/30 transition cursor-pointer"
                aria-label={`Open organization ${org.name}`}
              >
                <div className="h-10 w-10 flex items-center justify-center rounded-full bg-slate-800/60 text-slate-200 font-medium">
                  {org.name?.slice(0, 1).toUpperCase() ?? "O"}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-slate-100 font-medium truncate">{org.name}</div>
                  <div className="text-xs text-slate-400 mt-1 truncate">
                    {/* small metadata; adjust to your data model */}
                    Free Plan {org.created_at ? `• ${new Date(org.created_at).toLocaleDateString()}` : ""}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
