"use client";

import { type ReactNode, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Google, Microsoft } from "@lobehub/icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Key02Icon from "@hugeicons/core-free-icons/Key02Icon";
import Building06Icon from "@hugeicons/core-free-icons/Building06Icon";
import Upload03Icon from "@hugeicons/core-free-icons/Upload03Icon";
import CheckmarkCircle02Icon from "@hugeicons/core-free-icons/CheckmarkCircle02Icon";
import Alert02Icon from "@hugeicons/core-free-icons/Alert02Icon";
import Clock01Icon from "@hugeicons/core-free-icons/Clock01Icon";
import InformationCircleIcon from "@hugeicons/core-free-icons/InformationCircleIcon";
import UserSettings01Icon from "@hugeicons/core-free-icons/UserSettings01Icon";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "@/components/ui/toast";

interface SsoSettingsProps {
    orgSlug: string;
    orgName: string;
}

interface SsoConfiguration {
    sso_enabled: boolean;
    sso_domain: string | null;
    sso_enforce: boolean;
    sso_provider_id: string | null;
    sso_configured_at: string | null;
    subscription_tier: string | null;
}

interface SsoAuditEntry {
    id: string;
    action: string;
    actor_email: string | null;
    description: string;
    created_at: string;
}

interface SsoAuditResponse {
    logs: SsoAuditEntry[];
}

type MetadataMethod = "url" | "xml";

const DOMAIN_PATTERN = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => null) as ({ error?: string } & T) | null;
    if (!response.ok) {
        throw new Error(body?.error || "The request could not be completed.");
    }
    return body as T;
}

function formatTimestamp(value: string | null): string {
    if (!value) return "Not available";
    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(value));
}

function formatRelativeTime(value: string): string {
    const elapsed = Date.now() - new Date(value).getTime();
    const minutes = Math.max(0, Math.floor(elapsed / 60_000));
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return formatTimestamp(value);
}

export function SsoSettings({ orgSlug, orgName }: SsoSettingsProps) {
    const queryClient = useQueryClient();
    const endpoint = `/api/organizations/${orgSlug}/sso`;
    const auditEndpoint = `/api/organizations/${orgSlug}/audit-logs?category=sso&time_range=90d&per_page=6`;

    const { data: configuration, error, isLoading } = useQuery({
        queryKey: ["organizationSso", orgSlug],
        queryFn: () => requestJson<SsoConfiguration>(endpoint),
        staleTime: 30_000,
    });

    const { data: auditData, isLoading: isAuditLoading } = useQuery({
        queryKey: ["organizationSsoAudit", orgSlug],
        queryFn: () => requestJson<SsoAuditResponse>(auditEndpoint),
        enabled: !!configuration,
        staleTime: 15_000,
    });

    if (isLoading) return <SsoSettingsSkeleton />;

    if (error || !configuration) {
        return (
            <div className="rounded-lg border border-destructive/20 bg-destructive/[0.035] px-5 py-4">
                <div className="flex items-start gap-3">
                    <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <div>
                        <p className="text-xs font-medium">SSO configuration unavailable</p>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                            {error instanceof Error ? error.message : "Cencori could not load this organization’s identity settings."}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const isConfigured = configuration.sso_enabled && !!configuration.sso_provider_id;
    const canConfigure = ["team", "enterprise"].includes(configuration.subscription_tier || "");

    const refreshSso = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["organizationSso", orgSlug] }),
            queryClient.invalidateQueries({ queryKey: ["organizationSsoAudit", orgSlug] }),
        ]);
    };

    return (
        <div className="space-y-4">
            <SsoOverview
                orgSlug={orgSlug}
                configuration={configuration}
                isConfigured={isConfigured}
                canConfigure={canConfigure}
                onConfigured={refreshSso}
            />

            <IdentityProviderPanel
                domain={configuration.sso_domain}
                isConfigured={isConfigured}
            />

            <AuthenticationPolicyPanel
                orgSlug={orgSlug}
                configuration={configuration}
                isConfigured={isConfigured}
                canConfigure={canConfigure}
                onChanged={refreshSso}
            />

            <ConfigurationHealthPanel configuration={configuration} isConfigured={isConfigured} />

            <AuditHistoryPanel
                orgSlug={orgSlug}
                logs={auditData?.logs || []}
                isLoading={isAuditLoading}
            />

            {isConfigured && (
                <RemoveSsoPanel
                    orgName={orgName}
                    endpoint={endpoint}
                    onRemoved={refreshSso}
                />
            )}
        </div>
    );
}

