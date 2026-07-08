/**
 * NEXUS OS Brain Kernel  —  src/lib/nexus/brain.ts
 * ---------------------------------------------------------------------------
 * Seeded in-memory governance kernel for NEXUS OS v3.1. Produces realistic,
 * consistent data via a deterministic PRNG (FNV-1a -> mulberry32) seeded from
 * a fixed boot epoch. Data is generated ONCE per process (memoized) so it is
 * stable within a session; uptime grows naturally from BOOT_EPOCH.
 *
 * Pure TypeScript. No external packages. Imports shapes from @/lib/nexus/types.
 *
 * Exports (the /api/nexus/* routes are thin wrappers around these):
 *   getStatus, getAgents, getAgent, getVault, getGovernor, getSwarm,
 *   dispatchSwarm, probeProviders, getTokens, getModels, getRelay,
 *   getCompliance, getProposals, actProposal, getVap, verifyVap,
 *   getLogs, getTrust, getPorts, getCost, getDoctor, getScan, nexusDelay
 */

import type {
  Agent,
  ComplianceRule,
  GovernorDecision,
  LogEntry,
  ModelEntry,
  Pillar,
  PortEntry,
  Proposal,
  SwarmTask,
  SwarmWorker,
  VapEntry,
  VaultEntry,
  VaultTrack,
  WikiPage,
} from "@/lib/nexus/types";

// ---------------------------------------------------------------------------
// Boot epoch — fixed at module load. Uptime = now - BOOT_EPOCH grows naturally.
// Initial uptime: 3d 14h 27m (matches the NEXUS-INT-1 contract example).
// ---------------------------------------------------------------------------
const INITIAL_UPTIME_MS =
  3 * 86_400_000 + 14 * 3_600_000 + 27 * 60_000; // 3d 14h 27m
export const BOOT_EPOCH: number = Date.now() - INITIAL_UPTIME_MS;

export function uptimeString(): string {
  const ms = Date.now() - BOOT_EPOCH;
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return `${days}d ${hours}h ${mins}m`;
}

export async function nexusDelay(): Promise<void> {
  const ms = 80 + Math.floor(Math.random() * 121); // 80–200ms
  await new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Deterministic PRNG toolkit: FNV-1a hash -> mulberry32 stream.
// ---------------------------------------------------------------------------
function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rng {
  next: () => number;
  int: (lo: number, hi: number) => number;
  float: (lo: number, hi: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  bool: (p?: number) => boolean;
}

function makeRng(seedStr: string): Rng {
  const r = mulberry32(hashString(seedStr));
  const int = (lo: number, hi: number) =>
    Math.floor(lo + r() * (hi - lo + 1));
  const float = (lo: number, hi: number) => lo + r() * (hi - lo);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
  const bool = (p = 0.5) => r() < p;
  return { next: r, int, float, pick, bool };
}

function isoFromBoot(offsetMs: number): string {
  return new Date(BOOT_EPOCH + offsetMs).toISOString();
}

function isoFromNow(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function fakeHex(len: number, seed: string): string {
  const rng = makeRng(`hex-${seed}`);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += Math.floor(rng.next() * 16).toString(16);
  }
  return out;
}

// ===========================================================================
// AGENTS  (5 canonical NEXUS agents)
// ===========================================================================
interface AgentSeed {
  id: string;
  name: string;
  role: string;
  type: Agent["type"];
  status: Agent["status"];
  domain: Agent["domain"];
  trust: number;
  tokens: number;
  done: number;
  failed: number;
  activeOffsetMin: number;
}

const AGENT_SEEDS: AgentSeed[] = [
  {
    id: "ag-001",
    name: "foreman",
    role: "Coordinator / Dispatch",
    type: "coordinator",
    status: "busy",
    domain: "fast",
    trust: 0.95,
    tokens: 18450,
    done: 342,
    failed: 3,
    activeOffsetMin: 1,
  },
  {
    id: "ag-002",
    name: "research-agent",
    role: "Research Specialist",
    type: "specialist",
    status: "busy",
    domain: "research",
    trust: 0.88,
    tokens: 22100,
    done: 187,
    failed: 1,
    activeOffsetMin: 3,
  },
  {
    id: "ag-003",
    name: "code-agent",
    role: "Code Worker",
    type: "worker",
    status: "busy",
    domain: "code",
    trust: 0.91,
    tokens: 16800,
    done: 412,
    failed: 8,
    activeOffsetMin: 0,
  },
  {
    id: "ag-004",
    name: "analysis-agent",
    role: "Reasoning Specialist",
    type: "specialist",
    status: "idle",
    domain: "reason",
    trust: 0.82,
    tokens: 9870,
    done: 156,
    failed: 2,
    activeOffsetMin: 14,
  },
  {
    id: "ag-005",
    name: "governance-agent",
    role: "Security & Governance",
    type: "specialist",
    status: "busy",
    domain: "sec",
    trust: 0.93,
    tokens: 6230,
    done: 98,
    failed: 0,
    activeOffsetMin: 2,
  },
];

export function getAgents(): Agent[] {
  const base = AGENT_SEEDS.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    type: s.type,
    status: s.status,
    domain: s.domain,
    trustScore: _trustOverride.has(s.name) ? _trustOverride.get(s.name)! : s.trust,
    totalTokens: s.tokens,
    tasksDone: s.done,
    tasksFailed: s.failed,
    lastActive: isoFromNow(-s.activeOffsetMin * 60_000),
  }));
  return [...base, ..._spawnedAgents];
}

function findAgentSeed(name: string): AgentSeed | undefined {
  const n = name.toLowerCase();
  return AGENT_SEEDS.find((a) => a.name.toLowerCase() === n);
}

export function getAgent(name: string) {
  const seed = findAgentSeed(name);
  if (!seed) return null;
  const agent: Agent = {
    id: seed.id,
    name: seed.name,
    role: seed.role,
    type: seed.type,
    status: seed.status,
    domain: seed.domain,
    trustScore: seed.trust,
    totalTokens: seed.tokens,
    tasksDone: seed.done,
    tasksFailed: seed.failed,
    lastActive: isoFromNow(-seed.activeOffsetMin * 60_000),
  };
  const decisions = getGovernor().decisions
    .filter((d) => d.agent === seed.name)
    .slice(0, 5);
  const vaultEntries = memoVault()
    .filter((v) => v.agent === seed.name)
    .slice(0, 5);
  return { ...agent, decisions, vaultEntries };
}

// ===========================================================================
// VAULT  (~60 entries across 5 tracks)
// ===========================================================================
const VAULT_TRACKS: readonly VaultTrack[] = [
  "EVENT",
  "TRUST",
  "CAP",
  "FAIL",
  "GOV",
] as const;

const VAULT_KEYS: Record<VaultTrack, string[]> = {
  EVENT: [
    "task.completed",
    "task.dispatched",
    "proposal.submitted",
    "agent.booted",
    "session.opened",
    "model.swapped",
  ],
  TRUST: [
    "trust.delta",
    "cdr.advanced",
    "threshold.crossed",
    "trust.recover",
    "trust.bleed",
  ],
  CAP: [
    "cap.read",
    "cap.write",
    "cap.exec",
    "cap.grant",
    "cap.revoke",
  ],
  FAIL: [
    "fail.runtime",
    "fail.timeout",
    "fail.quota",
    "fail.circuit",
    "fail.exception",
  ],
  GOV: [
    "gov.allow",
    "gov.deny",
    "gov.hold",
    "gov.appeal",
    "gov.threshold",
  ],
};

const VAULT_TRACK_COUNTS: Record<VaultTrack, number> = {
  EVENT: 16,
  TRUST: 14,
  CAP: 12,
  FAIL: 8,
  GOV: 10,
};

