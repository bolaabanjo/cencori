'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type OrganizationDetails = {
  id: string;
  name: string;
  description?: string;
  type?: string;
  plan?: string;
  slug: string;
  user_id: string;
  created_at: string;
};

export default function OrganizationDetailsPage({
  params,
}: { 
  params: { id: string }; 
}) {
  const router = useRouter();
  const organizationId = params.id;
  const [organization, setOrganization] = useState<OrganizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrganization() {
      if (!organizationId) return;

      try {
        setLoading(true);
        const res = await fetch(`/api/organizations/${organizationId}`);
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json?.error || 'Failed to fetch organization');
        }

        setOrganization(json.organization);
      } catch (err) {
        console.error('Failed to fetch organization:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    }
    fetchOrganization();
  }, [organizationId]);

  if (loading) {
    return <div className="text-center text-zinc-500">Loading organization details...</div>;
  }

  if (error) {
    return <div className="text-center text-red-500">Error: {error}</div>;
  }

  if (!organization) {
    return <div className="text-center text-zinc-500">Organization not found.</div>;
  }

  return (
    <div className="max-w-2xl mx-auto lg:mt-10">
      <h1 className="text-xl font-semibold text-black dark:text-white mb-4">Organization: {organization.name}</h1>
      <div className="rounded-4xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-6 space-y-4">
        <p className="text-sm text-zinc-400">ID: {organization.id}</p>
        <p className="text-sm text-zinc-400">Description: {organization.description || 'N/A'}</p>
        <p className="text-sm text-zinc-400">Type: {organization.type}</p>
        <p className="text-sm text-zinc-400">Plan: {organization.plan}</p>
        <p className="text-sm text-zinc-400">Slug: {organization.slug}</p>
        <p className="text-sm text-zinc-400">Created At: {new Date(organization.created_at).toLocaleString()}</p>
      </div>
      {/* Add more organization details and management components here */}
    </div>
  );
}
