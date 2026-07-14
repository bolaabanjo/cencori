import type { Metadata } from 'next';
import StatusPageClient from './status-page-client';

export const metadata: Metadata = {
  title: 'System Status | Cencori',
  description: 'Real-time status of Cencori services. Check the health of the AI Gateway, API, Dashboard, Compute, Workflow, Storage, Provider Network, and Documentation.',
  openGraph: {
    title: 'Cencori System Status',
    description: 'Real-time status of all Cencori services.',
  },
};

export default function StatusPage() {
  return <StatusPageClient />;
}
