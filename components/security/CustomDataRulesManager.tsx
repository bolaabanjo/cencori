"use client";

/**
 * Custom Data Rules Manager Component
 * 
 * Allows users to define custom sensitive data patterns and actions
 * for their specific use case (farm data, client info, etc.)
 */

import { useState } from "react";
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
    DialogFooter,
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
import { Badge } from "@/components/ui/badge";
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
    const { data, isLoading } = useQuery({
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
            toast.success('Rule created successfully');
            resetForm();
        },
        onError: (error: Error) => {
            toast.error(error.message);
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
            toast.success('Rule updated successfully');
            resetForm();
        },
        onError: (error: Error) => {
            toast.error(error.message);
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
        if (!formData.name || !formData.pattern) {
            toast.error('Name and pattern are required');
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

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-8 w-24" />
                </div>
                {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                ))}
            </div>
        );
    }

    const rules = data?.rules || [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-medium">Custom Data Rules</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Define patterns for your domain-specific sensitive data
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Templates Dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs gap-1.5"
                            >
                                <DocumentTextIcon className="h-3.5 w-3.5" />
                                Templates
                                <ChevronDownIcon className="h-3 w-3 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64 p-0">
                            <div className="p-2 border-b border-border/50">
                                <span className="text-xs font-medium">Pre-built Templates</span>
                            </div>
                            <ScrollArea className="h-80">
                                {RULE_TEMPLATES.map((category, index) => {
                                    const CategoryIcon = category.icon;
                                    return (
                                        <div key={category.name}>
                                            {index > 0 && <DropdownMenuSeparator />}
                                            <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 flex items-center gap-2 py-2 px-3 bg-muted/30">
                                                <CategoryIcon className={`h-4 w-4 ${category.color}`} />
                                                {category.name}
                                            </DropdownMenuLabel>
                                            {category.templates.map((template) => (
                                                <DropdownMenuItem
                                                    key={template.name}
                                                    className="text-xs pl-8 cursor-pointer py-2 mx-1 rounded-md"
                                                    onClick={() => handleApplyTemplate(template)}
                                                >
                                                    <div>
                                                        <div className="font-medium">{template.name}</div>
                                                        <div className="text-muted-foreground text-[10px] mt-0.5">
                                                            {template.description}
                                                        </div>
                                                    </div>
                                                </DropdownMenuItem>
                                            ))}
                                        </div>
                                    );
                                })}
                            </ScrollArea>
                            {/* Scroll indicator */}
                            <div className="flex items-center justify-center py-1.5 border-t border-border/50 bg-gradient-to-t from-background to-transparent">
                                <ChevronDownIcon className="h-3 w-3 text-muted-foreground animate-bounce" />
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Add Rule Button */}
                    <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        onClick={() => setIsDialogOpen(true)}
                    >
                        <PlusIcon className="h-3.5 w-3.5" />
                        Add Rule
                    </Button>
                </div>
            </div>

            {/* Rules List */}
            {rules.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border/50 rounded-lg">
                    <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center mx-auto mb-3">
                        <ShieldCheckIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">No custom rules yet</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                        Create custom rules or use pre-built templates for Healthcare, Finance, Agriculture, and more
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-4">
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1.5"
                            onClick={() => {
                                // Apply first template as example
                                const firstTemplate = RULE_TEMPLATES[0].templates[0];
                                handleApplyTemplate(firstTemplate);
                            }}
                        >
                            <DocumentTextIcon className="h-3.5 w-3.5" />
                            Use Template
                        </Button>
                        <Button
                            size="sm"
                            className="h-8 text-xs gap-1.5"
                            onClick={() => setIsDialogOpen(true)}
                        >
                            <PlusIcon className="h-3.5 w-3.5" />
                            Create Rule
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    {rules.map((rule) => {
                        const MatchIcon = MATCH_TYPE_INFO[rule.match_type].icon;
                        const ActionInfo = ACTION_INFO[rule.action];
                        const ActionIcon = ActionInfo.icon;

                        return (
                            <div
                                key={rule.id}
                                className={`p-4 rounded-lg border transition-colors ${rule.is_active
                                    ? 'border-border/50 bg-card'
                                    : 'border-border/30 bg-card/50 opacity-60'
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-medium truncate">
                                                {rule.name}
                                            </span>
                                            <Badge variant="outline" className="text-[10px] h-5">
                                                {MATCH_TYPE_INFO[rule.match_type].label}
                                            </Badge>
                                            <Badge className={`text-[10px] h-5 ${ActionInfo.color}`}>
                                                {ActionInfo.label}
                                            </Badge>
                                        </div>
                                        {rule.description && (
                                            <p className="text-xs text-muted-foreground mb-2">
                                                {rule.description}
                                            </p>
                                        )}
                                        <code className="text-[11px] font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded block truncate">
                                            {rule.pattern}
                                        </code>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={rule.is_active}
                                            onCheckedChange={(checked) =>
                                                toggleMutation.mutate({ ruleId: rule.id, is_active: checked })
                                            }
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => handleEdit(rule)}
                                        >
                                            <PencilIcon className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive hover:text-destructive"
                                            onClick={() => deleteMutation.mutate(rule.id)}
                                        >
                                            <TrashIcon className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* AI Detect Info */}
            <div className="rounded-lg border border-border/50 bg-gradient-to-br from-purple-500/5 to-blue-500/5 p-4">
                <div className="flex items-start gap-3">
                    <div>
                        <h4 className="text-sm font-medium">AI-Powered Detection</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                            Use &quot;AI Detect&quot; to describe sensitive data in plain English.
                            It understands context and meaning—not just keywords.
                        </p>
                    </div>
                </div>
            </div>

            {/* Create/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={(open) => !open && resetForm()}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editingRule ? 'Edit Rule' : 'Create Data Rule'}</DialogTitle>
                        <DialogDescription>
                            Define a pattern to detect and protect sensitive data
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Name */}
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-xs">Name</Label>
                            <Input
                                id="name"
                                placeholder="e.g., Farm Production Data"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                className="h-9 text-sm"
                            />
                        </div>

                        {/* Description */}
                        <div className="space-y-2">
                            <Label htmlFor="description" className="text-xs">Description (optional)</Label>
                            <Input
                                id="description"
                                placeholder="Brief description of what this rule protects"
                                value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                className="h-9 text-sm"
                            />
                        </div>

                        {/* Match Type */}
                        <div className="space-y-2">
                            <Label className="text-xs">Match Type</Label>
                            <Select
                                value={formData.match_type}
                                onValueChange={(value) =>
                                    setFormData(prev => ({ ...prev, match_type: value as MatchType, pattern: '' }))
                                }
                            >
                                <SelectTrigger className="h-9 text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(MATCH_TYPE_INFO).map(([key, info]) => (
                                        <SelectItem key={key} value={key} className="text-sm">
                                            <div className="flex items-center gap-2">
                                                <info.icon className="h-4 w-4" />
                                                {info.label}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground">
                                {matchTypeInfo.description}
                            </p>
                        </div>

                        {/* Pattern */}
                        <div className="space-y-2">
                            <Label htmlFor="pattern" className="text-xs">Pattern</Label>
                            <Textarea
                                id="pattern"
                                placeholder={matchTypeInfo.placeholder}
                                value={formData.pattern}
                                onChange={(e) => setFormData(prev => ({ ...prev, pattern: e.target.value }))}
                                className="min-h-[80px] text-sm font-mono"
                            />
                        </div>

                        {/* Case Sensitive (only for keywords/regex) */}
                        {(formData.match_type === 'keywords' || formData.match_type === 'regex') && (
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label className="text-xs">Case Sensitive</Label>
                                    <p className="text-[11px] text-muted-foreground">Match exact case</p>
                                </div>
                                <Switch
                                    checked={formData.case_sensitive}
                                    onCheckedChange={(checked) =>
                                        setFormData(prev => ({ ...prev, case_sensitive: checked }))
                                    }
                                />
                            </div>
                        )}

                        {/* Action */}
                        <div className="space-y-2">
                            <Label className="text-xs">Action</Label>
                            <Select
                                value={formData.action}
                                onValueChange={(value) =>
                                    setFormData(prev => ({ ...prev, action: value as ActionType }))
                                }
                            >
                                <SelectTrigger className="h-9 text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(ACTION_INFO).map(([key, info]) => (
                                        <SelectItem key={key} value={key} className="text-sm">
                                            <div className="flex items-center gap-2">
                                                <info.icon className="h-4 w-4" />
                                                <span>{info.label}</span>
                                                <span className="text-muted-foreground">
                                                    — {info.description}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Block Warning */}
                        {formData.action === 'block' && formData.match_type === 'ai_detect' && (
                            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                                <p className="text-xs text-red-600 dark:text-red-400">
                                    <strong>Warning:</strong> Using Block with AI Detect will add ~200-500ms latency
                                    as we must wait for classification before processing the request.
                                </p>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={resetForm}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSubmit}
                            disabled={createMutation.isPending || updateMutation.isPending}
                        >
                            {createMutation.isPending || updateMutation.isPending ? (
                                'Saving...'
                            ) : editingRule ? (
                                'Save Changes'
                            ) : (
                                'Create Rule'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
