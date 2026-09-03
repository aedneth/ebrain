---
description: Distill related eBrain learnings into a reusable SKILL.md, with the user's approval.
argument-hint: <topic the skill should cover>
---
Turn eBrain memory into a reusable skill about: {{ARGUMENTS}}

1. Preview first. Run, from the shell, without `--yes`:

       ebrain skills from-memory "<topic>" --json

   It selects the related learnings and returns the SKILL.md it would write, the target path, and
   the learnings it draws from. If it finds too few learnings, say so and stop. Do not invent
   content to fill the gap.
2. Show the user the proposed name, the description, and the learnings behind it. Offer `--name`
   and `--description` when the defaults read poorly.
3. Only after the user approves, run the same command again with `--yes`. Never write a skill file
   without that approval.
4. Report the path written. The skill is now listed by `ebrain skills list` and by the `list_skills`
   MCP tool, and `ebrain skills show <name>` prints it.

The skill body is distilled from stored learnings only, and records which ones. If the wording
needs to change, store a better learning with `ebrain remember` and regenerate, so the provenance
stays true.
