'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2, Check, ShieldCheck, Clock, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';

interface Admin {
    id: string;
    email: string;
    role: 'admin' | 'super_admin';
    status: 'pending' | 'active' | 'revoked';
    created_at: string;
    accepted_at: string | null;
}

export default function AdminSettingsPage() {
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'admin' | 'super_admin'>('admin');
    const [copiedLink, setCopiedLink] = useState<string | null>(null);
    const queryClient = useQueryClient();

    const { data, isLoading, error } = useQuery<{ admins: Admin[]; currentUserRole: string }>({
        queryKey: ['admins'],
        queryFn: async () => {
            const res = await fetch('/api/internal/admins');
            const payload = await res.json().catch(() => ({} as { error?: string }));
            if (!res.ok) {
                throw new Error(payload.error || `Failed to fetch admins (${res.status})`);
            }
            return payload as { admins: Admin[]; currentUserRole: string };
        },
    });

    const inviteMutation = useMutation({
        mutationFn: async ({ email, role }: { email: string; role: string }) => {
            const res = await fetch('/api/internal/admins/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to invite');
            return data;
        },
        onSuccess: (data) => {
            toast.success('Invite sent');
            setInviteEmail('');
            queryClient.invalidateQueries({ queryKey: ['admins'] });
            navigator.clipboard.writeText(data.inviteLink);
            setCopiedLink(data.inviteLink);
            setTimeout(() => setCopiedLink(null), 5000);
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });

    const removeMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/internal/admins/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to remove');
            return data;
        },
        onSuccess: () => {
            toast.success('Access revoked');
            queryClient.invalidateQueries({ queryKey: ['admins'] });
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });

    const isSuperAdmin = data?.currentUserRole === 'super_admin';
    const activeAdmins = data?.admins.filter((a) => a.status === 'active') || [];
    const pendingAdmins = data?.admins.filter((a) => a.status === 'pending') || [];

    if (error) {
        return (
            <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-10">
                <div className="text-center py-12">
                    <p className="text-sm text-red-500">Failed to load team</p>
                    <p className="text-xs text-muted-foreground mt-1">{(error as Error).message}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
            <div>
                <h1 className="text-xl font-semibold tracking-tight">Team</h1>
                <p className="text-xs text-muted-foreground mt-1">
                    Manage who has access to the internal panel
                </p>
            </div>

            {isLoading ? (
                <LoadingSkeleton />
            ) : (
                <>
                    {isSuperAdmin && (
                        <div className="rounded-xl border border-border/30 bg-card/60 p-5">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (inviteEmail) {
                                        inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
                                    }
                                }}
                                className="flex flex-col sm:flex-row gap-2"
                            >
                                <Input
                                    type="email"
                                    placeholder="teammate@example.com"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    className="h-9 text-sm flex-1"
                                    required
                                />
                                <select
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value as 'admin' | 'super_admin')}
                                    className="h-9 px-3 text-xs rounded-md border border-border/40 bg-background"
                                >
                                    <option value="admin">Admin</option>
                                    <option value="super_admin">Super Admin</option>
                                </select>
                                <Button
                                    type="submit"
                                    size="sm"
                                    className="h-9"
                                    disabled={inviteMutation.isPending || !inviteEmail}
                                >
                                    <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                                    {inviteMutation.isPending ? 'Inviting...' : 'Send invite'}
                                </Button>
                            </form>
                            {copiedLink && (
                                <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-500">
                                    <Check className="h-3 w-3" />
                                    Invite link copied to clipboard
                                </div>
                            )}
                        </div>
                    )}

                    <MemberSection
                        label="Active"
                        admins={activeAdmins}
                        emptyMessage="No active team members"
                        canRemove={isSuperAdmin}
                        onRemove={(id) => removeMutation.mutate(id)}
                        isRemoving={removeMutation.isPending}
                    />

                    {pendingAdmins.length > 0 && (
                        <MemberSection
                            label="Pending"
                            admins={pendingAdmins}
                            emptyMessage="No pending invites"
                            canRemove={isSuperAdmin}
                            onRemove={(id) => removeMutation.mutate(id)}
                            isRemoving={removeMutation.isPending}
                        />
                    )}
                </>
            )}
        </div>
    );
}

function MemberSection({
    label,
    admins,
    emptyMessage,
    canRemove,
    onRemove,
    isRemoving,
}: {
    label: string;
    admins: Admin[];
    emptyMessage: string;
    canRemove: boolean;
    onRemove: (id: string) => void;
    isRemoving: boolean;
}) {
    return (
        <section className="space-y-2.5">
            <div className="flex items-baseline justify-between px-1">
                <h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.12em]">
                    {label}
                </h2>
                <span className="text-[10px] text-muted-foreground tabular-nums">{admins.length}</span>
            </div>
            <div className="rounded-xl border border-border/30 bg-card/60 overflow-hidden divide-y divide-border/30">
                {admins.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                        {emptyMessage}
                    </div>
                ) : (
                    admins.map((admin) => (
                        <AdminRow
                            key={admin.id}
                            admin={admin}
                            canRemove={canRemove}
                            onRemove={() => onRemove(admin.id)}
                            isRemoving={isRemoving}
                        />
                    ))
                )}
            </div>
        </section>
    );
}

function AdminRow({
    admin,
    canRemove,
    onRemove,
    isRemoving,
}: {
    admin: Admin;
    canRemove: boolean;
    onRemove: () => void;
    isRemoving: boolean;
}) {
    const statusIcon = {
        active: <ShieldCheck className="h-3 w-3 text-emerald-500" />,
        pending: <Clock className="h-3 w-3 text-amber-500" />,
        revoked: <XCircle className="h-3 w-3 text-red-500" />,
    }[admin.status];

    const roleLabel = admin.role === 'super_admin' ? 'Super Admin' : 'Admin';
    const initial = admin.email.charAt(0).toUpperCase();
    const dateLabel = admin.accepted_at
        ? `Joined ${new Date(admin.accepted_at).toLocaleDateString()}`
        : `Invited ${new Date(admin.created_at).toLocaleDateString()}`;

    return (
        <div className="group flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
                <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-muted/40 text-[13px] font-medium text-muted-foreground shrink-0">
                    {initial}
                    <div className="absolute -bottom-0.5 -right-0.5 rounded-full bg-background p-[3px]">
                        {statusIcon}
                    </div>
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{admin.email}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{roleLabel}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground">{dateLabel}</span>
                    </div>
                </div>
            </div>
            {canRemove && admin.status !== 'revoked' && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                    onClick={onRemove}
                    disabled={isRemoving}
                    aria-label="Revoke access"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            )}
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
        </div>
    );
}
