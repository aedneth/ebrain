# Troubleshooting

## `ebrain up` or `ebrain doctor` reports a local problem

Run `ebrain doctor` first. It checks the daemon, launchers, adapter state, source isolation, and
local contracts. Fix the named local prerequisite rather than bypassing the check.

## A supported agent was not onboarded

Confirm its CLI is installed and runnable, then run `ebrain onboard --all` or the adapter-specific
onboard command. `ebrain fleet --json` shows observed adapter health; it does not fabricate success.

## Memory recall is limited

`ebrain q` requires configured/approved searchable sources. Local episodes have their own bounded
recall path. Hosted embeddings are optional; without them, use the documented keyword fallback and
verify the source configuration.

## A session did not start in the expected project

Use the Workspaces cockpit or `ebrain workspaces list --json`, select the intended registered
workspace, then preview Launch. The registry rejects invalid canonical paths rather than accepting
an arbitrary session directory.

## Cost data is incomplete

Use `ebrain cost --json` and read the attribution fields. A provider that does not report usage is
not assigned a fabricated price. Routing-cap telemetry and unrelated provider usage are distinct.