function vaultValue(track: VaultTrack, key: string, rng: Rng): string {
  const a = rng.pick(AGENT_SEEDS).name;
  switch (track) {
    case "EVENT":
      return `${key} -> ${a} ok`;
    case "TRUST":
      return `${a} ${key} ${rng.float(-0.04, 0.06).toFixed(3)}`;
    case "CAP":
      return `${a} ${key} scope=${rng.pick([
        "SELF",
        "PROJECT",
        "CROSS",
      ])} ok`;
    case "FAIL":
      return `${a} ${key} ${rng.pick([
        "recovered",
        "retried",
        "circuit-open",
      ])}`;
    case "GOV":
      return `${a} ${key} trust=${rng.float(0.6, 0.95).toFixed(2)}`;
  }
}

let _vault: VaultEntry[] | null = null;
function memoVault(): VaultEntry[] {
  if (_vault) return _vault;
  const out: VaultEntry[] = [];
  let idc = 1;
  for (const track of VAULT_TRACKS) {
    const count = VAULT_TRACK_COUNTS[track];
    const rng = makeRng(`vault-${track}-${BOOT_EPOCH}`);
    for (let i = 0; i < count; i++) {
      const key = rng.pick(VAULT_KEYS[track]);
      const agent = rng.pick(AGENT_SEEDS).name;
      const score = Number(rng.float(0.4, 1.0).toFixed(3));
      const value = vaultValue(track, key, rng);
      const ts = isoFromBoot(rng.int(60_000, INITIAL_UPTIME_MS - 60_000));
      out.push({
        id: `ve-${String(idc).padStart(4, "0")}`,
        track,
        key,
        value,
        score,
        agent,
        ts,
      });
      idc++;
    }
  }
  out.sort((a, b) => b.ts.localeCompare(a.ts));
  _vault = out;
  return out;
}

export type VaultResponse =
  | { track: VaultTrack; total: number; entries: VaultEntry[] }
  | {
      track: null;
      total: number;
      summary: Record<string, number>;
      entries: VaultEntry[];
    };

export function getVault(track?: string): VaultResponse {
  const all = memoVault();
  if (track) {
    const t = track.toUpperCase() as VaultTrack;
    if ((VAULT_TRACKS as readonly string[]).includes(t)) {
      const entries = all.filter((e) => e.track === t);
      return { track: t, total: entries.length, entries };
    }
  }
  const summary: Record<string, number> = {};
  for (const t of VAULT_TRACKS) summary[t] = all.filter((e) => e.track === t).length;
  return {
    track: null,
    total: all.length,
    summary,
    entries: all.slice(0, 20),
  };
}

// ===========================================================================
// GOVERNOR  (Kaiju v2.4 engine)
// ===========================================================================
const GOV_ACTIONS = [
  "exec.shell",
  "write.file",
  "read.vault",
  "dispatch.swarm",
  "commit.git",
  "deploy.service",
  "research.web",
  "analyze.dataset",
  "sign.proposal",
  "grant.capability",
] as const;

const GOV_SCOPES = ["SELF", "PROJECT", "CROSS", "SYSTEM", "CRIT"] as const;
const GOV_IMPACTS = ["LOW", "MED", "HIGH", "CRIT"] as const;

const ALLOW_REASONS = [
  "trust {t} >= threshold {th}",
  "within scope SELF, proposal-bound pr-{pid}",
  "circuit healthy, capability cached",
  "VAP signed, provenance attached",
  "trust {t} above {scope} threshold {th}",
];
const DENY_REASONS = [
  "trust {t} below {scope} threshold {th}",
  "circuit breaker tripped on provider {prov}",
  "no proposal bound — proposal-required scope {scope}",
  "danger pattern match: {pat}",
];
const HOLD_REASONS = [
  "pending human review (scope {scope})",
  "awaiting VAP co-signature",
  "cross-project scope requires foreman approval",
  "trust {t} in review band, CDR stage {cdr}",
];

let _governor: {
  engine: string;
  decisions: GovernorDecision[];
  thresholds: { research: number; review: number; audit: number; impl: number };
  patterns: {
    id: string;
    name: string;
    severity: "LOW" | "MED" | "HIGH" | "CRIT";
    hits: number;
  }[];
  rate: { allow: number; deny: number; hold: number };
} | null = null;

function genGovernor() {
  const rng = makeRng(`governor-${BOOT_EPOCH}`);
  const thresholds = { research: 0.6, review: 0.7, audit: 0.8, impl: 0.75 };
  const decisions: GovernorDecision[] = [];
  // ~15 decisions, distribution ~96.9/2.6/0.5 -> ~14 ALLOW, 1 DENY, 0-1 HOLD
  const plan: GovernorDecision["decision"][] = [
    "ALLOW", "ALLOW", "ALLOW", "ALLOW", "ALLOW", "ALLOW", "ALLOW", "ALLOW",
    "ALLOW", "ALLOW", "ALLOW", "ALLOW", "DENY", "HOLD", "ALLOW",
  ];
  for (let i = 0; i < plan.length; i++) {
    const decision = plan[i];
    const agent = rng.pick(AGENT_SEEDS).name;
    const action = rng.pick(GOV_ACTIONS);
    const scope = rng.pick(GOV_SCOPES);
    const impact = rng.pick(GOV_IMPACTS);
    const seed = AGENT_SEEDS.find((a) => a.name === agent)!;
    const trustAtTime = Number(
      (seed.trust + rng.float(-0.05, 0.02)).toFixed(2),
    );
    let reason: string;
    if (decision === "ALLOW") {
      reason = rng
        .pick(ALLOW_REASONS)
        .replace("{t}", trustAtTime.toFixed(2))
        .replace("{th}", thresholds.impl.toFixed(2))
        .replace("{pid}", String(rng.int(100, 999)))
        .replace("{scope}", scope);
    } else if (decision === "DENY") {
      reason = rng
        .pick(DENY_REASONS)
        .replace("{t}", trustAtTime.toFixed(2))
        .replace("{th}", "0.90")
        .replace("{scope}", scope)
        .replace("{prov}", rng.pick(["groq", "openrouter", "fireworks"]))
        .replace("{pat}", rng.pick([
          "unauthorized_shell_exec",
          "cross_project_write",
          "trust_below_impl",
        ]));
    } else {
      reason = rng
        .pick(HOLD_REASONS)
        .replace("{scope}", scope)
        .replace("{t}", trustAtTime.toFixed(2))
        .replace("{cdr}", String(rng.int(2, 4)));
    }
    decisions.push({
      id: `gd-${String(i + 1).padStart(4, "0")}`,
      agent,
      action,
      scope,
      impact,
      decision,
      reason,
      trustAtTime,
      ts: isoFromBoot(rng.int(60_000, INITIAL_UPTIME_MS - 30_000)),
    });
  }
  decisions.sort((a, b) => b.ts.localeCompare(a.ts));

  const patterns = [
    { id: "dp-01", name: "unauthorized_shell_exec", severity: "CRIT" as const, hits: 2 },
    { id: "dp-02", name: "trust_below_impl_threshold", severity: "HIGH" as const, hits: 7 },
    { id: "dp-03", name: "cross_project_write", severity: "HIGH" as const, hits: 3 },
    { id: "dp-04", name: "circuit_breaker_trip", severity: "MED" as const, hits: 11 },
  ];

  return {
    engine: "Kaiju v2.4",
    decisions,
    thresholds,
    patterns,
    rate: { allow: 96.9, deny: 2.6, hold: 0.5 },
  };
}

export function getGovernor() {
  if (!_governor) _governor = genGovernor();
  return _governor;
}

// ===========================================================================
// SWARM  (foreman + workers + tasks; tasks are mutable for dispatch)
// ===========================================================================
const SWARM_WORKER_SEEDS: {
  id: string;
  name: string;
  status: SwarmWorker["status"];
  trust: number;
  tasksDone: number;
  currentTask: string | null;
}[] = [
  { id: "w-1", name: "worker-research-01", status: "busy", trust: 0.88, tasksDone: 142, currentTask: "swarm-1142" },
  { id: "w-2", name: "worker-code-01", status: "busy", trust: 0.91, tasksDone: 287, currentTask: "swarm-1143" },
  { id: "w-3", name: "worker-code-02", status: "offline", trust: 0.79, tasksDone: 198, currentTask: null },
  { id: "w-4", name: "worker-analysis-01", status: "idle", trust: 0.82, tasksDone: 96, currentTask: null },
  { id: "w-5", name: "worker-embed-01", status: "busy", trust: 0.86, tasksDone: 412, currentTask: "swarm-1144" },
  { id: "w-6", name: "worker-gov-01", status: "idle", trust: 0.93, tasksDone: 54, currentTask: null },
];

