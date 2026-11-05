# Supported Agents

eBrain wires each agent through the mechanism that agent really reads, then checks it by asking the agent, not by looking for
a file. A hook file in the wrong place is worth nothing and looks exactly like a working one, so the doctor treats "the
agent will not see this" as a failure.

| Agent | Per-prompt context | Secret guard | MCP | How it was checked |
| --- | --- | --- | --- | --- |
| Codex | `UserPromptSubmit` hook | `PreToolUse` on `Bash`, the canonical guard | `ebrain onboard codex` | Wiring and guard self-test in a throwaway `HOME`; `codex features list` reports hooks enabled. Not run live: hooks need approving in `/hooks`. |
| Antigravity | `PreInvocation` hook, first model call of a request | `PreToolUse` on every tool, with file-tool translation | not wired | Wiring and guard self-test (shell read, file-tool read, login-file read) in a throwaway `HOME`. |
| Hermes | memory provider `ebrain`, `prefetch()` | `pre_tool_call` hook, with file-tool translation | not wired | Wiring in a throwaway `HOME`; `hermes hooks list` shows the guard; the provider's `prefetch()` returns a stub command's text. |
| Claude Code | owned by the project's own hooks | `PreToolUse` on `Bash` | `ebrain onboard claude` | Guard self-test; the context hook is not eBrain's. |
| Gemini CLI, Cursor, OpenCode, generic | declared in their manifests | see manifest | see manifest | **Not verified in this release.** The Gemini manifest still points at a hook file Gemini CLI may not read. |

```bash
ebrain harness install <agent>      # write hooks into the file the agent reads; add norms; print what is left to do
ebrain harness doctor <agent>       # verify: wiring, dead keys, stale files, guard self-test, the agent's own report
ebrain adapters list                # every manifest; ebrain adapters validate checks them against the schema
```

## The guard, and what it covers

One canonical guard (`harness/core/guard-secrets.sh`) denies a read of a dotenv file, key, credential or login file
(`auth.json`, `oauth_creds*`, `.credentials.json`) and a dump of the environment. It understands shell commands only.
Agents that also read files through their own tools (`view_file`, `read_file`, `grep_search`, `execute_code`) would
bypass it, so for Antigravity and Hermes each such call is translated into the shell read it performs and the canon is
asked. Writing a secret is not blocked: it does not send it to the model.

Some credentials are legitimately loaded at run time (`KEY="$(cat $TOOL_KEY_FILE)" command`), so they are **not** in
the shell canon. To deny them to the read tools of those agents, list a regex per line in
`$XDG_CONFIG_HOME/ebrain/guard-extra-paths`.

The guard fails open on an error of its own, because a broken guard must not stop legitimate work, and it says so on
stderr when its canon or Bun is missing.

## Writing into a config eBrain does not own

- **Additive.** Hooks that are not eBrain's are never touched, reordered or removed.
- **Idempotent.** A wrapper already referenced is recognised by its path in any spelling a shell accepts.
- **Reversible.** One pre-eBrain backup (`<file>.ebrain-backup`) is kept, the write is atomic, and a symlink is written
  through, not replaced.
- **Honest.** A config that cannot be parsed is reported, never rewritten. Hermes' YAML is appended to only when it has no
  `hooks:` key; otherwise the exact lines to add are printed and the check stays red.

## An adapter is one manifest

Each agent is declared in `harness/adapters/<agent>/manifest.yaml`, validated against a strict schema: where its hooks
live, which events it really fires (`runtime_events`), files an older install left where it never looks (`stale`), and what
you still have to do inside it (`trust`). Adding an agent is adding a manifest.

Read [the context command](../reference/prompt-context.md) for what the per-prompt hooks run, and the
[MCP reference](../reference/mcp.md) for the bridge.