function SsoOverview({
    orgSlug,
    configuration,
    isConfigured,
    canConfigure,
    onConfigured,
}: {
    orgSlug: string;
    configuration: SsoConfiguration;
    isConfigured: boolean;
    canConfigure: boolean;
    onConfigured: () => Promise<void>;
}) {
    const [open, setOpen] = useState(false);

    return (
        <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
            <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border/35 bg-background/30">
                        <HugeiconsIcon icon={Key02Icon} className="size-4 text-foreground" />
                    </div>
                    <div>
                        <h2 className="text-sm font-medium">Single sign-on</h2>
                        <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
                            Authenticate organization members through a SAML identity provider.
                        </p>
                    </div>
                </div>

                {canConfigure ? (
                    <Button
                        size="sm"
                        className="h-7 self-start px-3 text-xs"
                        onClick={() => setOpen(true)}
                    >
                        {isConfigured ? "Reconfigure" : "Configure SSO"}
                    </Button>
                ) : (
                    <Button asChild size="sm" className="h-7 self-start px-3 text-xs">
                        <Link href={`/${orgSlug}/~/billing`}>Upgrade to configure</Link>
                    </Button>
                )}
            </div>

            <div className="divide-y divide-border/30 border-t border-border/30">
                <OverviewValue label="Status" value={isConfigured ? "Configured" : "Not configured"} />
                <OverviewValue label="Protocol" value="SAML 2.0" />
                <OverviewValue label="SSO email domain" value={configuration.sso_domain || "Not set"} mono />
            </div>

            {!canConfigure && (
                <div className="flex items-start gap-2 border-t border-border/30 bg-background/20 px-5 py-3">
                    <HugeiconsIcon icon={InformationCircleIcon} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <p className="text-[11px] leading-5 text-muted-foreground">
                        SAML SSO is available on Team and Enterprise. The controls remain visible so you can evaluate the complete setup before upgrading.
                    </p>
                </div>
            )}

            <SsoConfigurationDialog
                open={open}
                onOpenChange={setOpen}
                endpoint={`/api/organizations/${orgSlug}/sso`}
                initialDomain={configuration.sso_domain || ""}
                isReconfigure={isConfigured}
                onConfigured={onConfigured}
            />
        </div>
    );
}

function OverviewValue({
    label,
    value,
    mono = false,
}: {
    label: string;
    value: string;
    mono?: boolean;
}) {
    return (
        <div className="flex min-h-12 items-center justify-between gap-6 px-5 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`truncate text-right text-[13px] font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
        </div>
    );
}

