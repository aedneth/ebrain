/** Canonical ADR-005 tasks: capability coverage, never model recommendations. */
import type { Capability } from "./task-profile.ts";

export interface CanonicalTaskFixture {
  id: string;
  task: string;
  capability: Capability;
  /** Keywords that must remain explainable in the emitted signal. */
  matched: string[];
}

export const CANONICAL_TASKS: readonly CanonicalTaskFixture[] = [
  { id: "coding-regression", task: "Fix a TypeScript API bug, add regression tests, and refactor the parser.", capability: "coding", matched: ["bug", "refactor", "script", "typescript", "test", "api", "fix"] },
  { id: "agentic-workflow", task: "Orchestrate a multi-step agent workflow with a tool-call loop.", capability: "agentic", matched: ["agent", "tool-call", "multi-step", "orchestrate", "workflow", "loop"] },
  { id: "web-component", task: "Build a React frontend component with UI layout and Tailwind CSS.", capability: "web_design", matched: ["component", "ui", "tailwind", "css", "layout", "frontend", "react"] },
  { id: "long-repository", task: "Summarize a batch of whole repo transcripts and ingest the entire archive.", capability: "long_context", matched: ["summarize", "whole repo", "transcript", "entire", "ingest", "batch"] },
  { id: "terminal-pipeline", task: "Write a bash shell pipeline for this CLI command.", capability: "terminal", matched: ["bash", "shell", "command", "cli", "pipeline"] },
  { id: "general-explanation", task: "Explain the project goals in plain language.", capability: "general", matched: [] },
  { id: "web-refactor", task: "Refactor the CSS layout of this component.", capability: "web_design", matched: ["component", "css", "layout"] },
  { id: "agentic-research", task: "Create an autonomous agent that can scrape and crawl sites using a tool.", capability: "agentic", matched: ["agent", "autonomous", "scrape", "crawl"] },
  { id: "long-transcript", task: "Digest the entire long transcript and summarize it.", capability: "long_context", matched: ["summarize", "digest", "long", "transcript", "entire"] },
  { id: "coding-script", task: "Create a Python script with a regex to fix a function.", capability: "coding", matched: ["function", "script", "python", "regex", "fix"] },
];
