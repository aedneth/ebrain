---
type: study
project: ebrain
subject: earendil-works/pi (pi.dev)
status: input for v2 routing + website onboarding
created: 2026-07-21
author: Opus (orchestrator)
---

# Study — what to take from pi, and where eBrain already leads

Verified facts, not impressions: `earendil-works/pi`, **74,143 stars**, 9,133 forks, MIT, TypeScript,
created 2025-08-09, pushed today. A monorepo of five packages — `ai` (27k LOC), `agent` (8.5k),
`tui` (12.8k), `coding-agent` (72.6k), `orchestrator` (2k).

**Category first, because it changes every conclusion below.** pi *is* a coding agent — it competes
with Claude Code. eBrain is a control plane *around* agents: it gives Claude Code, Codex, Gemini and
Cursor one shared memory and one session cockpit. They are not the same product, and the honest
consequence is that **pi is a candidate eBrain adapter, not a rival.** A harness with 74k stars of
distribution is a supported-agent target.

━━━

## 1. Provider architecture — the single most valuable thing to copy

This is the answer to the v2 priority (more providers, launch a Chinese model directly). pi supports
**37 providers**, and adding one costs **15 lines**:

```ts
// packages/ai/src/providers/moonshotai.ts — the entire file
export function moonshotaiProvider(): Provider<"openai-completions"> {
  return createProvider({
    id: "moonshotai",
    name: "Moonshot AI",
    baseUrl: "https://api.moonshot.ai/v1",
    auth: { apiKey: envApiKeyAuth("Moonshot AI API key", ["MOONSHOT_API_KEY"]) },
    models: Object.values(MOONSHOTAI_MODELS),
    api: openAICompletionsApi(),
  });
}
```

Three decisions make that possible, and each is portable to eBrain:

1. **The wire protocol is factored out from the vendor.** `openAICompletionsApi()` is shared by every
   OpenAI-compatible provider — which is most of them. A new vendor declares *which shape it speaks*,
   not how to speak it.
2. **The model catalog is data, generated, not hand-maintained.** `models.generated.ts` plus a
   `build:offline` path for no-network builds. Model lists rot; hand-editing them guarantees drift.
3. **Auth is a helper, not bespoke code per provider.** `envApiKeyAuth(...)` names the env vars.

**Chinese coverage is first-class and instructive.** `moonshotai` *and* `moonshotai-cn`,
`kimi-coding`, `deepseek`, `minimax` + `minimax-cn`, `qwen-token-plan` + `-cn`, `zai` +
`zai-coding-cn`, `ant-ling`, and `xiaomi` split three ways (`-ams`, `-cn`, `-sgp`). Two patterns
worth stealing outright:

- **The `-cn` split.** Chinese vendors run separate domestic and international endpoints with
  different base URLs and keys. Modeling them as one provider with a region flag would be wrong.
- **`token-plan` variants.** Subscription/plan auth is a *different provider entry* from API-key
  auth for the same vendor. eBrain's routing currently assumes one auth mode per target.

## 2. Distribution — where the friction actually is

pi installs with `curl -fsSL https://pi.dev/install.sh | sh`, or npm/pnpm/bun, shown as tabs with a
copy button **above the fold**. eBrain requires: clone the repo, `bun install`, run
`./scripts/install.sh --from-source`, then `ebrain up`. Four steps, a prerequisite runtime, and — as
three audit passes established — a sequence that broke twice.

This is the friction, and it is not a UI problem. It is a **packaging** problem. Until eBrain is
installable without cloning a repository, the onboarding page cannot look like pi's.

## 3. Supply-chain hardening — adopt this immediately, it is nearly free

pi treats dependency changes as reviewed code changes: direct deps pinned exact, `.npmrc` with
`save-exact=true` and **`min-release-age=2`** (refuses same-day dependency releases — a real defense
against a compromised publish), lockfile as ground truth with a pre-commit block, and a generated
`npm-shrinkwrap.json` so npm consumers get pinned transitives.

eBrain pins the gbrain commit and installs it `--ignore-scripts`, but **has no `.npmrc`** — the local
git hook has been printing that warning on every commit this session.

## 4. Landing page — two sections worth copying by name

- **"Primitives, not features"** and **"What we didn't build."** An explicit anti-feature section
  that states what the project refuses to do. It reads as confidence and it pre-empts the "does it
  do X?" issue flood. eBrain already *has* this material — the boundary column in every README table,
  the claim audit, the security boundaries — but it is buried in documentation instead of being the
  landing page's argument.
- **One animated demo per capability**, not one hero video: website manipulation, mid-session model
  switching, session branching, extension install. Each is small, silent, loopable, and shows a
  single idea. That is the format for the eBrain site, and it is cheaper to produce than one
  polished minute.

Also worth noting: the hero is *"There are many agent harnesses — but this one is yours."* It
acknowledges a crowded field and names nobody. That is exactly the positioning rule already in force
here.

━━━

## Where eBrain is genuinely ahead

Not consolation prizes — these are things pi explicitly does not do.

1. **Security posture.** pi's README states it plainly: *"Pi does not include a built-in permission
   system for restricting filesystem, process, network, or credential access. By default, it runs
   with the permissions of the user and process that launched it."* Their answer is "containerize
   it." eBrain ships a fail-closed deny policy enforced identically in TypeScript and shell, a
   loopback-bound authenticated daemon, secret scrubbing on session peek, confirmation gates on
   destructive actions, and source isolation verified at daemon boot. That gap is the whole reason
   the last four audits existed.

2. **Memory that outlives one agent.** pi has tree-structured, shareable session history — excellent,
   and scoped to pi. eBrain's memory is *cross-agent and cross-provider*: a decision recorded from
   Claude Code is retrievable from Codex. A harness cannot offer that, because it only sees itself.

3. **Multi-agent, multi-workspace orchestration.** eBrain runs several different agents in different
   validated project directories with persistent tmux sessions. pi is one agent in one session tree.

4. **Verification culture.** Four independent read-only audit passes, every fix carrying a test
   proven to fail against the pre-fix code, and a published claim audit. pi's contribution model
   auto-closes new contributors' issues and PRs by default — a scale mechanism, not a correctness
   one.

## What this implies for the next cycles

| Priority | Work | Why |
| --- | --- | --- |
| 1 | Refactor routing to pi's provider shape: wire-protocol modules, declarative 15-line adapters, generated model catalog | Directly unblocks "add every Chinese provider"; today each one is bespoke |
| 2 | Model the `-cn` regional split and `token-plan` auth as separate provider entries | Otherwise Kimi/Qwen/Xiaomi cannot be represented correctly at all |
| 3 | Solve packaging before redesigning the landing page | The install command is the onboarding; a prettier page in front of a four-step clone changes nothing |
| 4 | Add `.npmrc` (`save-exact`, `min-release-age`), pin direct deps | Cheap, and the repo is already asking for it on every commit |
| 5 | Landing page: install above the fold, one small looping demo per capability, and a "What we didn't build" section | The boundary material already exists — move it to the front |
| 6 | Evaluate pi as a supported eBrain adapter | 74k stars of distribution, and it is a harness eBrain can federate rather than fight |
