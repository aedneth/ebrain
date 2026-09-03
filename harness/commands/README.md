# Canonical command catalog

Each `*.md` file here is one eBrain command, stated once. `ebrain harness install <agent>` renders
it into the agent's own user-level command directory in the shape that agent reads (declared in the
adapter manifest under `commands:`), so the same four commands exist in every harness that has a
command-file convention.

A file has YAML frontmatter with `description` and `argument-hint`, and a Markdown body. Two
placeholders are substituted at render time:

- `{{ARGUMENTS}}` — whatever the user typed after the command, in the agent's own spelling
  (`$ARGUMENTS` for Claude Code, Codex, OpenCode and Cursor; `{{args}}` for Gemini CLI).
- `{{AGENT}}` — the adapter id the file was rendered for.

The commands are a convenience layer over primitives that keep working without them: the `ebrain`
CLI and the MCP tools. A harness with no command-file convention loses nothing but the shortcut.

Rendered files carry an `ebrain-managed:` marker. The installer rewrites only files that carry it,
never a user's own file of the same name, and `ebrain uninstall` removes only the marked ones.
