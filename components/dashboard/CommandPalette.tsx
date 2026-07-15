"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import ReactMarkdown from "react-markdown";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ObservabilityIcon } from "@/components/icons/ObservabilityIcon";
import {
  Search,
  Code2,
  Settings,
  FolderKanban,
  Book,
  Key,
  ScrollText,
  Play,
  CreditCard,
  Plug,
  Home,
  Plus,
  FileText,
  Cpu,
  Lock,
  Building2,
  ChevronRight,
  HelpCircle,
  Lightbulb,
  Wand2,
  ArrowLeft,
} from "lucide-react";

// Official GitHub Logo SVG
const GitHubLogo = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
  >
    <path
      d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
      fill="currentColor"
    />
  </svg>
);

// Heroicons - User Group
const UserGroupIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
    />
  </svg>
);

// Heroicons - Arrow Up Circle (for Quick Start)
const ArrowUpCircleIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m15 11.25-3-3m0 0-3 3m3-3v7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
    />
  </svg>
);

// Heroicons - Shield Check
const ShieldCheckIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
    />
  </svg>
);

// Heroicons - Globe Alt
const GlobeAltIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
    />
  </svg>
);

// Heroicons - Chart Bar
const ChartBarIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
    />
  </svg>
);

// Heroicons - Bolt
const BoltIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"
    />
  </svg>
);

// Heroicons - Chat Bubble Left Right
const ChatBubbleIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
    />
  </svg>
);

// Heroicons - Signal
const SignalIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.348 14.652a3.75 3.75 0 0 1 0-5.304m5.304 0a3.75 3.75 0 0 1 0 5.304m-7.425 2.121a6.75 6.75 0 0 1 0-9.546m9.546 0a6.75 6.75 0 0 1 0 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.808 3.808 9.981 0 13.788M12 12h.008v.008H12V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
    />
  </svg>
);

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug?: string | null;
  projectSlug?: string | null;
}

interface CommandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  shortcut?: string;
  keywords?: string[];
}

interface CommandGroup {
  id: string;
  label: string;
  items: CommandItem[];
}

// Example questions for AI
const AI_EXAMPLE_QUESTIONS = [
  "How do I get started with Cencori?",
  "How do I create a project?",
  "How do I generate API keys?",
  "How do I integrate multiple AI providers?",
  "How do I monitor my AI usage?",
  "How do I set up content moderation?",
];