let _swarmTasks: SwarmTask[] | null = null;
function memoSwarmTasks(): SwarmTask[] {
  if (_swarmTasks) return _swarmTasks;
  const rng = makeRng(`swarm-tasks-${BOOT_EPOCH}`);
  const types: SwarmTask["type"][] = [
    "research", "code", "analysis", "governance", "chat", "embedding",
  ];
  const statuses: SwarmTask["status"][] = [
    "queued", "running", "completed", "completed", "completed", "failed",
    "completed", "running",
  ];
  const prios: SwarmTask["priority"][] = ["LOW", "MED", "HIGH", "CRIT"];
  const tasks: SwarmTask[] = [];
  for (let i = 0; i < 8; i++) {
    const status = statuses[i];
    tasks.push({
      id: `swarm-${1142 - i}`,
      type: rng.pick(types),
      status,
      priority: rng.pick(prios),
      assignedTo:
        status === "queued"
          ? null
          : rng.pick(SWARM_WORKER_SEEDS).name,
    });
  }
  _swarmTasks = tasks;
  return tasks;
}

export function getSwarm() {
  const tasks = memoSwarmTasks();
  const workers: SwarmWorker[] = SWARM_WORKER_SEEDS.map((w) => ({
    id: w.id,
    name: w.name,
    status: w.status,
    trust: w.trust,
    tasksDone: w.tasksDone,
    currentTask: w.currentTask,
  }));
  const stats = {
    queued: tasks.filter((t) => t.status === "queued").length,
    running: tasks.filter((t) => t.status === "running").length,
    completed: tasks.filter((t) => t.status === "completed").length,
    failed: tasks.filter((t) => t.status === "failed").length,
  };
  return { foreman: "foreman", workers, tasks, stats };
}

let _dispatchCounter = 1142;
export function dispatchSwarm(
  type: string,
  prompt: string,
): {
  ok: boolean;
  taskId: string;
  message: string;
  foreman: string;
  queued: number;
} {
  _dispatchCounter += 1;
  const id = `swarm-${_dispatchCounter}`;
  const validTypes: SwarmTask["type"][] = [
    "research", "code", "analysis", "governance", "chat", "embedding",
  ];
  const t = (validTypes as readonly string[]).includes(type)
    ? (type as SwarmTask["type"])
    : "research";
  const task: SwarmTask = {
    id,
    type: t,
    status: "queued",
    priority: "MED",
    assignedTo: null,
  };
  memoSwarmTasks().unshift(task);
  const queued = memoSwarmTasks().filter((x) => x.status === "queued").length;
  return {
    ok: true,
    taskId: id,
    message: `dispatched ${t} task -> queued (prompt: ${prompt.slice(0, 60)}${prompt.length > 60 ? "…" : ""})`,
    foreman: "foreman",
    queued,
  };
}

// ===========================================================================
// PROVIDER PROBE  (14 providers)
// ===========================================================================
const PROVIDERS = [
  "z-ai", "openrouter", "cerebras", "groq", "mistral", "codestral",
  "fireworks", "scaleway", "dashscope", "bitdeer", "nvidia", "sambanova",
  "siliconflow", "opencode",
] as const;

const PROVIDER_MODELS: Record<string, string> = {
  "z-ai": "GLM-5.2",
  openrouter: "claude-sonnet-4.5",
  cerebras: "llama-4-maverick",
  groq: "qwen3-235b",
  mistral: "mistral-large-2",
  codestral: "codestral-25",
  fireworks: "deepseek-v3",
  scaleway: "llama-3.3-70b",
  dashscope: "qwen3-coder",
  bitdeer: "deepseek-r1",
  nvidia: "nemotron-70b",
  sambanova: "qwen2.5-7b",
  siliconflow: "glm-4-flash",
  opencode: "opencode-7b",
};

export function probeProviders() {
  const rng = makeRng(`probe-${Date.now()}`);
  const results = PROVIDERS.map((p) => {
    // 12 live, 1 degraded, 1 offline
    const roll = rng.next();
    const status = roll < 0.86 ? "LIVE" : roll < 0.93 ? "DEGRADED" : "OFFLINE";
    const success = status !== "OFFLINE";
    const latencyMs =
      status === "LIVE"
        ? rng.int(80, 320)
        : status === "DEGRADED"
          ? rng.int(600, 1400)
          : 0;
    return {
      provider: p,
      model: PROVIDER_MODELS[p],
      status: status as "LIVE" | "DEGRADED" | "OFFLINE",
      latencyMs,
      success,
    };
  });
  return {
    probed: results.length,
    live: results.filter((r) => r.status === "LIVE").length,
    degraded: results.filter((r) => r.status === "DEGRADED").length,
    offline: results.filter((r) => r.status === "OFFLINE").length,
    results,
  };
}

// ===========================================================================
// TOKENS
// ===========================================================================
export function getTokens() {
  const total = 100000;
  const used = 73450;
  const remaining = total - used;
  const pct = 73.4; // matches NEXUS-INT-1 contract (73.45 rounds down to 73.4)
  const pools = {
    ECO: { cap: 40000, used: 28000 },
    FAST: { cap: 35000, used: 26000 },
    PREMIUM: { cap: 25000, used: 19450 },
  };
  const agentUsage = AGENT_SEEDS.map((s) => ({
    name: s.name,
    tokens: s.tokens,
  }));
  const burnRate = "2,340 tok/min";
  const burnPerMin = 2340;
  const minsLeft = remaining / burnPerMin;
  return {
    budget: { total, used, remaining, pct },
    pools,
    agentUsage,
    burnRate,
    projectedExhaustion: isoFromNow(minsLeft * 60_000),
  };
}

