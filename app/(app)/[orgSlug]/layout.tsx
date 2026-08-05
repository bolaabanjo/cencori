import { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabaseServer";
import OrganizationLayoutClient from "./OrganizationLayoutClient";

type LayoutParams = Promise<{ orgSlug: string }>;

export async function generateMetadata({
  params,
}: {
  params: LayoutParams;
}): Promise<Metadata> {
  const { orgSlug } = await params;

  try {
    const supabase = await createServerClient();
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("slug", orgSlug)
      .single();

    if (org?.name) {
      return {
        title: org.name,
      };
    }
  } catch (error) {
    console.error("Error fetching organization for metadata:", error);
  }

  return {
    title: "Organization",
  };
}

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: LayoutParams;
}) {
  // Org routes can't be protected by a middleware prefix — an org slug is any
  // top-level segment — so the session check lives here, where the segment is
  // unambiguous. Server-side, so an unauthenticated visitor never receives the
  // page instead of receiving it and being bounced by a client effect.
  const { orgSlug } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/${orgSlug}`)}`);
  }

  return (
    <OrganizationLayoutClient>
      {children}
    </OrganizationLayoutClient>
  );
}
