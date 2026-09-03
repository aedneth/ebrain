---
description: Turn what this session just did into a reviewable eBrain workflow proposal.
argument-hint: [short title for the workflow]
---
Propose a reusable workflow from what happened in this session. Title hint: {{ARGUMENTS}}

Look back over the work you just did and write it as a repeatable procedure: a title, a one-line
trigger ("use when ..."), the ordered steps someone could follow again, and the gates — the checks
that must pass before the work counts as done. Keep it general enough to reuse and specific enough
to be useful. Leave out anything tied to credentials or to a denied client repository.

Then submit it as a proposal, from the shell:

    ebrain workflows propose --title "<title>" --trigger "<use when ...>" \
      --step "<step 1>" --step "<step 2>" --gate "<check that must pass>" \
      --agent {{AGENT}} --session <session-id, or unknown> \
      --evidence "<one or two sentences on what in this session supports it>" --yes --json

The proposal is pending until a person reviews it: `ebrain workflows proposals` lists it, and
`ebrain workflows review <proposal-id> --action accept --yes` is the only step that turns it into a
workflow. Do not run that review yourself. Report the proposal id.
