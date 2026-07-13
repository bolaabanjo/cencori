import { redirect } from "next/navigation";

export default async function OrgLanding({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/~/projects`);
}
