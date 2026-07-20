"use client";

import React, { useState, use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
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
    UserPlus,
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
}

interface Organization {
    id: string;
    name: string;
    owner_id: string;
}

// Hook to fetch org data
function useOrganization(orgSlug: string) {
    return useQuery({
        queryKey: ["organization", orgSlug],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("organizations")
                .select("id, name, owner_id")
                .eq("slug", orgSlug)
                .single();

            if (error || !data) throw new Error("Organization not found");
            return data as Organization;
        },
        staleTime: 30 * 1000,
    });
}

// Hook to fetch organization members - simple query without joins
function useOrganizationMembers(orgId: string | undefined) {
    return useQuery({
        queryKey: ["organizationMembers", orgId],
        queryFn: async () => {
            if (!orgId) throw new Error("No org ID");

            const { data, error } = await supabase
                .from("organization_members")
                .select("user_id, role, joined_at")
                .eq("organization_id", orgId)
                .order("joined_at", { ascending: true });

            if (error) {
                console.error("Error fetching members:", error);
                throw error;
            }
            return data || [];
        },
        enabled: !!orgId,
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
    const queryClient = useQueryClient();
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
    const [filterText, setFilterText] = useState("");
    const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

    const { data: org, isLoading: orgLoading } = useOrganization(orgSlug);
    const { data: members, isLoading: membersLoading } = useOrganizationMembers(org?.id);
    const { data: currentUser } = useCurrentUser();

    const isLoading = orgLoading || membersLoading;

    // Current user's role in this org
    const currentMember = members?.find((m: OrganizationMember) => m.user_id === currentUser?.id);
    const isOwner = org?.owner_id === currentUser?.id;
    const isAdmin = currentMember?.role === "admin" || isOwner;
    const canManageMembers = isOwner || isAdmin;

    // Filter members
    const filteredMembers = members?.filter((m: OrganizationMember) => {
        if (!filterText) return true;
        // For current user, search by email; for others, search by user_id
        const searchText = currentUser?.id === m.user_id
            ? currentUser?.email?.toLowerCase()
            : m.user_id.toLowerCase();
        return searchText?.includes(filterText.toLowerCase());
    });

    // Mutation to update member role
    const updateRoleMutation = useMutation({
        mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
            const { error } = await supabase
                .from("organization_members")
                .update({ role: newRole })
                .eq("organization_id", org!.id)
                .eq("user_id", userId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["organizationMembers", org?.id] });
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

    // Get display email for a member - use auth email for current user
    const getMemberEmail = (member: OrganizationMember) => {
        if (member.user_id === currentUser?.id) {
            return currentUser?.email || "Unknown";
        }
        // For other users, show truncated user_id (ideally we'd store email in public.users)
        return `User ${member.user_id.slice(0, 8)}...`;
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

            {/* Controls Row */}
            <div className="flex items-center justify-between mb-4">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Filter members..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="pl-9 h-9 w-64 text-sm bg-secondary/50 border-border/50"
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    {canManageMembers && (
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
                </div>
            </div>

            {/* Members Table */}
            <div className="rounded-md border border-border/40 bg-card overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-[1fr_140px_100px_100px] gap-4 px-4 py-3 border-b border-border/40 bg-muted/30">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">User</div>
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
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-sm truncate">{getMemberEmail(member)}</span>
                                        {isCurrentUser && (
                                            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
                                                You
                                            </Badge>
                                        )}
                                    </div>

                                    {/* Joined At */}
                                    <div className="text-sm text-muted-foreground">
                                        {formatDate(member.joined_at)}
                                    </div>

                                    {/* Role */}
                                    <div>
                                        {canManageMembers && !isMemberOwner && !isCurrentUser ? (
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

