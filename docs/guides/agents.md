# Supported Agents

eBrain integrates with locally installed agent CLIs through small adapters and a command-only MCP
bridge. Start with:

```bash
ebrain up
ebrain onboard --all
ebrain fleet --json
```

The current integration surface includes Claude Code, Codex, Gemini, Cursor, and OpenCode where
the local CLI/configuration supports it. A generic adapter is available for a conservative local
shell-style launch. Detection is factual: an unavailable CLI remains unavailable rather than being
represented as connected.

The bridge configuration contains commands and stable arguments, not bearer material. Credentials
stay in local private stores or supported environment indirection. Do not copy tokens into adapter
configuration, prompts, issue reports, or documentation.

Use `ebrain harness doctor <agent>` for one adapter or `ebrain doctor` for the broader local health
view. See [MCP reference](../reference/mcp.md) for the boundary.