// ===========================================================================
// MODELS  (~18 models across 14 providers)
// ===========================================================================
const MODEL_SEED: {
  name: string;
  provider: string;
  tier: ModelEntry["tier"];
  domain: string;
  health: number;
  latencyMs: number;
  costPer1k: number;
  isFree: boolean;
  isActive: boolean;
  successRate: number;
  totalCalls: number;
}[] = [
  { name: "GLM-5.2", provider: "z-ai", tier: "reasoning", domain: "reason", health: 99, latencyMs: 420, costPer1k: 0.004, isFree: false, isActive: true, successRate: 98.7, totalCalls: 18420 },
  { name: "GLM-5.2-Air", provider: "z-ai", tier: "balanced", domain: "fast", health: 98, latencyMs: 280, costPer1k: 0.001, isFree: false, isActive: true, successRate: 97.9, totalCalls: 9120 },
  { name: "GLM-4.6", provider: "z-ai", tier: "fast", domain: "fast", health: 97, latencyMs: 180, costPer1k: 0.0006, isFree: false, isActive: true, successRate: 96.4, totalCalls: 6740 },
  { name: "claude-sonnet-4.5", provider: "openrouter", tier: "reasoning", domain: "reason", health: 95, latencyMs: 640, costPer1k: 0.012, isFree: false, isActive: true, successRate: 96.1, totalCalls: 4320 },
  { name: "gpt-5", provider: "openrouter", tier: "reasoning", domain: "reason", health: 94, latencyMs: 720, costPer1k: 0.015, isFree: false, isActive: true, successRate: 95.8, totalCalls: 2980 },
  { name: "gemini-2.5-pro", provider: "openrouter", tier: "reasoning", domain: "reason", health: 92, latencyMs: 580, costPer1k: 0.01, isFree: false, isActive: true, successRate: 94.3, totalCalls: 2110 },
  { name: "llama-4-maverick", provider: "cerebras", tier: "fast", domain: "fast", health: 96, latencyMs: 90, costPer1k: 0.0008, isFree: false, isActive: true, successRate: 95.2, totalCalls: 5430 },
  { name: "qwen3-235b", provider: "groq", tier: "fast", domain: "fast", health: 91, latencyMs: 110, costPer1k: 0.0007, isFree: true, isActive: true, successRate: 94.0, totalCalls: 3870 },
  { name: "mistral-large-2", provider: "mistral", tier: "balanced", domain: "reason", health: 93, latencyMs: 340, costPer1k: 0.005, isFree: false, isActive: true, successRate: 95.1, totalCalls: 1820 },
  { name: "codestral-25", provider: "codestral", tier: "balanced", domain: "code", health: 95, latencyMs: 260, costPer1k: 0.003, isFree: false, isActive: true, successRate: 96.8, totalCalls: 4290 },
  { name: "deepseek-v3", provider: "fireworks", tier: "balanced", domain: "code", health: 72, latencyMs: 880, costPer1k: 0.0014, isFree: false, isActive: true, successRate: 88.4, totalCalls: 1240 },
  { name: "llama-3.3-70b", provider: "scaleway", tier: "fast", domain: "fast", health: 88, latencyMs: 220, costPer1k: 0.0005, isFree: true, isActive: true, successRate: 92.7, totalCalls: 2610 },
  { name: "qwen3-coder", provider: "dashscope", tier: "balanced", domain: "code", health: 90, latencyMs: 310, costPer1k: 0.002, isFree: false, isActive: true, successRate: 93.5, totalCalls: 1980 },
  { name: "deepseek-r1", provider: "bitdeer", tier: "reasoning", domain: "reason", health: 68, latencyMs: 1240, costPer1k: 0.0022, isFree: false, isActive: false, successRate: 82.1, totalCalls: 540 },
  { name: "nemotron-70b", provider: "nvidia", tier: "fast", domain: "fast", health: 89, latencyMs: 160, costPer1k: 0.0009, isFree: false, isActive: true, successRate: 93.2, totalCalls: 1120 },
  { name: "qwen2.5-7b", provider: "sambanova", tier: "free", domain: "fast", health: 94, latencyMs: 130, costPer1k: 0, isFree: true, isActive: true, successRate: 94.6, totalCalls: 3340 },
  { name: "glm-4-flash", provider: "siliconflow", tier: "free", domain: "fast", health: 96, latencyMs: 200, costPer1k: 0, isFree: true, isActive: true, successRate: 96.0, totalCalls: 4180 },
  { name: "opencode-7b", provider: "opencode", tier: "free", domain: "code", health: 92, latencyMs: 240, costPer1k: 0, isFree: true, isActive: true, successRate: 93.9, totalCalls: 2270 },
];

export function getModels(filter?: {
  tier?: string;
  free?: boolean;
  healthy?: boolean;
}): { primary: string; models: ModelEntry[] } {
  let models = MODEL_SEED.slice();
  if (filter?.tier) {
    models = models.filter((m) => m.tier === filter.tier);
  }
  if (filter?.free === true) models = models.filter((m) => m.isFree);
  if (filter?.free === false) models = models.filter((m) => !m.isFree);
  if (filter?.healthy === true) models = models.filter((m) => m.health >= 85);
  if (filter?.healthy === false) models = models.filter((m) => m.health < 85);
  return {
    primary: "GLM-5.2",
    models: models.map((m) => ({ ...m })),
  };
}

// ===========================================================================
// RELAY
// ===========================================================================
export function getRelay() {
  return {
    gateway: "online",
    strategy: "quota_aware",
    totalRequests: 45230,
    successRate: 96.8,
    providers: 14,
    models: 18,
    healthy: 16,
    free: 6,
  };
}

// ===========================================================================
// COMPLIANCE
// ===========================================================================
export function getCompliance() {
  const rules: ComplianceRule[] = [
    { id: "CR-001", title: "No auto-commit without review", status: "PASS", violations: 0 },
    { id: "CR-002", title: "Proposal-bound actions", status: "PASS", violations: 0 },
    { id: "CR-003", title: "VAP signing on CRIT scope", status: "PASS", violations: 0 },
    { id: "CR-004", title: "Circuit breakers active", status: "WARN", violations: 2 },
    { id: "CR-005", title: "Trust thresholds enforced", status: "PASS", violations: 0 },
    { id: "CR-006", title: "Provenance tracking", status: "PASS", violations: 0 },
  ];
  return {
    rules,
    overall: "COMPLIANT" as const,
    score: 96,
  };
}

// ===========================================================================
// PROPOSALS  (mutable — actProposal changes status)
// ===========================================================================
let _proposals: Proposal[] | null = null;
function memoProposals(): Proposal[] {
  if (_proposals) return _proposals;
  const rng = makeRng(`proposals-${BOOT_EPOCH}`);
  const types = [
    "exec.shell",
    "write.file",
    "deploy.service",
    "research.web",
    "grant.capability",
    "commit.git",
    "analyze.dataset",
    "dispatch.swarm",
  ];
  const titles = [
    "Run pytest suite on engine module",
    "Patch governor threshold review band",
    "Deploy twave monitor v2.4.1",
    "Scrape arxiv for RLHF papers",
    "Grant code-agent CROSS write cap",
    "Commit vault hash-chain refactor",
    "Analyze token burn by provider",
    "Dispatch embedding sweep over vault",
  ];
  const riskLevels: Proposal["riskLevel"][] = ["LOW", "MED", "HIGH", "CRIT"];
  const statuses: Proposal["status"][] = [
    "pending", "pending", "pending", "approved", "approved",
    "approved", "rejected", "pending",
  ];
  const proposals: Proposal[] = [];
  for (let i = 0; i < 8; i++) {
    proposals.push({
      id: `pr-${String(1042 + i).padStart(4, "0")}`,
      agent: rng.pick(AGENT_SEEDS).name,
      type: types[i],
      title: titles[i],
      riskLevel: rng.pick(riskLevels),
      status: statuses[i],
      ts: isoFromBoot(rng.int(60_000, INITIAL_UPTIME_MS - 30_000)),
    });
  }
  _proposals = proposals;
  return proposals;
}

export function getProposals() {
  const proposals = memoProposals();
  return {
    total: proposals.length,
    pending: proposals.filter((p) => p.status === "pending").length,
    proposals: proposals.slice(),
  };
}

export function actProposal(
  action: "approve" | "reject",
  id: string,
): {
  ok: boolean;
  id: string;
  status: Proposal["status"];
  message: string;
} {
  const proposals = memoProposals();
  const p = proposals.find((x) => x.id === id);
  if (!p) {
    return { ok: false, id, status: "pending", message: "proposal not found" };
  }
  p.status = action === "approve" ? "approved" : "rejected";
  return {
    ok: true,
    id: p.id,
    status: p.status,
    message: `proposal ${p.id} ${p.status}`,
  };
}

// ===========================================================================
// VAP  (hash-linked chain)
// ===========================================================================
const ZERO_HASH = "0".repeat(64);

let _vap: VapEntry[] | null = null;
function memoVap(): VapEntry[] {
  if (_vap) return _vap;
  const rng = makeRng(`vap-${BOOT_EPOCH}`);
  const actors = AGENT_SEEDS.map((a) => a.name);
  const actions = [
    "proposal.signed",
    "gov.allow",
    "gov.deny",
    "vault.append",
    "cap.grant",
    "trust.commit",
    "circuit.reset",
    "model.swapped",
    "task.dispatched",
    "cdr.advanced",
    "circuit.verified",
    "boot.attested",
  ];
  const entries: VapEntry[] = [];
  let prevHash = ZERO_HASH;
  for (let i = 0; i < 12; i++) {
    const action = actions[i];
    const actor = rng.pick(actors);
    const ts = isoFromBoot(rng.int(60_000, INITIAL_UPTIME_MS - 30_000));
    const hash = fakeHex(64, `vap-${i}-${action}-${actor}-${ts}`);
    entries.push({
      id: `vap-${String(i + 1).padStart(3, "0")}`,
      hash,
      prevHash,
      action,
      actor,
      ts,
    });
    prevHash = hash;
  }
  _vap = entries;
  return entries;
}

