# KICKOFF PROMPT - Claude Code maker session

Paste this into a new Claude Code session opened in `/home/eduardo.borjas/eBrain`.

```text
You are Claude Code, taking the **maker** role for ebrain. Your task is to close
the F6 audit findings and open-source release blockers completely, without
self-approving the result. A separate Fable 5 agent must audit your final maker
commit before any gate is marked passed.

First load context in exactly this order:

cd /home/eduardo.borjas/eBrain
cat docs/HANDOFF.md
cat docs/HANDOFF-CLAUDE-F6-CORRECTIONS.md
cat docs/AUDIT-GPT-5.6-SOL-F6.md
cat docs/SPRINT-TUI.md
cat docs/SPRINT-ORCHESTRATION.md
cat docs/adr/ADR-005-user-governed-model-selection.md
sed -n '1,100p' CHANGELOG.md
ebrain daemon status
git status --short --branch

Then read `harness/core/NORMS.md`. Treat it as mandatory: never read or print
dotenv/credential files, never dump the environment, never expose tokens, use
specific `git add` paths only, and never touch the denied client repositories
`brisas-del-golfo` or `dekko`. Do not push, deploy, delete user data, run paid
provider requests, or auto-escalate to a frontier model. One heavy interactive
agent at a time on this 4 GB machine.

Your full implementation brief is `docs/HANDOFF-CLAUDE-F6-CORRECTIONS.md`. It
contains every finding (G56-F1 through G56-F8 and G56-R1/R2), the current dirty
WIP for the `ebrain q` structured MCP adapter, exact tests, release deliverables,
and the required commit sequence. Inspect the dirty worktree before changing it;
the WIP is untested and must either be completed with regressions or replaced
deliberately.

Execution rules:
1. Work spec-first: context -> plan -> one scoped implementation phase -> focused
   tests -> CHANGELOG -> descriptive commit. Do not use `git add -A`.
2. Keep token cost accounting factual only. Do not add subscription allocation,
   static undated pricing, benchmark-driven model rankings, or automatic routing.
3. Preserve the daemon Phase D baseline. Do not reveal OAuth, MCP tokens, PGLite
   locks or manual curl steps to end users.
4. Run both full suites before handoff:
   - `bun test ./cli/`
   - `bun test ./tui/test/`
   - zero-hex scans outside TUI theme files
   - daemon, bridge and doctor non-paid smokes
5. Update SPRINT/docs truthfully. Human acceptance remains unchecked until Eduardo
   actually performs it. Never write `[AUDIT_PASS]` yourself.
6. Add `docs/HANDOFF-BACK.md`, a newest-first CHANGELOG entry and durable,
   secret-free `ebrain remember` learnings before you stop.

After the final maker commit and all local checks, STOP making product edits and
**spawn one independent Fable 5 agent for audit**. Give Fable the final commit,
`docs/AUDIT-GPT-5.6-SOL-F6.md`, this handoff, and the final verification results.
Instruct Fable to independently reproduce the symlink isolation, launch exact
prompt delivery/workflow attribution, search selection and secret scrubbing,
source id/name/path isolation, profile provenance, English surface, pricing
semantics, installer, CI and public README checks. Fable must write
`docs/AUDIT-FABLE-F6-CORRECTIONS.md` with `[FABLE_AUDIT_PASS]` or evidence-backed
failures. Fable is a checker: it must not edit product code or accept your claims
without its own evidence.

Begin by reporting the context loaded, a concrete atomic plan, the current git
status, and whether the q-adapter WIP is safe to retain. Then implement all phases
autonomously.
```
