# Security Policy

eBrain is a local-first tool that brokers a shared memory between AI agents. We take its
security posture seriously — it holds your notes and mediates agent access to them.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, report privately to the
maintainer via a GitHub Security Advisory (**Security → Report a vulnerability**) on this
repository. We aim to acknowledge within 72 hours and to ship or coordinate a fix before public
disclosure.

When reporting, include: affected version/commit, reproduction steps, and impact. Never include
real secrets, tokens, or client data in a report.

## Design guarantees

- **Local by default.** The memory daemon binds to `127.0.0.1` and requires an authenticated
  bearer token that eBrain mints and stores with `600` permissions — it is never printed to a
  log, prompt, or commit.
- **Secret scrubbing at the boundary.** Dotenv/credential shapes are redacted before any snippet
  is stored or rendered.
- **Repository isolation.** A deny-list you configure locally keeps designated repositories out of
  memory and federation entirely, resolved through symlinks so an innocent-looking path cannot
  smuggle denied content in. It fails closed on an unreadable or malformed policy, and the daemon
  refuses to bind if a denied source reached the federated set. See
  [configuration reference](docs/reference/configuration.md#repository-deny-policy).

## Scope

In scope: token handling, the loopback MCP channel, secret redaction, source isolation, and the
installer. Out of scope: vulnerabilities in third-party agent CLIs or the vendored upstream
engine (report those to their respective projects), and misconfigurations that intentionally
expose the daemon beyond loopback.
