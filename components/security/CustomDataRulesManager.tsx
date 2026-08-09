"use client";

/**
 * Custom Data Rules Manager Component
 * 
 * Allows users to define custom sensitive data patterns and actions
 * for their specific use case (farm data, client info, etc.)
 */

import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    PlusIcon, TrashIcon, PencilIcon,
    Bars3BottomLeftIcon, CodeBracketIcon, CommandLineIcon, CpuChipIcon,
    ShieldCheckIcon, EyeSlashIcon, NoSymbolIcon, ArrowPathRoundedSquareIcon,
    DocumentTextIcon, ChevronDownIcon, UserGroupIcon, HeartIcon,
    CurrencyDollarIcon, ScaleIcon, GlobeAltIcon
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

type MatchType = 'keywords' | 'regex' | 'json_path' | 'ai_detect';
type ActionType = 'mask' | 'redact' | 'block' | 'tokenize';

interface CustomDataRule {
    id: string;
    name: string;
    description?: string;
    match_type: MatchType;
    pattern: string;
    case_sensitive: boolean;
    action: ActionType;
    is_active: boolean;
    priority: number;
    created_at: string;
}

interface FormData {
    name: string;
    description: string;
    match_type: MatchType;
    pattern: string;
    case_sensitive: boolean;
    action: ActionType;
    priority: number;
}

interface CustomDataRulesManagerProps {
    projectId: string;
}

const MATCH_TYPE_INFO = {
    keywords: {
        icon: Bars3BottomLeftIcon,
        label: 'Keywords',
        description: 'Comma-separated keywords to match',
        placeholder: 'eggs, mortality, crop yield, revenue',
    },
    regex: {
        icon: CodeBracketIcon,
        label: 'Regex',
        description: 'Regular expression pattern',
        placeholder: '\\d+\\s*eggs?|\\$[\\d,]+',
    },
    json_path: {
        icon: CommandLineIcon,
        label: 'JSON Path',
        description: 'Paths to sensitive JSON fields',
        placeholder: '$.user.email, $.payment.card',
    },
    ai_detect: {
        icon: CpuChipIcon,
        label: 'AI Detect',
        description: 'Describe what to detect in plain English',
        placeholder: 'Farm production numbers like egg counts, mortality rates, and crop yields',
    },
};

const ACTION_INFO = {
    tokenize: {
        icon: ArrowPathRoundedSquareIcon,
        label: 'Tokenize',
        description: 'Replace with placeholders, restore in response',
        color: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
    },
    mask: {
        icon: EyeSlashIcon,
        label: 'Mask',
        description: 'Replace with ****',
        color: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    },
    redact: {
        icon: ShieldCheckIcon,
        label: 'Redact',
        description: 'Replace with [REDACTED]',
        color: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
    },
    block: {
        icon: NoSymbolIcon,
        label: 'Block',
        description: 'Block entire request',
        color: 'bg-red-500/20 text-red-700 dark:text-red-400',
    },
};

// Pre-built rule templates for different industries
interface RuleTemplate {
    name: string;
    description: string;
    match_type: MatchType;
    pattern: string;
    case_sensitive: boolean;
    action: ActionType;
    priority: number;
}

interface TemplateCategory {
    name: string;
    icon: typeof ShieldCheckIcon;
    color: string;
    templates: RuleTemplate[];
}

