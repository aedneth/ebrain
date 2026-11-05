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
      { id: "getting-started/quickstart", title: "Quick start", description: "Install from scratch, wire an agent, and what does not work yet." },
      { id: "getting-started/install", title: "Install", description: "Prerequisites and the installer." },
      { id: "getting-started/onboarding", title: "Boot and onboarding", description: "Daemon lifecycle and adapter registration." },
    ],
  },
  {
    title: "Memory and agents",
    links: [
      { id: "concepts/memory", title: "Memory", description: "What arrives with each prompt, what the index contains, and how learnings are written." },
      { id: "guides/agents", title: "Supported agents", description: "How each agent is wired, guarded and verified." },
      { id: "reference/prompt-context", title: "The context command", description: "The contract between an agent's prompt hook and your retrieval." },
    ],
  },
  {
    title: "Architecture and safety",
    links: [
      { id: "architecture/daemon-federation", title: "Daemon and federation", description: "Loopback MCP and one writer owner." },
      { id: "guides/privacy", title: "Privacy and isolation", description: "Sources, secret scrubbing, and local safety." },
      { id: "release/security-and-license", title: "Security and license", description: "Private disclosure and AGPL boundary." },
    ],
  },
  {
    title: "Reference",
    links: [
      { id: "reference/cli", title: "CLI reference", description: "The commands that are in the flow." },
      { id: "reference/diagnostics", title: "Diagnostics", description: "Health, daemon ownership, adapters, and recovery boundaries." },
      { id: "reference/mcp", title: "MCP reference", description: "Bridge, daemon, and loopback boundary." },
      { id: "reference/configuration", title: "Configuration", description: "User-managed choices and strict stores." },
    ],
  },
  {
    title: "Contributing",
    links: [
      { id: "release/contributor-workflow", title: "Contributor workflow", description: "Spec-driven delivery with independent review." },
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
