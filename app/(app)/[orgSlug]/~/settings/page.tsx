'use client';

/**
 * Organization-scoped settings for identity and low-level controls.
 */

import { use, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Copy, Check } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { deleteOrganization, updateOrgName, updateOrgSlug } from './actions';
import { SsoSettings } from './SsoSettings';
import { AuditInfrastructureSettings } from './AuditInfrastructureSettings';
import type { SubscriptionTier } from '@/lib/entitlements';
import { useOrganizationProject } from '@/lib/contexts/OrganizationProjectContext';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

interface OrgRow {
    id: string;
    name: string;
    slug: string;
    subscription_tier: SubscriptionTier | null;
}

export default function OrgSettingsPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    const searchParams = useSearchParams();
    const activeSection = searchParams.get('section') === 'advanced' ? 'advanced' : 'general';
    const { organizations } = useOrganizationProject();
    const cachedOrganization = useMemo<OrgRow | undefined>(() => {
        const organization = organizations.find((item) => item.slug === orgSlug);
        if (!organization) return undefined;
        return {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            subscription_tier: (organization.subscription_tier || null) as SubscriptionTier | null,
        };
    }, [organizations, orgSlug]);

    const { data: org, isLoading, refetch } = useQuery<OrgRow>({
        queryKey: ['orgSettings', orgSlug],
        queryFn: async (): Promise<OrgRow> => {
            const { data, error } = await supabase
                .from('organizations')
                .select('id, name, slug, subscription_tier')
                .eq('slug', orgSlug)
                .single();
            if (error || !data) throw new Error('Organization not found');
            return data as OrgRow;
        },
        initialData: cachedOrganization,
        initialDataUpdatedAt: cachedOrganization ? 0 : undefined,
        staleTime: 30 * 1000,
    });

    if (isLoading) {
        return (
            <div className="w-full max-w-[1120px] mx-auto px-6 lg:px-10 py-12 space-y-8">
                <div className="space-y-3">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-7 w-56" />
                    <Skeleton className="h-3 w-96 max-w-full" />
                </div>
                <div className="space-y-8 pt-6">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
                            <Skeleton className="h-12 w-40" />
                            <Skeleton className="h-44 w-full rounded-lg" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (!org) {
        return (
            <div className="w-full max-w-[1120px] mx-auto px-6 lg:px-10 py-12">
                <p className="text-sm font-medium">Organization not found</p>
            </div>
        );
    }

    const previewTierValue = searchParams.get('preview_plan');
    const previewTier = process.env.NODE_ENV === 'development'
        && (previewTierValue === 'pro' || previewTierValue === 'team' || previewTierValue === 'enterprise')
        ? previewTierValue
        : null;
    const effectiveTier = (previewTier || org.subscription_tier || 'free') as SubscriptionTier;

    return (
        <main className="w-full max-w-[1120px] mx-auto px-6 lg:px-10 py-12">
            <header className="pb-8">
                <div>
                    <h1 className="text-2xl font-semibold tracking-[-0.03em]">
                        {activeSection === 'advanced' ? 'Advanced settings' : 'General settings'}
                    </h1>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                        {activeSection === 'advanced'
                            ? `Low-level organization controls for ${org.name}. Changes here can affect every project and workload.`
                            : `Identity settings for every project and workload operated by ${org.name}.`}
                    </p>
                </div>
            </header>

            <nav className="mb-6 grid grid-cols-2 gap-1 rounded-lg border border-border/35 bg-muted/20 p-1 lg:hidden" aria-label="Organization settings">
                <Link
                    href={`/${orgSlug}/~/settings`}
                    className={`rounded-md px-3 py-2 text-center text-xs font-medium transition-colors ${activeSection === 'general' ? 'bg-muted/80 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    General
                </Link>
                <Link
                    href={`/${orgSlug}/~/settings?section=advanced`}
                    className={`rounded-md px-3 py-2 text-center text-xs font-medium transition-colors ${activeSection === 'advanced' ? 'bg-muted/80 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Advanced
                </Link>
            </nav>

            {activeSection === 'general' ? (
                <div className="border-t border-border/35">
                    <SettingsSection
                        title="Organization identity"
                        description="The name and URL used across your Cencori control plane."
                    >
                        <SettingsPanel>
                            <OrgNameCard org={org} onSaved={refetch} />
                            <OrgSlugCard org={org} />
                        </SettingsPanel>
                    </SettingsSection>

                    <SettingsSection
                        title="System identifier"
                        description="Stable reference for API operations, audit events, and support."
                    >
                        <SettingsPanel>
                            <OrgIdCard org={org} />
                        </SettingsPanel>
                    </SettingsSection>
                </div>
            ) : (
                <div className="border-t border-border/35">
                    <SettingsSection
                        title="Identity & access"
                        description="Organization-wide SAML authentication, enforcement, and identity-provider controls."
                    >
                        <SsoSettings orgSlug={orgSlug} orgName={org.name} />
                    </SettingsSection>

                    <SettingsSection
                        title="Audit infrastructure"
                        description="Enterprise controls for evidence retention, machine access, and external security operations."
                    >
                        <AuditInfrastructureSettings orgSlug={orgSlug} tier={effectiveTier} />
                    </SettingsSection>

                    <SettingsSection
                        title="Destructive actions"
                        description="Permanent operations that affect every project in this organization."
                    >
                        <DangerZoneCard org={org} />
                    </SettingsSection>
                </div>
            )}
        </main>
    );
}

/* ---------- Organization Name ---------- */

function OrgNameCard({ org, onSaved }: { org: OrgRow; onSaved: () => void }) {
    const [value, setValue] = useState(org.name);
    const [isPending, startTransition] = useTransition();

    const dirty = value.trim() !== org.name && value.trim().length > 0;

    const handleSave = () => {
        startTransition(async () => {
            const result = await updateOrgName(org.slug, value);
            if (result.ok) {
                toast.success('Organization name updated.');
                onSaved();
            } else {
                toast.error(result.error || 'Could not update name.');
            }
        });
    };

    return (
        <SettingsCard>
            <SettingsCardHeader
                title="Organization name"
                description="The name operators and collaborators see throughout Cencori."
            />
            <SettingsCardBody>
                <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    maxLength={48}
                    className="h-8 text-xs max-w-md"
                    disabled={isPending}
                />
            </SettingsCardBody>
            <SettingsCardFooter caption="Maximum 48 characters.">
                <Button
                    onClick={handleSave}
                    disabled={!dirty || isPending}
                    className="h-7 text-xs px-3"
                >
                    {isPending ? 'Saving…' : 'Save'}
                </Button>
            </SettingsCardFooter>
        </SettingsCard>
    );
}

/* ---------- Organization URL / Slug ---------- */

function OrgSlugCard({ org }: { org: OrgRow }) {
    const router = useRouter();
    const [value, setValue] = useState(org.slug);
    const [isPending, startTransition] = useTransition();

    const dirty = value.trim().toLowerCase() !== org.slug && value.trim().length > 0;

    const handleSave = () => {
        startTransition(async () => {
            const result = await updateOrgSlug(org.slug, value);
            if (result.ok && result.data) {
                toast.success('Organization URL updated.');
                router.replace(`/${result.data.newSlug}/~/settings`);
            } else {
                toast.error(result.error || 'Could not update URL.');
            }
        });
    };

    return (
        <SettingsCard>
            <SettingsCardHeader
                title="Organization URL"
                description="Changing this address invalidates existing organization and project links."
            />
            <SettingsCardBody>
                <div className="flex items-center max-w-md">
                    <span className="h-8 px-3 flex items-center rounded-l border border-r-0 border-border/50 bg-muted/40 text-[11px] font-mono text-muted-foreground">
                        cencori.com/
                    </span>
                    <Input
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        maxLength={48}
                        className="h-8 text-xs rounded-l-none font-mono"
                        disabled={isPending}
                    />
                </div>
            </SettingsCardBody>
            <SettingsCardFooter caption="Lowercase letters, numbers, and hyphens only.">
                <Button
                    onClick={handleSave}
                    disabled={!dirty || isPending}
                    className="h-7 text-xs px-3"
                >
                    {isPending ? 'Saving…' : 'Save'}
                </Button>
            </SettingsCardFooter>
        </SettingsCard>
    );
}

/* ---------- Organization ID ---------- */

function OrgIdCard({ org }: { org: OrgRow }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(org.id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <SettingsCard>
            <SettingsCardHeader
                title="Organization ID"
                description="Immutable identifier used by the API and audit system."
            />
            <SettingsCardBody>
                <div className="flex items-center gap-2 max-w-md">
                    <code className="flex-1 h-8 px-3 flex items-center rounded border border-border/50 bg-muted/20 text-[11px] font-mono text-foreground overflow-x-auto whitespace-nowrap">
                        {org.id}
                    </code>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        onClick={handleCopy}
                        aria-label="Copy organization ID"
                    >
                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                </div>
            </SettingsCardBody>
        </SettingsCard>
    );
}

/* ---------- Danger Zone ---------- */

function DangerZoneCard({ org }: { org: OrgRow }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [isPending, startTransition] = useTransition();

    const canDelete = confirmText === org.slug;

    const handleDelete = () => {
        startTransition(async () => {
            const result = await deleteOrganization(org.slug, confirmText);
            if (result.ok) {
                toast.success('Organization deleted.');
                router.replace('/dashboard');
            } else {
                toast.error(result.error || 'Could not delete organization.');
            }
        });
    };

    return (
        <div className="overflow-hidden rounded-lg border border-destructive/25 bg-muted/25">
            <div className="p-5">
                <h2 className="text-sm font-medium">Delete Organization</h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Permanently delete <span className="font-mono text-foreground">{org.name}</span> and all
                    its projects, API keys, logs, and settings. This cannot be undone.
                </p>
            </div>
            <div className="border-t border-destructive/20 px-5 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-destructive/[0.035]">
                <p className="text-[11px] text-muted-foreground">
                    Only the organization owner can delete.
                </p>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button variant="destructive" size="sm" className="h-7 text-xs px-3">
                            Delete Organization
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Delete {org.name}?</DialogTitle>
                            <DialogDescription className="text-xs leading-relaxed pt-1">
                                This will permanently remove the organization, every project inside it,
                                every API key, every log, and every stored memory. There is no undo.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2 pt-2">
                            <label className="text-xs text-muted-foreground">
                                Type <span className="font-mono text-foreground">{org.slug}</span> to confirm.
                            </label>
                            <Input
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder={org.slug}
                                className="h-8 text-xs font-mono"
                                disabled={isPending}
                            />
                        </div>
                        <DialogFooter>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs px-3"
                                onClick={() => {
                                    setOpen(false);
                                    setConfirmText('');
                                }}
                                disabled={isPending}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                className="h-7 text-xs px-3"
                                onClick={handleDelete}
                                disabled={!canDelete || isPending}
                            >
                                {isPending ? 'Deleting…' : 'Delete Organization'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}

/* ---------- Shared card primitives ---------- */

function SettingsCard({ children }: { children: React.ReactNode }) {
    return (
        <div className="border-b border-border/35 last:border-b-0">
            {children}
        </div>
    );
}

function SettingsCardHeader({ title, description }: { title: string; description: string }) {
    return (
        <div className="px-5 pt-5 pb-3">
            <h2 className="text-sm font-medium">{title}</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-2xl">
                {description}
            </p>
        </div>
    );
}

function SettingsCardBody({ children }: { children: React.ReactNode }) {
    return <div className="px-5 pb-5">{children}</div>;
}

function SettingsCardFooter({
    caption,
    children,
}: {
    caption?: string;
    children?: React.ReactNode;
}) {
    return (
        <div className="border-t border-border/30 px-5 py-3 flex flex-col gap-3 bg-background/25 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-muted-foreground">{caption}</p>
            {children}
        </div>
    );
}

function SettingsPanel({ children }: { children: React.ReactNode }) {
    return (
        <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
            {children}
        </div>
    );
}

function SettingsSection({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <section className="grid gap-5 border-b border-border/35 py-8 last:border-b-0 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
            <div className="lg:pt-1">
                <h2 className="text-sm font-medium">{title}</h2>
                <p className="mt-1.5 max-w-[220px] text-xs leading-5 text-muted-foreground">
                    {description}
                </p>
            </div>
            <div className="min-w-0">{children}</div>
        </section>
    );
}
