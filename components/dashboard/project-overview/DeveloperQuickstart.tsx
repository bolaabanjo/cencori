"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BundledLanguage } from "shiki";
import { AudioLines } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import Chat01Icon from "@hugeicons/core-free-icons/Chat01Icon";
import Copy01Icon from "@hugeicons/core-free-icons/Copy01Icon";
import Image02Icon from "@hugeicons/core-free-icons/Image02Icon";
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon";
import { GenerateKeyDialog } from "@/components/api-keys/GenerateKeyDialog";
import {
  CodeBlock,
  CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ProjectOverviewCharts,
  type ProjectOverviewChartPoint,
  type ProjectOverviewStats,
} from "@/components/dashboard/project-overview/ProjectOverviewDashboard";
import { useEnvironment } from "@/lib/contexts/EnvironmentContext";
import { formatCurrency } from "@/lib/currency";
import { queryKeys, useProjectIdBySlug } from "@/lib/hooks/useQueries";

type LanguageId = "typescript" | "python" | "go" | "rust" | "php";
type ModalityId = "chat" | "image" | "voice";

interface LanguageOption {
  id: LanguageId;
  label: string;
  logo: string;
  logoClassName?: string;
  language: BundledLanguage;
  code: string;
}

interface ModalityOption {
  id: ModalityId;
  label: string;
  docsHref: string;
}

interface MonetizationConfig {
  end_user_billing_enabled: boolean;
  customer_markup_percentage: number;
  billing_cycle: "daily" | "weekly" | "monthly";
  default_rate_plan_id: string | null;
}

interface MonetizationStats {
  total_end_users: number;
  active_end_users: number;
  provider_cost_usd: number;
  customer_revenue_usd: number;
  margin_usd: number;
}

const MODALITIES: ModalityOption[] = [
  {
    id: "chat",
    label: "Chat",
    docsHref: "/docs/api/chat",
  },
  {
    id: "image",
    label: "Image",
    docsHref: "/docs/api/images",
  },
  {
    id: "voice",
    label: "Voice",
    docsHref: "/docs/api/voice",
  },
];

const CHART_PERIODS = [
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
] as const;

function ModalityIcon({ id }: { id: ModalityId }) {
  if (id === "chat") {
    return (
      <HugeiconsIcon
        icon={Chat01Icon}
        className="size-4 shrink-0 text-muted-foreground"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    );
  }

  if (id === "image") {
    return (
      <HugeiconsIcon
        icon={Image02Icon}
        className="size-4 shrink-0 text-muted-foreground"
        strokeWidth={1.75}
        aria-hidden="true"
      />
    );
  }

  return (
    <AudioLines
      aria-hidden="true"
      className="size-4 shrink-0 text-muted-foreground"
      strokeWidth={1.75}
    />
  );
}

const LANGUAGES: LanguageOption[] = [
  {
    id: "typescript",
    label: "TypeScript",
    logo: "/icons/languages/typescript.svg",
    language: "typescript",
    code: `import { Cencori } from "cencori";

const cencori = new Cencori();

const response = await cencori.ai.chat({
  model: "gpt-5.6-sol",
  messages: [
    { role: "user", content: "What should I build today?" },
  ],
});

console.log(response.content);`,
  },
  {
    id: "python",
    label: "Python",
    logo: "/icons/languages/python.svg",
    language: "python",
    code: `from cencori import Cencori

cencori = Cencori()

response = cencori.ai.chat(
    model="gpt-5.6-sol",
    messages=[
        {"role": "user", "content": "What should I build today?"}
    ],
)

print(response.content)`,
  },
  {
    id: "go",
    label: "Go",
    logo: "/icons/languages/go.svg",
    logoClassName: "w-5",
    language: "go",
    code: `package main

import (
    "context"
    "fmt"
    "os"

    "github.com/cencori/cencori-go"
)

func main() {
    client, err := cencori.NewClient(
        cencori.WithAPIKey(os.Getenv("CENCORI_API_KEY")),
    )
    if err != nil {
        panic(err)
    }

    response, err := client.Chat.Create(context.TODO(), &cencori.ChatParams{
        Model: "gpt-5.6-sol",
        Messages: []cencori.Message{
            {Role: "user", Content: "What should I build today?"},
        },
    })
    if err != nil {
        panic(err)
    }

    fmt.Println(response.Choices[0].Message.Content)
}`,
  },
  {
    id: "rust",
    label: "Rust",
    logo: "/icons/languages/rust.svg",
    logoClassName: "dark:invert",
    language: "rust",
    code: `use cencori::{types::Message, Cencori};

fn main() {
    let cencori = Cencori::new(None, None, None).unwrap();

    let response = cencori.ai.chat(
        vec![Message::user("What should I build today?")],
        Some("gpt-5.6-sol"),
        None,
        None,
        None,
    ).unwrap();

    println!("{}", response.content);
}`,
  },
  {
    id: "php",
    label: "PHP",
    logo: "/icons/languages/php.svg",
    logoClassName: "w-5",
    language: "php",
    code: `<?php

require "vendor/autoload.php";

$client = OpenAI::factory()
    ->withBaseUri("https://api.cencori.com/v1")
    ->withApiKey(getenv("CENCORI_API_KEY"))
    ->make();

$response = $client->chat()->create([
    "model" => "gpt-5.6-sol",
    "messages" => [[
        "role" => "user",
        "content" => "What should I build today?",
    ]],
]);

echo $response->choices[0]->message->content;`,
  },
];

