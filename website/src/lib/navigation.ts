export type DocLink = {
  id: string;
  title: string;
  description: string;
};

export type DocSection = {
  title: string;
  links: readonly DocLink[];
};

export const REPOSITORY_URL = "https://github.com/aedneth/ebrain";
export const SOCIAL_LINKS = {
  github: REPOSITORY_URL,
  x: "https://x.com/aedneth",
  linkedin: "https://www.linkedin.com/in/eduardo-borjas/",
} as const;

export const DOC_SECTIONS: readonly DocSection[] = [
  {
    title: "Getting started",
    links: [
      { id: "getting-started/install", title: "Install", description: "Source install and prerequisites." },
      { id: "getting-started/quickstart", title: "Quick start", description: "Boot, verify, remember, and open the cockpit." },
      { id: "getting-started/onboarding", title: "Boot and onboarding", description: "Daemon lifecycle and adapter registration." },
      { id: "getting-started/first-memory", title: "First durable memory", description: "Write and retrieve one bounded learning." },
      { id: "getting-started/workspace-session", title: "First workspace and session", description: "Register a project and create a session." },
    ],
  },
  {
    title: "Launch and sessions",
    links: [
      { id: "launch/manual-launch", title: "Manual launch", description: "Start a known local agent in a workspace." },
      { id: "launch/guided-launch", title: "Guided launch", description: "Review task, target, profile, capability, and workspace." },
      { id: "launch/sessions", title: "Sessions", description: "Observe, attach, prompt, and stop tmux sessions safely." },
      { id: "concepts/workspaces-sessions", title: "Workspace model", description: "Validated identities and persistent process boundaries." },
    ],
  },
  {
    title: "Memory and workflows",
    links: [
      { id: "concepts/memory", title: "Memory layers", description: "Purpose-specific local and federated retrieval boundaries." },
      { id: "memory/context-packs", title: "Context packs", description: "Versioned, human-reviewed operating context." },
      { id: "memory/episodes", title: "Episodes", description: "Immutable scrubbed local recall." },
      { id: "memory/procedures-and-workflows", title: "Procedures and workflows", description: "Reusable process without inferred success." },
      { id: "concepts/procedures", title: "Procedure lifecycle", description: "Active, stale, archived, and reviewed states." },
    ],
  },
  {
    title: "Routing and costs",
    links: [
      { id: "routing/task-signals", title: "Task signals", description: "Explainable capability orientation, never model rankings." },
      { id: "routing/profiles-and-targets", title: "Profiles and targets", description: "User-owned choices and safe launch declarations." },
      { id: "guides/routing", title: "Routing guide", description: "Provider boundaries and launch flow." },
      { id: "concepts/costs", title: "Token telemetry", description: "Factual provider and token attribution." },
    ],
  },
  {
    title: "Architecture",
    links: [
      { id: "architecture/daemon-federation", title: "Daemon and federation", description: "Loopback MCP and one writer owner." },
      { id: "architecture/ckis", title: "eBrain and CKIS", description: "Optional knowledge infrastructure relationship." },
      { id: "architecture/adr-index", title: "Public decisions", description: "Supported architecture consequences." },
    ],
  },
  {
    title: "Guides",
    links: [
      { id: "guides/agents", title: "Supported agents", description: "Adapter and bridge integration boundary." },
      { id: "guides/privacy", title: "Privacy and isolation", description: "Sources, secret scrubbing, and local safety." },
      { id: "guides/migration", title: "Migration concepts", description: "Fixture-only recovery and future import boundary." },
      { id: "guides/troubleshooting", title: "Troubleshooting", description: "Daemon, memory, session, and cost checks." },
    ],
  },
  {
    title: "Reference",
    links: [
      { id: "reference/cli", title: "CLI reference", description: "Daily control, memory, sessions, and diagnostics." },
      { id: "reference/tui", title: "TUI reference", description: "Views, keyboard model, and compact layout." },
      { id: "reference/mcp", title: "MCP reference", description: "Bridge, daemon, and loopback boundary." },
      { id: "reference/configuration", title: "Configuration", description: "User-managed choices and strict stores." },
      { id: "reference/json-contracts", title: "JSON contracts", description: "Narrow summary and explicit retrieval surfaces." },
    ],
  },
  {
    title: "Release",
    links: [
      { id: "release/contributor-workflow", title: "Contributor workflow", description: "Spec-driven maker/checker delivery." },
      { id: "release/security-and-license", title: "Security and license", description: "Private disclosure and AGPL boundary." },
      { id: "release/open-source-readiness", title: "Open-source readiness", description: "Remaining public-release gates." },
      { id: "release/devpost-evidence", title: "Devpost evidence", description: "Evidence-backed demonstration boundary." },
    ],
  },
];

export const ORDERED_DOCS = DOC_SECTIONS.flatMap((section) => section.links);

export function docRoute(id: string): string {
  return `/docs/${id}/`;
}

export function docById(id: string): DocLink | undefined {
  return ORDERED_DOCS.find((doc) => doc.id === id);
}
