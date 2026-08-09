/**
 * The normalized model every adapter emits. Cencori's pipeline and dashboard
 * speak *this* — never per-framework internals. See COMPUTE_UNIVERSAL_DEPLOY.md §3.
 */

/** Which compatibility layer got us here (§1). */
export type Compatibility = 'native' | 'language' | 'http' | 'container' | 'contract';

/** Read-only, non-executing view of a repo at a ref+rootDir. Adapters detect
 *  from manifests/imports/files — they never run the code. */
export interface DetectionContext {
    rootDir: string;
    readFile(path: string): Promise<string | null>;
    exists(path: string): Promise<boolean>;
    list(dir?: string): Promise<string[]>;
    json<T = unknown>(path: string): Promise<T | null>;
}

/** An adapter's detection verdict. `confidence` 0 = no match. */
export interface DetectionResult {
    confidence: number;
    language?: string;
    framework?: string;
    frameworkVersion?: string;
    entrypoint?: string;
    evidence: string[];
}

export interface RuntimeSpec {
    baseImage: 'node' | 'python';
    languageVersion?: string; // "23" | "3.12"
    port: number;
    healthPath: string;
    memoryMb?: number;
}

// ── Normalized manifest — what the agent *is* ──────────────────────────────
export interface ToolSpec { name: string; description?: string }
export interface AgentNode { name: string; role?: 'root' | 'sub'; children?: string[] }
export interface ModelRef { id: string; viaGateway: boolean }
export interface MemorySpec { kind: 'none' | 'checkpoint' | 'session' | 'vector'; provider?: string }
export interface ChannelSpec { type: 'slack' | 'discord' | 'http'; name: string }
export interface ScheduleSpec { name: string; cron: string }

export interface AgentManifest {
    agents: AgentNode[];
    tools: ToolSpec[];
    models: ModelRef[];
    memory: MemorySpec;
    io?: { input?: unknown; output?: unknown };
    streaming: boolean;
    humanApprovals: boolean;
    channels: ChannelSpec[];
    schedules: ScheduleSpec[];
    requiredSecrets: string[];
    network?: { egressAllow?: string[] };
    session: 'stateless' | 'persistent';
    frameworkMeta?: Record<string, unknown>;
}

/** The output of the winning adapter — drives the build + the dashboard. */
export interface AgentBuildPlan {
    adapter: string;          // "@cencori/adapter-arcie"
    adapterVersion: string;
    compatibility: Compatibility;
    language: string;
    framework?: string;
    frameworkVersion?: string;
    rootDirectory: string;
    packageManager?: string;
    installCommand: string;
    buildCommand?: string;
    startCommand: string;
    entrypoint?: string;
    runtime: RuntimeSpec;
    manifest: AgentManifest;
    confidence: number;
    warnings?: string[];
}

/** A sensible empty manifest adapters spread over. */
export const EMPTY_MANIFEST: AgentManifest = {
    agents: [],
    tools: [],
    models: [],
    memory: { kind: 'none' },
    streaming: false,
    humanApprovals: false,
    channels: [],
    schedules: [],
    requiredSecrets: [],
    session: 'stateless',
};
