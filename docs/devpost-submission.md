# eBrain — OpenAI Build Week (Devpost) Submission Copy

> Category: **Developer Tools** · Deadline: Tue Jul 21, 5:00 PM PT. Paste-ready, in form order:
> Project overview → Project details → Additional info → Submit. No emoji. Product-description
> register matches the README; the story is the author's voice. Fields needing a value are marked
> **NEEDS INPUT**.

---

## 1 · Project overview

**Project name**
```
eBrain
```

**Elevator pitch** (the README's definitional line; ~88 chars)
```
A local-first control plane for persistent agent memory, workspaces, and coding sessions.
```
*Alternate (outcome instead of category, still under 200):*
```
Give every coding agent one shared, permanent memory — and one cockpit for the work around it.
```

**Thumbnail:** 3:2, ≤5 MB (JPG/PNG). Use `ebrain-logo-3x2.jpg` (eBrain wordmark on the dark brand
background, full logo visible).

---

## 2 · Project details (public project page)

### Project Story — paste as Markdown into "About the project"

```markdown
## Inspiration

I run my whole company on AI. Along the way I noticed the same waste, every single day: every
coding agent I opened — Codex, Claude Code, Gemini, Cursor — started from zero. Same context
re-explained. Same decisions re-made. Same "wait, why did we do it this way?" A week of hard-won
reasoning evaporated the moment I closed the terminal.

The agents kept getting smarter. The memory around them stayed dumb. And it was per-tool: a
decision I reached in one agent was invisible to the next.

So I built the missing layer. Not another agent — the control plane the agents plug into. One
memory that outlives the session and is shared across every tool, plus one cockpit for the work
that usually gets scattered across a dozen terminal tabs.

## What it does

eBrain is a local-first control plane for coding agents. It runs one authenticated MCP daemon on
loopback and gives you:

- **Persistent, cross-agent memory.** A decision you record from Codex is retrievable from Claude
  Code. The memory belongs to you and your project, not to one vendor's session history.
- **Workspaces and sessions.** Validated project directories, persistent tmux-backed agent
  sessions, and one terminal cockpit — Home, Launch, Sessions, Workspaces, Memory, Routing,
  Doctor — instead of a wall of tabs.
- **User-owned routing.** You choose the model and the budget per task. eBrain shows the route it
  will take and the tokens the provider actually returned. No "this model is always best" theater.
- **Governed by default.** A fail-closed deny policy enforced identically in TypeScript and shell,
  a loopback-bound authenticated daemon, secret scrubbing, confirmation gates on destructive
  actions, and source isolation checked at boot. Federation is opt-in; a clean install works with
  local memory alone.

The whole thing installs from source and boots with one idempotent command. You never paste a
token, hand-manage a writer lock, or wire an OAuth flow.

## How I built it

Runtime: Bun and TypeScript for the CLI and TUI, POSIX shell for the harness, MCP as the wire
between agents and the daemon. It bridges the local agent CLIs you already use and speaks to a
pinned, separately installed knowledge engine.

I built it with a strict maker-and-checker pipeline, and both roles were AI:

- **Codex was the builder.** It wrote the harness, the CLI surface, the seven-view TUI, the daemon
  and MCP bridge, and the test suites — feature by feature, each behind its own contract.
- **GPT-5.6 did the heavy reasoning.** The hard calls — the daemon and federation architecture, the
  security boundaries, the deny-policy grammar that has to mean the same thing in two languages,
  the way memory stays governed instead of dumping every transcript into context — were reasoned
  through with GPT-5.6 before a line was written, then used again to pressure-test what came back.

Nothing high-risk merged on one pass. The builder's work was independently audited before it
shipped.

## Challenges I ran into

The honest one: it worked on my machine.

The logic was right and the delivery was broken — over and over. The published quickstart failed at
step four. The install script wasn't executable when checked out fresh. The tool resolved its own
location correctly in shell and then handed the wrong path to the process that actually registers
every agent's connection. Twenty-six places hardcoded a home directory that only existed on my
laptop. Under a container's default locale, listing your own sessions returned garbage.

None of it showed up while I tested in the one environment where eBrain already worked — mine. So I
made "not my machine" the acceptance bar: an arbitrary checkout path, a foreign home directory, no
environment set, the C locale a container ships with. Six independent audit passes later, the thing
installs and runs where a stranger runs it, not just where I built it. That fight — making it real
for someone else — was most of the work, and it is the part I am proudest of.

## Accomplishments that I'm proud of

- Memory that is genuinely cross-agent and cross-provider. A harness can't do that; it only sees
  itself.
- A security posture that is the default, not a setting: fail-closed isolation enforced in both
  languages, verified at daemon boot.
- A verification culture I can point to — every fix carries a test proven to fail against the code
  before it, and the false starts are documented instead of hidden.
- Built and hardened solo, from San Salvador, to a bar where it runs on a machine that isn't mine.

## What I learned

"It works" and "I verified it works" are not the same sentence, and the gap between them is where
real software lives. A test that checks a copy of the artifact can't catch a broken delivery. A
green suite on the author's machine is not evidence of portability. The discipline that actually
moves a tool from personal to public is boring and relentless: reproduce the failure first, then
fix it, then prove the fix in the environment you don't control.

## What's next for eBrain

Distribution first — a one-command install so the onboarding matches the product. Then a
substantially better routing layer with many more providers you can launch directly, more embedding
choices, and reviewed workflow reuse — all without weakening the approval and isolation boundaries
that make it safe to hand an agent your machine.
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
- Image gallery: `ebrain-logo-3x2.jpg` + 2–3 TUI frames (memory, routing, doctor). JPG/PNG, 5 MB, 3:2.
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
  Repo is **private** → share with `testing@devpost.com` and `build-week-event@openai.com`
  (Settings → Collaborators) before submitting. The README's **"How this was built with Codex and
  GPT-5.6"** section documents the usage judges look for.
- **`/feedback` Codex Session ID (REQUIRED):** NEEDS INPUT — see `docs/codex-session-and-feedback.md`.
- **Link + instructions for judges to test:**
  ```
  Live docs and product site: https://ebrain.vercel.app

  Local install (source), works on a fresh machine — arbitrary path, no env required:
    git clone https://github.com/aedneth/ebrain.git ebrain
    cd ebrain && bun install && ./scripts/install.sh --from-source
    ebrain up && ebrain doctor

  Then: ebrain remember "Review a DB migration before merge."
        ebrain q "what must happen before a database migration merges?"
  to see cross-agent memory, or run bare `ebrain` for the terminal cockpit.
  Requirements: Bun, git, tmux, and at least one supported local agent CLI.
  No API key or credits are required to run the control plane itself.
  ```

### Plugin / dev-tool installation instructions
```
eBrain is a developer tool (local control plane + CLI/TUI). Supported platforms: Linux and macOS
(POSIX shell + Bun; tmux for persistent sessions). Install from source, no build-from-scratch
required by judges:

  git clone https://github.com/aedneth/ebrain.git ebrain
  cd ebrain && bun install && ./scripts/install.sh --from-source
  ebrain up && ebrain doctor

To test without any external account: `ebrain remember "..."` then `ebrain q "..."` exercises the
full local memory plane offline. `ebrain` opens the seven-view cockpit. Bridging a live agent is one
`ebrain onboard <agent>` away and needs only that agent's own CLI. CI is green from a clean checkout
with no environment preset.
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
