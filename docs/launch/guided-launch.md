# Guided Launch

Guided launch makes the choices that affect a routed session explicit before it creates a process.

## The five inputs

1. **Task:** optional plain-language work description.
2. **Target:** a declared adapter target with a safe model selector.
3. **Profile:** a local execution profile chosen and maintained by the user.
4. **Capability:** a work category such as general or web design.
5. **Workspace:** the validated directory where the session will run.

The preview shows these inputs before launch. Arrow navigation changes the focused declared field; it never changes a provider or model behind the user's back.

## Task signals are orientation, not a verdict

```bash
ebrain task-profile "Refactor a typed API client" --json
```

Signals classify wording into an explainable capability and compatible execution modes. They do not rank models, pick an agent, prove benchmark quality, or determine what a developer must use. When the task is ambiguous, the safe classification is general.

## Profiles and targets

```bash
ebrain profiles list --json
ebrain profiles validate --json
ebrain targets list --json
```

Profiles retain catalog provenance for their model entries; targets declare how an adapter can represent a selected model. A guided plan refuses a capability or target declaration that cannot be represented safely. Read [profiles and targets](../routing/profiles-and-targets.md) before creating or migrating a profile.

## Preview before mutation

The target plan is distinct from launch. A preview does not start a session, spend provider usage, or send a prompt. Confirmation occurs at the launch boundary. If prompt delivery fails after a session exists, the session is retained and the failure is shown without echoing the prompt.

## Next step

Review [routing](../guides/routing.md) for provider boundaries and [sessions](sessions.md) for the post-launch control surface.
