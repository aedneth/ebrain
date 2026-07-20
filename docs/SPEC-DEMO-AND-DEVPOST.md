---
type: spec
project: ebrain
phase: launch surface (demo video + Devpost submission)
status: ready for maker
created: 2026-07-20
author: Opus (orchestrator)
maker: Codex
related: [HANDOFF-BACK.md, MAKER-REPORT-AUDIT-REMEDIATION.md, PUBLIC-DOCUMENTATION.md]
---

# Spec — launch surface: the one-minute demo and the Devpost submission

This is the next body of work, and it is yours because the README and the public documentation you
wrote are the reason the owner trusts this to you. The tone, restraint, and factual discipline of
those documents are the standard for everything below.

━━━

## Where the product actually stands

Treat this as **v1: functional**, not as a preview. What exists and works today:

- permanent agentic memory (context packs, episodes, procedure lifecycle, governed recall)
- the provider-agnostic harness
- model routing (works; **not** yet what it should be — see below)
- centralized sessions, multiple agents across multiple workspaces
- a functioning MCP surface
- complete public documentation, now live at **https://ebrain.vercel.app**

**v2 is already scoped and is not part of this spec:** a substantially better routing layer and many
more providers, including launching a chosen provider directly from manual launch rather than
routing to it. Do not promise v2 behavior in the demo or the submission. Describe what runs today.

The repository is **private** and stays private for now. The documentation website is public. Both
are deliberate; do not present either as temporary or as a problem being fixed.

## Non-negotiable constraints on everything you produce

These come from the F10 claim audit, the public-documentation contract, and standing owner
direction. A demo is marketing, which is exactly where overclaiming happens.

1. **No competitor is ever named, and nothing is described as better than another product.** State
   the lead implicitly, through what the thing does.
2. **No "best model" or "most powerful model" claims.** Models are the user's choice; eBrain does
   not rank them.
3. **Cost is telemetry, not a promise.** Token and spend figures are reported, never projected as
   savings.
4. **Never show a token, key, credential, or private path** — not in the video, not in a screenshot,
   not in a terminal recording. Use the neutral fixture names the test suite uses.
5. **Every command shown on screen must actually work.** Three independent audits of this repository
   found published commands that did not run. A demo that shows a command that fails is the same
   defect with a bigger audience. Run every line you record.
6. Follow the existing design system. Do not invent a palette.

## Deliverable 1 — the sixty-second demo

A single self-contained HTML file, animated, narrated, playable in a browser and recordable to
video.

**Precedent to study first:**
`~/Documents/Startups/Korvex/Systems/Korvex Web/korvex-web/public/demo/company-brain.html`
— a 37 KB single file with `#intro` / `#stage` / `#outro` scenes, a canvas layer, a typing caret,
and `setTimeout`-driven scene transitions. Reuse that architecture. What it does **not** have, and
what this one must, is **voice**.

**What the minute has to land.** One idea, demonstrated, not four listed. The strongest single
story this product has is: *an agent that remembers across sessions, agents, and providers, on your
own machine.* Everything else — workspaces, MCP, routing — is supporting evidence. Open on the
problem the viewer already recognizes (context lost the moment a session ends), show memory
surviving a jump between two different agents, close on what that makes possible. Sixty seconds is
roughly 150 spoken words: write the script first, cut it to fit, then build to the script. Do not
build the animation first and narrate over it.

**Voice.** An AI voice that reads as human — natural pacing, real sentence rhythm, no
list-reading cadence. Generate the narration as an audio file and ship it alongside the HTML;
do not use `speechSynthesis`, which sounds synthetic and differs on every machine. Propose the
specific TTS you intend to use and get the owner's approval before generating the final take, and
give him a way to re-record a line without rebuilding the whole piece — narration always needs a
second pass.

**Three technical constraints that will bite you if you discover them late:**

- **Browsers block autoplay with sound.** The demo needs an explicit start affordance. Design it as
  part of the piece, not as an apology banner.
- **Captions are required**, both for accessibility and because most social video is watched muted.
  They must be timed to the narration, and they are also what makes the piece work as a silent
  autoplaying loop on LinkedIn and X.
- **The site's Content-Security-Policy is strict and the demo must obey it if it is hosted there:**
  `default-src 'self'`, no third-party hosts, no remote fonts, no CDN. Audio must be same-origin.
  Inline `<script>` is permitted; an external script from another domain is not. Verify against the
  live headers, not against your local `astro dev`.

**Sync approach:** drive scene transitions from the audio element's `timeupdate` against a cue table
rather than from `setTimeout` chained off page load. Timeouts drift against the narration and desync
badly on a slow machine — which is exactly the machine a recording will be made on.

## Deliverable 2 — the Devpost submission and hackathon form

Update the existing Devpost submission and prepare the answers for the form the owner will fill in.
Produce the form answers as a document he can copy from, not as prose he has to re-edit.

- Inspect the current submission and the material already in `docs/launch/` before writing anything.
- The submission must match the product as it stands today, including the private-repository and
  public-documentation-site arrangement. If a field asks for a public repository link and there is
  none, raise it with the owner rather than inventing a URL or quietly leaving it blank.
- Reuse the README's framing. It is owner-endorsed and audited; the submission should read as the
  same product described by the same voice.
- Where a field wants a technical differentiator, use the actual architecture — one brain, many
  sources; provider-agnostic harness; memory that outlives the session and crosses agents — not
  adjectives.

## Deliverable 3 — tell him how to make the video

He is going to record and publish this himself, and he has asked to be walked through it. Write the
production guide as part of this work: how to record the HTML at a clean frame rate and resolution,
what aspect ratios LinkedIn and X actually want, where the captions get burned in versus carried as
a track, and what the export settings should be. Then do the parts you can do for him and hand him
a checklist for the parts he must do at the keyboard.

Social copy for LinkedIn and X is **not** in scope yet — he will give direction separately.

## Definition of done

- [ ] Script written and approved before any animation is built.
- [ ] Single self-contained HTML demo, running under the live CSP, with narration audio, timed
      captions, and an explicit start control.
- [ ] Every command or output shown is real and reproducible.
- [ ] Devpost submission updated; hackathon form answers delivered as a copyable document.
- [ ] Production guide written, with the owner's checklist separated from what you already did.
- [ ] `CHANGELOG.md` entry, and this spec's status updated.
- [ ] Nothing in any deliverable names a competitor, ranks a model, promises v2 routing, or shows a
      credential.
