# eBrain — OpenAI Build Week (Devpost) Submission Copy

> Category: **Developer Tools** · Deadline: Tue Jul 21, 5:00 PM PT. Paste-ready, in form order. No emoji.
> **Formatting note:** every paragraph in the paste blocks is a single line on purpose — copy the whole
> block and paste; the field wraps it. Fields needing a value are marked **NEEDS INPUT**.

---

## 1 · Project overview

**Project name**
```
eBrain
```

**Elevator pitch** (the README's definitional line)
```
A local-first control plane for persistent agent memory, workspaces, and coding sessions.
```
*Alternate (outcome instead of category, still under 200):*
```
Give every coding agent one shared, permanent memory — and one cockpit for the work around it.
```

**Thumbnail:** 3:2, ≤5 MB (JPG/PNG). Use `ebrain-logo-3x2.jpg` (full wordmark on the dark brand background).

---

## 2 · Project details (public project page)

### Project Story — paste as Markdown into "About the project"

```markdown
## Inspiration

I run my whole company on AI, and along the way I noticed the same waste every single day: every coding agent I opened — Codex, Claude Code, Gemini, Cursor — started from zero. Same context re-explained, same decisions re-made, same "wait, why did we do it this way?" A week of hard-won reasoning evaporated the moment I closed the terminal.

The agents kept getting smarter. The memory around them stayed dumb. And it was per-tool: a decision I reached in one agent was invisible to the next.

So I built the missing layer — not another agent, but the control plane the agents plug into. One memory that outlives the session and is shared across every tool, plus one cockpit for the work that usually gets scattered across a dozen terminal tabs.

## What it does

eBrain is a local-first control plane for coding agents. It runs one authenticated MCP daemon on loopback and gives you:

- **Persistent, cross-agent memory.** A decision you record from Codex is retrievable from Claude Code. The memory belongs to you and your project, not to one vendor's session history.
- **Workspaces and sessions.** Validated project directories, persistent tmux-backed agent sessions, and one terminal cockpit — Home, Launch, Sessions, Workspaces, Memory, Routing, Doctor — instead of a wall of tabs.
- **User-owned routing.** You choose the model and the budget per task. eBrain shows the route it will take and the tokens the provider actually returned. No "this model is always best" theater.
- **Governed by default.** A fail-closed deny policy enforced identically in TypeScript and shell, a loopback-bound authenticated daemon, secret scrubbing, confirmation gates on destructive actions, and source isolation checked at boot. Federation is opt-in; a clean install works with local memory alone.

The whole thing installs from source and boots with one idempotent command. You never paste a token, hand-manage a writer lock, or wire an OAuth flow.

## How I built it

Runtime: Bun and TypeScript for the CLI and TUI, POSIX shell for the harness, MCP as the wire between agents and the daemon. It bridges the local agent CLIs you already use and speaks to a pinned, separately installed knowledge engine.

I split the work between two AI models by what each is best at. **Codex was the builder** — it wrote the harness, the CLI surface, the seven-view TUI, the daemon and MCP bridge, and the test suites, feature by feature, each behind its own contract. **GPT-5.6 was the reasoning partner** — the hard calls were worked through with it: the daemon and federation architecture, the security boundaries, the deny-policy grammar that has to mean the same thing in two languages, and the way memory stays governed instead of dumping every transcript into context.

## Challenges I ran into

The hard problems were the ones that make the product real, not a toy.

**One memory that is genuinely shared — across agents and across providers.** A decision recorded from Codex has to be retrievable from Claude Code without belonging to either vendor's session history. That meant one authenticated daemon owning the writer path and a bridge every agent speaks to, so the memory is one plane instead of N silos.

**Memory that stays governed.** The easy version dumps every transcript into context and calls it memory. eBrain records bounded, reviewable decisions and procedures and keeps episode bodies behind explicit retrieval, so recall is useful without turning your history into an uncontrolled prompt.

**Security as the default, not a setting.** A deny policy has to mean exactly the same thing whether the CLI reads it or the shell harness does, and it has to fail closed. Getting that grammar identical in two languages, plus loopback-only auth, secret scrubbing, and source isolation checked at boot, was the difference between a tool you can hand your machine and one you can't.

## Accomplishments that I'm proud of

- Memory that is genuinely cross-agent and cross-provider. A harness can't do that; it only sees itself.
- A security posture that is the default, not a setting: fail-closed isolation enforced identically in TypeScript and shell, verified at daemon boot.
- Onboarding that just works: one idempotent `ebrain up` — no token paste, no writer lock, no OAuth.
- Built solo, from San Salvador, and shipped as a real local-first control plane, not a demo.

## What I learned

Memory — not model intelligence — is the real bottleneck in agentic coding. The agents keep getting smarter; the layer around them stays dumb and per-tool. Building that layer taught me that the hard part isn't storing text, it's keeping it governed and shared: one plane every agent can reach, scoped and reviewable, that belongs to you and your project instead of to a vendor's session.

## What's next for eBrain

Distribution first — a one-command install so the onboarding matches the product. Then a substantially better routing layer with many more providers you can launch directly, more embedding choices, and reviewed workflow reuse — all without weakening the approval and isolation boundaries that make it safe to hand an agent your machine.
```

### Built with — tags (comma-separated, up to 25)
```
bun, typescript, posix-shell, mcp, model-context-protocol, tmux, pglite, node, cli, tui, astro, vercel, git, sqlite, openai-codex, gpt-5.6, agents, developer-tools, local-first, ai-agents
```

### "Try it out" links
```
https://ebrain.vercel.app
https://github.com/aedneth/ebrain
```

### Project Media
- Image gallery: `ebrain-logo-3x2.jpg` + 2–3 real TUI frames (memory, routing, doctor). JPG/PNG, 5 MB, 3:2.
- **Video demo link (REQUIRED):** YouTube URL once uploaded (public/unlisted). NEEDS INPUT.

---

## 3 · Additional info (for judges/organizers)

- **Submitter Type:** `Individual`
- **Country of Residence:** `El Salvador`
- **Category:** `Developer Tools`
- **URL to code repo (REQUIRED — highlight Codex & GPT-5.6):**
  ```
  https://github.com/aedneth/ebrain
  ```
  Repo is **private** → share with `testing@devpost.com` and `build-week-event@openai.com` (Settings → Collaborators) before submitting. The README's "How this was built with Codex and GPT-5.6" section documents the usage judges look for.
- **`/feedback` Codex Session ID (REQUIRED):** NEEDS INPUT — see `docs/codex-session-and-feedback.md`.
- **Link + instructions for judges to test** (paste block below):
```
Live docs and product site: https://ebrain.vercel.app

Local install (source), works on a fresh machine — arbitrary path, no env required:
  git clone https://github.com/aedneth/ebrain.git ebrain
  cd ebrain && bun install && ./scripts/install.sh --from-source
  ebrain up && ebrain doctor

Then run: ebrain remember "Review a DB migration before merge." and ebrain q "what must happen before a database migration merges?" to see cross-agent memory, or run bare ebrain for the terminal cockpit. Requirements: Bun, git, tmux, and at least one supported local agent CLI. No API key or credits are required to run the control plane itself.
```

### Plugin / dev-tool installation instructions (paste block below)
```
eBrain is a developer tool (a local control plane plus CLI and TUI). Supported platforms: Linux and macOS (POSIX shell and Bun; tmux for persistent sessions). Install from source, no build-from-scratch required by judges:

  git clone https://github.com/aedneth/ebrain.git ebrain
  cd ebrain && bun install && ./scripts/install.sh --from-source
  ebrain up && ebrain doctor

To test without any external account, run ebrain remember "..." then ebrain q "..." to exercise the full local memory plane offline. Run bare ebrain to open the seven-view cockpit. Bridging a live agent is one ebrain onboard <agent> away and needs only that agent's own CLI. CI is green from a clean checkout with no environment preset.
```

---

## 4 · Submit — final checklist

- [ ] Demo video public/unlisted on YouTube; link in the Video demo field.
- [ ] Voiceover covers what I built, how I used Codex, and how I used GPT-5.6 (the script does this).
- [ ] `/feedback` Codex Session ID retrieved and entered.
- [ ] Private repo shared with testing@devpost.com and build-week-event@openai.com.
- [ ] README has setup instructions and the "How this was built with Codex and GPT-5.6" section.
- [ ] Dev-tool install instructions + no-rebuild test path included (above).
- [ ] Category = Developer Tools. Country = El Salvador. Submitter = Individual.
- [ ] Submission shows **Submitted** (green) on My Projects — not a draft.
