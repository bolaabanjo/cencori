"use client";

import React, { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserAvatar } from "@/components/ui/user-avatar";
import { FeatureUpgradeWall } from "@/components/billing/FeatureUpgradeWall";
import { supabase } from "@/lib/supabaseClient";
import { hasFeature, type SubscriptionTier } from "@/lib/entitlements";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
    Users,
    ChevronDown,
    Search,
    Loader2,
    X,
} from "lucide-react";

interface PageProps {
    params: Promise<{ orgSlug: string }>;
}

interface OrganizationMember {
    user_id: string;
    role: string;
    joined_at: string;
    name: string;
    email: string;
    avatar_url: string | null;
}

interface Organization {
    id: string;
    name: string;
    owner_id: string;
    subscription_tier: SubscriptionTier;
}

// Hook to fetch org data
function useOrganization(orgSlug: string) {
    return useQuery({
        queryKey: ["organizationTeams", orgSlug],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("organizations")
                .select("id, name, owner_id, subscription_tier")
                .eq("slug", orgSlug)
                .single();

            if (error || !data) throw new Error("Organization not found");
            return data as Organization;
        },
        staleTime: 30 * 1000,
    });
}

// Member identity is resolved server-side from profiles and Supabase Auth.
function useOrganizationMembers(orgSlug: string, enabled: boolean) {
    return useQuery({
        queryKey: ["organizationMembers", orgSlug],
        queryFn: async () => {
            const response = await fetch(`/api/organizations/${orgSlug}/members`);
            const body = await response.json() as { members?: OrganizationMember[]; error?: string };
            if (!response.ok) throw new Error(body.error || "Could not load members");
            return body.members ?? [];
        },
        enabled,
        staleTime: 30 * 1000,
    });
}

// Hook to get current user with email
function useCurrentUser() {
    return useQuery({
        queryKey: ["currentUser"],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            return user;
        },
        staleTime: 60 * 1000,
    });
}