export function getVap() {
  const entries = memoVap();
  return { entries, verified: true, length: entries.length };
}

export function verifyVap() {
  return { verified: true, brokenAt: null as string | null };
}

// ===========================================================================
// LOGS  (~40 entries)
// ===========================================================================
const LOG_SOURCES = [
  "governor", "vault", "swarm", "engine", "gmr", "monitor",
  "relay", "bridge", "config", "vap",
] as const;

function genLogMessage(source: string, rng: Rng): {
  level: LogEntry["level"];
  message: string;
} {
  const agent = rng.pick(AGENT_SEEDS).name;
  switch (source) {
    case "governor":
      return rng.bool(0.85)
        ? { level: "success", message: `ALLOW ${agent} ${rng.pick(GOV_ACTIONS)} (scope ${rng.pick(GOV_SCOPES)})` }
        : { level: "warn", message: `HOLD ${agent} ${rng.pick(GOV_ACTIONS)} pending review` };
    case "vault":
      return { level: "info", message: `append ${rng.pick(VAULT_TRACKS)} ve-${String(rng.int(1, 60)).padStart(4, "0")} <- ${agent}` };
    case "swarm":
      return rng.bool(0.7)
        ? { level: "info", message: `dispatch swarm-${rng.int(1100, 1144)} -> ${agent}` }
        : { level: "warn", message: `worker w-3 heartbeat lost (offline)` };
    case "engine":
      return { level: "info", message: `GMR cycle ${rng.int(4800, 4920)} complete, ${rng.int(2, 8)} prompts` };
    case "gmr":
      return { level: "debug", message: `context compaction saved ${rng.int(2, 6)}.${rng.int(0, 9)}k tokens` };
    case "monitor":
      return rng.bool(0.8)
        ? { level: "info", message: `relay ok ${rng.int(180, 320)}ms via ${rng.pick(PROVIDERS)}` }
        : { level: "error", message: `provider ${rng.pick(PROVIDERS)} timeout, circuit open` };
    case "relay":
      return { level: "info", message: `route -> ${rng.pick(PROVIDERS)} (${rng.pick(["GLM-5.2", "qwen3-235b", "codestral-25"])})` };
    case "bridge":
      return { level: "info", message: `ws upgrade /?XTransformPort=3003 ${agent}` };
    case "config":
      return { level: "debug", message: `reload thresholds research=${0.6} review=${0.7}` };
    case "vap":
      return { level: "success", message: `chain verified length=12 head=${fakeHex(8, `vap-head-${rng.int(0, 99)}`)}` };
  }
  return { level: "info", message: `${source} ok` };
}

let _logs: LogEntry[] | null = null;
function memoLogs(): LogEntry[] {
  if (_logs) return _logs;
  const rng = makeRng(`logs-${BOOT_EPOCH}`);
  const out: LogEntry[] = [];
  for (let i = 0; i < 40; i++) {
    const source = rng.pick(LOG_SOURCES);
    const { level, message } = genLogMessage(source, rng);
    out.push({
      ts: isoFromBoot(rng.int(60_000, INITIAL_UPTIME_MS - 30_000)),
      level,
      source,
      message,
    });
  }
  out.sort((a, b) => b.ts.localeCompare(a.ts));
  _logs = out;
  return out;
}

export function getLogs(limit = 50): LogEntry[] {
  return memoLogs().slice(0, limit);
}

/** Push a fresh log entry to the head of the logs (used by write-actions + live generator). */
export function pushLog(level: LogEntry["level"], source: string, message: string): void {
  memoLogs().unshift({ ts: new Date().toISOString(), level, source, message });
  // keep the log ring bounded
  if (memoLogs().length > 200) memoLogs().length = 200;
}

// ===========================================================================
// TRUST  (matrix + per-agent detail)
// ===========================================================================
type DangerLevel = "safe" | "watch" | "danger";

function dangerFor(trust: number): { cdrStage: number; danger: DangerLevel } {
  if (trust >= 0.9) return { cdrStage: 0, danger: "safe" };
  if (trust >= 0.85) return { cdrStage: 1, danger: "safe" };
  if (trust >= 0.8) return { cdrStage: 2, danger: "watch" };
  if (trust >= 0.7) return { cdrStage: 3, danger: "watch" };
  if (trust >= 0.6) return { cdrStage: 4, danger: "danger" };
  return { cdrStage: 5, danger: "danger" };
}

export type TrustResponse =
  | {
      agents: {
        name: string;
        trustScore: number;
        cdrStage: number;
        dangerLevel: DangerLevel;
      }[];
    }
  | {
      agent: string;
      trustScore: number;
      cdrStage: number;
      dangerLevel: DangerLevel;
      history: {
        ts: string;
        event: string;
        delta: number;
        source: string;
      }[];
    };

export function getTrust(agent?: string): TrustResponse {
  if (agent) {
    const seed = findAgentSeed(agent);
    if (!seed) {
      // fall through to matrix if unknown
    } else {
      const { cdrStage, danger } = dangerFor(seed.trust);
      const rng = makeRng(`trust-${seed.name}-${BOOT_EPOCH}`);
      const events = [
        "task.completed",
        "gov.allow",
        "trust.recover",
        "cdr.advanced",
        "fail.recovered",
        "proposal.signed",
      ];
      const history = Array.from({ length: 8 }, (_, i) => ({
        ts: isoFromBoot(rng.int(60_000, INITIAL_UPTIME_MS - 30_000) - i * 60_000),
        event: rng.pick(events),
        delta: Number(rng.float(-0.03, 0.05).toFixed(3)),
        source: rng.pick(["governor", "vault", "swarm"] as const),
      }));
      return {
        agent: seed.name,
        trustScore: seed.trust,
        cdrStage,
        dangerLevel: danger,
        history,
      };
    }
  }
  const agents = AGENT_SEEDS.map((s) => {
    const { cdrStage, danger } = dangerFor(s.trust);
    return {
      name: s.name,
      trustScore: s.trust,
      cdrStage,
      dangerLevel: danger,
    };
  });
  return { agents };
}

// ===========================================================================
// PORTS  (11 canonical NEXUS ports)
// ===========================================================================
export function getPorts(): PortEntry[] {
  return [
    { port: 3000, service: "Next.js HTTP", protocol: "HTTP", status: "LIVE" },
    { port: 7352, service: "Brain API", protocol: "HTTP", status: "LIVE" },
    { port: 7353, service: "TWAVE", protocol: "HTTP", status: "LIVE" },
    { port: 3003, service: "Swarm WS", protocol: "Socket.io", status: "LIVE" },
    { port: 11434, service: "Ollama", protocol: "HTTP", status: "OFFLINE" },
    { port: 8082, service: "free-claude", protocol: "HTTP", status: "LIVE" },
    { port: 7450, service: "hf-router", protocol: "HTTP", status: "LIVE" },
    { port: 6333, service: "mcp", protocol: "HTTP", status: "LIVE" },
    { port: 9000, service: "prometheus", protocol: "HTTP", status: "LIVE" },
    { port: 5432, service: "postgres", protocol: "TCP", status: "LIVE" },
    { port: 6379, service: "redis", protocol: "TCP", status: "OFFLINE" },
  ];
}

