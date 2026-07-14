/**
 * tui/src/sessions/tmux.ts — TUI control-plane wrapper over tmux (SPRINT-TUI 6.4.1).
 *
 * ADR-003 §2: tmux is the session DATA PLANE (sessions outlive the TUI and this
 * process); the TUI is only the CONTROL PLANE that drives it. This module deliberately
 * REUSES the backend already built and contract-tested in cli/sessions.ts (SPRINT-TUI
 * 6.1.6) — the typed tmux spawn, the secret scrubber, and list/new/peek/send/kill — so
 * there is ZERO orphan logic (F6.5 gate, criterion #2: every panel wires to a
 * contract-tested backend fn). It adds ONLY the introspection the Sessions panel (6.4.3)
 * and the attach handoff (6.4.4) need and that the CLI never did:
 *   - insideTmux():   are WE already inside a tmux client? → switch-client vs attach.
 *   - hasServer():    is a tmux server running at all? → distinguishes "nothing launched
 *                     yet" (empty-but-healthy panel) from a real tmux error.
 *   - attachTarget(): the exact tmux argv to hand off to for `a` attach, honoring nesting.
 *
 * SECURITY: every re-exported function keeps its cli/sessions.ts guarantee verbatim —
 * peek is ALWAYS scrubbed, send/kill ALWAYS require yes=true, new denies client repos.
 * This module adds no bypass and no new raw-pane exit path.
 */
export {
  listSessions,
  newSession,
  peekSession,
  sendToSession,
  killSession,
  resolveLaunch,
  scrubSecrets,
  sessionName,
  parseSessionName,
  isSafeToken,
  isClientPath,
  SESSION_PREFIX,
  DEFAULT_PEEK_LINES,
} from "../../../cli/sessions.ts";

export type {
  SessionRow,
  TmuxError,
  TmuxErrorType,
  Result,
  NewSessionInfo,
  NewSessionOpts,
  ManifestLaunch,
} from "../../../cli/sessions.ts";

// ── server / client introspection (new — the CLI never needed these) ────────

/** Are we already running inside a tmux client? Attaching cannot be NESTED (tmux
 * refuses `attach` from within a client) — so this decides attach vs switch-client
 * for the handoff (6.4.4). Pure over its `env` arg so it's testable without a TTY. */
export function insideTmux(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.TMUX === "string" && env.TMUX.length > 0;
}

async function tmuxProbe(
  args: string[],
): Promise<{ code: number; stderr: string } | { spawnError: string }> {
  try {
    const proc = Bun.spawn(["tmux", ...args], { stdout: "ignore", stderr: "pipe" });
    const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    return { code, stderr };
  } catch (e) {
    return { spawnError: String((e as Error)?.message ?? e) };
  }
}

export type ServerState = "up" | "no-server" | "tmux-not-installed";

/** Is a tmux server running? An empty Sessions panel with `no-server` means "nothing
 * launched yet, offer launch"; `tmux-not-installed` is a hard environment problem; a
 * live server is `up`. Never throws. */
export async function hasServer(): Promise<ServerState> {
  const r = await tmuxProbe(["list-sessions"]);
  if ("spawnError" in r) return "tmux-not-installed";
  if (r.code === 0) return "up";
  const s = r.stderr.toLowerCase();
  if (s.includes("no server running") || s.includes("failed to connect to server")) {
    return "no-server";
  }
  // Any other nonzero (server up but odd) — treat as up so a live server is never hidden.
  return "up";
}

export interface AttachTarget {
  verb: "attach-session" | "switch-client";
  /** Exact tmux argv to spawn (with inherited stdio) after suspending the alt-screen. */
  args: string[];
}

/** The exact tmux argv to hand off to when attaching to `name`. Inside tmux you CANNOT
 * nest `attach-session` — you must `switch-client`; outside tmux, attach normally. */
export function attachTarget(name: string, env: NodeJS.ProcessEnv = process.env): AttachTarget {
  return insideTmux(env)
    ? { verb: "switch-client", args: ["switch-client", "-t", name] }
    : { verb: "attach-session", args: ["attach-session", "-t", name] };
}