function SsoConfigurationDialog({
    open,
    onOpenChange,
    endpoint,
    initialDomain,
    isReconfigure,
    onConfigured,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    endpoint: string;
    initialDomain: string;
    isReconfigure: boolean;
    onConfigured: () => Promise<void>;
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [method, setMethod] = useState<MetadataMethod>("url");
    const [domain, setDomain] = useState(initialDomain);
    const [metadataUrl, setMetadataUrl] = useState("");
    const [metadataXml, setMetadataXml] = useState("");
    const [fileName, setFileName] = useState<string | null>(null);

    const normalizedDomain = domain.trim().toLowerCase().replace(/^@/, "");
    const domainIsValid = DOMAIN_PATTERN.test(normalizedDomain);
    const metadataIsPresent = method === "url" ? metadataUrl.trim().length > 0 : metadataXml.trim().length > 0;

    const mutation = useMutation({
        mutationFn: () => requestJson<SsoConfiguration>(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                domain: normalizedDomain,
                ...(method === "url"
                    ? { metadata_url: metadataUrl.trim() }
                    : { metadata_xml: metadataXml.trim() }),
            }),
        }),
        onSuccess: async () => {
            toast.success(isReconfigure ? "SSO configuration updated." : "SSO configured.");
            onOpenChange(false);
            setMetadataUrl("");
            setMetadataXml("");
            setFileName(null);
            await onConfigured();
        },
        onError: (mutationError: Error) => {
            toast.error(mutationError.message || "Could not configure SSO.");
        },
    });

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        if (file.size > 250_000) {
            toast.error("Metadata XML must be smaller than 250 KB.");
            return;
        }
        const contents = await file.text();
        if (!contents.trim().startsWith("<")) {
            toast.error("Choose a valid XML metadata file.");
            return;
        }
        setMetadataXml(contents);
        setFileName(file.name);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="gap-0 overflow-hidden border-border/45 bg-background p-0 sm:max-w-[620px]">
                <DialogHeader className="border-b border-border/35 px-6 py-5 pr-12">
                    <DialogTitle className="text-base">
                        {isReconfigure ? "Reconfigure SSO" : "Configure SSO"}
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-xs leading-5">
                        Connect any SAML 2.0 identity provider using its metadata URL or XML document.
                    </DialogDescription>
                </DialogHeader>

                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        mutation.mutate();
                    }}
                >
                    <div className="space-y-6 px-6 py-5">
                        <div className="space-y-2">
                            <Label htmlFor="sso-domain" className="text-xs">SSO email domain</Label>
                            <Input
                                id="sso-domain"
                                value={domain}
                                onChange={(event) => setDomain(event.target.value)}
                                placeholder="company.com"
                                autoComplete="off"
                                className="h-8 font-mono text-xs"
                                disabled={mutation.isPending}
                            />
                            <p className="text-[11px] leading-5 text-muted-foreground">
                                The email domain used to route organization members to this identity provider—for example, company.com.
                            </p>
                            {domain.length > 0 && !domainIsValid && (
                                <p className="text-[11px] text-destructive">Enter a valid email domain.</p>
                            )}
                        </div>

                        <div className="space-y-3">
                            <div>
                                <p className="text-xs font-medium">Provider metadata</p>
                                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                    Cencori validates the metadata with the identity provider when you save.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-1 rounded-md border border-border/40 bg-muted/25 p-1">
                                <button
                                    type="button"
                                    onClick={() => setMethod("url")}
                                    className={`rounded px-3 py-2 text-xs font-medium transition-colors ${method === "url" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                                >
                                    Metadata URL
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMethod("xml")}
                                    className={`rounded px-3 py-2 text-xs font-medium transition-colors ${method === "xml" ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                                >
                                    XML metadata
                                </button>
                            </div>

                            {method === "url" ? (
                                <div className="space-y-2">
                                    <Label htmlFor="metadata-url" className="text-xs">Metadata URL</Label>
                                    <Input
                                        id="metadata-url"
                                        type="url"
                                        value={metadataUrl}
                                        onChange={(event) => setMetadataUrl(event.target.value)}
                                        placeholder="https://company.okta.com/app/.../metadata"
                                        className="h-8 font-mono text-xs"
                                        disabled={mutation.isPending}
                                    />
                                    <p className="text-[11px] text-muted-foreground">Recommended. Provider metadata remains centrally managed.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".xml,text/xml,application/xml"
                                        className="sr-only"
                                        onChange={(event) => void handleFile(event.target.files?.[0])}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex w-full items-center gap-3 rounded-md border border-dashed border-border/50 bg-muted/20 px-4 py-4 text-left transition-colors hover:border-border hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                    >
                                        <HugeiconsIcon icon={Upload03Icon} className="size-4 shrink-0 text-muted-foreground" />
                                        <span className="min-w-0">
                                            <span className="block truncate text-xs font-medium">{fileName || "Choose metadata XML"}</span>
                                            <span className="mt-1 block text-[11px] text-muted-foreground">XML document up to 250 KB</span>
                                        </span>
                                    </button>
                                    <Textarea
                                        value={metadataXml}
                                        onChange={(event) => {
                                            setMetadataXml(event.target.value);
                                            setFileName(null);
                                        }}
                                        placeholder="Or paste XML metadata here"
                                        className="min-h-28 resize-y font-mono text-[11px] leading-5"
                                        disabled={mutation.isPending}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter className="border-t border-border/35 bg-muted/15 px-6 py-4">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-3 text-xs"
                            onClick={() => onOpenChange(false)}
                            disabled={mutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            className="h-7 px-3 text-xs"
                            disabled={!domainIsValid || !metadataIsPresent || mutation.isPending}
                        >
                            {mutation.isPending ? "Validating…" : isReconfigure ? "Save configuration" : "Configure SSO"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function IdentityProviderPanel({ domain, isConfigured }: { domain: string | null; isConfigured: boolean }) {
    return (
        <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
            <PanelHeader
                icon={Building06Icon}
                title="Identity provider"
                description="Cencori connects through the SAML 2.0 standard rather than a vendor-specific integration."
            />
            <div className="grid border-t border-border/30 sm:grid-cols-2 sm:divide-x sm:divide-border/30">
                <DetailRow label="Provider type" value="Generic SAML 2.0" />
                <DetailRow label="SSO email domain" value={domain || "Configured during setup"} mono={isConfigured} />
            </div>
            <div className="border-t border-border/30">
                <p className="px-5 pb-2 pt-4 text-xs text-muted-foreground">Compatible providers</p>
                <div className="divide-y divide-border/25">
                    <ProviderRow
                        icon={<OktaMark />}
                        name="Okta"
                        protocol="SAML 2.0"
                    />
                    <ProviderRow
                        icon={<Microsoft.Color size={18} />}
                        name="Microsoft Entra ID"
                        protocol="SAML 2.0"
                    />
                    <ProviderRow
                        icon={<Google.Color size={18} />}
                        name="Google Workspace"
                        protocol="SAML 2.0"
                    />
                    <ProviderRow
                        icon={<OneLoginMark />}
                        name="OneLogin"
                        protocol="SAML 2.0"
                        iconClassName="border-transparent bg-[#1c1f2a] text-white"
                    />
                    <ProviderRow
                        icon={<HugeiconsIcon icon={Key02Icon} size={16} strokeWidth={1.7} />}
                        name="Any SAML 2.0 IdP"
                        protocol="Metadata URL or XML"
                    />
                </div>
            </div>
        </div>
    );
}

function ProviderRow({
    icon,
    name,
    protocol,
    iconClassName = "",
}: {
    icon: ReactNode;
    name: string;
    protocol: string;
    iconClassName?: string;
}) {
    return (
        <div className="flex min-h-12 items-center gap-3 px-5 py-2.5">
            <div
                className={`flex size-7 shrink-0 items-center justify-center rounded-md border border-border/30 bg-background/50 ${iconClassName}`}
                aria-hidden="true"
            >
                {icon}
            </div>
            <p className="min-w-0 flex-1 text-[13px] font-medium text-foreground/90">{name}</p>
            <p className="shrink-0 text-right font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {protocol}
            </p>
        </div>
    );
}

function OktaMark() {
    return (
        <span className="text-[10px] font-bold tracking-[-0.08em] text-[#007dc1]" aria-label="Okta">
            okta
        </span>
    );
}

function OneLoginMark() {
    return (
        <svg viewBox="0 0 222.6 222.6" className="size-[17px]" role="img" aria-label="OneLogin">
            <path
                fill="currentColor"
                d="M111.3 0C49.8 0 0 49.8 0 111.3s49.8 111.3 111.3 111.3 111.3-49.8 111.3-111.3S172.8 0 111.3 0Zm16.5 150.7c0 2.1-1.1 3.2-3.2 3.2h-20c-2.1 0-3.2-1.1-3.2-3.2v-48.2H86.2c-2.1 0-3.2-1.1-3.2-3.2v-20c0-2.1 1.1-3.2 3.2-3.2h39c2.1 0 2.6 1.1 2.6 2.6v72Z"
            />
        </svg>
    );
}

function AuthenticationPolicyPanel({
    orgSlug,
    configuration,
    isConfigured,
    canConfigure,
    onChanged,
}: {
    orgSlug: string;
    configuration: SsoConfiguration;
    isConfigured: boolean;
    canConfigure: boolean;
    onChanged: () => Promise<void>;
}) {
    const [confirmEnforcement, setConfirmEnforcement] = useState(false);
    const [mappingOpen, setMappingOpen] = useState(false);
    const [isLaunchingTest, setIsLaunchingTest] = useState(false);

    const enforcementMutation = useMutation({
        mutationFn: (enabled: boolean) => requestJson<{ sso_enforce: boolean }>(
            `/api/organizations/${orgSlug}/sso`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sso_enforce: enabled }),
            },
        ),
        onSuccess: async (result) => {
            toast.success(result.sso_enforce ? "SSO is now required." : "SSO requirement disabled.");
            setConfirmEnforcement(false);
            await onChanged();
        },
        onError: (mutationError: Error) => toast.error(mutationError.message || "Could not update enforcement."),
    });

    const launchTest = async () => {
        if (!configuration.sso_domain) return;
        const testWindow = window.open("about:blank", "_blank");
        if (!testWindow) {
            toast.error("Allow pop-ups to launch the SSO test.");
            return;
        }
        testWindow.opener = null;
        setIsLaunchingTest(true);
        try {
            const { data, error: ssoError } = await supabase.auth.signInWithSSO({
                domain: configuration.sso_domain,
                options: {
                    redirectTo: `${window.location.origin}/${orgSlug}/~/settings?section=advanced&sso_test=complete`,
                    skipBrowserRedirect: true,
                },
            });
            if (ssoError || !data?.url) {
                testWindow.close();
                throw ssoError || new Error("The identity provider did not return a test URL.");
            }
            testWindow.location.assign(data.url);
            toast.success("SSO test opened in a new tab.");
        } catch (testError) {
            testWindow.close();
            toast.error(testError instanceof Error ? testError.message : "Could not launch the SSO test.");
        } finally {
            setIsLaunchingTest(false);
        }
    };

    return (
        <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
            <PanelHeader
                icon={UserSettings01Icon}
                title="Authentication policy"
                description="Test the connection before requiring it across the organization."
            />

            <PolicyRow
                title="Test SSO"
                description="Open a provider login in a new tab without changing organization-wide enforcement."
                control={(
                    <Button
                        size="sm"
                        className="h-7 px-3 text-xs"
                        disabled={!isConfigured || isLaunchingTest}
                        onClick={() => void launchTest()}
                    >
                        {isLaunchingTest ? "Launching…" : "Launch test"}
                    </Button>
                )}
            />

            <PolicyRow
                title="Require SSO"
                description="Members using the configured SSO email domain must sign in through the identity provider."
                control={(
                    <Switch
                        checked={configuration.sso_enforce}
                        disabled={!isConfigured || enforcementMutation.isPending || (!canConfigure && !configuration.sso_enforce)}
                        onCheckedChange={(checked) => {
                            if (checked) setConfirmEnforcement(true);
                            else enforcementMutation.mutate(false);
                        }}
                        aria-label="Require SSO"
                    />
                )}
            />

            <Collapsible open={mappingOpen} onOpenChange={setMappingOpen}>
                <CollapsibleTrigger asChild>
                    <button className="flex w-full items-center justify-between gap-4 border-t border-border/30 px-5 py-4 text-left transition-colors hover:bg-background/15 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50">
                        <span>
                            <span className="block text-[13px] font-medium">Advanced mapping</span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">Default attributes resolved from SAML assertions.</span>
                        </span>
                        <ChevronDown className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${mappingOpen ? "rotate-180" : ""}`} />
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="grid border-t border-border/30 bg-background/15 sm:grid-cols-2">
                        <MappingValue label="Email" value="email" />
                        <MappingValue label="First name" value="givenName" />
                        <MappingValue label="Last name" value="surname" />
                        <MappingValue label="Groups" value="groups" />
                    </div>
                    <p className="border-t border-border/30 bg-background/15 px-5 py-3 text-[10px] leading-5 text-muted-foreground">
                        Custom attribute mapping is not exposed yet. Cencori currently uses the identity provider’s standard SAML attributes.
                    </p>
                </CollapsibleContent>
            </Collapsible>

            <PolicyRow
                title="Automatic user provisioning"
                description="Provision and deactivate members through SCIM."
                control={<span className="text-[10px] font-medium tracking-[0.08em] text-muted-foreground">COMING SOON</span>}
            />

            <PolicyRow
                title="Session controls"
                description="Organization-specific session duration and reauthentication policies."
                control={<span className="text-[11px] text-muted-foreground">Platform managed</span>}
            />

            <AlertDialog open={confirmEnforcement} onOpenChange={setConfirmEnforcement}>
                <AlertDialogContent className="border-border/45 bg-background">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-base">Require SSO for {configuration.sso_domain}?</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs leading-5">
                            Members whose email addresses use this domain will no longer be able to sign in with a password. Test the configuration first and confirm that an administrator can complete the SAML flow.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="h-8 text-xs" disabled={enforcementMutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="h-8 text-xs"
                            onClick={(event) => {
                                event.preventDefault();
                                enforcementMutation.mutate(true);
                            }}
                            disabled={enforcementMutation.isPending}
                        >
                            {enforcementMutation.isPending ? "Enabling…" : "Require SSO"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function ConfigurationHealthPanel({
    configuration,
    isConfigured,
}: {
    configuration: SsoConfiguration;
    isConfigured: boolean;
}) {
    return (
        <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
            <PanelHeader
                icon={CheckmarkCircle02Icon}
                title="Configuration health"
                description="Operational state of the organization’s identity connection."
            />
            <div className="grid border-t border-border/30 sm:grid-cols-3 sm:divide-x sm:divide-border/30">
                <DetailRow label="Metadata" value={isConfigured ? "Validated" : "Not configured"} />
                <DetailRow label="Enforcement" value={configuration.sso_enforce ? "Required" : "Optional"} />
                <DetailRow label="Last configured" value={formatTimestamp(configuration.sso_configured_at)} />
            </div>
            <div className="flex items-start gap-2 border-t border-border/30 px-5 py-3">
                <HugeiconsIcon icon={InformationCircleIcon} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <p className="text-[10px] leading-5 text-muted-foreground">
                    Login metrics and certificate-expiry reporting will appear here when provider telemetry is available. No synthetic security data is shown.
                </p>
            </div>
        </div>
    );
}

function AuditHistoryPanel({
    orgSlug,
    logs,
    isLoading,
}: {
    orgSlug: string;
    logs: SsoAuditEntry[];
    isLoading: boolean;
}) {
    return (
        <div className="overflow-hidden rounded-lg border border-border/35 bg-muted/30">
            <PanelHeader
                icon={Clock01Icon}
                title="SSO audit history"
                description="Configuration and enforcement changes recorded for this organization."
                action={(
                    <Button asChild size="sm" className="h-7 px-3 text-[11px]">
                        <Link href={`/${orgSlug}/~/audit-log?category=sso`}>View audit log</Link>
                    </Button>
                )}
            />

            <div className="border-t border-border/30">
                {isLoading ? (
                    <div className="space-y-3 px-5 py-4">
                        {[1, 2, 3].map((item) => <Skeleton key={item} className="h-8 w-full" />)}
                    </div>
                ) : logs.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                        <p className="text-[13px] font-medium">No SSO events yet</p>
                        <p className="mt-1 text-xs text-muted-foreground">Configuration changes will appear here.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border/30">
                        {logs.map((log) => (
                            <div key={log.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                                <div className="min-w-0">
                                    <p className="truncate text-xs text-foreground">{log.description}</p>
                                    <p className="mt-1 truncate text-[10px] text-muted-foreground">
                                        {log.actor_email || "System"}
                                    </p>
                                </div>
                                <time dateTime={log.created_at} className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                                    {formatRelativeTime(log.created_at)}
                                </time>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function RemoveSsoPanel({
    orgName,
    endpoint,
    onRemoved,
}: {
    orgName: string;
    endpoint: string;
    onRemoved: () => Promise<void>;
}) {
    const [open, setOpen] = useState(false);
    const mutation = useMutation({
        mutationFn: () => requestJson<{ sso_enabled: boolean }>(endpoint, { method: "DELETE" }),
        onSuccess: async () => {
            toast.success("SSO configuration removed.");
            setOpen(false);
            await onRemoved();
        },
        onError: (mutationError: Error) => toast.error(mutationError.message || "Could not remove SSO."),
    });

    return (
        <div className="overflow-hidden rounded-lg border border-destructive/20 bg-destructive/[0.025]">
            <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-[13px] font-medium">Remove SSO configuration</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Password authentication will become available again for members of {orgName}.
                    </p>
                </div>
                <Button variant="destructive" size="sm" className="h-7 self-start px-3 text-xs" onClick={() => setOpen(true)}>
                    Remove configuration
                </Button>
            </div>

            <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogContent className="border-border/45 bg-background">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-base">Remove SSO from {orgName}?</AlertDialogTitle>
                        <AlertDialogDescription className="text-xs leading-5">
                            This deletes the connected SAML provider and disables SSO enforcement. Members will be able to authenticate with passwords again.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="h-8 text-xs" disabled={mutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="h-8 bg-destructive text-xs text-white hover:bg-destructive/90"
                            onClick={(event) => {
                                event.preventDefault();
                                mutation.mutate();
                            }}
                            disabled={mutation.isPending}
                        >
                            {mutation.isPending ? "Removing…" : "Remove SSO"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function PanelHeader({
    icon,
    title,
    description,
    action,
}: {
    icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
    title: string;
    description: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex items-start justify-between gap-4 px-5 py-4">
            <div className="flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-border/35 bg-background/25">
                    <HugeiconsIcon icon={icon} className="size-3.5" />
                </div>
                <div>
                    <h3 className="text-[13px] font-medium">{title}</h3>
                    <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{description}</p>
                </div>
            </div>
            {action}
        </div>
    );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="px-5 py-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1.5 truncate text-[13px] font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
        </div>
    );
}

function PolicyRow({
    title,
    description,
    control,
}: {
    title: string;
    description: string;
    control: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-3 border-t border-border/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
                <p className="text-[13px] font-medium">{title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
            <div className="shrink-0">{control}</div>
        </div>
    );
}

function MappingValue({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between border-b border-border/30 px-5 py-3.5 odd:sm:border-r">
            <span className="text-xs text-muted-foreground">{label}</span>
            <code className="text-[13px] text-foreground">{value}</code>
        </div>
    );
}

function SsoSettingsSkeleton() {
    return (
        <div className="space-y-4">
            {[180, 150, 280, 140].map((height, index) => (
                <div key={index} className="rounded-lg border border-border/35 bg-muted/20 p-5">
                    <div className="flex items-start gap-3">
                        <Skeleton className="size-8 rounded-[9px]" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-3 w-32" />
                            <Skeleton className="h-2.5 w-3/5" />
                        </div>
                    </div>
                    <Skeleton className="mt-5 w-full" style={{ height }} />
                </div>
            ))}
        </div>
    );
}
