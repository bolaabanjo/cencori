import { Metadata } from "next";
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

export default function OrganizationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: LayoutParams;
}) {
  return (
    <OrganizationLayoutClient params={params}>
      {children}
    </OrganizationLayoutClient>
  );
}
