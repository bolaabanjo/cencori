// app/dashboard/organization/page.tsx
import { createServerClient } from "@/lib/supabaseServer";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic"; // ensure server auth checks every request

export default async function DashboardOrganizationPage() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // not signed in -> send to login
    redirect("/login");
  }

  // load organizations for this user
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("user_id", user.id);

  if (error) {
    console.error("Error loading orgs", error.message);
    throw new Error("Failed to load organizations.");
  }

  return (
    <main className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Your organizations</h1>
        <p className="text-sm text-slate-500">Manage projects, API keys, and settings.</p>
      </header>

      <section className="grid gap-4">
          <div className="p-6 rounded border text-slate-500">No organizations yet. Create one via the API or the dashboard UI.</div>
      </section>
    </main>
  );
}
