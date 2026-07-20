"use client";

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { importGitHubProject } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { GitHubInstallDialog } from '@/components/github/GitHubInstallDialog';
import { UpgradeDialog } from '@/components/billing/UpgradeDialog';

// Official GitHub logo SVG
const GitHubLogo = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path
      d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
      fill="currentColor"
    />
  </svg>
);

interface GitHubRepo {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
}

interface GitHubInstallation {
  installation_id: number;
  github_account_type: string;
  github_account_login: string;
  github_account_name: string | null;
}

interface PageProps {
  params: Promise<{ orgSlug: string }>;
}

// Hook to fetch GitHub status and repos via server-side API (bypasses RLS)
function useGitHubData(orgSlug: string) {
  return useQuery({
    queryKey: ["githubStatus", orgSlug],
    queryFn: async () => {
      const res = await fetch(`/api/github/status?orgSlug=${encodeURIComponent(orgSlug)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch GitHub status');
      }
      const data = await res.json();
      return data as {
        status: 'installed' | 'not_installed';
        organizationId: string;
        installationId?: number;
        repositories?: GitHubRepo[];
      };
    },
    staleTime: 30 * 1000,
  });
}

// Hook to fetch available installations for the user
function useAvailableInstallations(organizationId: string | null) {
  return useQuery({
    queryKey: ["availableInstallations", organizationId],
    queryFn: async () => {
      const response = await fetch(`/api/github/user-installations?organizationId=${organizationId}`);
      if (!response.ok) return [];
      const data = await response.json();
      return (data.installations || []) as GitHubInstallation[];
    },
    enabled: !!organizationId,
    staleTime: 30 * 1000,
  });
}

export default function GitHubImportPage({ params }: PageProps) {
  const { orgSlug } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchTerm, setSearchTerm] = useState('');
  const [importingRepoId, setImportingRepoId] = useState<number | null>(null);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [linkingInstallationId, setLinkingInstallationId] = useState<number | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);



  // Fetch GitHub data with caching
  const { data: githubData, isLoading, error, refetch } = useGitHubData(orgSlug);

  // Fetch available installations
  const { data: availableInstallations = [] } = useAvailableInstallations(
    githubData?.status === 'not_installed' ? githubData.organizationId : null
  );

  // Handle error params from GitHub OAuth flow
  useEffect(() => {
    const errorType = searchParams.get('error');
    if (errorType === 'project_limit_reached') {
      setUpgradeOpen(true);
    } else if (errorType === 'account_type_mismatch') {
      const expected = searchParams.get('expected');
      const actual = searchParams.get('actual');
      const account = searchParams.get('account');
      toast.error(
        `Account type mismatch: You selected "${expected}" but installed on a ${actual} account (@${account}). Please try again with the correct account type.`,
        { duration: 10000 }
      );
    } else if (errorType === 'account_name_mismatch') {
      const expected = searchParams.get('expected');
      const actual = searchParams.get('actual');
      toast.error(
        `Account name mismatch: You selected "@${expected}" but installed on "@${actual}". Please try again with the correct organization.`,
        { duration: 10000 }
      );
    }
  }, [searchParams]);

  // Filter repositories by search term
  const filteredRepos = searchTerm
    ? (githubData?.repositories || []).filter(repo =>
      repo.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      repo.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    : (githubData?.repositories || []);

  const handleImport = async (repo: GitHubRepo) => {
    if (!githubData?.organizationId || importingRepoId) return;

    setImportingRepoId(repo.id);

    try {
      await importGitHubProject({
        orgSlug,
        organizationId: githubData.organizationId,
        repoId: repo.id,
        repoFullName: repo.full_name,
        repoHtmlUrl: repo.html_url,
        repoDescription: repo.description,
      });
    } catch (error: unknown) {
      if (
        (error instanceof Error && error.message === 'NEXT_REDIRECT') ||
        (typeof error === 'object' &&
          error !== null &&
          'digest' in error &&
          typeof (error as { digest: unknown }).digest === 'string' &&
          (error as { digest: string }).digest.startsWith('NEXT_REDIRECT'))
      ) {
        throw error;
      }
      console.error('Import error:', error);
      toast.error('Failed to import repository. Please try again.');
      setImportingRepoId(null);
    }
  };

  const handleInstallConfirm = async (accountType: 'user' | 'organization', accountLogin?: string) => {
    const params = new URLSearchParams({ orgSlug, accountType });
    if (accountLogin) params.set('accountLogin', accountLogin);

    const res = await fetch(`/api/github/install-url?${params}`);
    if (!res.ok) {
      toast.error('Failed to generate installation URL. Please try again.');
      return;
    }
    const { url } = await res.json();
    window.location.href = url;
  };

  const handleLinkInstallation = async (installation: GitHubInstallation) => {
    if (!githubData?.organizationId || linkingInstallationId !== null) return;

    setLinkingInstallationId(installation.installation_id);
    try {
      const response = await fetch('/api/github/link-installation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: githubData.organizationId,
          installationId: installation.installation_id,
        }),
      });

      if (!response.ok) throw new Error('Failed to link installation');

      toast.success(`Linked GitHub account: ${installation.github_account_login}`);
      // router.refresh() forces a full server-side revalidation so the
      // organization_github_installations row is visible to the next query
      router.refresh();
      await refetch();
    } catch (error) {
      console.error('Error linking installation:', error);
      toast.error('Failed to link GitHub account. Please try again.');
    } finally {
      setLinkingInstallationId(null);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="w-full max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="flex items-center justify-between gap-4 mb-6">
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="bg-card border border-border/40 rounded-md">
          <div className="border-b border-border/40 px-4 py-2">
            <Skeleton className="h-3 w-32" />
          </div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="border-b border-border/40 px-4 py-3 last:border-b-0">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-2.5 w-64" />
                </div>
                <Skeleton className="h-7 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="w-full max-w-2xl mx-auto px-6 py-10">
        <div className="bg-card border border-red-500/30 rounded-md p-6 text-center">
          <div className="w-12 h-12 rounded-md bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-6 w-6 text-red-500" />
          </div>
          <h2 className="text-sm font-medium text-red-500 mb-1">Error fetching repositories</h2>
          <p className="text-xs text-muted-foreground mb-4">
            {error.message}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs px-3" onClick={() => refetch()}>
              Try again
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs px-3" asChild>
              <Link href={`/${orgSlug}/~/projects`}>
                Back to projects
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Not installed state
  if (githubData?.status === 'not_installed') {
    return (
      <div className="w-full max-w-2xl mx-auto px-6 py-10">
        <div className="bg-card border border-border/40 rounded-md p-6 text-center">
          <div className="w-12 h-12 rounded-md bg-secondary flex items-center justify-center mx-auto mb-4">
            <GitHubLogo className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-sm font-medium mb-1">GitHub App not installed</h2>
          <p className="text-xs text-muted-foreground mb-6">
            To import projects from GitHub, you need to install the Cencori GitHub App.
          </p>

          {availableInstallations.length > 0 ? (
            <>
              <p className="text-[11px] text-muted-foreground mb-3">
                You have existing GitHub installations. Link one to this organization:
              </p>
              <div className="space-y-2 mb-4">
                {availableInstallations.map((installation) => (
                  <Button
                    key={installation.installation_id}
                    size="sm"
                    className="h-7 text-xs px-3 w-fit"
                    onClick={() => handleLinkInstallation(installation)}
                    disabled={linkingInstallationId !== null}
                  >
                    {linkingInstallationId === installation.installation_id ? (
                      <>
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        Linking...
                      </>
                    ) : (
                      <>
                        Link @{installation.github_account_login}
                      </>
                    )}
                  </Button>
                ))}
              </div>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/40" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or</span>
                </div>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs px-3" onClick={() => setShowInstallDialog(true)}>
                Install new GitHub App
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" className="h-7 text-xs px-4" onClick={() => setShowInstallDialog(true)}>
                <GitHubLogo className="mr-1.5 h-3 w-3" />
                Install GitHub App
              </Button>
              <p className="text-[11px] text-muted-foreground mt-3">
                You&apos;ll be guided through the installation process
              </p>
            </>
          )}
        </div>

        <GitHubInstallDialog
          open={showInstallDialog}
          onOpenChange={setShowInstallDialog}
          orgSlug={orgSlug}
          onConfirm={handleInstallConfirm}
        />

        {githubData?.organizationId && (
          <UpgradeDialog
            open={upgradeOpen}
            onOpenChange={setUpgradeOpen}
            orgId={githubData.organizationId}
            orgSlug={orgSlug}
            reason="Your free plan is limited to 1 project. Upgrade to Pro for unlimited projects."
            recommendedTier="pro"
          />
        )}
      </div>
    );
  }

  // Main repository selection view
  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-base font-medium mb-1">Import from GitHub</h1>
        <p className="text-xs text-muted-foreground">
          Select a repository to import as a new project
        </p>
      </div>

      {/* Search */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search repositories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoComplete="off"
            className="w-48 sm:w-64 h-7 pl-7 text-xs rounded border-border/50 bg-transparent placeholder:text-muted-foreground/60"
          />
        </div>
        {githubData?.installationId && (
          <Button size="sm" variant="outline" className="h-7 text-xs px-3" asChild>
            <a
              href={`https://github.com/settings/installations/${githubData.installationId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Manage installation
            </a>
          </Button>
        )}
      </div>

      {/* Repositories Table */}
      {filteredRepos.length === 0 ? (
        <div className="bg-card border border-border/40 rounded-md p-8 text-center">
          <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mx-auto mb-3">
            <GitHubLogo className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium mb-1">
            {searchTerm ? 'No matching repositories' : 'No repositories found'}
          </p>
          <p className="text-xs text-muted-foreground">
            {searchTerm
              ? 'Try a different search term'
              : 'Make sure the GitHub App is installed on your repositories'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border/40 rounded-md overflow-hidden">
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border/40">
                <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8 px-4">Repository</TableHead>
                <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider h-8 w-[110px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRepos.map((repo) => (
                <TableRow
                  key={repo.id}
                  className="hover:bg-secondary/30 border-b border-border/40 last:border-b-0 transition-colors"
                >
                  <TableCell className="py-3 px-4 min-w-0">
                    <div className="text-[13px] font-medium truncate" title={repo.full_name}>
                      {repo.full_name}
                    </div>
                    <div
                      className="text-[11px] text-muted-foreground truncate"
                      title={repo.description || 'No description'}
                    >
                      {repo.description || 'No description'}
                    </div>
                  </TableCell>
                  <TableCell className="py-3 pr-4 text-right">
                    <Button
                      size="sm"
                      className="h-7 text-xs px-3"
                      onClick={() => handleImport(repo)}
                      disabled={importingRepoId !== null}
                    >
                      {importingRepoId === repo.id ? (
                        <>
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                          Importing
                        </>
                      ) : (
                        'Import'
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {githubData?.organizationId && (
        <UpgradeDialog
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          orgId={githubData.organizationId}
          orgSlug={orgSlug}
          reason="Your free plan is limited to 1 project. Upgrade to Pro for unlimited projects."
          recommendedTier="pro"
        />
      )}
    </div>
  );
}