const RULE_TEMPLATES: TemplateCategory[] = [
    {
        name: 'General PII',
        icon: UserGroupIcon,
        color: 'text-blue-500',
        templates: [
            {
                name: 'Email Addresses',
                description: 'Detect and mask email addresses',
                match_type: 'regex',
                pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
                case_sensitive: false,
                action: 'mask',
                priority: 10,
            },
            {
                name: 'Phone Numbers',
                description: 'Detect phone numbers in various formats',
                match_type: 'regex',
                pattern: '(\\+\\d{1,3}[.-\\s]?)?(\\(?\\d{2,3}\\)?[.-\\s]?)?\\d{3,4}[.-\\s]?\\d{4}',
                case_sensitive: false,
                action: 'mask',
                priority: 10,
            },
            {
                name: 'Social Security Numbers',
                description: 'Block requests containing SSN patterns',
                match_type: 'regex',
                pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
                case_sensitive: false,
                action: 'block',
                priority: 20,
            },
        ],
    },
    {
        name: 'Healthcare (HIPAA)',
        icon: HeartIcon,
        color: 'text-red-500',
        templates: [
            {
                name: 'Medical Record Numbers',
                description: 'Detect MRN patterns',
                match_type: 'regex',
                pattern: 'MRN[:\\s]?\\d{6,10}|\\bMR\\d{7,}\\b',
                case_sensitive: false,
                action: 'redact',
                priority: 15,
            },
            {
                name: 'Patient Health Info',
                description: 'AI detection for diagnoses, medications, symptoms',
                match_type: 'ai_detect',
                pattern: 'Patient health information including diagnoses, medications, symptoms, treatment plans, and medical conditions',
                case_sensitive: false,
                action: 'mask',
                priority: 10,
            },
            {
                name: 'Insurance IDs',
                description: 'Health insurance member IDs',
                match_type: 'regex',
                pattern: '\\b[A-Z]{3}\\d{9}\\b|\\bMEMBER[:\\s]?\\d{8,}\\b',
                case_sensitive: false,
                action: 'mask',
                priority: 10,
            },
        ],
    },
    {
        name: 'Finance (PCI)',
        icon: CurrencyDollarIcon,
        color: 'text-green-500',
        templates: [
            {
                name: 'Credit Card Numbers',
                description: 'Block credit card number patterns',
                match_type: 'regex',
                pattern: '\\b(?:4[0-9]{3}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}|5[1-5][0-9]{2}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}|3[47][0-9]{2}[- ]?[0-9]{6}[- ]?[0-9]{5}|6(?:011|5[0-9]{2})[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4})\\b',
                case_sensitive: false,
                action: 'block',
                priority: 20,
            },
            {
                name: 'Bank Account Numbers',
                description: 'Mask bank account and routing numbers',
                match_type: 'regex',
                pattern: '\\b(account|acct|a\\/c)[:\\s#]*\\d{8,17}\\b|\\b(routing|aba)[:\\s#]*\\d{9}\\b|\\baccount\\s+(is|number|#|:)\\s*\\d{8,17}\\b',
                case_sensitive: false,
                action: 'mask',
                priority: 15,
            },
            {
                name: 'Financial Amounts',
                description: 'AI detection for sensitive financial data',
                match_type: 'ai_detect',
                pattern: 'Sensitive financial information like account balances, transaction amounts over $10,000, salary information, or investment portfolio values',
                case_sensitive: false,
                action: 'mask',
                priority: 5,
            },
        ],
    },
    {
        name: 'Agriculture',
        icon: GlobeAltIcon,
        color: 'text-amber-500',
        templates: [
            {
                name: 'Production Metrics',
                description: 'Farm production data like yields and counts',
                match_type: 'keywords',
                pattern: 'eggs, mortality rate, crop yield, harvest, bushels, head count, livestock count',
                case_sensitive: false,
                action: 'mask',
                priority: 10,
            },
            {
                name: 'Farm Financials',
                description: 'AI detection for farm financial data',
                match_type: 'ai_detect',
                pattern: 'Farm financial metrics including revenue per acre, cost per head, profit margins, and operational expenses',
                case_sensitive: false,
                action: 'mask',
                priority: 10,
            },
            {
                name: 'Location Data',
                description: 'Farm locations and GPS coordinates',
                match_type: 'regex',
                pattern: '-?\\d{1,3}\\.\\d{2,},?\\s*-?\\d{1,3}\\.\\d{2,}|\\b(farm|field|plot|location)\\b.*\\b(coordinates?|gps|lat|lon|address)\\b',
                case_sensitive: false,
                action: 'redact',
                priority: 15,
            },
        ],
    },
    {
        name: 'Legal',
        icon: ScaleIcon,
        color: 'text-purple-500',
        templates: [
            {
                name: 'Case Numbers',
                description: 'Court case and docket numbers',
                match_type: 'regex',
                pattern: '\\b(case|docket)[:\\s#]?\\d{2,4}[-/]?[A-Z]{0,3}[-/]?\\d{4,8}\\b',
                case_sensitive: false,
                action: 'redact',
                priority: 10,
            },
            {
                name: 'Attorney-Client Privilege',
                description: 'AI detection for privileged communications',
                match_type: 'ai_detect',
                pattern: 'Attorney-client privileged information, legal advice, litigation strategy, or confidential legal communications',
                case_sensitive: false,
                action: 'block',
                priority: 20,
            },
            {
                name: 'Contract Terms',
                description: 'Sensitive contract clauses and terms',
                match_type: 'keywords',
                pattern: 'confidential, proprietary, trade secret, non-disclosure, indemnification, termination clause',
                case_sensitive: false,
                action: 'mask',
                priority: 5,
            },
        ],
    },
];

