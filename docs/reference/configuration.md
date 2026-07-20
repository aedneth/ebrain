# Configuration Reference

eBrain keeps runtime state in private local configuration directories. Commands initialize required
stores as needed and validate their schema on read. Do not commit local runtime configuration.

## User-managed choices

- registered workspaces: generated IDs, labels, canonical directories;
- execution profiles: user-selected model/provider chains with catalog provenance;
- context packs: explicit operator/workspace content and reviewed proposals;
- workflow records and procedure review metadata;
- source registration and local isolation exclusions.

## Repository deny policy

Some repositories must never enter eBrain — client work under NDA, an employer monorepo, a
contractor tree. Which ones is a property of your machine, not of eBrain, so the list is yours:

```
$XDG_CONFIG_HOME/ebrain/denied-repos     # defaults to $HOME/.config/ebrain/denied-repos
```

One bare directory or source name per line; `#` starts a comment. A clean install ships no entries.

```
# never let these reach sessions, workspaces, federation, or memory
acme-client
internal-monorepo
```

`EBRAIN_DENIED_REPOS` (comma or whitespace separated) overrides the file for a single invocation,
and `EBRAIN_DENY_CONFIG` points at a different policy file.

How entries are matched:

| Boundary | Match | Effect |
| --- | --- | --- |
| Sessions and workspaces | whole path segment, case-insensitive, **after** symlink resolution | launching or registering that directory is refused |
| Federation and sources | substring of the source id, display name, or local path | the source is never federated, and the daemon refuses to bind if one is present |
| Memory inputs | substring of the text | episodes, context, and recall queries referencing it are rejected |

Segment matching is deliberate for paths: a directory named `acme-client-notes` is not
`acme-client`, because over-blocking teaches people to switch the guard off.

The policy fails closed, identically in the CLI and in the shell harness. A policy file that exists
but cannot be read, or an entry that is not a bare name, aborts the operation instead of continuing
with a silently smaller policy — the shell half reports the offending line number and denies every
repository until the file is fixed. Entries match literally (a `.` is a dot, not a wildcard) and
CRLF line endings are tolerated, so the same file always means the same thing on both paths.

An **empty** policy denies nothing by name — federation is already default-deny, so a source must be
registered before it can be read at all; this list is the second gate for directories you want
refused even if something tries to register them.

> **Upgrading:** earlier builds carried a deny list compiled into the source. If you relied on it,
> create this file — a fresh install starts with no entries. Run `ebrain doctor` to see the policy
> state (`sources:deny-policy` reports the number of entries loaded, or that none are configured).

## Safety constraints

- Keep secrets in supported environment indirection or local private stores, never documentation.
- Do not hand-edit a store to introduce commands, paths outside a validated workspace, or unreviewed
  context. Strict parsers fail closed on unsupported fields.
- Optional providers require the user's own configuration. eBrain does not create a provider account,
  invent a payment method, or expose credential values.

Use `ebrain profiles validate`, `ebrain workspaces list --json`, and `ebrain doctor` to inspect
supported configuration state without printing secret values.
