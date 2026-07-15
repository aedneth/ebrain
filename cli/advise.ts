#!/usr/bin/env bun
/** Compatibility alias for ADR-005. `ebrain task-profile` is the canonical command. */
export * from "./task-profile.ts";
import { runTaskProfileCli } from "./task-profile.ts";

if (import.meta.main) await runTaskProfileCli(process.argv.slice(2), "advise");