// ===========================================================================
// COST
// ===========================================================================
export function getCost() {
  const today = 4.82;
  const week = 31.4;
  const month = 128.55;
  const burnRate = "$0.16/min";
  const monthlyBudget = 200;
  const remaining = monthlyBudget - month;
  const minsLeft = remaining / 0.16;
  const byModel = [
    { name: "GLM-5.2", cost: 42.18, calls: 18420 },
    { name: "claude-sonnet-4.5", cost: 28.44, calls: 4320 },
    { name: "gpt-5", cost: 24.10, calls: 2980 },
    { name: "gemini-2.5-pro", cost: 12.66, calls: 2110 },
    { name: "mistral-large-2", cost: 8.91, calls: 1820 },
  ];
  const byAgent = [
    { name: "research-agent", cost: 38.22, tokens: 22100 },
    { name: "foreman", cost: 31.84, tokens: 18450 },
    { name: "code-agent", cost: 28.67, tokens: 16800 },
    { name: "analysis-agent", cost: 17.42, tokens: 9870 },
    { name: "governance-agent", cost: 12.40, tokens: 6230 },
  ];
  const insights = [
    "GLM-5.2 (z-ai) accounts for 32.8% of monthly spend — consider ECO pool routing for non-reasoning tasks.",
    "deepseek-r1 (bitdeer) is offline with 68% health; drain active traffic and re-probe before failover.",
    "PREMIUM pool at 77.8% used; projected exhaustion in 4.2h at current burn rate.",
  ];
  return {
    today,
    week,
    month,
    burnRate,
    projectedExhaustion: isoFromNow(minsLeft * 60_000),
    byModel,
    byAgent,
    insights,
  };
}

// ===========================================================================
// DOCTOR
// ===========================================================================
export function getDoctor() {
  const checks = [
    { name: "Brain API", status: "LIVE" as const, detail: "7352 reachable" },
    { name: "Database", status: "LIVE" as const, detail: "postgres 5432 ok" },
    { name: "Vault chain", status: "VERIFIED" as const, detail: "12/12 entries linked" },
    { name: "Swarm", status: "DEGRADED" as const, detail: "2 workers offline" },
    { name: "Token budget", status: "WARN" as const, detail: "73.4% used" },
    { name: "Governor", status: "LIVE" as const, detail: "Kaiju v2.4 cycling" },
    { name: "VAP ledger", status: "VERIFIED" as const, detail: "head hash intact" },
  ];
  const pythonModules = [
    { name: "fastapi", version: "0.115.6", status: "ok" as const },
    { name: "uvicorn", version: "0.34.0", status: "ok" as const },
    { name: "pydantic", version: "2.10.4", status: "ok" as const },
    { name: "sqlalchemy", version: "2.0.36", status: "ok" as const },
    { name: "redis", version: "5.2.1", status: "ok" as const },
    { name: "httpx", version: "0.28.1", status: "ok" as const },
    { name: "litellm", version: "1.55.10", status: "stale" as const },
    { name: "openai", version: "1.59.6", status: "ok" as const },
    { name: "anthropic", version: "0.42.0", status: "ok" as const },
    { name: "prometheus-client", version: "0.21.1", status: "ok" as const },
  ];
  return {
    checks,
    overall: "DEGRADED" as const,
    git: { branch: "main", commit: "a4f2c91" },
    pythonModules,
  };
}

// ===========================================================================
// SCAN  (security findings)
// ===========================================================================
export function getScan() {
  const findings = [
    { id: "SEC-001", severity: "CRIT" as const, title: "Ollama (11434) exposed without auth", status: "open" as const },
    { id: "SEC-002", severity: "HIGH" as const, title: "Redis (6379) bind 0.0.0.0 no password", status: "open" as const },
    { id: "SEC-003", severity: "MED" as const, title: "litellm module 1 major behind", status: "mitigated" as const },
    { id: "SEC-004", severity: "MED" as const, title: "Governor CR-004 circuit breakers warn (2)", status: "open" as const },
    { id: "SEC-005", severity: "LOW" as const, title: "CORS * on free-claude (8082)", status: "accepted" as const },
  ];
  return {
    findings,
    lastScan: isoFromNow(-3_600_000),
    total: findings.length,
    critical: findings.filter((f) => f.severity === "CRIT").length,
  };
}

// ===========================================================================
// STATUS  (top-level dashboard)
// ===========================================================================
export function getStatus() {
  const pillars: Pillar[] = [
    { name: "Bridge", health: 100, status: "OPERATIONAL" },
    { name: "Engine", health: 98, status: "OPERATIONAL" },
    { name: "Governor", health: 95, status: "OPERATIONAL" },
    { name: "Vault", health: 100, status: "OPERATIONAL" },
    { name: "GMR", health: 92, status: "OPERATIONAL" },
    { name: "Swarm", health: 88, status: "OPERATIONAL" },
    { name: "Monitor", health: 96, status: "OPERATIONAL" },
    { name: "Config", health: 100, status: "OPERATIONAL" },
  ];
  const ports = getPorts();
  return {
    version: "3.1",
    brain: "LIVE" as const,
    uptime: uptimeString(),
    pillars,
    agents: { total: 5, active: 4, idle: 1, error: 0 },
    tokens: { used: 73450, total: 100000, pct: 73.4 },
    models: { total: 18, free: 6, healthy: 16 },
    ports: { canonical: ports.length, live: ports.filter((p) => p.status === "LIVE").length },
    primaryModel: "GLM-5.2",
    bootTime: BOOT_EPOCH,
  };
}

// ===========================================================================
// WRITE ACTIONS  (mutate the in-memory brain — proposal-bound governance)
// ===========================================================================

// Mutable overlays
const _spawnedAgents: Agent[] = [];
const _trustOverride: Map<string, number> = new Map();

let _spawnCounter = 100;
let _proposalCounter = 100;

export function spawnAgent(
  name: string,
  type: "worker" | "coordinator" | "specialist",
  domain: "code" | "reason" | "research" | "fast" | "sec",
): { ok: boolean; agent: Agent; message: string } {
  _spawnCounter += 1;
  const agent: Agent = {
    id: `ag-${String(_spawnCounter).padStart(3, "0")}`,
    name,
    role: type === "coordinator" ? "Coordinator" : type === "specialist" ? `${domain} Specialist` : "Worker",
    type,
    status: "idle",
    domain,
    trustScore: 0.5,
    totalTokens: 0,
    tasksDone: 0,
    tasksFailed: 0,
    lastActive: isoFromNow(0),
  };
  _spawnedAgents.push(agent);
  // record a vault GOV entry + a governor decision
  memoVault().unshift({
    id: `ve-${String(_vaultId++).padStart(4, "0")}`,
    track: "GOV",
    key: "agent.spawn",
    value: `${name} spawned as ${type}/${domain}`,
    score: 0.5,
    agent: name,
    ts: isoFromNow(0),
  });
  pushLog("success", "swarm", `agent ${name} spawned (${type}/${domain})`);
  return { ok: true, agent, message: `agent ${name} spawned as ${type}/${domain} (trust 0.50, idle)` };
}

export function createProposal(
  type: string,
  title: string,
  riskLevel: Proposal["riskLevel"],
  agent = "nexus@os",
): { ok: boolean; proposal: Proposal; message: string } {
  _proposalCounter += 1;
  const p: Proposal = {
    id: `pr-${String(_proposalCounter).padStart(3, "0")}`,
    agent,
    type,
    title,
    riskLevel,
    status: "pending",
    ts: isoFromNow(0),
  };
  memoProposals().unshift(p);
  pushLog("info", "governance", `proposal ${p.id} created: ${title}`);
  return { ok: true, proposal: p, message: `proposal ${p.id} created (pending) — ${title}` };
}