export function CustomDataRulesManager({ projectId }: CustomDataRulesManagerProps) {
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<CustomDataRule | null>(null);
    const [formError, setFormError] = useState<string | null>(null);

    const [formData, setFormData] = useState<FormData>({
        name: '',
        description: '',
        match_type: 'keywords',
        pattern: '',
        case_sensitive: false,
        action: 'mask',
        priority: 0,
    });

    // Fetch rules
    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: ['customRules', projectId],
        queryFn: async () => {
            const res = await fetch(`/api/projects/${projectId}/custom-rules`);
            if (!res.ok) throw new Error('Failed to fetch rules');
            return res.json() as Promise<{ rules: CustomDataRule[] }>;
        },
    });

    // Create rule
    const createMutation = useMutation({
        mutationFn: async (data: typeof formData) => {
            const res = await fetch(`/api/projects/${projectId}/custom-rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to create rule');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['customRules', projectId] });
            toast.success('Rule created');
            resetForm();
        },
        onError: (error: Error) => {
            setFormError(error.message);
        },
    });

    // Update rule
    const updateMutation = useMutation({
        mutationFn: async ({ ruleId, data }: { ruleId: string; data: Partial<typeof formData> }) => {
            const res = await fetch(`/api/projects/${projectId}/custom-rules/${ruleId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to update rule');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['customRules', projectId] });
            toast.success('Rule updated');
            resetForm();
        },
        onError: (error: Error) => {
            setFormError(error.message);
        },
    });

    // Delete rule
    const deleteMutation = useMutation({
        mutationFn: async (ruleId: string) => {
            const res = await fetch(`/api/projects/${projectId}/custom-rules/${ruleId}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to delete rule');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['customRules', projectId] });
            toast.success('Rule deleted');
        },
        onError: () => {
            toast.error('Failed to delete rule');
        },
    });

    // Toggle active status
    const toggleMutation = useMutation({
        mutationFn: async ({ ruleId, is_active }: { ruleId: string; is_active: boolean }) => {
            const res = await fetch(`/api/projects/${projectId}/custom-rules/${ruleId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active }),
            });
            if (!res.ok) throw new Error('Failed to toggle rule');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['customRules', projectId] });
        },
        onError: () => {
            toast.error('Failed to toggle rule');
        },
    });

    const resetForm = () => {
        setIsDialogOpen(false);
        setEditingRule(null);
        setFormError(null);
        setFormData({
            name: '',
            description: '',
            match_type: 'keywords',
            pattern: '',
            case_sensitive: false,
            action: 'mask',
            priority: 0,
        });
    };

    const handleEdit = (rule: CustomDataRule) => {
        setEditingRule(rule);
        setFormError(null);
        setFormData({
            name: rule.name,
            description: rule.description || '',
            match_type: rule.match_type,
            pattern: rule.pattern,
            case_sensitive: rule.case_sensitive,
            action: rule.action,
            priority: rule.priority,
        });
        setIsDialogOpen(true);
    };

    const handleSubmit = () => {
        setFormError(null);

        if (!formData.name.trim()) {
            setFormError('Enter a name for this rule.');
            return;
        }

        if (!formData.pattern.trim()) {
            setFormError('Define what this rule should detect.');
            return;
        }

        if (editingRule) {
            updateMutation.mutate({ ruleId: editingRule.id, data: formData });
        } else {
            createMutation.mutate(formData);
        }
    };

    const handleApplyTemplate = (template: RuleTemplate) => {
        setEditingRule(null);
        setFormError(null);
        setFormData({
            name: template.name,
            description: template.description,
            match_type: template.match_type,
            pattern: template.pattern,
            case_sensitive: template.case_sensitive,
            action: template.action,
            priority: template.priority,
        });
        setIsDialogOpen(true);
        toast.success(`Template "${template.name}" loaded. Review and save to create the rule.`);
    };

    const matchTypeInfo = MATCH_TYPE_INFO[formData.match_type];
    const rules = data?.rules || [];
    const activeRules = rules.filter((rule) => rule.is_active).length;
    const aiRules = rules.filter((rule) => rule.match_type === 'ai_detect').length;
    const deterministicRules = rules.length - aiRules;

    if (isLoading) {
        return (
            <div className="space-y-3">
                <div className="flex items-end justify-between gap-6">
                    <div>
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
                    </div>
                    <Skeleton className="h-8 w-28" />
                </div>
                <div className="overflow-hidden rounded-lg border border-border/25 bg-[#f3f3f1] dark:bg-[#111111]">
                    <div className="grid grid-cols-2 border-b border-border/25 sm:grid-cols-4">
                        {[1, 2, 3, 4].map((item) => (
                            <div key={item} className="border-b border-border/20 px-5 py-5 even:border-l sm:border-b-0 sm:border-l sm:first:border-l-0">
                                <Skeleton className="h-3 w-20" />
                                <Skeleton className="mt-3 h-6 w-10" />
                            </div>
                        ))}
                    </div>
                    <div className="px-6 py-14 sm:px-7">
                        <Skeleton className="h-5 w-52" />
                        <Skeleton className="mt-3 h-3 w-96 max-w-full" />
                        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-sm font-medium tracking-[-0.01em]">Protection rules</h2>
                    <p className="mt-1 max-w-[60ch] text-[11px] leading-4 text-muted-foreground">
                        Detect domain-specific sensitive data and decide how Cencori handles each match.
                    </p>
                </div>
                {rules.length > 0 && (
                    <div className="flex items-center gap-2">
                        <RuleTemplateMenu onSelect={handleApplyTemplate}>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5 border-border/30 bg-transparent text-xs shadow-none active:translate-y-px"
                            >
                                Browse templates
                                <ChevronDownIcon className="h-3 w-3 opacity-50" />
                            </Button>
                        </RuleTemplateMenu>
                        <Button
                            size="sm"
                            className="h-8 gap-1.5 text-xs shadow-none active:translate-y-px"
                            onClick={() => setIsDialogOpen(true)}
                        >
                            <PlusIcon className="h-3.5 w-3.5" />
                            Create rule
                        </Button>
                    </div>
                )}
            </header>

            <section className="overflow-hidden rounded-lg border border-border/25 bg-[#f3f3f1] dark:bg-[#111111]">
                <dl className="grid grid-cols-2 border-b border-border/25 sm:grid-cols-4">
                    <RuleMetric label="Total rules" value={rules.length} />
                    <RuleMetric label="Active" value={activeRules} />
                    <RuleMetric label="Pattern matchers" value={deterministicRules} />
                    <RuleMetric label="AI classifiers" value={aiRules} />
                </dl>

                {isError ? (
                    <div className="flex min-h-72 flex-col items-center justify-center px-7 py-14 text-center">
                        <span className="mb-5 h-px w-10 bg-red-500/70" />
                        <p className="text-sm font-medium">Rules are unavailable</p>
                        <p className="mt-1 max-w-sm text-[11px] leading-5 text-muted-foreground">
                            {error instanceof Error ? error.message : 'We could not load this project’s rules.'}
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-5 h-8 gap-2 border-border/30 bg-transparent text-xs shadow-none"
                            onClick={() => void refetch()}
                        >
                            <ArrowPathRoundedSquareIcon className="size-3.5" />
                            Try again
                        </Button>
                    </div>
                ) : rules.length === 0 ? (
                    <div className="grid sm:grid-cols-2">
                        <article className="flex min-h-64 flex-col justify-between border-b border-border/25 px-6 py-7 sm:border-b-0 sm:border-r sm:px-7 sm:py-8">
                            <div>
                                <span className="mb-6 block h-px w-10 bg-emerald-500/70" />
                                <p className="text-[10px] font-medium text-muted-foreground">Start from scratch</p>
                                <h3 className="mt-2 text-lg font-medium tracking-[-0.025em]">Create a protection rule</h3>
                                <p className="mt-2 max-w-sm text-[11px] leading-5 text-muted-foreground">
                                    Define the exact data to detect, then mask, redact, tokenize, or block every match.
                                </p>
                            </div>
                            <Button
                                size="sm"
                                className="mt-7 h-9 w-fit gap-1.5 text-xs shadow-none active:translate-y-px"
                                onClick={() => setIsDialogOpen(true)}
                            >
                                <PlusIcon className="size-3.5" />
                                Create first rule
                            </Button>
                        </article>

                        <article className="flex min-h-64 flex-col justify-between px-6 py-7 sm:px-7 sm:py-8">
                            <div>
                                <span className="mb-6 block h-px w-10 bg-foreground/35" />
                                <p className="text-[10px] font-medium text-muted-foreground">Start from policy</p>
                                <h3 className="mt-2 text-lg font-medium tracking-[-0.025em]">Use a vetted template</h3>
                                <p className="mt-2 max-w-sm text-[11px] leading-5 text-muted-foreground">
                                    Begin with common PII, healthcare, finance, agriculture, or legal protections and adapt them.
                                </p>
                            </div>
                            <RuleTemplateMenu onSelect={handleApplyTemplate}>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="mt-7 h-9 w-fit gap-1.5 border-border/30 bg-transparent text-xs shadow-none active:translate-y-px"
                                >
                                    <DocumentTextIcon className="size-3.5" />
                                    Browse templates
                                </Button>
                            </RuleTemplateMenu>
                        </article>
                    </div>
                ) : (
                    <div className="divide-y divide-border/20">
                    {rules.map((rule) => {
                        const ActionInfo = ACTION_INFO[rule.action];

                        return (
                            <article
                                key={rule.id}
                                className={`grid gap-5 px-5 py-5 transition-colors hover:bg-muted/45 sm:px-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)_auto] lg:items-center ${rule.is_active ? '' : 'opacity-55'}`}
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={`size-1.5 shrink-0 rounded-full ${rule.is_active ? 'bg-emerald-500' : 'bg-foreground/25'}`} />
                                        <h3 className="truncate text-sm font-medium">{rule.name}</h3>
                                    </div>
                                    {rule.description && <p className="mt-1 truncate text-[11px] text-muted-foreground">{rule.description}</p>}
                                    <code className="mt-3 block truncate rounded-[3px] bg-background/35 px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">
                                        {rule.pattern}
                                    </code>
                                </div>

                                <dl className="grid grid-cols-3 gap-4">
                                    <RuleMeta label="Match" value={MATCH_TYPE_INFO[rule.match_type].label} />
                                    <RuleMeta label="Action" value={ActionInfo.label} />
                                    <RuleMeta label="Priority" value={String(rule.priority)} mono />
                                </dl>

                                <div className="flex items-center justify-end gap-1.5">
                                    <Switch
                                        checked={rule.is_active}
                                        aria-label={`${rule.is_active ? 'Disable' : 'Enable'} ${rule.name}`}
                                        onCheckedChange={(checked) => toggleMutation.mutate({ ruleId: rule.id, is_active: checked })}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Edit ${rule.name}`}
                                        className="size-8"
                                        onClick={() => handleEdit(rule)}
                                    >
                                        <PencilIcon className="size-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Delete ${rule.name}`}
                                        className="size-8 text-muted-foreground hover:text-destructive"
                                        onClick={() => deleteMutation.mutate(rule.id)}
                                    >
                                        <TrashIcon className="size-3.5" />
                                    </Button>
                                </div>
                            </article>
                        );
                    })}
                    </div>
                )}

                <footer className="flex flex-col gap-4 border-t border-border/25 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                    <div>
                        <h3 className="text-xs font-medium">Context-aware matching</h3>
                        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                            AI Detect rules classify meaning and context when keywords or patterns are not enough.
                        </p>
                    </div>
                    <span className="w-fit rounded-[3px] border border-border/25 bg-background/30 px-2 py-1 font-mono text-[9px] tracking-[0.12em] text-muted-foreground">
                        AI DETECT
                    </span>
                </footer>
            </section>

            {/* Create/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={(open) => !open && resetForm()}>
                <DialogContent className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden border-border/25 bg-[#f3f3f1] p-0 shadow-none dark:bg-[#111111] sm:max-w-2xl">
                    <DialogHeader className="border-b border-border/25 px-6 pb-6 pt-6 pr-14 text-left sm:px-7 sm:pr-14">
                        <DialogTitle className="text-base font-medium tracking-[-0.02em]">
                            {editingRule ? 'Edit protection rule' : 'Create protection rule'}
                        </DialogTitle>
                        <DialogDescription className="max-w-lg text-xs leading-5">
                            Define what Cencori should detect and how it should handle each match.
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            handleSubmit();
                        }}
                    >
                        <div className="max-h-[65vh] overflow-y-auto">
                            <section className="border-b border-border/25 px-6 py-6 sm:px-7">
                                <div className="mb-5">
                                    <h3 className="text-xs font-medium">Rule identity</h3>
                                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                                        Give operators a clear name and a short explanation of what this rule protects.
                                    </p>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="name" className="text-[11px]">Name</Label>
                                        <Input
                                            id="name"
                                            placeholder="Farm production data"
                                            value={formData.name}
                                            aria-invalid={Boolean(formError && !formData.name.trim())}
                                            onChange={(e) => {
                                                setFormError(null);
                                                setFormData(prev => ({ ...prev, name: e.target.value }));
                                            }}
                                            className="h-9 border-border/25 bg-background/35 text-sm shadow-none focus-visible:ring-1"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="description" className="text-[11px]">Description <span className="text-muted-foreground">· optional</span></Label>
                                        <Input
                                            id="description"
                                            placeholder="Protects internal production metrics"
                                            value={formData.description}
                                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                            className="h-9 border-border/25 bg-background/35 text-sm shadow-none focus-visible:ring-1"
                                        />
                                    </div>
                                </div>
                            </section>

                            <section className="border-b border-border/25 px-6 py-6 sm:px-7">
                                <div className="mb-5">
                                    <h3 className="text-xs font-medium">Detection logic</h3>
                                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                                        Choose how Cencori identifies a match, then define the content it should look for.
                                    </p>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-[11px]">Match type</Label>
                                        <Select
                                            value={formData.match_type}
                                            onValueChange={(value) => {
                                                setFormError(null);
                                                setFormData(prev => ({ ...prev, match_type: value as MatchType, pattern: '' }));
                                            }}
                                        >
                                            <SelectTrigger className="h-9 border-border/25 bg-background/35 text-sm shadow-none focus:ring-1">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(MATCH_TYPE_INFO).map(([key, info]) => (
                                                    <SelectItem key={key} value={key} className="text-sm">
                                                        <div className="flex items-center gap-2">
                                                            <info.icon className="size-4" />
                                                            <span>{info.label}</span>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[10px] leading-4 text-muted-foreground">{matchTypeInfo.description}</p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="pattern" className="text-[11px]">
                                            {formData.match_type === 'ai_detect' ? 'Detection instruction' : 'Pattern'}
                                        </Label>
                                        <Textarea
                                            id="pattern"
                                            placeholder={matchTypeInfo.placeholder}
                                            value={formData.pattern}
                                            aria-invalid={Boolean(formError && !formData.pattern.trim())}
                                            onChange={(e) => {
                                                setFormError(null);
                                                setFormData(prev => ({ ...prev, pattern: e.target.value }));
                                            }}
                                            className="min-h-24 resize-y border-border/25 bg-background/35 font-mono text-xs leading-5 shadow-none focus-visible:ring-1"
                                        />
                                    </div>

                                    {(formData.match_type === 'keywords' || formData.match_type === 'regex') && (
                                        <div className="flex items-center justify-between rounded-[5px] border border-border/20 bg-background/25 px-4 py-3">
                                            <div>
                                                <Label htmlFor="case-sensitive" className="text-[11px]">Case sensitive</Label>
                                                <p className="mt-1 text-[10px] text-muted-foreground">Require capitalization to match exactly.</p>
                                            </div>
                                            <Switch
                                                id="case-sensitive"
                                                checked={formData.case_sensitive}
                                                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, case_sensitive: checked }))}
                                            />
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="px-6 py-6 sm:px-7">
                                <div className="mb-5">
                                    <h3 className="text-xs font-medium">Enforcement</h3>
                                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                                        Decide what happens after a match and where this rule sits in the evaluation order.
                                    </p>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
                                    <div className="space-y-2">
                                        <Label className="text-[11px]">Action</Label>
                                        <Select
                                            value={formData.action}
                                            onValueChange={(value) => setFormData(prev => ({ ...prev, action: value as ActionType }))}
                                        >
                                            <SelectTrigger className="h-9 border-border/25 bg-background/35 text-sm shadow-none focus:ring-1">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(ACTION_INFO).map(([key, info]) => (
                                                    <SelectItem key={key} value={key} className="text-sm">
                                                        <div className="flex items-center gap-2">
                                                            <info.icon className="size-4" />
                                                            <span>{info.label}</span>
                                                            <span className="text-muted-foreground">— {info.description}</span>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="priority" className="text-[11px]">Priority</Label>
                                        <Input
                                            id="priority"
                                            type="number"
                                            inputMode="numeric"
                                            value={formData.priority}
                                            onChange={(e) => setFormData(prev => ({ ...prev, priority: Number(e.target.value) || 0 }))}
                                            className="h-9 border-border/25 bg-background/35 font-mono text-sm tabular-nums shadow-none focus-visible:ring-1"
                                        />
                                        <p className="text-[10px] leading-4 text-muted-foreground">Higher runs first.</p>
                                    </div>
                                </div>

                                {formData.action === 'block' && formData.match_type === 'ai_detect' && (
                                    <p className="mt-4 rounded-[5px] border border-red-500/15 bg-red-500/[0.06] px-4 py-3 text-[10px] leading-4 text-red-700 dark:text-red-400">
                                        Blocking with AI Detect adds roughly 200–500ms while classification completes before the request proceeds.
                                    </p>
                                )}
                            </section>
                        </div>

                        <div className="flex flex-col gap-3 border-t border-border/25 bg-background/15 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                            <div className="min-h-4" aria-live="polite">
                                {formError && <p className="text-[10px] leading-4 text-red-700 dark:text-red-400">{formError}</p>}
                            </div>
                            <div className="flex items-center justify-end gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={createMutation.isPending || updateMutation.isPending}
                                >
                                    {createMutation.isPending || updateMutation.isPending
                                        ? 'Saving…'
                                        : editingRule
                                            ? 'Save changes'
                                            : 'Create rule'}
                                </Button>
                            </div>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function RuleMetric({ label, value }: { label: string; value: number }) {
    return (
        <div className="border-b border-border/20 px-5 py-5 even:border-l sm:border-b-0 sm:border-l sm:first:border-l-0">
            <dt className="text-[10px] text-muted-foreground">{label}</dt>
            <dd className="mt-3 font-mono text-xl font-medium leading-none tracking-[-0.04em] tabular-nums">{value}</dd>
        </div>
    );
}

function RuleMeta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="min-w-0">
            <dt className="text-[9px] text-muted-foreground">{label}</dt>
            <dd className={`mt-1 truncate text-[11px] font-medium ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</dd>
        </div>
    );
}

function RuleTemplateMenu({ onSelect, children }: { onSelect: (template: RuleTemplate) => void; children: ReactNode }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 overflow-hidden border-border/30 p-0 shadow-none">
                <div className="border-b border-border/25 px-4 py-3">
                    <p className="text-xs font-medium">Rule templates</p>
                    <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Select a starting policy, then review it before saving.</p>
                </div>
                <ScrollArea className="h-80">
                    <div className="py-1.5">
                        {RULE_TEMPLATES.map((category, index) => {
                            const CategoryIcon = category.icon;
                            return (
                                <div key={category.name}>
                                    {index > 0 && <DropdownMenuSeparator className="my-1.5" />}
                                    <DropdownMenuLabel className="flex items-center gap-2 px-3 py-2 text-[10px] font-medium text-muted-foreground">
                                        <CategoryIcon className={`size-3.5 ${category.color}`} />
                                        {category.name}
                                    </DropdownMenuLabel>
                                    {category.templates.map((template) => (
                                        <DropdownMenuItem
                                            key={template.name}
                                            className="mx-1.5 cursor-pointer rounded-[4px] px-3 py-2.5 focus:bg-muted/70"
                                            onClick={() => onSelect(template)}
                                        >
                                            <div className="min-w-0">
                                                <p className="text-xs font-medium">{template.name}</p>
                                                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{template.description}</p>
                                            </div>
                                        </DropdownMenuItem>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
