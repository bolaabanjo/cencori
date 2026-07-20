'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { Save, Plus, X, Shield, Eye, Ban, Siren, Fingerprint } from 'lucide-react';

interface SecuritySettingsProps {
    projectId: string;
}

interface Settings {
    filter_harmful_content: boolean;
    filter_pii: boolean;
    filter_nsfw: boolean;
    filter_jailbreaks: boolean;
    filter_prompt_injection: boolean;
    safety_threshold: number;
    ip_allowlist: string[] | null;
    audit_logging_enabled: boolean;
    alert_webhook_url: string | null;
    alert_on_critical: boolean;
    alert_on_high: boolean;
    alert_on_medium: boolean;
    alert_on_low: boolean;
}

function useSecuritySettings(projectId: string) {
    return useQuery({
        queryKey: ['securitySettings', projectId],
        queryFn: async () => {
            const response = await fetch(`/api/projects/${projectId}/security/settings`);
            if (!response.ok) throw new Error('Failed to fetch settings');
            const data = await response.json();
            return data.settings as Settings;
        },
        staleTime: 60 * 1000,
    });
}

function useSaveSettings(projectId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (settings: Partial<Settings>) => {
            const response = await fetch(`/api/projects/${projectId}/security/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save settings');
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['securitySettings', projectId] });
            toast.success('Settings saved');
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });
}

export function SecuritySettings({ projectId }: SecuritySettingsProps) {
    const { data: settings, isLoading } = useSecuritySettings(projectId);
    const { mutate: saveSettings, isPending: isSaving } = useSaveSettings(projectId);
    const [localSettings, setLocalSettings] = useState<Partial<Settings>>({});
    const [newIp, setNewIp] = useState('');

    // Merge local changes with fetched settings
    const currentSettings = { ...settings, ...localSettings };

    const handleChange = <K extends keyof Settings>(key: K, value: Settings[K]) => {
        setLocalSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = () => {
        saveSettings(localSettings);
        setLocalSettings({});
    };

    const handleAddIp = () => {
        if (!newIp.trim()) return;
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
        if (!ipRegex.test(newIp)) {
            toast.error('Invalid IP format (use x.x.x.x or x.x.x.x/24)');
            return;
        }
        const currentList = currentSettings.ip_allowlist || [];
        if (currentList.includes(newIp)) {
            toast.error('IP already in list');
            return;
        }
        handleChange('ip_allowlist', [...currentList, newIp]);
        setNewIp('');
    };

    const handleRemoveIp = (ip: string) => {
        const currentList = currentSettings.ip_allowlist || [];
        handleChange('ip_allowlist', currentList.filter(i => i !== ip));
    };

    const hasChanges = Object.keys(localSettings).length > 0;

    if (isLoading) {
        return (
            <div className="space-y-6">
                {[1, 2, 3].map(i => (
                    <div key={i} className="rounded-lg border border-border/40 bg-card p-4">
                        <Skeleton className="h-4 w-32 mb-3" />
                        <div className="space-y-3">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (!settings) return null;

    return (
        <div className="space-y-6">
            {/* Content Filtering */}
            <div className="rounded-lg border border-border/40 bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/40 bg-secondary/20">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium">Content Filtering</h3>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                        Enable or disable content filtering categories
                    </p>
                </div>
                <div className="p-4 space-y-3">
                    {[
                        { key: 'filter_harmful_content', label: 'Harmful Content', desc: 'Block violent, dangerous, or illegal content', icon: Ban },
                        { key: 'filter_pii', label: 'PII Detection', desc: 'Detect and redact personal identifiable information', icon: Fingerprint },
                        { key: 'filter_nsfw', label: 'NSFW Content', desc: 'Block adult or explicit content', icon: Eye },
                        { key: 'filter_jailbreaks', label: 'Jailbreak Attempts', desc: 'Detect attempts to bypass safety guidelines', icon: Siren },
                        { key: 'filter_prompt_injection', label: 'Prompt Injection', desc: 'Detect malicious prompt manipulation', icon: Siren },
                    ].map(({ key, label, desc, icon: Icon }) => (
                        <div key={key} className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-3">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                                <div>
                                    <p className="text-xs font-medium">{label}</p>
                                    <p className="text-[10px] text-muted-foreground">{desc}</p>
                                </div>
                            </div>
                            <Switch
                                checked={currentSettings[key as keyof Settings] as boolean}
                                onCheckedChange={(checked) => handleChange(key as keyof Settings, checked)}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Safety Threshold */}
            <div className="rounded-lg border border-border/40 bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/40 bg-secondary/20">
                    <h3 className="text-sm font-medium">Safety Threshold</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                        Adjust content safety sensitivity (higher = stricter)
                    </p>
                </div>
                <div className="p-4">
                    <div className="flex items-center gap-4">
                        <span className="text-[10px] text-muted-foreground w-10">Lenient</span>
                        <Slider
                            value={(currentSettings.safety_threshold ?? 0.7) * 100}
                            onChange={(value) => handleChange('safety_threshold', value / 100)}
                            min={0}
                            max={100}
                            step={5}
                            className="flex-1"
                        />
                        <span className="text-[10px] text-muted-foreground w-8">Strict</span>
                    </div>
                </div>
            </div>

            {/* IP Allowlist */}
            <div className="rounded-lg border border-border/40 bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/40 bg-secondary/20">
                    <h3 className="text-sm font-medium">IP Allowlist</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                        Restrict API access to specific IP addresses (leave empty to allow all)
                    </p>
                </div>
                <div className="p-4">
                    <div className="flex gap-2 mb-3">
                        <Input
                            placeholder="192.168.1.0/24"
                            value={newIp}
                            onChange={(e) => setNewIp(e.target.value)}
                            className="h-8 text-xs flex-1"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddIp()}
                        />
                        <Button size="sm" variant="outline" className="h-8" onClick={handleAddIp}>
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                        </Button>
                    </div>
                    {currentSettings.ip_allowlist && currentSettings.ip_allowlist.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {currentSettings.ip_allowlist.map((ip) => (
                                <Badge key={ip} variant="secondary" className="text-xs font-mono gap-1 pr-1">
                                    {ip}
                                    <button
                                        onClick={() => handleRemoveIp(ip)}
                                        className="hover:text-red-500 transition-colors"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground">All IPs allowed</p>
                    )}
                </div>
            </div>

            {/* Audit Logging */}
            <div className="rounded-lg border border-border/40 bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/40 bg-secondary/20">
                    <h3 className="text-sm font-medium">Audit Logging</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                        Log all security-related events for compliance
                    </p>
                </div>
                <div className="p-4">
                    <div className="flex items-center justify-between">
                        <p className="text-xs">Enable audit logging</p>
                        <Switch
                            checked={currentSettings.audit_logging_enabled ?? true}
                            onCheckedChange={(checked) => handleChange('audit_logging_enabled', checked)}
                        />
                    </div>
                </div>
            </div>

            {/* Alert Configuration */}
            <div className="rounded-lg border border-border/40 bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/40 bg-secondary/20">
                    <h3 className="text-sm font-medium">Security Alerts</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                        Configure webhook notifications for security events
                    </p>
                </div>
                <div className="p-4 space-y-4">
                    <div>
                        <label className="text-xs font-medium mb-1.5 block">Webhook URL</label>
                        <Input
                            placeholder="https://your-server.com/webhook"
                            value={currentSettings.alert_webhook_url || ''}
                            onChange={(e) => handleChange('alert_webhook_url', e.target.value || null)}
                            className="h-8 text-xs"
                        />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-medium">Alert on severity levels:</p>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { key: 'alert_on_critical', label: 'Critical', color: 'text-red-500' },
                                { key: 'alert_on_high', label: 'High', color: 'text-amber-500' },
                                { key: 'alert_on_medium', label: 'Medium', color: 'text-yellow-500' },
                                { key: 'alert_on_low', label: 'Low', color: 'text-gray-400' },
                            ].map(({ key, label, color }) => (
                                <div key={key} className="flex items-center justify-between p-2 rounded bg-secondary/30">
                                    <span className={`text-xs ${color}`}>{label}</span>
                                    <Switch
                                        checked={currentSettings[key as keyof Settings] as boolean}
                                        onCheckedChange={(checked) => handleChange(key as keyof Settings, checked)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            {hasChanges && (
                <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={isSaving} className="h-8 text-xs">
                        <Save className="h-3 w-3 mr-1" />
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            )}
        </div>
    );
}
