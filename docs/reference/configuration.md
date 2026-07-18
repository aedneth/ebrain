# Configuration Reference

eBrain keeps runtime state in private local configuration directories. Commands initialize required
stores as needed and validate their schema on read. Do not commit local runtime configuration.

## User-managed choices

- registered workspaces: generated IDs, labels, canonical directories;
- execution profiles: user-selected model/provider chains with catalog provenance;
- context packs: explicit operator/workspace content and reviewed proposals;
- workflow records and procedure review metadata;
- source registration and local isolation exclusions.

## Safety constraints

- Keep secrets in supported environment indirection or local private stores, never documentation.
- Do not hand-edit a store to introduce commands, paths outside a validated workspace, or unreviewed
  context. Strict parsers fail closed on unsupported fields.
- Optional providers require the user's own configuration. eBrain does not create a provider account,
  invent a payment method, or expose credential values.

Use `ebrain profiles validate`, `ebrain workspaces list --json`, and `ebrain doctor` to inspect
supported configuration state without printing secret values.
