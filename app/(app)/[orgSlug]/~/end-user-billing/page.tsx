import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function LegacyOrgEndUserBillingPage({ params }: PageProps) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/~/monetization`);
}