const MODALITY_CODE: Record<
  Exclude<ModalityId, "chat">,
  Record<LanguageId, string>
> = {
  image: {
    typescript: `import { Cencori } from "cencori";

const cencori = new Cencori();

const result = await cencori.ai.generateImage({
  prompt: "A cinematic city floating above the clouds",
  model: "gpt-image-2",
  size: "1024x1024",
});

console.log(result.images[0].url);`,
    python: `from cencori import Cencori

cencori = Cencori()

result = cencori.ai.generate_image(
    prompt="A cinematic city floating above the clouds",
    model="gpt-image-2",
    size="1024x1024",
)

print(result.images[0].url)`,
    go: `package main

import (
    "context"
    "fmt"
    "os"

    "github.com/cencori/cencori-go"
)

func main() {
    client, err := cencori.NewClient(
        cencori.WithAPIKey(os.Getenv("CENCORI_API_KEY")),
    )
    if err != nil {
        panic(err)
    }

    result, err := client.Chat.GenerateImage(
        context.TODO(),
        &cencori.ImageGenerationRequest{
            Prompt: "A cinematic city floating above the clouds",
            Model: "gpt-image-2",
            Size: "1024x1024",
        },
    )
    if err != nil {
        panic(err)
    }

    fmt.Println(result.Images[0].URL)
}`,
    rust: `use cencori::Cencori;

fn main() {
    let cencori = Cencori::new(None, None, None).unwrap();

    let result = cencori.ai.generate_image(
        "A cinematic city floating above the clouds",
        Some("gpt-image-2"),
        None,
        Some("1024x1024"),
        None,
        None,
        None,
    ).unwrap();

    println!("{}", result.images[0].url.as_deref().unwrap_or(""));
}`,
    php: `<?php

require "vendor/autoload.php";

use Cencori\\Cencori;

$cencori = new Cencori();

$result = $cencori->ai->generateImage(
    prompt: "A cinematic city floating above the clouds",
    model: "gpt-image-2",
    size: "1024x1024",
);

echo $result["images"][0]["url"];`,
  },
  voice: {
    typescript: `import { writeFile } from "node:fs/promises";
import { Cencori } from "cencori";

const cencori = new Cencori();

const { audio } = await cencori.voice.speak({
  input: "Your idea is ready to ship.",
  model: "sonic-2",
});

await writeFile("hello.mp3", Buffer.from(audio));`,
    python: `from cencori import Cencori

cencori = Cencori()

audio = cencori.voice.speak(
    "Your idea is ready to ship.",
    model="sonic-2",
)

with open("hello.mp3", "wb") as file:
    file.write(audio)`,
    go: `package main

import (
    "context"
    "os"

    "github.com/cencori/cencori-go"
)

func main() {
    client, err := cencori.NewClient(
        cencori.WithAPIKey(os.Getenv("CENCORI_API_KEY")),
    )
    if err != nil {
        panic(err)
    }

    result, err := client.Voice.Speak(
        context.TODO(),
        &cencori.SpeakParams{
            Input: "Your idea is ready to ship.",
            Model: "sonic-2",
        },
    )
    if err != nil {
        panic(err)
    }

    if err := os.WriteFile("hello.mp3", result.Audio, 0600); err != nil {
        panic(err)
    }
}`,
    rust: `use cencori::{voice::SpeakParams, Cencori};

fn main() {
    let cencori = Cencori::new(None, None, None).unwrap();

    let speech = cencori.voice.speak(
        &SpeakParams::new("Your idea is ready to ship.")
            .with_model("sonic-2"),
    ).unwrap();

    std::fs::write("hello.mp3", speech.audio).unwrap();
}`,
    php: `<?php

require "vendor/autoload.php";

use Cencori\\Cencori;

$cencori = new Cencori();

$speech = $cencori->voice->speak([
    "input" => "Your idea is ready to ship.",
    "model" => "sonic-2",
]);

file_put_contents("hello.mp3", $speech["audio"]);`,
  },
};

