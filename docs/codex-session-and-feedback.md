# Getting the `/feedback` Codex Session ID (and exporting the session)

> DevPost requires the **`/feedback` Codex Session ID** for the session where most of the work was
> done. This project's implementation work was done in **Codex via the Cursor extension** (the
> official OpenAI Codex extension — equivalent to the Codex platform). Here is exactly how to get
> the ID, plus how to export the session.

---

## What DevPost wants

- A **Session ID** — a string of letters and numbers.
- From an **official Codex interface** (Codex CLI, Codex Desktop, or the official OpenAI Codex
  extension in VS Code / Cursor).
- From the session where **the majority of the project was built**.

The OpenAI Codex extension inside Cursor **is** an official Codex interface, so a `/feedback` run
from the exact chat session where you built eBrain gives the ID DevPost is asking for.

---

## Path A — from the Cursor Codex extension (preferred: it is the session you worked in)

1. Open **Cursor**, open the **eBrain** codebase, and open the **OpenAI Codex** extension panel
   (the same chat where you did the work).
2. If the extension keeps session history, **reopen the eBrain build session** (the long one) so
   `/feedback` reports *that* session, not a fresh one.
3. In the Codex chat input, type the slash command:
   ```
   /feedback
   ```
   and send it. Codex returns a short confirmation that includes the **Session ID**. (The same
   menu also has `/status`.)
4. Copy the Session ID string into the DevPost **"/feedback Session ID"** field.

> If the extension's `/` menu does not show `/feedback`, update the OpenAI Codex extension to the
> latest version — the slash commands ship with recent releases.

## Path B — from the Codex CLI on Linux (fallback)

The Codex CLI is available on Linux even though the desktop app is not. Use this if Path A does not
expose `/feedback`.

1. In a terminal, open the eBrain codebase in Codex:
   ```bash
   cd ~/eBrain
   codex           # opens the Codex CLI in this repo
   ```
2. At the Codex prompt, run:
   ```
   /feedback
   ```
   and copy the **Session ID** it returns.

> Caveat, stated honestly: a fresh `codex` invocation is a **new** session, so its ID is not the
> literal session where the work happened. DevPost's instruction ("the session where most of your
> work was done") is best satisfied by **Path A**. Use Path B only if Path A is impossible, and note
> in the judges-instructions field that the work was done in the Codex Cursor extension.

---

## Exporting the session (optional attachment / your own records)

DevPost does not require a transcript, but you can attach one under **Additional info → Upload a
file** if you want to show the build history.

- **From the Cursor Codex extension:** use the extension's **export / copy conversation** action
  (panel overflow menu → *Export* or *Copy*), and save it as `codex-session-ebrain.md` or `.txt`.
- **From the Codex CLI:** session logs live under Codex's local state directory (e.g.
  `~/.codex/`); copy the relevant session log out to a file. Do **not** include any `.env`,
  credential, or token content in an exported file — scrub before attaching.
- Zip the file(s) if attaching more than one, and keep the upload under DevPost's 35 MB limit.

---

## Quick checklist

- [ ] `/feedback` run in the **official Codex interface** you built in (Path A).
- [ ] Session ID copied into the DevPost field.
- [ ] (Optional) Session exported and scrubbed of secrets before attaching.
