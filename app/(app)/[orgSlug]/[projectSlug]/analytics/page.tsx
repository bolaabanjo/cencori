import { redirect } from 'next/navigation';

interface PageProps {
    params: Promise<{
        orgSlug: string;
        projectSlug: string;
    }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AnalyticsRedirectPage({ params, searchParams }: PageProps) {
    const { orgSlug, projectSlug } = await params;
    const resolvedSearchParams = (await searchParams) || {};

    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(resolvedSearchParams)) {
        if (typeof value === 'string') {
            query.set(key, value);
        } else if (Array.isArray(value)) {
            for (const item of value) {
                query.append(key, item);
            }
        }
    }

    const destination = `/${orgSlug}/${projectSlug}/observability`;
    const queryString = query.toString();

    redirect(queryString ? `${destination}?${queryString}` : destination);
}