interface DeveloperQuickstartProps {
  orgSlug: string;
  projectSlug: string;
}

export function DeveloperQuickstart({
  orgSlug,
  projectSlug,
}: DeveloperQuickstartProps) {
  const queryClient = useQueryClient();
  const { environment } = useEnvironment();
  const { data: projectId, isLoading: projectLoading } = useProjectIdBySlug(
    orgSlug,
    projectSlug,
  );
  const [activeLanguage, setActiveLanguage] = useState<LanguageId>("typescript");
  const [activeModality, setActiveModality] = useState<ModalityId>("chat");
  const [promptCopied, setPromptCopied] = useState(false);
  const [showGenerateKeyDialog, setShowGenerateKeyDialog] = useState(false);
  const [chartPeriod, setChartPeriod] = useState("7d");
  const {
    data: statsData,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useQuery<{
    stats: ProjectOverviewStats;
    chartData: ProjectOverviewChartPoint[];
  }>({
    queryKey: ["aiStats", projectId, chartPeriod, environment],
    queryFn: async () => {
      const response = await fetch(
        `/api/projects/${projectId}/ai/stats?period=${chartPeriod}&environment=${environment}`,
      );
      if (!response.ok) throw new Error("Failed to load project usage");
      return response.json();
    },
    enabled: Boolean(projectId),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    placeholderData: (previousData) => previousData,
  });
  const {
    data: monetizationConfig,
    isLoading: monetizationConfigLoading,
    isError: monetizationConfigError,
    refetch: refetchMonetizationConfig,
  } = useQuery<MonetizationConfig>({
    queryKey: ["endUserBillingConfig", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/end-user-billing`);
      if (!response.ok) throw new Error("Failed to load monetization configuration");
      return response.json();
    },
    enabled: Boolean(projectId),
    staleTime: 30 * 1000,
  });
  const monetizationEnabled =
    monetizationConfig?.end_user_billing_enabled ?? false;
  const {
    data: monetizationStats,
    isLoading: monetizationStatsLoading,
    isError: monetizationStatsError,
    refetch: refetchMonetizationStats,
  } = useQuery<MonetizationStats>({
    queryKey: ["endUserBillingStats", projectId, "30d"],
    queryFn: async () => {
      const response = await fetch(
        `/api/projects/${projectId}/end-user-billing/stats?period=30d`,
      );
      if (!response.ok) throw new Error("Failed to load monetization metrics");
      return response.json();
    },
    enabled: Boolean(projectId && monetizationEnabled),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    placeholderData: (previousData) => previousData,
  });
  const monetizationLoading =
    projectLoading ||
    monetizationConfigLoading ||
    (monetizationEnabled && monetizationStatsLoading && !monetizationStats);
  const monetizationError =
    monetizationConfigError ||
    (monetizationEnabled && monetizationStatsError);
  const monetizationMarginRate =
    (monetizationStats?.customer_revenue_usd ?? 0) > 0
      ? ((monetizationStats?.margin_usd ?? 0) /
          (monetizationStats?.customer_revenue_usd ?? 1)) *
        100
      : 0;
  const active = LANGUAGES.find((language) => language.id === activeLanguage) ?? LANGUAGES[0];
  const activeModalityOption =
    MODALITIES.find((modality) => modality.id === activeModality) ?? MODALITIES[0];
  const activeCode =
    activeModality === "chat"
      ? active.code
      : MODALITY_CODE[activeModality][active.id];
  const agentPrompt = `Integrate Cencori into this codebase for the feature I am building.

Before changing code, read https://cencori.com/llm.txt and treat it as the source of truth for current packages, imports, authentication, endpoints, models, and request/response shapes.

Instructions:
1. Inspect the repository to understand its language, framework, package manager, architecture, existing AI integrations, server/client boundaries, environment conventions, and testing setup.
2. Determine the intended product outcome from my request and the codebase. Do not assume I need chat or text completions. Cencori can support chat and text, image generation and vision, voice and transcription, documents, embeddings, memory and RAG, web search and extraction, agents and sessions, moderation, and other documented capabilities.
3. If the intended outcome is still unclear after inspection, ask one concise clarifying question before changing code. Otherwise, proceed with the smallest appropriate integration.
4. Preserve the existing application, routes, authentication, UI, dependencies, and response contracts. Do not scaffold a new app unless I explicitly ask for one.
5. Choose the official Cencori SDK, compatible endpoint, and supported model that best fit this stack and use case. Confirm any required provider access instead of silently switching models.
6. Keep CENCORI_API_KEY server-side. Never hard-code it, expose it in client code, or place it in a public environment variable. Add only a placeholder to the appropriate example environment file.
7. Implement the requested capability end to end using documented Cencori patterns. Do not invent configuration fields or APIs.
8. Run the relevant formatter, type checks, and tests, then fix issues caused by the integration.
9. Summarize the files changed, commands run, setup required, how to exercise the feature, and how to verify its requests in Cencori Logs.`;

  const copyAgentPrompt = async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      setPromptCopied(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-[980px] px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:px-8 lg:pb-24 lg:pt-20">
      <header className="mb-6">
        <h1 className="text-[2rem] font-medium leading-none tracking-[-0.055em]">
          Quick start
        </h1>
        <p className="mt-3 max-w-[60ch] text-xs leading-5 text-muted-foreground">
          Choose your language and make your first request through Cencori.
        </p>
      </header>

      <div className="flex h-[30rem] flex-col overflow-hidden rounded-xl border border-border/60 bg-[#f3f3f1] shadow-[0_24px_80px_rgba(0,0,0,0.12)] dark:bg-[#111111]">
        <div className="flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border/50 bg-[#ededeb] p-1.5 dark:bg-[#0d0d0d]">
          <Select
            value={activeLanguage}
            onValueChange={(value) => setActiveLanguage(value as LanguageId)}
          >
            <SelectTrigger
              aria-label="Select quickstart language"
              aria-controls="quickstart-code"
              className="h-10 min-w-0 flex-1 rounded-md border-border/50 bg-transparent px-2.5 text-xs font-semibold shadow-none hover:bg-muted/50 focus-visible:border-zinc-500/60 focus-visible:ring-2 focus-visible:ring-zinc-500/20 sm:w-[13rem] sm:flex-none dark:focus-visible:ring-zinc-400/15 [&>svg]:ml-auto"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-[5px] border border-border/40 bg-muted/35">
                  <Image
                    src={active.logo}
                    alt=""
                    width={18}
                    height={18}
                    className={`size-[18px] object-contain ${active.logoClassName ?? ""}`}
                  />
                </span>
                <span className="truncate leading-none">{active.label}</span>
              </div>
            </SelectTrigger>
            <SelectContent
              align="start"
              className="min-w-[13rem] rounded-lg border-border/60 bg-popover/95 p-1 shadow-xl backdrop-blur-xl"
            >
              {LANGUAGES.map((language) => (
                <SelectItem
                  key={language.id}
                  value={language.id}
                  className="rounded-md py-2 ps-2.5 pe-9 text-xs font-medium [&>span:first-child]:start-auto! [&>span:first-child]:end-2.5!"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-[5px] border border-border/40 bg-muted/35">
                      <Image
                        src={language.logo}
                        alt=""
                        width={18}
                        height={18}
                        className={`size-[18px] object-contain ${language.logoClassName ?? ""}`}
                      />
                    </span>
                    <span>{language.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={activeModality}
            onValueChange={(value) => setActiveModality(value as ModalityId)}
          >
            <SelectTrigger
              aria-label="Select quickstart capability"
              aria-controls="quickstart-code"
              className="h-10 min-w-0 flex-1 rounded-md border-border/50 bg-transparent px-2.5 text-xs font-semibold shadow-none hover:bg-muted/50 focus-visible:border-zinc-500/60 focus-visible:ring-2 focus-visible:ring-zinc-500/20 sm:w-[10rem] sm:flex-none dark:focus-visible:ring-zinc-400/15 [&>svg]:ml-auto"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <ModalityIcon id={activeModalityOption.id} />
                <span className="truncate leading-none">
                  {activeModalityOption.label}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent
              align="end"
              className="min-w-[10rem] rounded-lg border-border/60 bg-popover/95 p-1 shadow-xl backdrop-blur-xl"
            >
              {MODALITIES.map((modality) => (
                <SelectItem
                  key={modality.id}
                  value={modality.id}
                  className="rounded-md py-2 ps-2.5 pe-9 text-xs font-medium [&>span:first-child]:start-auto! [&>span:first-child]:end-2.5!"
                >
                  <span className="flex items-center gap-2.5">
                    <ModalityIcon id={modality.id} />
                    <span>{modality.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-h-0 min-w-0 flex-1">
          <div
            id="quickstart-code"
            className="h-full min-w-0 bg-[#f3f3f1] dark:bg-[#111111]"
          >
            <CodeBlock
              key={`${active.id}-${activeModality}`}
              code={activeCode}
              language={active.language}
              className="h-full rounded-none border-0 bg-transparent [&>div]:h-full [&>div>div:first-child]:h-full [&>div>div:first-child]:overflow-auto [&_pre]:min-h-full [&_pre]:p-5! [&_pre]:text-[12px]! [&_pre]:leading-6! sm:[&_pre]:p-7! sm:[&_pre]:text-[13px]!"
            >
              <CodeBlockCopyButton className="rounded-md border border-border/50 bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground" />
            </CodeBlock>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-border/50 bg-[#ededeb] px-5 py-3 dark:bg-[#0d0d0d]">
          <Button
            type="button"
            onClick={() => setShowGenerateKeyDialog(true)}
            disabled={!projectId || projectLoading}
            aria-busy={projectLoading}
            className="h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90"
          >
            Create API key
          </Button>
          <Link
            href={activeModalityOption.docsHref}
            className="text-xs font-semibold text-foreground transition-colors hover:text-foreground/65 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Read the full guide <span aria-hidden="true">↗</span>
          </Link>
        </footer>
      </div>

      {projectId && (
        <GenerateKeyDialog
          projectId={projectId}
          open={showGenerateKeyDialog}
          onOpenChange={setShowGenerateKeyDialog}
          defaultKeyType="secret"
          onKeyGenerated={() => {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.apiKeys(projectId),
            });
          }}
        />
      )}

      <section className="mt-8" aria-label="Coding agent setup prompt">
        <div className="overflow-hidden rounded-lg border border-border/60 bg-[#f3f3f1] dark:bg-[#111111]">
          <div className="flex items-center justify-between gap-4 bg-[#ededeb] px-4 py-3 dark:bg-[#0d0d0d] sm:px-5">
            <div className="min-w-0">
              <p className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground">
                AGENT PROMPT
              </p>
              <p className="mt-1 truncate text-[11px] text-foreground/80">
                Adapts to your codebase and intended use case
              </p>
            </div>
            <button
              type="button"
              onClick={copyAgentPrompt}
              className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-border/50 bg-transparent px-3 text-[10px] font-medium text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-[0.98]"
              aria-label={promptCopied ? "Prompt copied" : "Copy agent prompt"}
            >
              <HugeiconsIcon
                icon={promptCopied ? Tick02Icon : Copy01Icon}
                size={13}
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <span aria-live="polite">{promptCopied ? "Copied" : "Copy prompt"}</span>
            </button>
          </div>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="project-usage-heading">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2
            id="project-usage-heading"
            className="text-sm font-medium tracking-[-0.02em]"
          >
            Usage
          </h2>
          <Select value={chartPeriod} onValueChange={setChartPeriod}>
            <SelectTrigger
              aria-label="Select usage period"
              className="h-8 w-[8.5rem] rounded-md border-border/45 bg-muted/20 px-3 text-[11px] shadow-none"
            >
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent align="end">
              {CHART_PERIODS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="text-xs"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {statsError && (
          <div className="mb-3 flex items-center justify-between gap-4 rounded-md border border-red-500/20 bg-red-500/[0.04] px-4 py-3 text-[11px]">
            <p className="text-red-600 dark:text-red-400">
              We couldn&apos;t refresh this project&apos;s usage.
            </p>
            <button
              type="button"
              onClick={() => void refetchStats()}
              className="shrink-0 font-medium underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              Try again
            </button>
          </div>
        )}

        <ProjectOverviewCharts
          stats={statsData?.stats ?? null}
          chartData={statsData?.chartData ?? []}
          period={chartPeriod}
          loading={projectLoading || (statsLoading && !statsData)}
        />
      </section>

      <section className="mt-8" aria-labelledby="project-monetization-heading">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2
            id="project-monetization-heading"
            className="text-sm font-medium tracking-[-0.02em]"
          >
            Monetization
          </h2>
          <Link
            href={`/${orgSlug}/${projectSlug}/monetization`}
            className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Open monetization <span aria-hidden="true">↗</span>
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl bg-[#f3f3f1] ring-1 ring-inset ring-black/[0.05] dark:bg-[#111111] dark:ring-white/[0.045]">
          {monetizationLoading ? (
            <div className="grid gap-px bg-border/40 p-px sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="bg-[#f3f3f1] p-5 dark:bg-[#111111]">
                  <Skeleton className="h-3 w-24 rounded-sm" />
                  <Skeleton className="mt-4 h-8 w-28 rounded-sm" />
                  <Skeleton className="mt-3 h-3 w-20 rounded-sm" />
                </div>
              ))}
            </div>
          ) : monetizationError ? (
            <div className="flex min-h-[12rem] flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-medium">Monetization is unavailable</p>
              <p className="mt-2 max-w-[42ch] text-[11px] leading-5 text-muted-foreground">
                Cencori couldn&apos;t load this project&apos;s billing state.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 h-7 px-3 text-[11px]"
                onClick={() => {
                  void refetchMonetizationConfig();
                  if (monetizationEnabled) void refetchMonetizationStats();
                }}
              >
                Try again
              </Button>
            </div>
          ) : !monetizationEnabled ? (
            <div className="flex min-h-[14rem] flex-col items-center justify-center px-6 text-center">
              <span className="rounded-md border border-border/45 bg-muted/40 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                Not enabled
              </span>
              <p className="mt-5 text-sm font-medium tracking-[-0.015em]">
                Turn AI usage into customer revenue
              </p>
              <p className="mt-2 max-w-[48ch] text-[11px] leading-5 text-muted-foreground">
                Meter customer usage, apply pricing and quotas, then invoice through Stripe or your existing billing system.
              </p>
              <Button
                asChild
                className="mt-5 h-7 rounded-md bg-foreground px-3 text-[11px] font-medium text-background hover:bg-foreground/90"
              >
                <Link href={`/${orgSlug}/${projectSlug}/monetization`}>
                  Configure monetization
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: "Customer revenue",
                    value: formatCurrency(monetizationStats?.customer_revenue_usd ?? 0),
                    detail: "Gross usage revenue",
                  },
                  {
                    label: "Provider cost",
                    value: formatCurrency(monetizationStats?.provider_cost_usd ?? 0),
                    detail: "Underlying AI spend",
                  },
                  {
                    label: "Margin",
                    value: formatCurrency(monetizationStats?.margin_usd ?? 0),
                    detail: `${monetizationMarginRate.toFixed(1)}% of revenue`,
                  },
                  {
                    label: "Active customers",
                    value: (monetizationStats?.active_end_users ?? 0).toLocaleString(),
                    detail: `${(monetizationStats?.total_end_users ?? 0).toLocaleString()} total customers`,
                  },
                ].map((metric) => (
                  <article
                    key={metric.label}
                    className="border-b border-black/[0.055] p-5 last:border-b-0 dark:border-white/[0.055] sm:[&:nth-child(odd)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0"
                  >
                    <p className="text-[10px] font-medium text-muted-foreground">
                      {metric.label}
                    </p>
                    <p className="mt-3 font-mono text-xl font-medium tracking-[-0.04em] tabular-nums">
                      {metric.value}
                    </p>
                    <p className="mt-2 text-[9px] text-muted-foreground">
                      {metric.detail}
                    </p>
                  </article>
                ))}
              </div>

              <dl className="grid border-t border-black/[0.055] text-[10px] dark:border-white/[0.055] sm:grid-cols-3">
                <div className="flex items-center justify-between gap-4 border-b border-black/[0.055] px-5 py-3 dark:border-white/[0.055] sm:border-b-0 sm:border-r">
                  <dt className="text-muted-foreground">Billing cycle</dt>
                  <dd className="font-medium capitalize">
                    {monetizationConfig?.billing_cycle ?? "monthly"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-black/[0.055] px-5 py-3 dark:border-white/[0.055] sm:border-b-0 sm:border-r">
                  <dt className="text-muted-foreground">Default markup</dt>
                  <dd className="font-mono font-medium tabular-nums">
                    {(monetizationConfig?.customer_markup_percentage ?? 0).toFixed(1)}%
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-5 py-3">
                  <dt className="text-muted-foreground">Default plan</dt>
                  <dd className="font-medium">
                    {monetizationConfig?.default_rate_plan_id ? "Assigned" : "Not assigned"}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>
      </section>
    </section>
  );
}
