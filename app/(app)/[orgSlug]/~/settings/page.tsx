'use client';

/**
 * Org-level General settings.
 *
 * Vercel-style layout: cards for Organization Name, Organization URL,
 * Organization ID, and a Danger Zone with Delete Organization. Each card
 * owns its own form + save button so partial edits don't stomp each other.
 */

import { use, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import { updateOrgName, updateOrgSlug, deleteOrganization } from './actions';

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

interface OrgRow {
    id: string;
    name: string;
    slug: string;
    subscription_tier: string | null;
}

export default function OrgSettingsPage({ params }: PageProps) {
    const { orgSlug } = use(params);

    const { data: org, isLoading, refetch } = useQuery({
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
        staleTime: 30 * 1000,
    });

    if (isLoading) {
        return (
            <div className="w-full max-w-3xl mx-auto px-6 py-10 space-y-4">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-3 w-72" />
                <div className="mt-6 space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-40 w-full" />
                    ))}
                </div>
            </div>
        );
    }

    if (!org) {
        return (
            <div className="w-full max-w-3xl mx-auto px-6 py-10">
                <p className="text-sm font-medium">Organization not found</p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-3xl mx-auto px-6 py-10">
            <div className="mb-8">
                <h1 className="text-base font-medium">Settings</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                    General settings for the {org.name} organization.
                </p>
            </div>

            <div className="space-y-4">
                <OrgNameCard org={org} onSaved={refetch} />
                <OrgSlugCard org={org} />
                <OrgIdCard org={org} />
                <DangerZoneCard org={org} />
            </div>
        </div>
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
                title="Organization Name"
                description="This is your organization's visible name within Cencori. For example, the name of your company or team."
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
            <SettingsCardFooter caption="Please use 48 characters at maximum.">
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
                description="Your organization's URL slug on Cencori. Changing this will break existing links to your organization and its projects."
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
                description="Used when interacting with the Cencori API."
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
        <div className="rounded-md border border-destructive/40 bg-card">
            <div className="p-5">
                <h2 className="text-sm font-medium">Delete Organization</h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Permanently delete <span className="font-mono text-foreground">{org.name}</span> and all
                    its projects, API keys, logs, and settings. This cannot be undone.
                </p>
            </div>
            <div className="border-t border-destructive/30 px-5 py-3 flex items-center justify-between bg-destructive/5">
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
        <div className="rounded-md border border-border/40 bg-card">
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
        <div className="border-t border-border/40 px-5 py-3 flex items-center justify-between bg-muted/20">
            <p className="text-[11px] text-muted-foreground">{caption}</p>
            {children}
        </div>
    );
}
