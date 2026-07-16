# eBrain — Devpost Submission Polish Plan (OpenAI Build Week · Developer Tools)

> Goal: take the submission from "package drafted" (`docs/devpost-submission.md`) to **submitted and
> competitive**. Deadline: ~5 days from 2026-07-16. Every copy rule from
> [[feedback_positioning_implicit_no_competitors]] applies: **never name a competitor, never say
> "superior to X"** — state the lead implicitly through capabilities. No "best model" claims; cost =
> factual telemetry only; no user-facing tokens/OAuth/locks.

Legend: **[E]** = needs Eduardo · **[C]** = Claude can do · **[E+C]** = draft by Claude, finalize by Eduardo.

---

## 0. The one-line pitch (lock this first — everything else hangs off it)

Chosen elevator pitch (≤200 chars, from `docs/devpost-submission.md`):

> *One permanent memory for every AI coding agent. eBrain shares memory across Claude Code, Codex &
> Gemini, and routes tasks across providers by capability under a hard cost cap.*

**[E]** Approve or tweak. This exact line should also open the video and the README hero.

---

## 1. Inputs only Eduardo can provide (unblock these early)

| # | Field | How to get it | Priority |
|---|---|---|---|
| 1 | **`/feedback` Codex Session ID** | In the Codex session where the bulk of eBrain was built, run `/feedback`; copy the session id string. Required by the form. | 🔴 now |
| 2 | **Demo video (YouTube, <3 min)** | Record per §3; upload unlisted/public to YouTube. | 🔴 (longest lead) |
| 3 | **Country of Residence** | El Salvador — confirm. | 🟡 |
| 4 | **Repo visibility + sharing** | Decide public vs private. If private, add `testing@devpost.com` and `build-week-event@openai.com` as collaborators. | 🔴 |
| 5 | **Public repo slug** | Confirm the final slug (draft assumes `aedneth/ebrain`). Every install link + badge depends on it. | 🔴 |
| 6 | **Thumbnail (3:2, ≤5 MB)** | eBrain isotype on the dark brand background. Reuse the current draft thumbnail if approved. | 🟡 |
| 7 | **Image gallery (≤15, 3:2)** | Screenshots per §4. | 🟡 |

---

## 2. Repo readiness before submit (the judges will clone it)

- **[E] Decision — generalize client names before going public.** `AGENTS.md`/`harness/core/NORMS.md`
  and the codebase (`cli/isolation.ts` `CLIENT_DENYLIST`, tests) hardcode real client repo names
  (`brisas-del-golfo`, `dekko`). Not a code leak, but a public repo would expose client relationships.
  **Recommendation:** make the deny-list **configurable** (env/config file, e.g. `EBRAIN_CLIENT_DENYLIST`
  or `~/.config/ebrain/isolation.json`) with a neutral example in NORMS, then re-render AGENTS.md. This
  also makes eBrain more useful to other developers. **[C]** can implement once approved.
- **[C] Confirm the install one-liner works end-to-end** on a clean machine/VM once the repo is public
  and `scripts/install.sh` points at the real slug. Until then the README `curl | sh` line is the
  documented contract, not yet live.
- **[C] Verify README links + badges** resolve on the public repo; add the CI + release + stars badges
  once the slug is fixed (placeholders noted in README).
- **[C/E] Tag `v0.1.0`** so the release has a version (growth-standard: semver from day one) and the
  README badge is real.
- **[C] Finish the maker gate** (F2/F3/F4/F8 + R2) so the tool a judge tests matches the README claims —
  in particular F2 (Launch actually delivers the reviewed task) is demo-visible.

---

## 3. Demo video — script & shotlist (target 2:30, hard cap 3:00)

Rules from the form: public YouTube link; **voiceover must explain what you built, how you used Codex,
and how you used GPT-5.6**; AI narration is allowed. Speed up dead time; cut typing/loading.