export default function TeamsPage({ params }: PageProps) {
    const { orgSlug } = use(params);
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
    const [filterText, setFilterText] = useState("");
    const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

    const checkoutId = searchParams.get("checkout_session_id") || searchParams.get("checkout_id");
    const { data: org, isLoading: orgLoading, refetch: refetchOrg } = useOrganization(orgSlug);
    const teamsEnabled = org ? hasFeature(org.subscription_tier, "teams") : false;
    const { data: members, isLoading: membersLoading } = useOrganizationMembers(orgSlug, Boolean(org?.id));
    const { data: currentUser } = useCurrentUser();

    const isLoading = orgLoading || membersLoading;

    // Current user's role in this org
    const currentMember = members?.find((m: OrganizationMember) => m.user_id === currentUser?.id);
    const isOwner = org?.owner_id === currentUser?.id;
    const isAdmin = currentMember?.role === "admin" || isOwner;
    const canManageMembers = isOwner || isAdmin;

    useEffect(() => {
        if (!checkoutId) return;

        let completed = false;

        const refreshEntitlement = async () => {
            const result = await refetchOrg();
            if (result.data?.subscription_tier && result.data.subscription_tier !== "free") {
                completed = true;
                window.clearInterval(refreshTimer);
                sessionStorage.removeItem(`cencori:stripe-checkout:${checkoutId}`);
                window.history.replaceState({}, "", window.location.pathname);
                toast.success("Team collaboration unlocked");
            }
        };

        const refreshTimer = window.setInterval(() => {
            if (!completed) void refreshEntitlement();
        }, 2_000);
        void refreshEntitlement();
        const stopTimer = window.setTimeout(() => {
            window.clearInterval(refreshTimer);
        }, 30_000);

        return () => {
            window.clearInterval(refreshTimer);
            window.clearTimeout(stopTimer);
        };
    }, [checkoutId, refetchOrg]);

    // Filter members
    const filteredMembers = members?.filter((m: OrganizationMember) => {
        if (!filterText) return true;
        const query = filterText.trim().toLowerCase();
        return m.name.toLowerCase().includes(query) ||
            m.email.toLowerCase().includes(query) ||
            m.role.toLowerCase().includes(query);
    });

    // Mutation to update member role
    const updateRoleMutation = useMutation({
        mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
            const response = await fetch(`/api/organizations/${orgSlug}/members`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, role: newRole }),
            });
            const body = await response.json() as { error?: string };
            if (!response.ok) throw new Error(body.error || "Failed to update role");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["organizationMembers", orgSlug] });
            toast.success("Role updated successfully");
        },
        onError: () => {
            toast.error("Failed to update role");
        },
    });

    // Mutation to leave team
    const leaveTeamMutation = useMutation({
        mutationFn: async () => {
            if (!currentUser) throw new Error("Not logged in");

            const { error } = await supabase
                .from("organization_members")
                .delete()
                .eq("organization_id", org!.id)
                .eq("user_id", currentUser.id);

            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("You have left the organization");
            // Redirect to organizations list
            window.location.href = "/dashboard";
        },
        onError: () => {
            toast.error("Failed to leave organization");
        },
    });

    const [isInviting, setIsInviting] = useState(false);

    const handleInvite = async () => {
        if (!inviteEmail || !org) return;

        setIsInviting(true);
        try {
            const res = await fetch(`/api/organizations/${orgSlug}/invites`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
            });

            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || "Failed to send invite");
                setIsInviting(false);
                return;
            }

            toast.success(data.message || "Invite sent!");
            setInviteOpen(false);
            setInviteEmail("");
        } catch {
            toast.error("Failed to send invite");
        } finally {
            setIsInviting(false);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    };

    if (isLoading) {
        return (
            <div className="w-full max-w-5xl mx-auto px-6 py-8">
                <Skeleton className="h-6 w-20 mb-6" />
                <Skeleton className="h-10 w-48 mb-4" />
                <Skeleton className="h-64" />
            </div>
        );
    }

    if (!org) {
        return (
            <div className="w-full max-w-5xl mx-auto px-6 py-8">
                <div className="text-center py-16 flex flex-col items-center">
                    <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center mb-3">
                        <Users className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">Organization not found</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-5xl mx-auto px-6 py-8">
            {/* Header */}
            <h1 className="text-lg font-medium mb-6">Team</h1>

            {canManageMembers && !teamsEnabled && (
                <FeatureUpgradeWall
                    orgSlug={orgSlug}
                    orgId={org.id}
                    orgName={org.name}
                    currentTier={org.subscription_tier}
                    feature="Invite members"
                    message="Team collaboration is available on Pro, Team, and Enterprise."
                    variant="inline"
                    className="mb-4"
                    returnPath={`/${orgSlug}/~/teams`}
                />
            )}

            {/* Controls Row */}
            <div className="flex items-center justify-between mb-4">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name or email..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="pl-9 h-9 w-64 text-sm bg-secondary/50 border-border/50"
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    {canManageMembers && teamsEnabled && (
                        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" className="h-8 text-xs gap-1.5">
                                    Invite member
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle className="text-base">Invite Team Member</DialogTitle>
                                    <DialogDescription className="text-xs">
                                        Send an invitation to join {org.name}
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Input
                                            type="email"
                                            placeholder="Enter email address"
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                            className="h-9 text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "member" | "admin")}>
                                            <SelectTrigger className="h-9 text-sm">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="member">Member</SelectItem>
                                                <SelectItem value="admin">Admin</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" size="sm" onClick={() => setInviteOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button size="sm" onClick={handleInvite} disabled={!inviteEmail || isInviting}>
                                        {isInviting ? (
                                            <>
                                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                                Sending...
                                            </>
                                        ) : (
                                            "Send Invite"
                                        )}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                    {canManageMembers && !teamsEnabled && (
                        <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled
                            title="Available on Pro, Team, and Enterprise"
                        >
                            Invite member
                        </Button>
                    )}
                </div>
            </div>

            {/* Members Table */}
            <div className="rounded-md border border-border/40 bg-card overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-[1fr_140px_100px_100px] gap-4 px-4 py-3 border-b border-border/40 bg-muted/30">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Member</div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        Joined at
                        <ChevronDown className="h-3 w-3" />
                    </div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</div>
                    <div></div>
                </div>

                {/* Table Body */}
                {filteredMembers && filteredMembers.length > 0 ? (
                    <div className="divide-y divide-border/40">
                        {filteredMembers.map((member: OrganizationMember) => {
                            const isCurrentUser = member.user_id === currentUser?.id;
                            const isMemberOwner = member.role === "owner" || org.owner_id === member.user_id;
                            const displayRole = isMemberOwner ? "Owner" : member.role.charAt(0).toUpperCase() + member.role.slice(1);

                            return (
                                <div
                                    key={member.user_id}
                                    className="grid grid-cols-[1fr_140px_100px_100px] gap-4 px-4 py-3 items-center hover:bg-muted/20 transition-colors"
                                >
                                    {/* User */}
                                    <div className="flex min-w-0 items-center gap-3">
                                        <UserAvatar
                                            src={member.avatar_url}
                                            name={member.name}
                                            email={member.email}
                                            size={32}
                                            className="border border-border/35 bg-muted/40"
                                        />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate text-[13px] font-medium">{member.name}</span>
                                                {isCurrentUser && (
                                                    <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
                                                        You
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{member.email}</p>
                                        </div>
                                    </div>

                                    {/* Joined At */}
                                    <div className="text-sm text-muted-foreground">
                                        {formatDate(member.joined_at)}
                                    </div>

                                    {/* Role */}
                                    <div>
                                        {canManageMembers && teamsEnabled && !isMemberOwner && !isCurrentUser ? (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2">
                                                        {displayRole}
                                                        <ChevronDown className="h-3 w-3" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="start">
                                                    <DropdownMenuItem
                                                        onClick={() => updateRoleMutation.mutate({ userId: member.user_id, newRole: "admin" })}
                                                        className="text-xs"
                                                    >
                                                        Admin
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => updateRoleMutation.mutate({ userId: member.user_id, newRole: "member" })}
                                                        className="text-xs"
                                                    >
                                                        Member
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        ) : (
                                            <span className="text-sm">{displayRole}</span>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex justify-end">
                                        {isCurrentUser && !isMemberOwner && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-xs"
                                                onClick={() => setLeaveDialogOpen(true)}
                                            >
                                                Leave team
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm font-medium">No members found</p>
                    </div>
                )}

                {/* Footer */}
                <div className="px-4 py-3 border-t border-border/40 bg-muted/30">
                    <p className="text-xs text-muted-foreground">
                        {members?.length || 0} user{members?.length !== 1 ? "s" : ""}
                    </p>
                </div>
            </div>

            {/* Leave Team Dialog */}
            <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base">Leave Team</DialogTitle>
                        <DialogDescription className="text-xs">
                            Are you sure you want to leave {org.name}? You will lose access to all projects.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setLeaveDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => leaveTeamMutation.mutate()}
                            disabled={leaveTeamMutation.isPending}
                            className="gap-1.5"
                        >
                            {leaveTeamMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <X className="h-3.5 w-3.5" />
                            )}
                            Leave
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
