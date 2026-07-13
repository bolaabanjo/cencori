import { redirect } from "next/navigation";

type PageParams = Promise<{ orgSlug: string; projectSlug: string }>;

export default async function MemoryPage({ params }: { params: PageParams }) {
    const { orgSlug, projectSlug } = await params;
    redirect(`/${orgSlug}/${projectSlug}`);
}

