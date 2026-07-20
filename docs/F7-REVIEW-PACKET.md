---
type: review-packet
project: ebrain
program: F7 workspace-first Launch experience
prepared_by: Codex (maker)
status: awaiting-independent-checker
review_range: 4e96c37..c05437b
related: [ULTRAPLAN-LAUNCH-WORKSPACES.md, adr/ADR-006-workspace-first-control-plane.md, SPRINT-TUI.md, HANDOFF-BACK.md]
---

# F7 Review Packet

This is evidence and a reproducible checklist for an independent checker. It is **not** an audit
verdict and does not make a maker approval claim.

## Delivered commits

- `a8beb66 feat(tui): add validated workspace picker`
- `c05437b feat(cli): launch TUI with bare ebrain`

The earlier harness auto-checkpoint `5cbd025` contains the initial F7.3 CLI store files. It was
created during this maker session; the subsequent descriptive F7.3 commit contains the completed
picker, validation, tests, and documentation.

## Product contract to verify

1. `ebrain` opens the TUI only when stdin and stdout are TTYs and `TERM` is usable. `ebrain ui`
   stays equivalent. Bare non-TTY use prints help; explicit `ui` non-TTY use fails before the TUI.
2. `ebrain workspaces` persists only schema version, generated safe id, label, and canonical cwd.
   No registry field may transport a command, environment, credential, prompt, or session output.
3. A submitted workspace must exist, be a directory, resolve through symlinks, and pass client
   isolation on both its literal and canonical path. Reads revalidate stored entries. Direct and
   guided launch revalidate the active selection again before session planning/creation.
4. Manual Launch uses the active workspace. Guided Launch uses that workspace by default and can
   select another only through the same picker. Existing tmux sessions retain the cwd they started
   with; workspace switching affects only future sessions.
5. Modal key ownership and prompt review guarantees must be unchanged: selector/add keys never
   launch, confirmations remain `y`-only, task payloads remain stdin-only on the target path, and
   responsive dialog content wraps or scrolls rather than clipping.

## Reproduce the automated evidence

```bash
bun test ./cli/
bun test ./tui/test/
bash -n cli/ebrain
bash harness/core/contract-test.sh
git diff --check 4e96c37..c05437b
```

Maker result on 2026-07-17:

- CLI: `229 pass / 0 fail` across 25 files, including strict workspace store tests, dispatcher
  invocation matrix, and fake-agent tmux cwd E2E.
- TUI: `419 pass / 0 fail` across 35 files.
- Harness contract: `16 ok, 0 failed; JSON(zod): ok`.
- Zero hardcoded-hex scan outside `tui/src/theme.ts`: clean.
- Diff whitespace: clean.
- F7 range secret-safety scan: no dotenv/credential-shaped file and no token-shaped diff content.

## Independent visual checklist

Use a normal terminal, not a pipe. Do not launch a real provider or agent merely to check the UI.

1. Run `ebrain`; verify it opens the cockpit. In a pipe, run bare `ebrain` and verify help.
   Run `ebrain ui` in a pipe and verify the visible terminal requirement.
2. At 80x24, open Launch (`2`) then Task Setup (`t`). Verify every category description and action
   is visible through wrapping or scroll behavior, with no overlap.
3. At 100x30, open Launch then `[g] workspace`. Verify current directory appears only after
   validation; filter with `s`; inspect `a` add form; cancel without a config write.
4. At 160x48, open Guided Launch (`w`). Verify one-choice target/profile labels say `locked` and
   never advertise inert arrows. Press `c` and verify the same validated picker opens; Esc returns
   to the wizard.
5. In two harmless temporary directories, register two labels through the picker or CLI. Start
   fake-agent sessions only, then verify `ebrain sessions list --json` reports each expected cwd.
   Do not test with client repositories.

## Maker visual observations

The maker inspected real bare-command tmux panes at 80x24, 100x30, and 160x48. Task Setup,
workspace picker/add, singleton Guided Launch, and picker-in-wizard all had square modal contours,
wrapped prose, full action labels, and stable underlying frames. The fake-agent automated E2E
created two sessions in distinct temporary registered directories and tore both down. No real
provider target was launched during maker QA.

## Required checker outcome

Record findings by severity with file/line and reproduction. If no blocking issue remains, record
an independent pass separately from this maker packet. Human daily-driver acceptance remains in
`docs/human-checklist.md`; it is not substituted by this automated evidence.
