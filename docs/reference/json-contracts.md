# JSON Contract Boundary

The TUI reads CLI `--json` contracts rather than private files. Contracts are deliberately narrow:
summary surfaces contain only fields needed to render a safe view, while bodies require explicit,
bounded retrieval commands.

Examples of protected boundaries:

- memory recent, episode list/recall, context list, and procedure list reject filesystem paths and
  raw bodies on passive surfaces;
- episode `get` is explicit and character-bounded;
- cost telemetry distinguishes known usage from untracked or unavailable values;
- routing/task-profile output does not carry a universal model ranking;
- session mutations require an explicit confirmation envelope.

Consumers should reject unknown fields rather than silently treating a widened response as safe. The
repository contract tests use fixtures to protect this boundary without recursively invoking health
commands or provider services.