export function appealDecision(
  decisionId: string,
  reason: string,
): { ok: boolean; decision: GovernorDecision | null; message: string } {
  const g = getGovernor();
  const orig = g.decisions.find((d) => d.id === decisionId);
  if (!orig) {
    return { ok: false, decision: null, message: `decision ${decisionId} not found` };
  }
  // push a new HOLD decision recording the appeal
  const appealed: GovernorDecision = {
    id: `gd-${String(Math.floor(Math.random() * 90000) + 10000)}`,
    agent: orig.agent,
    action: `appeal(${orig.action})`,
    scope: orig.scope,
    impact: orig.impact,
    decision: "HOLD",
    reason: `appeal of ${decisionId}: ${reason.slice(0, 80)}`,
    trustAtTime: orig.trustAtTime,
    ts: isoFromNow(0),
  };
  // mutate the cached governor if present
  if (_governor) {
    _governor.decisions = [appealed, ..._governor.decisions];
  }
  pushLog("warn", "governor", `appeal filed for ${decisionId}: ${reason.slice(0, 60)}`);
  return { ok: true, decision: appealed, message: `appeal filed for ${decisionId} — held pending review` };
}

export function updateTrust(
  agentName: string,
  delta: number,
): { ok: boolean; agent: string; newScore: number; message: string } {
  const seed = findAgentSeed(agentName);
  const spawned = _spawnedAgents.find((a) => a.name.toLowerCase() === agentName.toLowerCase());
  if (!seed && !spawned) {
    return { ok: false, agent: agentName, newScore: 0, message: `agent ${agentName} not found` };
  }
  const current = _trustOverride.has(agentName)
    ? _trustOverride.get(agentName)!
    : (seed?.trust ?? spawned?.trustScore ?? 0.5);
  const next = Number(Math.max(0, Math.min(1, current + delta)).toFixed(2));
  _trustOverride.set(agentName, next);
  if (spawned) spawned.trustScore = next;
  pushLog(
    delta >= 0 ? "success" : "warn",
    "trust",
    `trust ${agentName} ${current.toFixed(2)} → ${next.toFixed(2)} (${delta >= 0 ? "+" : ""}${delta})`,
  );
  return { ok: true, agent: agentName, newScore: next, message: `trust ${agentName} → ${next.toFixed(2)}` };
}

// ===========================================================================
// LIVE EVENT GENERATOR  (drives the `tail`/`top` live streams)
// ===========================================================================

let _vaultId = 9000;

