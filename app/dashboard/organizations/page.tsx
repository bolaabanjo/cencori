import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { siteConfig } from "@/config/site";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabaseServer";

export default async function OrganizationsPage() {
  const supabase = await createServerClient(); // Call without arguments

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.16))]">
        <p className="text-xl">Please log in to view organizations.</p>
        <Button asChild className="mt-4">
          <Link href={siteConfig.links.signInUrl}>Log In</Link>
        </Button>
      </div>
    );
  }

  const { data: organizations, error } = await supabase
    .from("organizations")
    .select("id, name, slug, description, type, current_plan")
    .eq("owner_id", user.id);

  if (error) {
    console.error("Error fetching organizations:", error.message);
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.16))]">
        <p className="text-xl text-red-500">Error loading organizations.</p>
      </div>
    );
  }

  // Redirect to new organization page if no organizations exist
  if (organizations && organizations.length === 0) {
    redirect("/dashboard/organizations/new");
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Your Organizations</h1>
        <Button asChild>
          <Link href="/dashboard/organizations/new">Create New Organization</Link>
        </Button>
      </div>

      {organizations && organizations.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {organizations.map((org) => (
            <Card key={org.id}>
              <CardHeader>
                <CardTitle>{org.name}</CardTitle>
                <CardDescription>{org.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <p>Type: {org.type}</p>
                <p>Plan: {org.current_plan}</p>
                <Button asChild className="mt-4">
                  <Link href={`/dashboard/organizations/${org.slug}/projects`}>
                    View Projects
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center p-10 border rounded-lg">
          <p className="text-xl mb-4">You don&apos;t have any organizations yet.</p>
          <Button asChild>
            <Link href="/dashboard/organizations/new">Create Your First Organization</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