export function CommandPalette({
  open,
  onOpenChange,
  orgSlug,
  projectSlug,
}: CommandPaletteProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const aiInputRef = React.useRef<HTMLInputElement>(null);

  // AI Chat State
  const [showAI, setShowAI] = React.useState(false);
  const [aiQuestion, setAiQuestion] = React.useState("");
  const [aiAnswer, setAiAnswer] = React.useState("");
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiSelectedIndex, setAiSelectedIndex] = React.useState(0);

  const navigate = (path: string) => {
    router.push(path);
    onOpenChange(false);
  };

  const openExternal = (url: string) => {
    window.open(url, "_blank");
    onOpenChange(false);
  };

  // Ask AI function
  const askAI = async (question: string) => {
    if (!question.trim() || aiLoading) return;

    setAiLoading(true);
    setAiAnswer("");

    try {
      const res = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) throw new Error("Failed to get response");

      const data = await res.json();
      setAiAnswer(data.answer);
    } catch {
      setAiAnswer("Sorry, I couldn't process your question. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  // Handle AI question submission
  const handleAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    askAI(aiQuestion);
  };

  // Handle example question click
  const handleExampleClick = (question: string) => {
    setAiQuestion(question);
    askAI(question);
  };

  // Reset AI state when closing
  const handleClose = (open: boolean) => {
    if (!open) {
      setShowAI(false);
      setAiQuestion("");
      setAiAnswer("");
      setAiLoading(false);
    }
    onOpenChange(open);
  };

  // Command groups
  const commandGroups: CommandGroup[] = React.useMemo(() => {
    const groups: CommandGroup[] = [];

    // ============ PROJECT CONTEXT COMMANDS ============
    if (projectSlug && orgSlug) {
      groups.push({
        id: "project",
        label: "PROJECT",
        items: [
          {
            id: "project-overview",
            label: "Project overview",
            icon: <Home className="h-3.5 w-3.5" />,
            action: () =>
              navigate(
`/${orgSlug}/${projectSlug}`,
            ),
          keywords: ["dashboard", "home", "main"],
          },
          {
            id: "playground",
            label: "AI Playground",
            icon: <Play className="h-3.5 w-3.5" />,
            action: () =>
              navigate(
                `/${orgSlug}/${projectSlug}/playground`,
              ),
            keywords: ["test", "chat", "try", "sandbox", "experiment"],
          },
          {
            id: "api-keys",
            label: "API Keys",
            icon: <Key className="h-3.5 w-3.5" />,
            action: () =>
              navigate(
                `/${orgSlug}/${projectSlug}/settings?tab=api`,
              ),
            keywords: ["token", "secret", "credentials", "key"],
          },
          {
            id: "project-observability",
            label: "Observability",
            icon: <ObservabilityIcon className="h-3.5 w-3.5" />,
            action: () =>
              navigate(
                `/${orgSlug}/${projectSlug}/observability`,
              ),
            keywords: [
              "observability",
              "analytics",
              "stats",
              "metrics",
              "usage",
              "charts",
              "reports",
            ],
          },
          {
            id: "logs",
            label: "Request Logs",
            icon: <ScrollText className="h-3.5 w-3.5" />,
            action: () =>
              navigate(
                `/${orgSlug}/${projectSlug}/logs`,
              ),
            keywords: ["history", "requests", "debug", "trace"],
          },
          {
            id: "security",
            label: "Security",
            icon: <ShieldCheckIcon className="h-3.5 w-3.5" />,
            action: () =>
              navigate(
                `/${orgSlug}/${projectSlug}/security`,
              ),
            keywords: ["protection", "firewall", "rules", "safety"],
          },
          {
            id: "project-settings",
            label: "Project Settings",
            icon: <Settings className="h-3.5 w-3.5" />,
            action: () =>
              navigate(
                `/${orgSlug}/${projectSlug}/settings`,
              ),
            keywords: ["configure", "options", "preferences"],
          },
        ],
      });
    }

    // ============ ORGANIZATION COMMANDS ============
    if (orgSlug) {
      groups.push({
        id: "organization",
        label: "ORGANIZATION",
        items: [
          {
            id: "all-projects",
            label: "All Projects",
            icon: <FolderKanban className="h-3.5 w-3.5" />,
            action: () =>
              navigate(`/${orgSlug}/~/projects`),
            keywords: ["list", "browse", "view"],
          },
          {
            id: "new-project",
            label: "Create new project",
            icon: <Plus className="h-3.5 w-3.5" />,
            action: () =>
              navigate(`/${orgSlug}/~/projects/new`),
            keywords: ["add", "create", "start"],
          },
          {
            id: "import-github",
            label: "Import from GitHub",
            icon: <GitHubLogo className="h-3.5 w-3.5" />,
            action: () =>
              navigate(
                `/${orgSlug}/~/projects/import/github`,
              ),
            keywords: ["repository", "repo", "git", "clone"],
          },
          {
            id: "org-analytics",
            label: "Organization Analytics",
            icon: <ChartBarIcon className="h-3.5 w-3.5" />,
            action: () =>
              navigate(`/${orgSlug}/analytics`),
            keywords: ["stats", "metrics", "usage"],
          },
          {
            id: "providers",
            label: "AI Providers",
            icon: <Cpu className="h-3.5 w-3.5" />,
            action: () =>
              navigate(`/${orgSlug}/~/providers`),
            keywords: ["openai", "anthropic", "claude", "gpt", "models"],
          },
          {
            id: "integrations",
            label: "Integrations",
            icon: <Plug className="h-3.5 w-3.5" />,
            action: () =>
              navigate(`/${orgSlug}/~/integrations`),
            keywords: ["connect", "apps", "services"],
          },
          {
            id: "teams",
            label: "Team Members",
            icon: <UserGroupIcon className="h-3.5 w-3.5" />,
            action: () => navigate(`/${orgSlug}/~/teams`),
            keywords: ["users", "invite", "members", "access"],
          },
          {
            id: "billing",
            label: "Billing & Usage",
            icon: <CreditCard className="h-3.5 w-3.5" />,
            action: () =>
              navigate(`/${orgSlug}/~/billing`),
            keywords: ["payment", "invoice", "plan", "subscription", "upgrade"],
          },
          {
            id: "org-settings",
            label: "Organization Settings",
            icon: <Settings className="h-3.5 w-3.5" />,
            action: () =>
              navigate(`/${orgSlug}/settings`),
            keywords: ["configure", "options"],
          },
        ],
      });
    }

    // ============ QUICK ACTIONS ============
    groups.push({
      id: "actions",
      label: "QUICK ACTIONS",
      items: [
        {
          id: "switch-org",
          label: "Switch organization",
          icon: <Building2 className="h-3.5 w-3.5" />,
          action: () => navigate("/dashboard"),
          keywords: ["change", "select", "workspace"],
        },
        {
          id: "new-org",
          label: "Create organization",
          icon: <Plus className="h-3.5 w-3.5" />,
          action: () => navigate("/onboarding"),
          keywords: ["add", "workspace", "team"],
        },
      ],
    });

    // ============ DOCUMENTATION ============
    groups.push({
      id: "docs",
      label: "DOCUMENTATION",
      items: [
        {
          id: "docs-home",
          label: "Documentation",
          icon: <Book className="h-3.5 w-3.5" />,
          action: () => navigate("/docs"),
          keywords: ["help", "learn", "guide"],
        },
        {
          id: "ask-ai",
          label: "Ask Cencori AI",
          icon: <Wand2 className="h-3.5 w-3.5" />,
          action: () => setShowAI(true),
          keywords: ["assistant", "chat", "help", "question", "ai"],
        },
        {
          id: "quick-start",
          label: "Quick Start Guide",
          icon: <ArrowUpCircleIcon className="h-3.5 w-3.5" />,
          action: () => navigate("/docs/quick-start"),
          keywords: ["getting started", "tutorial", "begin"],
        },
        {
          id: "api-reference",
          label: "API Reference",
          icon: <Code2 className="h-3.5 w-3.5" />,
          action: () => navigate("/docs/api/metrics"),
          keywords: ["endpoints", "methods", "rest", "sdk"],
        },
        {
          id: "installation",
          label: "Installation",
          icon: <FileText className="h-3.5 w-3.5" />,
          action: () => navigate("/docs/installation"),
          keywords: ["setup", "npm", "install", "package"],
        },
        {
          id: "security-docs",
          label: "Security Guide",
          icon: <Lock className="h-3.5 w-3.5" />,
          action: () => navigate("/docs/security"),
          keywords: ["protection", "encryption", "compliance"],
        },
      ],
    });

    // ============ PRODUCTS ============
    groups.push({
      id: "products",
      label: "PRODUCTS",
      items: [
        {
          id: "product-ai",
          label: "Cencori AI",
          icon: <Wand2 className="h-3.5 w-3.5" />,
          action: () => navigate("/ai"),
          keywords: ["gateway", "proxy", "models"],
        },
        {
          id: "product-edge",
          label: "Cencori Edge",
          icon: <GlobeAltIcon className="h-3.5 w-3.5" />,
          action: () => navigate("/edge"),
          keywords: ["cdn", "fast", "global", "low latency"],
        },
        {
          id: "product-knight",
          label: "Cencori Knight",
          icon: <ShieldCheckIcon className="h-3.5 w-3.5" />,
          action: () => navigate("/product-knight"),
          keywords: ["firewall", "protection", "moderation"],
        },
        {
          id: "product-sandbox",
          label: "Cencori Sandbox",
          icon: <Play className="h-3.5 w-3.5" />,
          action: () => navigate("/product-sandbox"),
          keywords: ["test", "experiment", "playground"],
        },
        {
          id: "product-insights",
          label: "Cencori Insights",
          icon: <ChartBarIcon className="h-3.5 w-3.5" />,
          action: () => navigate("/insights"),
          keywords: ["analytics", "metrics", "monitoring"],
        },
        {
          id: "product-audit",
          label: "Cencori Audit",
          icon: <ScrollText className="h-3.5 w-3.5" />,
          action: () => navigate("/audit"),
          keywords: ["logs", "compliance", "trace"],
        },
        {
          id: "product-enterprise",
          label: "Enterprise",
          icon: <Building2 className="h-3.5 w-3.5" />,
          action: () => navigate("/solutions/enterprise"),
          keywords: ["business", "scale", "custom"],
        },
      ],
    });

    // ============ RESOURCES ============
    groups.push({
      id: "resources",
      label: "RESOURCES",
      items: [
        {
          id: "pricing",
          label: "Pricing",
          icon: <CreditCard className="h-3.5 w-3.5" />,
          action: () => navigate("/pricing"),
          keywords: ["cost", "plans", "free", "pro", "enterprise"],
        },
        {
          id: "changelog",
          label: "Changelog",
          icon: <BoltIcon className="h-3.5 w-3.5" />,
          action: () => navigate("/changelog"),
          keywords: ["updates", "new", "features", "release"],
        },
        {
          id: "blog",
          label: "Blog",
          icon: <FileText className="h-3.5 w-3.5" />,
          action: () => navigate("/blog"),
          keywords: ["articles", "news", "posts"],
        },
        {
          id: "status",
          label: "System Status",
          icon: <SignalIcon className="h-3.5 w-3.5" />,
          action: () => window.open("/status", "_self"),
          keywords: ["uptime", "health", "incidents"],
        },
        {
          id: "discord",
          label: "Join Discord",
          icon: <ChatBubbleIcon className="h-3.5 w-3.5" />,
          action: () => openExternal("https://discord.gg/j3eAV5WzCa"),
          keywords: ["community", "chat", "support"],
        },
        {
          id: "github",
          label: "GitHub",
          icon: <GitHubLogo className="h-3.5 w-3.5" />,
          action: () => openExternal("https://github.com/cencori"),
          keywords: ["code", "open source", "repository"],
        },
        {
          id: "support",
          label: "Contact Support",
          icon: <HelpCircle className="h-3.5 w-3.5" />,
          action: () => navigate("/contact"),
          keywords: ["help", "email", "ticket"],
        },
        {
          id: "feedback",
          label: "Send Feedback",
          icon: <Lightbulb className="h-3.5 w-3.5" />,
          action: () => navigate("/contact"),
          keywords: ["idea", "suggestion", "feature request"],
        },
      ],
    });

    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, onOpenChange, orgSlug, projectSlug]);

  // Smart search: filter items based on label and keywords
  const filteredGroups = React.useMemo(() => {
    if (!search.trim()) return commandGroups;

    const searchLower = search.toLowerCase();

    return commandGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (item.label.toLowerCase().includes(searchLower)) return true;
          if (
            item.keywords?.some((kw) => kw.toLowerCase().includes(searchLower))
          )
            return true;
          return false;
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [commandGroups, search]);

  // Flatten items for keyboard navigation
  const allItems = React.useMemo(() => {
    return filteredGroups.flatMap((group) => group.items);
  }, [filteredGroups]);

  // Reset selection when search changes
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Handle keyboard navigation
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % Math.max(allItems.length, 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(
            (prev) =>
              (prev - 1 + allItems.length) % Math.max(allItems.length, 1),
          );
          break;
        case "Enter":
          e.preventDefault();
          if (allItems[selectedIndex]) {
            allItems[selectedIndex].action();
          }
          break;
        case "Escape":
          e.preventDefault();
          handleClose(false);
          break;
      }
    },
    [allItems, selectedIndex],
  );

  // Handle AI keyboard navigation
  const handleAiKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (aiAnswer) {
          setAiAnswer("");
        } else {
          setShowAI(false);
        }
      } else if (e.key === "ArrowDown" && !aiQuestion && !aiAnswer) {
        e.preventDefault();
        setAiSelectedIndex((prev) => (prev + 1) % AI_EXAMPLE_QUESTIONS.length);
      } else if (e.key === "ArrowUp" && !aiQuestion && !aiAnswer) {
        e.preventDefault();
        setAiSelectedIndex(
          (prev) =>
            (prev - 1 + AI_EXAMPLE_QUESTIONS.length) %
            AI_EXAMPLE_QUESTIONS.length,
        );
      } else if (e.key === "Enter" && !aiQuestion && !aiAnswer) {
        e.preventDefault();
        handleExampleClick(AI_EXAMPLE_QUESTIONS[aiSelectedIndex]);
      }
    },
    [aiQuestion, aiAnswer, aiSelectedIndex],
  );

  // Focus input when dialog opens
  React.useEffect(() => {
    if (open) {
      setTimeout(() => {
        if (showAI) {
          aiInputRef.current?.focus();
        } else {
          inputRef.current?.focus();
        }
      }, 0);
    } else {
      setSearch("");
      setSelectedIndex(0);
    }
  }, [open, showAI]);

  let itemIndex = 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>Command Palette</DialogTitle>
        </VisuallyHidden>

        {showAI ? (
          // ============ AI VIEW ============
          <div className="flex flex-col h-[450px]">
            {/* AI Header */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40">
              <button
                type="button"
                onClick={() => {
                  setShowAI(false);
                  setAiAnswer("");
                  setAiQuestion("");
                }}
                className="p-1 hover:bg-secondary rounded transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              <span className="text-sm font-medium">Ask Cencori AI</span>
            </div>

            {/* AI Content */}
            <div className="flex-1 overflow-y-auto">
              {aiAnswer ? (
                // Show question and answer with avatars
                <div className="p-4 space-y-4">
                  {/* User question */}
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <svg
                        className="h-3.5 w-3.5 text-muted-foreground"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                        />
                      </svg>
                    </div>
                    <div className="text-sm text-foreground pt-0.5">
                      {aiQuestion}
                    </div>
                  </div>
                  {/* AI answer */}
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Wand2 className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none pt-0.5 text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-secondary [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto">
                      <ReactMarkdown>{aiAnswer}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ) : aiLoading ? (
                // Loading state with animated dots
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-2">
                      <span
                        className="w-2 h-2 rounded-full bg-primary animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="w-2 h-2 rounded-full bg-primary animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-2 h-2 rounded-full bg-primary animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Thinking...</p>
                  </div>
                </div>
              ) : (
                // Example questions
                <div className="py-2">
                  <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    EXAMPLES
                  </div>
                  {AI_EXAMPLE_QUESTIONS.map((question, index) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => handleExampleClick(question)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer",
                        index === aiSelectedIndex
                          ? "bg-secondary/80 text-foreground"
                          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                      )}
                    >
                      <Wand2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="text-xs">{question}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* AI Input */}
            <form
              onSubmit={handleAiSubmit}
              className="border-t border-border/40"
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  ref={aiInputRef}
                  type="text"
                  placeholder="Ask Cencori AI a question..."
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  onKeyDown={handleAiKeyDown}
                  disabled={aiLoading}
                  className="border-0 shadow-none focus-visible:ring-0 px-0 h-7 text-sm bg-transparent"
                />
              </div>
            </form>
          </div>
        ) : (
          // ============ MAIN COMMAND VIEW ============
          <>
            {/* Search Input */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                ref={inputRef}
                type="text"
                placeholder="Run a command or search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="border-0 shadow-none focus-visible:ring-0 px-0 h-7 text-sm bg-transparent"
              />
            </div>

            {/* Command List */}
            <div className="max-h-[400px] overflow-y-auto py-1">
              {filteredGroups.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs text-muted-foreground">
                    No results found
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    Try searching for &quot;settings&quot;, &quot;api&quot;, or
                    &quot;docs&quot;
                  </p>
                </div>
              ) : (
                filteredGroups.map((group) => (
                  <div key={group.id} className="mb-1">
                    <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      {group.label}
                    </div>
                    <div>
                      {group.items.map((item) => {
                        const currentIndex = itemIndex++;
                        const isSelected = currentIndex === selectedIndex;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={item.action}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors cursor-pointer",
                              isSelected
                                ? "bg-secondary/80 text-foreground"
                                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                            )}
                          >
                            <span className="shrink-0">{item.icon}</span>
                            <span className="flex-1 text-xs truncate">
                              {item.label}
                            </span>
                            {item.shortcut && (
                              <span className="text-[10px] text-muted-foreground/60 shrink-0">
                                {item.shortcut}
                              </span>
                            )}
                            <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div className="px-3 py-2 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground/60">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-secondary rounded text-[9px]">
                    ↑↓
                  </kbd>{" "}
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-secondary rounded text-[9px]">
                    ↵
                  </kbd>{" "}
                  select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-secondary rounded text-[9px]">
                    esc
                  </kbd>{" "}
                  close
                </span>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