const LIVE_TEMPLATES: { level: LogEntry["level"]; source: string; msg: () => string }[] = [
  { level: "info", source: "swarm", msg: () => `worker ${pick(["worker-research-01", "worker-code-01", "worker-analysis-02"])} picked up task swarm-${rand(1140, 1190)}` },
  { level: "success", source: "swarm", msg: () => `task swarm-${rand(1140, 1190)} completed in ${rand(120, 4800)}ms` },
  { level: "info", source: "governor", msg: () => `[ALLOW] ${pick(AGENT_SEEDS).name} → ${pick(GOV_ACTIONS)} (${pick(GOV_SCOPES)})` },
  { level: "warn", source: "ratelimit", msg: () => `provider ${pick(["groq", "fireworks", "openrouter"])} rate-limited (cooldown 30s)` },
  { level: "info", source: "vault", msg: () => `vault entry appended to ${pick(["EVENT", "TRUST", "CAP", "GOV"])} track` },
  { level: "info", source: "gmr", msg: () => `route rotated to ${pick(["GLM-5.2", "GLM-4.7-Flash", "Qwen3-4B"])} (tier ${pick(["fast", "balanced"])})` },
  { level: "success", source: "vap", msg: () => `VAP entry #${rand(880, 920)} attested (sha256:${randHash(8)})` },
  { level: "warn", source: "monitor", msg: () => `token burn rate spike: ${rand(2200, 3100)} tok/min` },
  { level: "info", source: "engine", msg: () => `hermes routed intent → ${pick(["research", "code", "analysis", "governance"])} lane` },
  { level: "error", source: "swarm", msg: () => `worker worker-code-02 heartbeat missed (offline)` },
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randHash(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += "0123456789abcdef"[rand(0, 15)];
  return s;
}

/** Generate one fresh log entry (used by the live stream). */
export function nextLogEntry(): LogEntry {
  const t = LIVE_TEMPLATES[rand(0, LIVE_TEMPLATES.length - 1)];
  return { ts: new Date().toISOString(), level: t.level, source: t.source, message: t.msg() };
}

/** Generate a fresh governor decision tick (occasionally). */
export function nextGovernorTick(): GovernorDecision | null {
  if (Math.random() > 0.35) return null;
  const decision: GovernorDecision["decision"] = Math.random() < 0.93 ? "ALLOW" : Math.random() < 0.5 ? "DENY" : "HOLD";
  const agent = pick(AGENT_SEEDS).name;
  const d: GovernorDecision = {
    id: `gd-${rand(10000, 99999)}`,
    agent,
    action: pick(GOV_ACTIONS),
    scope: pick(GOV_SCOPES),
    impact: pick(GOV_IMPACTS),
    decision,
    reason: decision === "ALLOW" ? "trust ok, within threshold" : decision === "DENY" ? "trust below threshold" : "pending review",
    trustAtTime: Number((0.5 + Math.random() * 0.45).toFixed(2)),
    ts: new Date().toISOString(),
  };
  if (_governor) _governor.decisions = [d, ..._governor.decisions].slice(0, 40);
  return d;
}

// ===========================================================================
// COMPACT LIVE CONTEXT  (fed to the LLM assistant)
// ===========================================================================
export function getRecentContext(): string {
  const s = getStatus();
  const agents = getAgents().map((a) => ({
    name: a.name, type: a.type, status: a.status, domain: a.domain,
    trust: a.trustScore, tokens: a.totalTokens, done: a.tasksDone, failed: a.tasksFailed,
  }));
  const g = getGovernor();
  const decisions = g.decisions.slice(0, 6).map((d) => ({
    id: d.id, agent: d.agent, decision: d.decision, action: d.action, scope: d.scope,
  }));
  const t = getTokens();
  const sw = getSwarm();
  const c = getCompliance();
  return JSON.stringify({
    version: s.version,
    brain: s.brain,
    uptime: s.uptime,
    primaryModel: s.primaryModel,
    pillars: s.pillars.map((p) => ({ name: p.name, health: p.health, status: p.status })),
    agents,
    tokens: { used: t.budget.used, total: t.budget.total, pct: t.budget.pct, burnRate: t.burnRate },
    governor: { engine: g.engine, rate: g.rate, thresholds: g.thresholds, recentDecisions: decisions },
    swarm: { workers: sw.workers.length, tasks: sw.tasks.length, stats: sw.stats },
    compliance: { overall: c.overall, score: c.score, rules: c.rules.map((r) => ({ id: r.id, status: r.status, violations: r.violations })) },
  }, null, 1);
}
export function getConstitution() {
  return {
    riskLadder: [
      { tier: 'M1', label: 'trivial', threshold: 'auto-allow', example: 'read-only fs ops' },
      { tier: 'M2', label: 'low', threshold: 'auto-allow + log', example: 'invoke free model' },
      { tier: 'M3', label: 'moderate', threshold: 'trust >= 0.6 + log', example: 'spawn worker' },
      { tier: 'M4', label: 'elevated', threshold: 'trust >= 0.7 + review', example: 'cross-domain call' },
      { tier: 'M5', label: 'high', threshold: 'trust >= 0.75 + audit', example: 'commit proposal' },
      { tier: 'M6', label: 'severe', threshold: 'trust >= 0.85 + governor', example: 'rollback vault' },
      { tier: 'M7', label: 'critical', threshold: 'hard DENY pending human', example: 'purge vault' },
    ],
    milestones: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'],
    classifiers: ['intent', 'capability', 'trust', 'quota', 'audit', 'scope'],
    prohibited: [
      'raw network egress outside relay',
      'vault purge without M7 sign-off',
      'trust promotion without audit',
      'cross-domain spawn below M4',
      'quota borrow across pools',
    ],
  }
}
export function getDrillScoreboard() {
  if (!_drillScores) {
    const r = makeRng('drill')
    const out: Record<string, { score: number; status: 'pass' | 'warn' | 'fail'; ranAt: string }> = {}
    for (const [id] of DRILLS) {
      const score = r.int(60, 99)
      out[id] = { score, status: score >= 85 ? 'pass' : score >= 70 ? 'warn' : 'fail', ranAt: ts(r, 4320) }
    }
    _drillScores = out
  }
  const drills = DRILLS.map(([id, name, category]) => ({ id, name, category, ..._drillScores[id] }))
  const lastRun = drills.map((d) => d.ranAt).sort().reverse()[0]
  return { drills, lastRun }
}
export function runDrill(id: string) {
  const scoreboard = getDrillScoreboard()
  const drill = scoreboard.drills.find((d) => d.id.toLowerCase() === id.toLowerCase())
  if (!drill) return { error: 'unknown drill: ' + id }
  const r = makeRng('drill-run:' + id + ':' + Date.now())
  const score = r.int(60, 99)
  const status: 'pass' | 'warn' | 'fail' = score >= 85 ? 'pass' : score >= 70 ? 'warn' : 'fail'
  return {
    drill,
    result: {
      score,
      status,
      durationMs: r.int(2000, 9000),
      steps: Array.from({ length: 5 }, (_, i) => ({
        step: i + 1,
        action: r.pick(['spawn probe', 'inject payload', 'observe governor', 'measure relay', 'check vault']),
        outcome: r.pick(['ok', 'ok', 'ok', 'warn'] as const),
      })),
      verdict: status === 'pass' ? 'defense held' : status === 'warn' ? 'defense wobbled' : 'defense broke',
    },
  }
}
export function getModalStatus() {
  const r = makeRng('modal')
  return {
    contract: {
      capPerCall: 500,
      capPerMinute: 8000,
      currency: 'tokens',
      enforceAt: 'relay',
    },
    ledger: Array.from({ length: 10 }, () => ({
      ts: ts(r, 60),
      caller: r.pick(getAgents()).name,
      model: r.pick(['GLM-5.2', 'GPT-5', 'Claude-Sonnet-4.5', 'DeepSeek-V3']),
      tokens: r.int(120, 480),
      cost: r.float(0.001, 0.02, 4),
      status: r.pick(['ok', 'ok', 'ok', 'held'] as const),
    })),
    spentThisMinute: r.int(2200, 7800),
    overrun: r.bool(0.15),
  }
}
export function getWeaver() {
  const r = makeRng('weaver')
  const lanes = [
    { name: 'foreman', domain: 'coord', activity: 'high', tasks: r.int(3, 8) },
    { name: 'w-alpha', domain: 'code', activity: 'high', tasks: r.int(2, 6) },
    { name: 'w-beta', domain: 'research', activity: 'med', tasks: r.int(1, 4) },
    { name: 'w-gamma', domain: 'analysis', activity: 'low', tasks: r.int(0, 2) },
    { name: 'w-delta', domain: 'code', activity: 'med', tasks: r.int(1, 4) },
    { name: 'w-epsilon', domain: 'review', activity: 'idle', tasks: 0 },
    { name: 'w-zeta', domain: 'deploy', activity: 'med', tasks: r.int(1, 3) },
  ]
  return { lanes, snapshot: '6 active lanes / 1 idle', updated: ts(r, 5) }
}
export function getWiki(q?: string, source?: 'vault' | 'governor' | 'swarm' | 'brain'): WikiPage[] {
  let pages: WikiPage[] = WIKI_PAGES.map(([id, title, category, summary, body]) => {
    const r = makeRng('wiki:' + id)
    return {
      id,
      title,
      category,
      summary,
      body,
      updated: ts(r, 10080),
      source: r.pick(['vault', 'governor', 'swarm', 'brain'] as const),
    }
  })
  if (source) pages = pages.filter((p) => p.source === source)
  if (q) {
    const needle = q.toLowerCase()
    pages = pages.filter(
      (p) =>
        p.title.toLowerCase().includes(needle) ||
        p.summary.toLowerCase().includes(needle) ||
        p.body.toLowerCase().includes(needle) ||
        p.id.includes(needle)
    )
  }
  return pages
}

// --- Constants for drill/wiki (merged from current) ---
const DRILLS: Array<[string, string, string]> = [
  ['DR-01', 'red-team: prompt injection', 'security'],
  ['DR-02', 'quota exhaustion', 'capacity'],
  ['DR-03', 'trust collapse cascade', 'governance'],
  ['DR-04', 'relay 503 storm', 'infra'],
  ['DR-05', 'vault hash tamper', 'governance'],
  ['DR-06', 'swarm partition', 'ops'],
  ['DR-07', 'modal overrun', 'cost'],
  ['DR-08', 'governor HOLD flood', 'governance'],
]

let _drillScores: Record<string, { score: number; status: 'pass' | 'warn' | 'fail'; ranAt: string }> | null = null

const WIKI_PAGES: Array<[string, string, string, string, string]> = [
  ['brain', 'The NEXUS Brain', 'core', 'In-memory governance singleton at port 7352.', 'The brain is the single source of truth. All commands resolve against it; all API routes proxy to it.'],
  ['governor', 'Governor Kaiju v2.4', 'governance', 'Decision engine that gates every agent action.', 'Kaiju reads the risk ladder, applies the matching threshold, and emits a verdict.'],
  ['vault', 'Vault Memory', 'governance', '5-track append-only memory.', 'EVENT, TRUST, CAP, FAIL, GOV. Each entry is hash-linked to the previous.'],
  ['swarm', 'Swarm Foreman', 'ops', 'Coordinates worker agents.', 'The foreman dispatches tasks, balances load, and reports up to the brain.'],
  ['relay', 'Model Relay', 'infra', 'quota_aware gateway to LLM providers.', 'Routes calls across 18 models, retrying 503s and failing over when a quota pool dries.'],
  ['tokens', 'Token Budget', 'infra', '100k tokens split across ECO/FAST/PREMIUM.', 'Each pool has independent quota. Burn rate is sampled every 60s.'],
  ['trust', 'Trust Matrix', 'governance', 'Per-agent trust score in [0,1].', 'Trust gates the risk ladder. It decays slowly and bumps on task success.'],
  ['compliance', 'Compliance Rules', 'governance', 'CR-001 through CR-006.', 'Each rule is checked continuously.'],
  ['proposals', 'Proposals', 'governance', 'On-chain changes to the system.', 'Proposals need quorum and pass through governor before execution.'],
  ['vap', 'VAP Chain', 'governance', 'Verifiable Action Pipeline.', 'Hash-linked audit trail. Tampering breaks the chain and trips CR-005.'],
  ['ports', 'Canonical Ports', 'infra', '11 reserved ports for NEXUS services.', 'Port registry is enforced by the bridge. Conflicts trip CR-004.'],
  ['weaver', 'Visual Weaver', 'visual', 'Governed image generation pipeline.', 'Pinned lanes for FLUX.2-klein-9B + ST3GG security scan.'],
  ['modal', 'MODAL Contract', 'cost', 'Bounded compute spend contract.', '$40 cap, scale-to-zero, per-run cost summary required.'],
  ['drill', 'DoppelGround Drills', 'security', '8 integrity drills (DR-01..DR-08).', 'Drills test prompt injection, quota exhaustion, trust collapse, and more.'],
]

// Helper: generate a timestamp from N minutes ago (for appended functions)
function ts(r: ReturnType<typeof makeRng>, minutesBack: number): string {
  return isoFromBoot(r.int(60_000, INITIAL_UPTIME_MS - minutesBack * 60_000))
}

// ===========================================================================
// AGENT-WRITTEN FILES  (shared between agent-exec route and terminal)
// ===========================================================================
const _agentFiles: Map<string, string> = new Map()

export function agentWriteFile(path: string, content: string): string {
  _agentFiles.set(path, content)
  return path
}

export function agentReadFile(path: string): string | null {
  return _agentFiles.get(path) ?? null
}

export function agentListFiles(): string[] {
  return Array.from(_agentFiles.keys())
}

export function getAgentFiles(): { path: string; content: string; size: number }[] {
  return Array.from(_agentFiles.entries()).map(([path, content]) => ({
    path,
    content,
    size: content.length,
  }))
}