| Time | Shot | Narration (implicit positioning — no competitor names) |
|---|---|---|
| 0:00–0:15 | Title card → split terminal, 3 agents idle | "Every AI coding agent starts from zero. You explain your architecture to one, then again to the next, then again tomorrow. eBrain fixes that." |
| 0:15–0:40 | `ebrain up` running; agents light up as connected | "One command. eBrain starts a local memory daemon and connects every agent you have — Claude Code, Codex, Gemini — over MCP. You never touch a token or a lock." |
| 0:40–1:10 | In Codex: `ebrain remember "…"`. Switch to Claude Code: it recalls it. Then `ebrain q "…"` | "What Codex learns, Claude Code remembers. One permanent memory, shared across every agent and every session — searchable across all your sources." |
| 1:10–1:40 | `ebrain routing` / a routed task + the spend cap | "Describe a task and eBrain routes it to the provider you chose for that capability — with native fallback and a hard cost cap. You govern the models; eBrain governs the spend." |
| 1:40–2:05 | `ebrain ui` cockpit: sessions, memory, routing, doctor | "A cockpit, not a config file: launch agents into persistent workspaces, review before they run, and watch memory and spend in one window." |
| 2:05–2:30 | Diagram / commit graph | "eBrain was built the way it runs. Codex was the maker; GPT-5.6 was the independent auditor that re-ran the tests and blocked the gate on evidence, not claims. Agents that share memory and check each other ship better software. That's eBrain." |

- **[C]** Provide this as a teleprompter script + the exact commands to run on screen (`docs/devpost-submission.md` §6 has the copy-paste set).
- **[E]** Record + narrate + upload. If over 3:00, cut the routing beat first.

---

## 4. Image gallery (3:2, ≤15) — shot list

1. Hero: `ebrain up` connecting the fleet (terminal).
2. Cross-agent recall: `remember` in one agent, `q` returning it.
3. The TUI **Memory** panel.
4. The TUI **Routing** panel (capability chains + spend cap).
5. The TUI **Doctor** panel (green).
6. The architecture diagram (from the README "How it works").
7. `ebrain doctor` healthy output.

**[C]** can generate the architecture diagram as a clean image; **[E]** captures the live terminal/TUI shots (real data, secrets off-screen).

---

## 5. Copy polish passes (Claude)

- **[C] README final pass:** tighten the hero, confirm every claim is truthful post-gate, ensure the
  "Built with Codex & GPT-5.6" section is specific (it satisfies the form's README requirement).
- **[C] Project Story final pass** (`docs/devpost-submission.md` §2): once F2/F3/F4/F8 land, update
  "Accomplishments" / "What's next" to match what actually shipped. Keep the 7 headings exactly as the
  form expects.
- **[C] Built-with tags:** trim/confirm ≤25 (current list in §3 of the submission doc).
- **[C] Consistency:** product name `eBrain`, CLI command `ebrain`, one voice throughout.

---

## 6. Pre-submit checklist (mirrors the Devpost form)

- [ ] Elevator pitch approved (≤200 chars).
- [ ] Project Story pasted (7 headings, Markdown).
- [ ] Built-with tags entered (≤25).
- [ ] "Try it out" links: repo (+ live demo if any).
- [ ] Thumbnail (3:2) + image gallery uploaded.
- [ ] Demo video < 3 min, public on YouTube, link in form.
- [ ] Voiceover explains what was built + how Codex and GPT-5.6 were used.
- [ ] Category = Developer Tools.
- [ ] Repo URL entered; if private, shared with `testing@devpost.com` + `build-week-event@openai.com`.
- [ ] README has setup instructions and explains Codex & GPT-5.6 usage. ✅ (done)
- [ ] Judge install/test instructions included. ✅ (submission doc §6)
- [ ] `/feedback` Codex Session ID entered.
- [ ] Country of residence set.
- [ ] Terms accepted; **not** left as a draft.

---

## 7. Suggested 5-day timeline

- **Day 1 (today):** [E] retrieve Codex session id, decide repo visibility + slug, approve pitch.
  [C] finish maker gate F2 (demo-visible) + generalize deny-list if approved.
- **Day 2:** [C] finish F3/F4/F8 + R2 doc reconciliation; final independent audit (Fable/GPT-5.6).
  [E] confirm country/thumbnail.
- **Day 3:** [C] README/story final pass + architecture diagram; make repo public, tag `v0.1.0`,
  verify `curl | sh` end-to-end. [E] capture gallery screenshots.
- **Day 4:** [E] record + upload demo video (script in §3). [C] final copy consistency pass.
- **Day 5:** [E] fill the form, run the pre-submit checklist (§6), submit (not a draft). Buffer day.

---

## 8. Winning-edge notes (Developer Tools category)

- **Lead with the outcome, prove it live:** the judge should *see* two agents sharing one memory in the
  first 40 seconds. That single moment is the differentiator most tools in this space don't have.
- **Make "it works for judges" trivial:** the `curl | sh` + `ebrain doctor` + one cross-agent recall is
  the whole evaluation loop — keep it under two minutes.
- **The build story is a feature:** "built by Codex, audited by GPT-5.6, under a maker≠checker gate" is
  both on-theme for the hackathon and a credibility signal — the tool dogfoods its own thesis.
